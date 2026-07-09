"""SPDX-License-Identifier: Apache-2.0

Settings routes — ``/api/v1/settings`` (connection info, notifications, alert thresholds).

Notification/alert preferences are Phase 2 features and return explicit 501
so the UI never hits a silent dead button.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from src.core.config import get_settings, settings

router = APIRouter(prefix="/settings", tags=["settings"])


class ConnectionInfo(BaseModel):
    """Read-only LDAP connection details from the active configuration."""

    host: str
    port: int
    use_ssl: bool
    bind_dn: str
    search_base: str
    read_only: bool = True


@router.get(
    "/connection", response_model=ConnectionInfo, summary="Get connection settings"
)
def get_connection() -> ConnectionInfo:
    """Return the current LDAP connection configuration (read-only)."""
    s = get_settings()
    return ConnectionInfo(
        host=s.ldap_host,
        port=s.ldap_port,
        use_ssl=s.ldap_use_ssl,
        bind_dn=s.ldap_bind_dn,
        search_base=s.ldap_search_base,
        read_only=True,
    )


class MfaSettings(BaseModel):
    """MFA feature state and enforcement policy."""

    mfa_enabled: bool
    mfa_required: bool


class MfaSettingsUpdate(BaseModel):
    """Request body for toggling MFA enforcement."""

    mfa_required: bool


@router.get("/mfa", response_model=MfaSettings, summary="Get MFA settings")
def get_mfa() -> MfaSettings:
    """Return the current MFA configuration (feature flag + enforcement)."""
    s = get_settings()
    return MfaSettings(
        mfa_enabled=s.mfa_enabled,
        mfa_required=s.mfa_required,
    )


@router.patch("/mfa", response_model=MfaSettings, summary="Update MFA settings")
def update_mfa(body: MfaSettingsUpdate) -> MfaSettings:
    """Toggle whether MFA is required for login.

    Only ``mfa_required`` is mutable; ``mfa_enabled`` is a read-only feature flag.
    """
    settings.mfa_required = body.mfa_required
    return MfaSettings(
        mfa_enabled=settings.mfa_enabled,
        mfa_required=settings.mfa_required,
    )


@router.patch(
    "/notifications",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    summary="Update notification preferences (Phase 2)",
)
def update_notifications() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "code": "NOT_IMPLEMENTED",
            "message": "Notification settings will be supported in Phase 2.",
        },
    )


@router.patch(
    "/alerts",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    summary="Update alert thresholds (Phase 2)",
)
def update_alerts() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "code": "NOT_IMPLEMENTED",
            "message": "Alert threshold settings will be supported in Phase 2.",
        },
    )
