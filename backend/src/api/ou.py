"""SPDX-License-Identifier: Apache-2.0

Organizational Unit routes — ``/api/v1/ou``.

``GET /ou`` returns a paginated flat list (for the management table).
``GET /ou/tree`` returns the hierarchical tree (for tree-view widgets).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field

from src.api._errors import to_http_error
from src.core.deps import get_directory
from src.models.common import decode_id
from src.models.ou import (
    GpoLinkRequest,
    OuCreate,
    OuDetail,
    OuStats,
    OuTreeNode,
    OuUpdate,
)
from src.services.directory import DirectoryBackend, DirectoryError

router = APIRouter(prefix="/ou", tags=["ou"])


# ── Paginated list response (matches frontend Paginated<ADOU>) ────────


class OuListItem(BaseModel):
    """Flat OU row for the management table (matches frontend ADOU type)."""

    id: str
    name: str
    dn: str
    description: str | None = None
    child_ous: int = Field(ge=0)
    user_count: int = Field(ge=0)
    computer_count: int = Field(ge=0)
    gpo_links: list[str] = Field(default_factory=list)


class PaginatedOUs(BaseModel):
    items: list[OuListItem]
    total: int
    page: int
    page_size: int
    pages: int


def _flatten_tree(
    nodes: list[OuTreeNode], acc: list[OuListItem] | None = None
) -> list[OuListItem]:
    """Recursively flatten OU tree into a flat list."""
    if acc is None:
        acc = []
    for node in nodes:
        acc.append(
            OuListItem(
                id=node.id,
                name=node.name,
                dn=node.dn,
                description=node.description,
                child_ous=len(node.children),
                user_count=node.user_count,
                computer_count=node.computer_count,
                gpo_links=[],  # names populated from detail if needed
            )
        )
        _flatten_tree(node.children, acc)
    return acc


@router.get("", response_model=PaginatedOUs)
def list_ous(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    q: str | None = Query(None),  # alias for backward compat
    directory: DirectoryBackend = Depends(get_directory),
) -> PaginatedOUs:
    """Paginated flat list of OUs (for the management table)."""
    query = search or q
    tree = directory.ou_tree()
    flat = _flatten_tree(tree)

    if query:
        ql = query.lower()
        flat = [o for o in flat if ql in o.name.lower()]

    total = len(flat)
    pages = (total + page_size - 1) // page_size if total else 1
    start = (page - 1) * page_size
    items = flat[start : start + page_size]

    return PaginatedOUs(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/tree", response_model=list[OuTreeNode])
def ou_tree(directory: DirectoryBackend = Depends(get_directory)) -> list[OuTreeNode]:
    return directory.ou_tree()


@router.get("/stats", response_model=OuStats)
def ou_stats(directory: DirectoryBackend = Depends(get_directory)) -> OuStats:
    return directory.ou_stats()


@router.get("/{item_id}", response_model=OuDetail)
def get_ou(
    item_id: str, directory: DirectoryBackend = Depends(get_directory)
) -> OuDetail:
    try:
        return directory.get_ou(item_id)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.post("", response_model=OuTreeNode, status_code=status.HTTP_201_CREATED)
def create_ou(
    payload: OuCreate,
    directory: DirectoryBackend = Depends(get_directory),
) -> OuTreeNode:
    try:
        return directory.create_ou(payload)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.patch("/{item_id}", response_model=OuDetail)
def update_ou(
    item_id: str,
    payload: OuUpdate,
    directory: DirectoryBackend = Depends(get_directory),
) -> OuDetail:
    try:
        return directory.update_ou(item_id, **payload.model_dump(exclude_unset=True))
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ou(
    item_id: str, directory: DirectoryBackend = Depends(get_directory)
) -> None:
    try:
        directory.delete_ou(item_id)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.post("/{item_id}/gpo-links", response_model=OuDetail)
def link_gpo(
    item_id: str,
    payload: GpoLinkRequest,
    directory: DirectoryBackend = Depends(get_directory),
) -> OuDetail:
    try:
        directory.link_gpo(payload.gpo_id, decode_id(item_id), payload.enforced)
        return directory.get_ou(item_id)
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.delete("/{item_id}/gpo-links/{gpo_id}", response_model=OuDetail)
def unlink_gpo(
    item_id: str,
    gpo_id: str,
    directory: DirectoryBackend = Depends(get_directory),
) -> OuDetail:
    try:
        directory.unlink_gpo(gpo_id, decode_id(item_id))
        return directory.get_ou(item_id)
    except DirectoryError as e:
        raise to_http_error(e) from e
