"""SPDX-License-Identifier: Apache-2.0

Alerts routes — ``/api/v1/alerts`` (recent security alerts list).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from src.core.deps import get_directory
from src.models.stats import AlertItem
from src.services.directory import DirectoryBackend

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertItem], summary="Recent alerts")
def list_alerts(
    limit: int = Query(10, ge=1, le=100),
    directory: DirectoryBackend = Depends(get_directory),
) -> list[AlertItem]:
    return directory.recent_alerts(limit)  # type: ignore[attr-defined]
