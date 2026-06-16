"""SPDX-License-Identifier: Apache-2.0

Settings routes — ``/api/v1/settings`` (notifications, alert thresholds).

Phase 2 features — all return explicit 501 so the UI never hits a silent
dead button.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/settings", tags=["settings"])


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
