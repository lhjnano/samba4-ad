"""SPDX-License-Identifier: Apache-2.0

IAM (Identity and Access Management) routes — ``/api/v1/iam``.

Provides policy introspection, evaluation testing, policy CRUD,
and assignment management for the PBAC engine.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.core.auth import UserInfo, get_current_user
from src.core.config import settings
from src.core.pbac import PolicyDocument, Statement, get_engine, reset_engine

router = APIRouter(prefix="/iam", tags=["iam"])


# ── Response models ──────────────────────────────────────────────────


class PolicySummary(BaseModel):
    path: str
    version: str
    statements: int
    actions: list[str]
    is_system: bool


class AssignmentInfo(BaseModel):
    group_assignments: dict[str, list[str]]
    user_assignments: dict[str, list[str]]
    default_policy: str | None


class EvaluateRequest(BaseModel):
    action: str
    resource: str = "*"


class EvaluateResponse(BaseModel):
    allowed: bool
    matched_policy: str | None
    action: str
    resource: str


class PolicyCreateRequest(BaseModel):
    """Create or update a custom policy."""

    path: str = Field(description="Relative path, e.g. 'custom/my-policy.json'")
    version: str = "2026-06-20"
    statement: list[Statement] = Field(min_length=1)


class AssignmentUpdateRequest(BaseModel):
    """Update group/user → policy assignments."""

    group_assignments: dict[str, list[str]] | None = None
    user_assignments: dict[str, list[str]] | None = None
    default_policy: str | None = None


# ── Helper ───────────────────────────────────────────────────────────


def _policy_dir() -> Path:
    return Path(settings.pbac_policy_dir)


def _reload_engine() -> None:
    """Reload policy engine after file changes."""
    reset_engine()
    get_engine()


# ── Read endpoints ───────────────────────────────────────────────────


@router.get("/policies", response_model=list[PolicySummary])
def list_policies(
    user: UserInfo = Depends(get_current_user),
) -> list[PolicySummary]:
    """List all loaded policies."""
    engine = get_engine()
    if engine is None:
        return []
    return [PolicySummary(**p) for p in engine.list_policies()]


@router.get("/policies/{policy_path:path}", response_model=PolicyDocument)
def get_policy(
    policy_path: str,
    user: UserInfo = Depends(get_current_user),
) -> PolicyDocument:
    """Get a single policy by path."""
    engine = get_engine()
    if engine is None:
        raise HTTPException(404, "PBAC engine not available")
    policy = engine.get_policy(policy_path)
    if policy is None:
        raise HTTPException(404, f"Policy not found: {policy_path}")
    return policy


@router.get("/assignments", response_model=AssignmentInfo)
def get_assignments(
    user: UserInfo = Depends(get_current_user),
) -> AssignmentInfo:
    """Get current group/user policy assignments."""
    engine = get_engine()
    if engine is None:
        return AssignmentInfo(
            group_assignments={},
            user_assignments={},
            default_policy=None,
        )
    data = engine.list_assignments()
    return AssignmentInfo(
        group_assignments=data.get("group_assignments", {}),
        user_assignments=data.get("user_assignments", {}),
        default_policy=data.get("default_policy"),
    )


@router.post("/eval", response_model=EvaluateResponse)
def evaluate(
    payload: EvaluateRequest,
    user: UserInfo = Depends(get_current_user),
) -> EvaluateResponse:
    """Evaluate whether the current user can perform an action."""
    engine = get_engine()
    if engine is None:
        return EvaluateResponse(
            allowed=True,
            matched_policy=None,
            action=payload.action,
            resource=payload.resource,
        )
    allowed, matched = engine.evaluate(
        user_dn=user.username,
        group_dns=user.groups,
        action=payload.action,
        resource=payload.resource,
    )
    return EvaluateResponse(
        allowed=allowed,
        matched_policy=matched,
        action=payload.action,
        resource=payload.resource,
    )


# ── Write endpoints (custom policies only) ───────────────────────────


@router.post("/policies", response_model=PolicyDocument, status_code=201)
def create_policy(
    payload: PolicyCreateRequest,
    user: UserInfo = Depends(get_current_user),
) -> PolicyDocument:
    """Create a new custom policy.

    System policies (under system/) cannot be created or modified.
    """
    path = payload.path.strip().lstrip("/")

    # Security: only allow custom/ prefix
    if not path.startswith("custom/"):
        raise HTTPException(400, "Custom policies must be under custom/")
    if not path.endswith(".json"):
        raise HTTPException(400, "Policy path must end with .json")

    file_path = _policy_dir() / path
    if file_path.exists():
        raise HTTPException(409, f"Policy already exists: {path}")

    # Security: prevent path traversal
    try:
        file_path.resolve().relative_to(_policy_dir().resolve())
    except ValueError:
        raise HTTPException(400, "Invalid policy path") from None

    doc = PolicyDocument(version=payload.version, statement=payload.statement)

    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(
        json.dumps(doc.model_dump(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    _reload_engine()

    from src.core.audit import get_audit

    get_audit().log(
        actor=user.username,
        action="iam:CreatePolicy",
        resource_type="policy",
        resource_id=path,
        severity="warning",
        detail=f"Created policy with {len(payload.statement)} statements",
    )
    return doc


@router.put("/policies/{policy_path:path}", response_model=PolicyDocument)
def update_policy(
    policy_path: str,
    payload: PolicyCreateRequest,
    user: UserInfo = Depends(get_current_user),
) -> PolicyDocument:
    """Update an existing custom policy."""
    path = policy_path.strip().lstrip("/")

    if not path.startswith("custom/"):
        raise HTTPException(403, "System policies cannot be modified")
    if not path.endswith(".json"):
        raise HTTPException(400, "Policy path must end with .json")

    file_path = _policy_dir() / path
    if not file_path.exists():
        raise HTTPException(404, f"Policy not found: {path}")

    doc = PolicyDocument(version=payload.version, statement=payload.statement)
    file_path.write_text(
        json.dumps(doc.model_dump(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    _reload_engine()

    from src.core.audit import get_audit

    get_audit().log(
        actor=user.username,
        action="iam:UpdatePolicy",
        resource_type="policy",
        resource_id=path,
        severity="warning",
        detail=f"Updated policy with {len(payload.statement)} statements",
    )
    return doc


@router.delete("/policies/{policy_path:path}", status_code=204)
def delete_policy(
    policy_path: str,
    user: UserInfo = Depends(get_current_user),
) -> None:
    """Delete a custom policy. System policies cannot be deleted."""
    path = policy_path.strip().lstrip("/")

    if not path.startswith("custom/"):
        raise HTTPException(403, "System policies cannot be deleted")

    file_path = _policy_dir() / path
    if not file_path.exists():
        raise HTTPException(404, f"Policy not found: {path}")

    file_path.unlink()
    _reload_engine()

    from src.core.audit import get_audit

    get_audit().log(
        actor=user.username,
        action="iam:DeletePolicy",
        resource_type="policy",
        resource_id=path,
        severity="warning",
    )


# ── Assignment management ────────────────────────────────────────────


@router.put("/assignments", response_model=AssignmentInfo)
def update_assignments(
    payload: AssignmentUpdateRequest,
    user: UserInfo = Depends(get_current_user),
) -> AssignmentInfo:
    """Update group/user policy assignments and/or default policy."""
    assign_path = _policy_dir() / "assignments.json"

    # Load existing
    if assign_path.exists():
        data = json.loads(assign_path.read_text(encoding="utf-8"))
    else:
        data = {
            "group_assignments": {},
            "user_assignments": {},
            "default_policy": "system/viewer.json",
        }

    # Apply partial updates
    if payload.group_assignments is not None:
        data["group_assignments"] = payload.group_assignments
    if payload.user_assignments is not None:
        data["user_assignments"] = payload.user_assignments
    if payload.default_policy is not None:
        data["default_policy"] = payload.default_policy

    assign_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    _reload_engine()

    from src.core.audit import get_audit

    get_audit().log(
        actor=user.username,
        action="iam:UpdateAssignments",
        resource_type="assignment",
        resource_id="assignments.json",
        severity="critical",
    )

    return AssignmentInfo(
        group_assignments=data.get("group_assignments", {}),
        user_assignments=data.get("user_assignments", {}),
        default_policy=data.get("default_policy"),
    )
