"""SPDX-License-Identifier: Apache-2.0

Organizational Unit routes — ``/api/v1/ou``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

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


@router.get("", response_model=list[OuTreeNode])
def search_ou(
    q: str | None = Query(None),
    directory: DirectoryBackend = Depends(get_directory),
) -> list[OuTreeNode]:
    tree = directory.ou_tree()
    if not q:
        return tree
    ql = q.lower()

    def matches(node: OuTreeNode) -> bool:
        return ql in node.name.lower() or any(matches(c) for c in node.children)

    return [n for n in tree if matches(n)]


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
