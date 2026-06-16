"""SPDX-License-Identifier: Apache-2.0

Shared HTTP error mapping used by all route modules.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from src.services.directory import DirectoryError

_STATUS_BY_CODE = {
    "LDAP_ENTRY_NOT_FOUND": status.HTTP_404_NOT_FOUND,
    "LDAP_ENTRY_EXISTS": status.HTTP_409_CONFLICT,
    "LDAP_INSUFFICIENT_RIGHTS": status.HTTP_403_FORBIDDEN,
    "INVALID_ARGUMENT": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "LDAP_OPERATION_FAILED": status.HTTP_500_INTERNAL_SERVER_ERROR,
}


def to_http_error(err: DirectoryError) -> HTTPException:
    """Translate a :class:`DirectoryError` into an :class:`HTTPException`."""
    return HTTPException(
        status_code=_STATUS_BY_CODE.get(
            err.code, status.HTTP_500_INTERNAL_SERVER_ERROR
        ),
        detail={"code": err.code, "message": err.message},
    )
