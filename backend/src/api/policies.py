"""SPDX-License-Identifier: Apache-2.0

Combined domain policies route — ``/api/v1/policies``.

The frontend Policies page expects a single ``GET/PATCH /policies/domain``
that returns both password and lockout policy together. This router
delegates to the directory backend's existing methods.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from src.api._errors import to_http_error
from src.core.deps import get_directory
from src.services.directory import DirectoryBackend, DirectoryError

router = APIRouter(prefix="/policies", tags=["policies"])


class DomainPolicy(BaseModel):
    """Combined password + lockout policy (matches frontend type)."""

    complex_passwords: bool = True
    min_password_length: int = 7
    password_history: int = 24
    max_password_age_days: int = 42
    min_password_age_days: int = 1
    account_lockout_threshold: int = 0
    account_lockout_duration_minutes: int = 30
    reset_lockout_after_minutes: int = 30


class DomainPolicyUpdate(BaseModel):
    complex_passwords: bool | None = None
    min_password_length: int | None = None
    password_history: int | None = None
    max_password_age_days: int | None = None
    min_password_age_days: int | None = None
    account_lockout_threshold: int | None = None
    account_lockout_duration_minutes: int | None = None
    reset_lockout_after_minutes: int | None = None


@router.get("/domain", response_model=DomainPolicy)
def get_domain_policy(
    directory: DirectoryBackend = Depends(get_directory),
) -> DomainPolicy:
    """Get combined password + lockout policy."""
    try:
        pw = directory.password_policy()
        lo = directory.lockout_policy()
        return DomainPolicy(
            complex_passwords=pw.complexity,
            min_password_length=pw.min_length,
            password_history=pw.history,
            max_password_age_days=pw.max_age_days,
            min_password_age_days=pw.min_age_days,
            account_lockout_threshold=lo.threshold,
            account_lockout_duration_minutes=lo.duration_minutes,
            reset_lockout_after_minutes=lo.observation_window_minutes,
        )
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.patch("/domain", response_model=DomainPolicy)
def update_domain_policy(
    payload: DomainPolicyUpdate,
    directory: DirectoryBackend = Depends(get_directory),
) -> DomainPolicy:
    """Update password and/or lockout policy."""
    try:
        pw_fields = {}
        if payload.complex_passwords is not None:
            pw_fields["complexity"] = payload.complex_passwords
        if payload.min_password_length is not None:
            pw_fields["min_length"] = payload.min_password_length
        if payload.password_history is not None:
            pw_fields["history"] = payload.password_history
        if payload.max_password_age_days is not None:
            pw_fields["max_age_days"] = payload.max_password_age_days
        if payload.min_password_age_days is not None:
            pw_fields["min_age_days"] = payload.min_password_age_days

        lo_fields = {}
        if payload.account_lockout_threshold is not None:
            lo_fields["threshold"] = payload.account_lockout_threshold
        if payload.account_lockout_duration_minutes is not None:
            lo_fields["duration_minutes"] = payload.account_lockout_duration_minutes
        if payload.reset_lockout_after_minutes is not None:
            lo_fields["observation_window_minutes"] = (
                payload.reset_lockout_after_minutes
            )

        if pw_fields:
            directory.set_password_policy(**pw_fields)
        if lo_fields:
            directory.set_lockout_policy(**lo_fields)

        # Return updated policy
        pw = directory.password_policy()
        lo = directory.lockout_policy()
        return DomainPolicy(
            complex_passwords=pw.complexity,
            min_password_length=pw.min_length,
            password_history=pw.history,
            max_password_age_days=pw.max_age_days,
            min_password_age_days=pw.min_age_days,
            account_lockout_threshold=lo.threshold,
            account_lockout_duration_minutes=lo.duration_minutes,
            reset_lockout_after_minutes=lo.observation_window_minutes,
        )
    except DirectoryError as e:
        raise to_http_error(e) from e
