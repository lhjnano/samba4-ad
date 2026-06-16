"""SPDX-License-Identifier: Apache-2.0

Group management routes — ``/api/v1/groups``.
"""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from src.api._errors import to_http_error
from src.core.deps import get_directory
from src.models.common import Page
from src.models.groups import (
    AddMembersRequest,
    GroupCreate,
    GroupDetail,
    GroupStats,
    GroupSummary,
    GroupUpdate,
)
from src.services.directory import DirectoryBackend, DirectoryError

router = APIRouter(prefix="/groups", tags=["groups"])


def _err(e: DirectoryError) -> HTTPException:
    return to_http_error(e)


@router.get("", response_model=Page[GroupSummary])
def list_groups(
    q: str | None = Query(None),
    category: str | None = Query(None, description="security|distribution"),
    scope: str | None = Query(None, description="domain|global|universal"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    directory: DirectoryBackend = Depends(get_directory),
) -> Page[GroupSummary]:
    items, total = directory.list_groups(
        q=q, category=category, scope=scope, page=page, limit=limit
    )
    return Page.of(items, total, page, limit)


@router.get("/stats", response_model=GroupStats)
def group_stats(directory: DirectoryBackend = Depends(get_directory)) -> GroupStats:
    return directory.group_stats()


@router.get(
    "/export",
    summary="Export groups CSV",
)
def export_groups(
    directory: DirectoryBackend = Depends(get_directory),
) -> StreamingResponse:
    """Export all groups as a downloadable CSV file."""
    items, _ = directory.list_groups(page=1, limit=10000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["name", "category", "scope", "member_count", "description", "managed_by"]
    )
    for g in items:
        writer.writerow(
            [
                g.name,
                g.category.value,
                g.scope.value,
                g.member_count,
                g.description or "",
                g.managed_by or "",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=groups.csv"},
    )


@router.get("/{item_id}", response_model=GroupDetail)
def get_group(
    item_id: str, directory: DirectoryBackend = Depends(get_directory)
) -> GroupDetail:
    try:
        return directory.get_group(item_id)
    except DirectoryError as e:
        raise _err(e) from e


@router.post("", response_model=GroupDetail, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: GroupCreate,
    directory: DirectoryBackend = Depends(get_directory),
) -> GroupDetail:
    try:
        return directory.create_group(payload)
    except DirectoryError as e:
        raise _err(e) from e


@router.patch("/{item_id}", response_model=GroupDetail)
def update_group(
    item_id: str,
    payload: GroupUpdate,
    directory: DirectoryBackend = Depends(get_directory),
) -> GroupDetail:
    try:
        return directory.update_group(item_id, **payload.model_dump(exclude_unset=True))
    except DirectoryError as e:
        raise _err(e) from e


@router.post("/{item_id}/members", response_model=GroupDetail)
def add_members(
    item_id: str,
    payload: AddMembersRequest,
    directory: DirectoryBackend = Depends(get_directory),
) -> GroupDetail:
    try:
        return directory.add_group_members(item_id, payload.member_dns)
    except DirectoryError as e:
        raise _err(e) from e


@router.delete("/{item_id}/members/{member_dn}", response_model=GroupDetail)
def remove_member(
    item_id: str,
    member_dn: str,
    directory: DirectoryBackend = Depends(get_directory),
) -> GroupDetail:
    try:
        return directory.remove_group_member(item_id, member_dn)
    except DirectoryError as e:
        raise _err(e) from e


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    item_id: str, directory: DirectoryBackend = Depends(get_directory)
) -> None:
    try:
        directory.delete_group(item_id)
    except DirectoryError as e:
        raise _err(e) from e


@router.get(
    "/{item_id}/members/export",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    summary="Export group members CSV (Phase 2)",
)
def export_group_members(item_id: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "code": "NOT_IMPLEMENTED",
            "message": "Group member CSV export will be supported in Phase 2.",
        },
    )
