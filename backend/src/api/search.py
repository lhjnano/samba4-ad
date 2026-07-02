"""SPDX-License-Identifier: Apache-2.0

Global search routes — ``/api/v1/search``.

Aggregates results across users, groups, computers, and OUs so the
frontend Topbar can show a unified quick-jump dropdown.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from src.core.deps import get_directory
from src.services.directory import DirectoryBackend

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["search"])


class SearchHit(BaseModel):
    type: str  # "user" | "group" | "computer" | "ou"
    id: str
    name: str
    description: str = ""
    path: str = ""  # frontend route for navigation


class SearchResponse(BaseModel):
    query: str
    total: int
    results: list[SearchHit]


def _search_users(directory: DirectoryBackend, q: str) -> list[SearchHit]:
    try:
        users, _ = directory.list_users(q=q, page=1, limit=5)
    except Exception:
        logger.warning("Search users failed", exc_info=True)
        return []
    return [
        SearchHit(
            type="user",
            id=u.id,
            name=u.username,
            description=u.display_name or "",
            path="/users",
        )
        for u in users
    ]


def _search_groups(directory: DirectoryBackend, q: str) -> list[SearchHit]:
    try:
        groups, _ = directory.list_groups(q=q, page=1, limit=5)
    except Exception:
        logger.warning("Search groups failed", exc_info=True)
        return []
    return [
        SearchHit(
            type="group",
            id=g.id,
            name=g.name,
            description=g.description or "",
            path="/groups",
        )
        for g in groups
    ]


def _search_computers(directory: DirectoryBackend, q: str) -> list[SearchHit]:
    try:
        computers, _ = directory.list_computers(q=q, page=1, limit=5)
    except Exception:
        logger.warning("Search computers failed", exc_info=True)
        return []
    return [
        SearchHit(
            type="computer",
            id=c.id,
            name=c.hostname,
            description=c.operating_system or "",
            path="/computers",
        )
        for c in computers
    ]


@router.get("", response_model=SearchResponse)
def global_search(
    q: str = Query(..., min_length=1, max_length=100),
    directory: DirectoryBackend = Depends(get_directory),
) -> SearchResponse:
    """Search across users, groups, computers, and OUs."""
    results: list[SearchHit] = []
    results.extend(_search_users(directory, q))
    results.extend(_search_groups(directory, q))
    results.extend(_search_computers(directory, q))
    return SearchResponse(query=q, total=len(results), results=results)
