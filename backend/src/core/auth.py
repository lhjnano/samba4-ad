"""SPDX-License-Identifier: Apache-2.0

JWT authentication utilities and FastAPI dependencies.

* **Mock mode** — credentials checked against a local in-memory user table.
* **LDAP mode** — credentials validated via an LDAP simple bind against the AD.

Public routes (no auth required):
  - ``GET  /health``
  - ``POST /api/v1/auth/login``
  - ``GET  /api/v1/setup/status``
  - ``POST /api/v1/setup/provision``
  - ``GET  /docs``, ``GET  /openapi.json`` (FastAPI built-ins)

All other routes require a valid ``Authorization: Bearer <jwt>`` header.
"""

from __future__ import annotations

import os
import time
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.core.config import settings
from src.models.auth import UserInfo

# ── Config ────────────────────────────────────────────────────────────

# In production this MUST be set via env var.  For dev we generate a
# random one at import time (tokens won't survive restarts — acceptable
# for local development).
_JWT_SECRET = os.environ.get("JWT_SECRET", os.urandom(32).hex())
_JWT_ALGORITHM = "HS256"
_TOKEN_TTL = 8 * 3600  # 8 hours

# Bearer scheme — ``auto_error=False`` so we can customise 401 messages.
_bearer = HTTPBearer(auto_error=False)

# ── Mock user store (mock mode only) ──────────────────────────────────

_MOCK_USERS: dict[str, dict[str, Any]] = {
    "admin": {
        "password": "admin",
        "display_name": "Administrator",
        "email": "admin@corp.local",
        "role": "admin",
        "groups": ["Domain Admins", "Administrators"],
    },
}


# ── Token helpers ─────────────────────────────────────────────────────


def create_access_token(payload: dict[str, Any]) -> str:
    """Sign a JWT with the given claims."""
    claims = {
        **payload,
        "iat": int(time.time()),
        "exp": int(time.time()) + _TOKEN_TTL,
    }
    return jwt.encode(claims, _JWT_SECRET, algorithm=_JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Decode & verify a JWT. Raises ``HTTPException(401)`` on failure."""
    try:
        return jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        ) from None
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from None


# ── Credential verification ───────────────────────────────────────────


def verify_credentials(username: str, password: str) -> dict[str, Any] | None:
    """Verify username/password.

    Returns a user dict on success, ``None`` on failure.

    * mock mode → check ``_MOCK_USERS``
    * ldap mode → LDAP simple bind
    """
    if settings.app_mode == "mock":
        user = _MOCK_USERS.get(username.lower())
        if user and user["password"] == password:
            return user
        return None

    # LDAP mode — attempt a simple bind
    try:
        from ldap3 import Connection, Server

        # Extract sAMAccountName from various input formats
        sam = username.split("@")[0]
        if "\\" in sam:
            sam = sam.rsplit("\\", 1)[-1]

        # Build bind DN: if the caller passed a bare username, prepend the
        # search base; if they passed user@domain or CN=..., use as-is.
        if "\\" in username:
            _, sam_name = username.rsplit("\\", 1)
            domain = (
                settings.ldap_search_base.replace(",", ".")
                .replace("DC=", "")
                .replace("dc=", "")
            )
            bind_dn = f"{sam_name}@{domain}"
        elif "@" not in username:
            domain = (
                settings.ldap_search_base.replace(",", ".")
                .replace("DC=", "")
                .replace("dc=", "")
            )
            bind_dn = f"{username}@{domain}"
        else:
            bind_dn = username

        server = Server(
            settings.ldap_host,
            port=settings.ldap_port,
            use_ssl=settings.ldap_use_ssl,
            connect_timeout=10,
        )
        conn = Connection(
            server,
            user=bind_dn,
            password=password,
            authentication="SIMPLE",
            auto_bind=True,
            read_only=True,
        )

        if conn.bound:
            # Fetch user info
            search_filter = f"(sAMAccountName={sam})"
            conn.search(
                search_base=settings.ldap_search_base,
                search_filter=search_filter,
                attributes=["displayName", "mail", "memberOf", "cn"],
            )
            entry = conn.entries[0] if conn.entries else None
            conn.unbind()

            display_name = ""
            email = ""
            groups: list[str] = []
            if entry:
                display_name = (
                    str(entry.displayName) if entry.displayName else str(entry.cn)
                )
                email = str(entry.mail) if entry.mail else ""
                if entry.memberOf:
                    groups = [str(g) for g in entry.memberOf]

            return {
                "display_name": display_name or username,
                "email": email,
                "role": "admin",
                "groups": groups,
            }
        return None
    except Exception:
        return None


# ── FastAPI dependencies ──────────────────────────────────────────────


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UserInfo:
    """Extract and validate the JWT bearer token.

    Raises 401 if missing/invalid.  Returns a :class:`UserInfo` on success.
    """
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(creds.credentials)
    return UserInfo(
        username=payload.get("sub", ""),
        display_name=payload.get("display_name", ""),
        email=payload.get("email"),
        role=payload.get("role", "admin"),
        groups=payload.get("groups", []),
    )


async def get_current_user_optional(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UserInfo | None:
    """Like :func:`get_current_user` but returns ``None`` instead of 401."""
    if creds is None:
        return None
    try:
        payload = decode_token(creds.credentials)
        return UserInfo(
            username=payload.get("sub", ""),
            display_name=payload.get("display_name", ""),
            email=payload.get("email"),
            role=payload.get("role", "admin"),
            groups=payload.get("groups", []),
        )
    except HTTPException:
        return None
