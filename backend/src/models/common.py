"""SPDX-License-Identifier: Apache-2.0

Common API schemas: pagination, standard error envelopes, and DN id helpers.

``id`` strategy
---------------
LDAP resources are uniquely identified by their *distinguished name* (DN),
e.g. ``CN=jdoe,OU=Engineering,DC=TEST,DC=LOCAL``. DNs contain commas and are not
URL-safe, so we expose a URL-safe base64url-encoded DN as the opaque resource
``id``. Clients receive the ``id`` from list responses and pass it back to
detail/mutate endpoints — they never construct it themselves.

This keeps REST paths clean (``/api/v1/users/{id}``) while remaining fully
reversible and LDAP-correct. The encoding is documented on every schema.
"""

from __future__ import annotations

import base64
from collections.abc import Sequence
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, Field, StringConstraints

T = TypeVar("T")

# A pragmatic email type. AD directory emails frequently use internal TLDs
# (e.g. ``user@test.local``) which the strict ``EmailStr`` rejects. We validate
# shape but permit any TLD to match real AD data ("Data First").
Email = Annotated[
    str,
    StringConstraints(
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        max_length=320,
    ),
]


# ---------------------------------------------------------------------------
# DN <-> opaque id encoding
# ---------------------------------------------------------------------------


def encode_id(dn: str) -> str:
    """Encode an LDAP distinguished name into a URL-safe opaque id."""
    return base64.urlsafe_b64encode(dn.encode("utf-8")).decode("ascii").rstrip("=")


def decode_id(item_id: str) -> str:
    """Decode an opaque id back into an LDAP distinguished name.

    Raises :class:`ValueError` on malformed input.
    """
    padding = "=" * (-len(item_id) % 4)
    try:
        return base64.urlsafe_b64decode(item_id + padding).decode("utf-8")
    except (ValueError, UnicodeDecodeError) as exc:  # pragma: no cover
        raise ValueError(f"Invalid resource id: {item_id!r}") from exc


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------


class Page(BaseModel, Generic[T]):
    """A paginated list response.

    Attributes:
        items: page slice of results.
        total: total matching items across all pages.
        page: current 1-based page number.
        limit: page size.
        pages: total number of pages.
    """

    items: list[T]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    limit: int = Field(ge=1, le=500)
    pages: int = Field(ge=0)

    @classmethod
    def of(cls, items: Sequence[T], total: int, page: int, limit: int) -> Page[T]:
        pages = (total + limit - 1) // limit if limit else 0
        return cls(
            items=list(items),
            total=total,
            page=page,
            limit=limit,
            pages=pages,
        )


# ---------------------------------------------------------------------------
# Error envelope
# ---------------------------------------------------------------------------


class ErrorDetail(BaseModel):
    """Structured error body returned on non-2xx responses."""

    code: str = Field(description="Machine-readable error code, e.g. LDAP_ENTRY_EXISTS")
    message: str = Field(description="Human-readable message (Korean for this app)")
    details: dict[str, object] | None = None


# ---------------------------------------------------------------------------
# Standard error codes (used by services + routes)
# ---------------------------------------------------------------------------

ERR_ENTRY_NOT_FOUND = "LDAP_ENTRY_NOT_FOUND"
ERR_ENTRY_EXISTS = "LDAP_ENTRY_EXISTS"
ERR_INSUFFICIENT_RIGHTS = "LDAP_INSUFFICIENT_RIGHTS"
ERR_INVALID_CREDENTIALS = "LDAP_INVALID_CREDENTIALS"
ERR_INVALID_ARGUMENT = "INVALID_ARGUMENT"
ERR_OPERATION_FAILED = "LDAP_OPERATION_FAILED"
ERR_UNAVAILABLE = "DIRECTORY_UNAVAILABLE"
