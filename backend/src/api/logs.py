"""SPDX-License-Identifier: Apache-2.0

System logs routes — ``/api/v1/logs``.

Returns paginated log entries. In mock mode returns an empty list
(freshly provisioned domain has no audit history). In production
they can read from journald or ``/var/log/samba/``.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter(prefix="/logs", tags=["logs"])


class LogEntry(BaseModel):
    id: str
    timestamp: str
    severity: str  # info | warning | critical
    source: str
    message: str


class PaginatedLogs(BaseModel):
    items: list[LogEntry]
    total: int
    page: int
    page_size: int
    pages: int


# ── Mock data (empty — fresh domain) ──────────────────────────────────

_all_logs: list[LogEntry] = []


@router.get("", response_model=PaginatedLogs)
def list_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    severity: str | None = Query(None),
    source: str | None = Query(None),
    q: str | None = Query(None),
) -> PaginatedLogs:
    """List system logs with optional filtering and pagination."""
    filtered = _all_logs
    if severity:
        filtered = [e for e in filtered if e.severity == severity]
    if source:
        filtered = [e for e in filtered if e.source == source]
    if q:
        filtered = [e for e in filtered if q.lower() in e.message.lower()]

    total = len(filtered)
    pages = (total + page_size - 1) // page_size
    start = (page - 1) * page_size
    items = filtered[start : start + page_size]

    return PaginatedLogs(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )
