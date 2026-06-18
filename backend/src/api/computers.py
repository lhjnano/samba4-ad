"""SPDX-License-Identifier: Apache-2.0

Computer / domain-join routes — ``/api/v1/computers``.
"""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse

from src.api._errors import to_http_error
from src.core.deps import get_directory
from src.models.common import Page
from src.models.computers import (
    ComputerDetail,
    ComputerStats,
    ComputerSummary,
    JoinTrendPoint,
    OsDistribution,
)
from src.services.directory import DirectoryBackend, DirectoryError

router = APIRouter(prefix="/computers", tags=["computers"])


@router.get("", response_model=Page[ComputerSummary])
def list_computers(
    q: str | None = Query(None, description="Search by hostname or IP"),
    search: str | None = Query(None, description="Search (alias for q)"),
    os_filter: str | None = Query(
        None, alias="os", description="Filter by operating system"
    ),
    status_filter: str | None = Query(
        None, alias="status", description="active|inactive|stale"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, alias="page_size", ge=1, le=500),
    directory: DirectoryBackend = Depends(get_directory),
) -> Page[ComputerSummary]:
    items, total = directory.list_computers(
        q=search or q,
        os_filter=os_filter,
        status=status_filter,
        page=page,
        limit=page_size,
    )
    return Page.of(items, total, page, page_size)


@router.get("/stats", response_model=ComputerStats)
def computer_stats(
    directory: DirectoryBackend = Depends(get_directory),
) -> ComputerStats:
    return directory.computer_stats()


@router.get("/os-distribution", response_model=list[OsDistribution])
def os_distribution(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[OsDistribution]:
    return directory.computer_os_distribution()


@router.get("/join-trend", response_model=list[JoinTrendPoint])
def join_trend(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[JoinTrendPoint]:
    return directory.computer_join_trend()


@router.get(
    "/export",
    summary="Export devices CSV",
)
def export_computers(
    directory: DirectoryBackend = Depends(get_directory),
) -> StreamingResponse:
    """Export all computers as a downloadable CSV file."""
    items, _ = directory.list_computers(page=1, limit=10000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "hostname",
            "dns_hostname",
            "operating_system",
            "os_version",
            "ou",
            "status",
            "last_logon",
            "join_date",
        ]
    )
    for c in items:
        writer.writerow(
            [
                c.hostname,
                c.dns_hostname or "",
                c.operating_system or "",
                c.operating_system_version or "",
                c.ou,
                c.status.value,
                c.last_logon.isoformat() if c.last_logon else "",
                c.join_date.isoformat() if c.join_date else "",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=computers.csv"},
    )


@router.get("/{item_id}", response_model=ComputerDetail)
def get_computer(
    item_id: str, directory: DirectoryBackend = Depends(get_directory)
) -> ComputerDetail:
    try:
        return directory.get_computer(item_id)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.patch("/{item_id}/status", response_model=ComputerDetail)
def set_computer_status(
    item_id: str,
    status_value: str = Query(..., alias="status", description="active|inactive"),
    directory: DirectoryBackend = Depends(get_directory),
) -> ComputerDetail:
    try:
        return directory.set_computer_status(item_id, status_value)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.post("/{item_id}/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_computer(
    item_id: str, directory: DirectoryBackend = Depends(get_directory)
) -> None:
    try:
        directory.reset_computer(item_id)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_computer(
    item_id: str, directory: DirectoryBackend = Depends(get_directory)
) -> None:
    try:
        directory.delete_computer(item_id)
    except DirectoryError as e:
        raise to_http_error(e) from e
