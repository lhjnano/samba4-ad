"""SPDX-License-Identifier: Apache-2.0

Access Intelligence — effective permission calculation and usage analytics.

Computes what a user CAN do (from PBAC policies) and what they
actually DO (from audit logs), then identifies:
  - Active permissions (have + used)
  - Idle permissions (have but never used)
  - Denied attempts (don't have but tried)
"""

from __future__ import annotations

import fnmatch
from typing import Any

from src.core.audit import get_audit
from src.core.pbac import PolicyEngine, get_engine


def compute_effective_permissions(
    user_dn: str,
    group_dns: list[str],
    engine: PolicyEngine | None = None,
) -> list[dict[str, Any]]:
    """Compute all permissions a user effectively has.

    Returns a list of permission entries with the source policy.
    """
    if engine is None:
        engine = get_engine()
    if engine is None:
        return []

    # Collect all policies applicable to this user
    policies = engine._get_applicable_policies(user_dn, group_dns)

    # Build effective permission map
    allows: dict[str, str] = {}  # action → policy_path
    denies: dict[str, str] = {}  # action → policy_path

    policy_paths = engine._policy_paths_for(user_dn, group_dns)

    for policy_path, policy in zip(policy_paths, policies, strict=False):
        for stmt in policy.statement:
            for action_pattern in stmt.action:
                if action_pattern == "*":
                    # Wildcard — marks all actions
                    if stmt.effect == "Allow":
                        allows["*"] = policy_path
                    elif stmt.effect == "Deny":
                        denies["*"] = policy_path
                else:
                    if stmt.effect == "Allow":
                        if action_pattern not in denies:
                            allows[action_pattern] = policy_path
                    elif stmt.effect == "Deny":
                        denies[action_pattern] = policy_path
                        allows.pop(action_pattern, None)

    # Build result list
    result: list[dict[str, Any]] = []

    if "*" in allows:
        result.append(
            {
                "action": "*",
                "effect": "Allow",
                "source_policy": allows["*"],
                "resource": "*",
            }
        )
    else:
        for action, policy_path in allows.items():
            result.append(
                {
                    "action": action,
                    "effect": "Allow",
                    "source_policy": policy_path,
                    "resource": "*",
                }
            )

    for action, policy_path in denies.items():
        result.append(
            {
                "action": action,
                "effect": "Deny",
                "source_policy": policy_path,
                "resource": "*",
            }
        )

    return result


def compute_usage_stats(
    user_dn: str,
    allowed_actions: list[str],
    days: int = 90,
) -> dict[str, Any]:
    """Cross-reference audit logs with permissions.

    Returns stats about active vs idle permissions.
    """
    audit = get_audit()
    entries = audit.read_entries(limit=1000)

    # Count actions by this user
    user_actions: dict[str, int] = {}
    for entry in entries:
        actor = entry.get("actor", "").lower()
        if actor != user_dn.lower():
            continue
        action = entry.get("action", "")
        user_actions[action] = user_actions.get(action, 0) + 1

    # Categorize permissions
    active: list[dict[str, Any]] = []
    idle: list[dict[str, Any]] = []
    denied_attempts: list[dict[str, Any]] = []

    for action in allowed_actions:
        if action == "*":
            continue

        # Check if any audit entry matches this action pattern
        used_count = 0
        for audit_action, count in user_actions.items():
            if action.endswith(":*"):
                prefix = action[:-2]
                if audit_action.startswith(prefix + ":"):
                    used_count += count
            elif fnmatch.fnmatch(audit_action, action):
                used_count += count

        if used_count > 0:
            active.append({"action": action, "usage_count": used_count})
        else:
            idle.append({"action": action, "usage_count": 0})

    # Find denied attempts (actions tried but not in allowed list)
    for audit_action, count in user_actions.items():
        # Check if this action is allowed
        is_allowed = False
        for pattern in allowed_actions:
            if pattern == "*":
                is_allowed = True
                break
            if pattern.endswith(":*"):
                prefix = pattern[:-2]
                if audit_action.startswith(prefix + ":"):
                    is_allowed = True
                    break
            elif fnmatch.fnmatch(audit_action, pattern):
                is_allowed = True
                break

        if not is_allowed and not audit_action.startswith("auth:"):
            denied_attempts.append(
                {
                    "action": audit_action,
                    "attempt_count": count,
                }
            )

    total = len(active) + len(idle)
    usage_rate = (len(active) / total * 100) if total > 0 else 0

    return {
        "total_permissions": total,
        "active_count": len(active),
        "idle_count": len(idle),
        "denied_attempt_count": len(denied_attempts),
        "usage_rate": round(usage_rate, 1),
        "active_permissions": active,
        "idle_permissions": idle,
        "denied_attempts": denied_attempts,
    }
