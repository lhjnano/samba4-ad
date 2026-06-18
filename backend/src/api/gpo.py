"""SPDX-License-Identifier: Apache-2.0

Group Policy Object routes — ``/api/v1/gpo``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from src.api._errors import to_http_error
from src.core.deps import get_directory
from src.models.domain import GpoStatus
from src.models.gpo import (
    GpoCreate,
    GpoDetail,
    GpoLinkTargetRequest,
    GpoStats,
)
from src.services.directory import DirectoryBackend, DirectoryError

router = APIRouter(prefix="/gpo", tags=["gpo"])


# ── List item matching frontend GPO type ──────────────────────────────


class GpoListItem(BaseModel):
    """Flat GPO row for the management table (matches frontend GPO type)."""

    id: str
    display_name: str
    status: str = "enabled"
    description: str = ""
    link_count: int = 0


class PaginatedGPOs(BaseModel):
    items: list[GpoListItem]
    total: int
    page: int
    page_size: int
    pages: int


@router.get("", response_model=PaginatedGPOs)
def list_gpos(
    q: str | None = Query(None, description="Search by GPO display name"),
    status_filter: str | None = Query(
        None, alias="status", description="enabled|disabled"
    ),
    search: str | None = Query(None, description="Search (alias for q)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    directory: DirectoryBackend = Depends(get_directory),
) -> PaginatedGPOs:
    """Paginated GPO list matching frontend GPO type."""
    query = q or search
    limit = page_size  # backend directory uses 'limit' internally
    items, total = directory.list_gpos(
        q=query, status=status_filter, page=page, limit=limit
    )
    pages = (total + limit - 1) // limit if total else 1
    mapped = [
        GpoListItem(
            id=g.id,
            display_name=g.display_name,
            description=g.description or "",
            status=g.status.value if hasattr(g.status, "value") else str(g.status),
            link_count=g.link_count,
        )
        for g in items
    ]
    return PaginatedGPOs(
        items=mapped,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/stats", response_model=GpoStats)
def gpo_stats(directory: DirectoryBackend = Depends(get_directory)) -> GpoStats:
    return directory.gpo_stats()


@router.get("/{item_id}", response_model=GpoDetail)
def get_gpo(
    item_id: str, directory: DirectoryBackend = Depends(get_directory)
) -> GpoDetail:
    try:
        return directory.get_gpo(item_id)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.post("", response_model=GpoDetail, status_code=status.HTTP_201_CREATED)
def create_gpo(
    payload: GpoCreate,
    directory: DirectoryBackend = Depends(get_directory),
) -> GpoDetail:
    try:
        return directory.create_gpo(payload.display_name, payload.ou_dn)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.patch("/{item_id}/status", response_model=GpoDetail)
def set_gpo_status(
    item_id: str,
    status_value: GpoStatus = Query(..., alias="status"),
    directory: DirectoryBackend = Depends(get_directory),
) -> GpoDetail:
    try:
        return directory.set_gpo_status(item_id, status_value.value)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.post("/{item_id}/links", response_model=GpoDetail)
def link_gpo_to_ou(
    item_id: str,
    payload: GpoLinkTargetRequest,
    directory: DirectoryBackend = Depends(get_directory),
) -> GpoDetail:
    try:
        return directory.link_gpo(item_id, payload.ou_dn, payload.enforced)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.delete("/{item_id}/links", response_model=GpoDetail)
def unlink_gpo(
    item_id: str,
    ou_dn: str = Query(..., description="OU DN to unlink"),
    directory: DirectoryBackend = Depends(get_directory),
) -> GpoDetail:
    try:
        return directory.unlink_gpo(item_id, ou_dn)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gpo(
    item_id: str, directory: DirectoryBackend = Depends(get_directory)
) -> None:
    try:
        directory.delete_gpo(item_id)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.post(
    "/{item_id}/backup",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    summary="Backup GPO (Phase 2)",
)
def backup_gpo(item_id: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "code": "NOT_IMPLEMENTED",
            "message": "GPO backup will be supported in Phase 2.",
        },
    )


@router.post(
    "/import",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    summary="Import GPO from backup (Phase 2)",
)
def import_gpo() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "code": "NOT_IMPLEMENTED",
            "message": "GPO import will be supported in Phase 2.",
        },
    )


@router.post(
    "/{item_id}/copy",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    summary="Copy GPO settings to new GPO (Phase 2)",
)
def copy_gpo(item_id: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "code": "NOT_IMPLEMENTED",
            "message": "GPO copy will be supported in Phase 2.",
        },
    )
