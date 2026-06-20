"""SPDX-License-Identifier: Apache-2.0

Policy-Based Access Control (PBAC) engine.

Inspired by AWS IAM: policies are JSON documents that define what
actions a principal can perform on which resources.  The engine
collects all applicable policies for a user (direct + group-inherited
+ system defaults), then evaluates each statement using wildcard
matching with explicit-deny-wins semantics.

Evaluation rules (identical to AWS IAM):
  1. Default decision: DENY (closed system)
  2. Explicit DENY overrides any ALLOW
  3. At least one ALLOW required for access
"""

from __future__ import annotations

import fnmatch
import json
import logging
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ── Policy data models ────────────────────────────────────────────────


class Statement(BaseModel):
    """A single permission statement within a policy."""

    sid: str | None = None
    effect: str = "Allow"  # "Allow" | "Deny"
    action: list[str] = Field(default_factory=list)
    resource: list[str] = Field(default_factory=lambda: ["*"])
    condition: dict[str, Any] | None = None


class PolicyDocument(BaseModel):
    """A complete policy document containing one or more statements."""

    version: str = "2026-06-20"
    statement: list[Statement] = Field(default_factory=list)


# ── Policy Engine ─────────────────────────────────────────────────────


class PolicyEngine:
    """Evaluate access decisions from policy documents.

    Usage::

        engine = PolicyEngine("/etc/samba-ad-manager/policies")
        allowed = engine.evaluate(
            user_dn="CN=jdoe,...",
            group_dns=["CN=Help Desk,..."],
            action="users:Create",
            resource="ou=Sales,DC=corp,DC=local",
        )
    """

    def __init__(self, policy_dir: str) -> None:
        self._policy_dir = Path(policy_dir)
        self._policies: dict[str, PolicyDocument] = {}
        self._assignments: dict[str, Any] = {}
        self._load_all()

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def _load_all(self) -> None:
        """Load all policy files and assignments from disk."""
        # Load all .json policy files
        for root, _dirs, files in os.walk(self._policy_dir):
            for fname in files:
                if fname.endswith(".json") and fname != "assignments.json":
                    fpath = Path(root) / fname
                    rel = fpath.relative_to(self._policy_dir)
                    try:
                        data = json.loads(fpath.read_text(encoding="utf-8"))
                        self._policies[str(rel)] = PolicyDocument(**data)
                    except Exception:
                        logger.exception("Failed to load policy %s", fpath)

        # Load assignments
        assign_path = self._policy_dir / "assignments.json"
        if assign_path.exists():
            try:
                self._assignments = json.loads(assign_path.read_text(encoding="utf-8"))
            except Exception:
                logger.exception("Failed to load assignments")
                self._assignments = {}

    def reload(self) -> None:  # pragma: no cover
        """Force reload all policies from disk."""
        self._policies.clear()
        self._assignments.clear()
        self._load_all()

    # ------------------------------------------------------------------
    # Policy collection
    # ------------------------------------------------------------------

    def _get_applicable_policies(
        self, user_dn: str, group_dns: list[str]
    ) -> list[PolicyDocument]:
        """Collect all policies applicable to this user."""
        result: list[PolicyDocument] = []

        group_assignments: dict = self._assignments.get("group_assignments", {})
        user_assignments: dict = self._assignments.get("user_assignments", {})
        default_policy: str | None = self._assignments.get("default_policy")

        # Group-inherited policies
        for group_dn in group_dns:
            for policy_path in group_assignments.get(group_dn, []):
                policy = self._policies.get(policy_path)
                if policy:
                    result.append(policy)

        # User-specific policies (override/extend group policies)
        for policy_path in user_assignments.get(user_dn, []):
            policy = self._policies.get(policy_path)
            if policy:
                result.append(policy)

        # Default policy (if no group/user assignment matched)
        if not result and default_policy:
            policy = self._policies.get(default_policy)
            if policy:
                result.append(policy)

        # Fallback: super-admin for Domain Admins (safety net)
        # This ensures Domain Admins always have full access even if
        # assignments.json is not configured
        if not result:
            for gdn in group_dns:
                if "Domain Admins" in gdn:
                    sa = self._policies.get("system/super-admin.json")
                    if sa:
                        result.append(sa)
                        break

        return result

    # ------------------------------------------------------------------
    # Pattern matching
    # ------------------------------------------------------------------

    @staticmethod
    def _match_action(action: str, patterns: list[str]) -> bool:
        """Check if *action* matches any pattern in *patterns*.

        Supports glob wildcards: ``users:*`` matches ``users:Create``.
        """
        return any(pat == "*" or fnmatch.fnmatch(action, pat) for pat in patterns)

    @staticmethod
    def _match_resource(resource: str, patterns: list[str]) -> bool:
        """Check if *resource* matches any pattern.

        Resource identifiers are LDAP distinguished names with wildcards.
        Matching is case-insensitive (LDAP DN convention).
        """
        res_lower = resource.lower()
        for pat in patterns:
            if pat == "*":
                return True
            if fnmatch.fnmatch(res_lower, pat.lower()):
                return True
        return False

    @staticmethod
    def _match_conditions(  # pragma: no cover - complex condition paths
        conditions: dict[str, Any] | None, context: dict[str, Any]
    ) -> bool:
        """Evaluate condition block against request context.

        Currently supports ipAddress and simple equality conditions.
        Returns True if all conditions pass (or if no conditions).
        """
        if not conditions:
            return True

        for cond_type, cond_map in conditions.items():
            for key, expected in cond_map.items():
                actual = context.get(key)
                if actual is None:
                    return False

                if cond_type == "ipAddress":
                    # Simple CIDR / exact match (can be extended)
                    if not _ip_matches(actual, expected):
                        return False
                elif cond_type in ("stringEquals", "equals"):
                    if isinstance(expected, list):
                        if actual not in expected:
                            return False
                    elif actual != expected:
                        return False
                elif cond_type == "bool" and bool(actual) != bool(expected):
                    return False

        return True

    # ------------------------------------------------------------------
    # Evaluation
    # ------------------------------------------------------------------

    def evaluate(
        self,
        user_dn: str,
        group_dns: list[str],
        action: str,
        resource: str = "*",
        context: dict[str, Any] | None = None,
    ) -> tuple[bool, str | None]:
        """Evaluate whether the action is allowed.

        Returns ``(allowed, matched_policy_path)``.
        """
        policies = self._get_applicable_policies(user_dn, group_dns)
        ctx = context or {}

        has_allow = False
        matched_policy: str | None = None

        for policy_path, policy in zip(  # noqa: B905
            self._policy_paths_for(user_dn, group_dns), policies
        ):
            for stmt in policy.statement:
                if not self._match_action(action, stmt.action):
                    continue
                if not self._match_resource(resource, stmt.resource):
                    continue
                if not self._match_conditions(stmt.condition, ctx):
                    continue

                if stmt.effect == "Deny":
                    logger.info(
                        "PBAC DENY: %s on %s (policy=%s, stmt=%s)",
                        action,
                        resource,
                        policy_path,
                        stmt.sid,
                    )
                    return False, policy_path

                if stmt.effect == "Allow":
                    has_allow = True
                    matched_policy = policy_path

        if has_allow:
            logger.debug(
                "PBAC ALLOW: %s on %s (policy=%s)", action, resource, matched_policy
            )
        else:
            logger.info(
                "PBAC DENY (default): %s on %s — no matching Allow", action, resource
            )

        return has_allow, matched_policy

    def _policy_paths_for(self, user_dn: str, group_dns: list[str]) -> list[str]:
        """Return policy file paths for logging (mirrors _get_applicable_policies)."""
        paths: list[str] = []
        group_assignments: dict = self._assignments.get("group_assignments", {})
        user_assignments: dict = self._assignments.get("user_assignments", {})
        default_policy: str | None = self._assignments.get("default_policy")

        for group_dn in group_dns:
            paths.extend(group_assignments.get(group_dn, []))
        paths.extend(user_assignments.get(user_dn, []))

        if not paths and default_policy:
            paths.append(default_policy)
        if not paths:
            for gdn in group_dns:
                if "Domain Admins" in gdn:
                    paths.append("system/super-admin.json")
                    break
        return paths

    # ------------------------------------------------------------------
    # Introspection (for IAM API)
    # ------------------------------------------------------------------

    def list_policies(self) -> list[dict[str, Any]]:
        """List all loaded policies with metadata."""
        result = []
        for path, policy in sorted(self._policies.items()):
            actions: set[str] = set()
            for stmt in policy.statement:
                actions.update(stmt.action)
            result.append(
                {
                    "path": path,
                    "version": policy.version,
                    "statements": len(policy.statement),
                    "actions": sorted(actions),
                    "is_system": path.startswith("system/"),
                }
            )
        return result

    def get_policy(self, path: str) -> PolicyDocument | None:
        return self._policies.get(path)

    def list_assignments(self) -> dict[str, Any]:
        return self._assignments


# ── IP matching helper ────────────────────────────────────────────────


def _ip_matches(ip: str, patterns: list[str] | str) -> bool:
    """Check if *ip* matches any CIDR or exact IP in *patterns*."""
    if isinstance(patterns, str):
        patterns = [patterns]

    import ipaddress

    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False

    for pat in patterns:
        try:
            if "/" in pat:
                network = ipaddress.ip_network(pat, strict=False)
                if addr in network:
                    return True
            else:
                if ip == pat:
                    return True
        except ValueError:
            continue
    return False


# ── Global engine singleton ───────────────────────────────────────────

_engine: PolicyEngine | None = None


def get_engine() -> PolicyEngine | None:  # pragma: no cover
    """Return the global policy engine, or None if PBAC is disabled."""
    global _engine
    if _engine is None:
        from src.core.config import settings

        if not settings.pbac_enabled:
            return None
        policy_dir = settings.pbac_policy_dir
        if not Path(policy_dir).exists():
            logger.warning("PBAC policy dir does not exist: %s", policy_dir)
            return None
        _engine = PolicyEngine(policy_dir)
    return _engine


def reset_engine() -> None:  # pragma: no cover
    """Reset the cached engine (used by tests)."""
    global _engine
    _engine = None
