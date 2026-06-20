"""SPDX-License-Identifier: Apache-2.0

IAM (Identity and Access Management) routes — ``/api/v1/iam``.

Provides policy introspection, evaluation testing, and assignment
management for the PBAC engine.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from src.core.auth import UserInfo, get_current_user
from src.core.pbac import get_engine

router = APIRouter(prefix="/iam", tags=["iam"])


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


@router.get("/policies", response_model=list[PolicySummary])
def list_policies(
    user: UserInfo = Depends(get_current_user),
) -> list[PolicySummary]:
    """List all loaded policies."""
    engine = get_engine()
    if engine is None:
        return []
    return [PolicySummary(**p) for p in engine.list_policies()]


@router.get("/assignments", response_model=AssignmentInfo)
def get_assignments(
    user: UserInfo = Depends(get_current_user),
) -> AssignmentInfo:
    """Get current group/user → policy assignments."""
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
    """Evaluate whether the current user can perform *action* on *resource*.

    Useful for UI to show/hide buttons based on permissions.
    """
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
