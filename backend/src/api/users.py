"""SPDX-License-Identifier: Apache-2.0

User management routes — ``/api/v1/users``.

Every interactive element from ``docs/tracking/02-users.md`` is wired to an
endpoint here. No dead handlers: undefined Phase 2 items (e.g. CSV export) are
explicitly marked and return 501, not silent no-ops.
"""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from src.api._errors import to_http_error
from src.core.deps import get_directory
from src.models.common import Page
from src.models.domain import AccountStatus
from src.models.users import (
    LoginEvent,
    ResetPasswordRequest,
    UserCreate,
    UserDetail,
    UserStats,
    UserSummary,
    UserUpdate,
)
from src.services.directory import (
    DirectoryBackend,
    DirectoryError,
    EntryExistsError,
    EntryNotFoundError,
)

router = APIRouter(prefix="/users", tags=["users"])


def _to_http(err: DirectoryError) -> HTTPException:
    return to_http_error(err)


@router.get("", response_model=Page[UserSummary], summary="List / search users")
def list_users(
    q: str | None = Query(
        None, description="Search by username, display name, or email"
    ),
    ou: str | None = Query(None, description="Filter by OU (e.g. Dev Team)"),
    status_filter: str | None = Query(
        None, alias="status", description="active|inactive|locked"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, alias="page_size", ge=1, le=500),
    sort: str = Query("username"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    directory: DirectoryBackend = Depends(get_directory),
) -> Page[UserSummary]:
    items, total = directory.list_users(
        q=q,
        ou=ou,
        status=status_filter,
        page=page,
        limit=page_size,
        sort=sort,
        order=order,
    )
    return Page.of(items, total, page, page_size)


@router.get("/stats", response_model=UserStats, summary="User aggregate stats")
def user_stats(directory: DirectoryBackend = Depends(get_directory)) -> UserStats:
    return directory.user_stats()


@router.get(
    "/export",
    summary="Export users CSV",
)
def export_users(
    directory: DirectoryBackend = Depends(get_directory),
) -> StreamingResponse:
    """Export all matching users as a downloadable CSV file."""
    items, _ = directory.list_users(page=1, limit=10000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["username", "display_name", "email", "ou", "status", "last_logon"])
    for u in items:
        writer.writerow(
            [
                u.username,
                u.display_name or "",
                u.email or "",
                u.ou,
                u.status.value,
                u.last_logon.isoformat() if u.last_logon else "",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users.csv"},
    )


@router.get("/{item_id}", response_model=UserDetail, summary="User detail")
def get_user(
    item_id: str, directory: DirectoryBackend = Depends(get_directory)
) -> UserDetail:
    try:
        return directory.get_user(item_id)
    except EntryNotFoundError as err:
        raise _to_http(err) from err
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "LDAP_ENTRY_NOT_FOUND", "message": str(err)},
        ) from err


@router.post(
    "",
    response_model=UserDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create user",
)
def create_user(
    payload: UserCreate,
    directory: DirectoryBackend = Depends(get_directory),
) -> UserDetail:
    try:
        return directory.create_user(payload)
    except EntryExistsError as err:
        raise _to_http(err) from err


@router.patch("/{item_id}", response_model=UserDetail, summary="Update user")
def update_user(
    item_id: str,
    payload: UserUpdate,
    directory: DirectoryBackend = Depends(get_directory),
) -> UserDetail:
    try:
        return directory.update_user(item_id, **payload.model_dump(exclude_unset=True))
    except EntryNotFoundError as err:
        raise _to_http(err) from err


@router.patch(
    "/{item_id}/status", response_model=UserDetail, summary="Enable/Disable/Lock user"
)
def set_user_status(
    item_id: str,
    status_value: AccountStatus = Query(..., alias="status"),
    directory: DirectoryBackend = Depends(get_directory),
) -> UserDetail:
    try:
        return directory.set_user_status(item_id, status_value.value)
    except EntryNotFoundError as err:
        raise _to_http(err) from err


@router.post(
    "/{item_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reset password",
)
def reset_password(
    item_id: str,
    payload: ResetPasswordRequest,
    directory: DirectoryBackend = Depends(get_directory),
) -> None:
    try:
        directory.reset_password(item_id, payload.new_password)
    except EntryNotFoundError as err:
        raise _to_http(err) from err


@router.delete(
    "/{item_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete user"
)
def delete_user(
    item_id: str,
    directory: DirectoryBackend = Depends(get_directory),
) -> None:
    try:
        directory.delete_user(item_id)
    except EntryNotFoundError as err:
        raise _to_http(err) from err


@router.get(
    "/{item_id}/login-history",
    response_model=list[LoginEvent],
    summary="User login history",
)
def user_login_history(
    item_id: str,
    directory: DirectoryBackend = Depends(get_directory),
) -> list[LoginEvent]:
    try:
        return directory.user_login_history(item_id)
    except EntryNotFoundError as err:
        raise _to_http(err) from err
