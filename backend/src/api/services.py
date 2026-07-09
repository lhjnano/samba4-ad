"""SPDX-License-Identifier: Apache-2.0

Service management routes — /api/v1/services.

Allows administrators to view and control Samba AD DC related services
from the web UI.
"""

from __future__ import annotations

import subprocess
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.core.auth import UserInfo, get_current_user

router = APIRouter(prefix="/services", tags=["services"])


# Services we manage
_MANAGED_SERVICES = [
    "samba-ad-dc",
    "smbd",
    "nmbd",
    "winbind",
    "named",
    "nscd",
]

_DISPLAY_NAMES = {
    "samba-ad-dc": "Samba AD DC",
    "smbd": "SMB Daemon",
    "nmbd": "NetBIOS Daemon",
    "winbind": "Winbind",
    "named": "DNS Server (BIND)",
    "nscd": "Name Service Cache",
}


class ServiceStatus(BaseModel):
    name: str
    display_name: str
    active: bool
    status: str  # active, inactive, failed, unknown
    enabled: bool


class ServiceActionRequest(BaseModel):
    action: Literal["start", "stop", "restart", "reload"]


class ServiceActionResponse(BaseModel):
    name: str
    action: str
    success: bool
    message: str
    new_status: str


def _run_systemctl(args: list[str]) -> tuple[int, str]:
    """Run systemctl and return (returncode, output)."""
    try:
        result = subprocess.run(
            ["systemctl", *args],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.returncode, (result.stdout + result.stderr).strip()
    except FileNotFoundError:
        return 1, "systemctl not found"
    except subprocess.TimeoutExpired:
        return 1, "Command timed out"


def _get_status(name: str) -> ServiceStatus:
    rc_active, _ = _run_systemctl(["is-active", name])
    rc_enabled, _ = _run_systemctl(["is-enabled", name])

    active = rc_active == 0
    if active:
        status = "active"
    elif rc_active == 3:
        status = "inactive"
    elif rc_active == 4:
        status = "unknown"
    else:
        status = "failed"

    return ServiceStatus(
        name=name,
        display_name=_DISPLAY_NAMES.get(name, name),
        active=active,
        status=status,
        enabled=rc_enabled == 0,
    )


@router.get("", response_model=list[ServiceStatus], summary="List service statuses")
def list_services(
    user: UserInfo = Depends(get_current_user),
) -> list[ServiceStatus]:
    """Get status of all managed Samba services."""
    return [_get_status(name) for name in _MANAGED_SERVICES]


@router.get("/{name}", response_model=ServiceStatus, summary="Get service status")
def get_service(
    name: str,
    user: UserInfo = Depends(get_current_user),
) -> ServiceStatus:
    if name not in _MANAGED_SERVICES:
        raise HTTPException(400, f"Unknown service: {name}")
    return _get_status(name)


@router.post(
    "/{name}/action", response_model=ServiceActionResponse, summary="Control service"
)
def service_action(
    name: str,
    body: ServiceActionRequest,
    user: UserInfo = Depends(get_current_user),
) -> ServiceActionResponse:
    """Start, stop, or restart a service."""
    if name not in _MANAGED_SERVICES:
        raise HTTPException(400, f"Unknown service: {name}")

    rc, output = _run_systemctl([body.action, name])
    new_status = _get_status(name)

    from src.core.audit import get_audit

    get_audit().log(
        actor=user.username,
        action=f"service:{body.action.capitalize()}",
        resource_type="service",
        resource_id=name,
        severity="critical" if body.action in ("stop", "restart") else "warning",
        detail=f"{body.action} {name}: {'OK' if rc == 0 else 'FAILED'}",
    )

    return ServiceActionResponse(
        name=name,
        action=body.action,
        success=rc == 0,
        message=output if rc != 0 else f"{name} {body.action} successful",
        new_status=new_status.status,
    )
