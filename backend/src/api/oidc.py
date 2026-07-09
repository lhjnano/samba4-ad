"""SPDX-License-Identifier: Apache-2.0

OIDC Provider — allows external applications to authenticate via SSO.

Endpoints:
  GET  /.well-known/openid-configuration  — Discovery
  GET  /api/v1/oidc/authorize             — Authorization
  POST /api/v1/oidc/token                 — Token exchange
  GET  /api/v1/oidc/userinfo              — UserInfo
  GET  /api/v1/oidc/jwks                  — JWKS
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from authlib.jose import jwt as authlib_jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from src.core.auth import create_access_token, get_current_user, get_jwt_secret
from src.core.config import settings
from src.models.auth import UserInfo

router = APIRouter(prefix="/oidc", tags=["oidc"])

# ── Config ───────────────────────────────────────────────────────────

# OIDC issuer is configurable via the ``OIDC_ISSUER`` env var (HTTPS by
# default — the OIDC spec requires HTTPS for external clients). See
# ``src/core/config.py``.

# Stable key id for the symmetric signing key. Derived deterministically
# from the issuer so it is stable across restarts within a deployment.
_JWT_KID = "samba-ad-oidc-hs256"


def _issuer(request: Request | None = None) -> str:
    """Resolve the issuer at call time.

    If ``OIDC_ISSUER`` is set in the environment, use it.
    Otherwise derive from the incoming request's base URL.
    """
    if settings.oidc_issuer:
        return settings.oidc_issuer
    if request is not None:
        return str(request.base_url).rstrip("/")
    return "http://localhost:8000"


# In-memory authorization code store (production: use Redis)
_auth_codes: dict[str, dict[str, Any]] = {}


def _clients_file() -> Path:
    """OIDC client registry file (alongside the audit log).

    Resolved lazily so it honours a runtime-overridden ``audit_log_path``
    (e.g. the test suite redirects it to a temp directory).
    """
    return Path(settings.audit_log_path).parent / "oidc_clients.json"


def _load_clients() -> dict[str, Any]:
    path = _clients_file()
    if path.exists():
        loaded: dict[str, Any] = json.loads(path.read_text())
        return loaded
    return {}


def _save_clients(data: dict[str, Any]) -> None:
    path = _clients_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


# ── Token signing (authlib) ──────────────────────────────────────────


def _sign_id_token(claims: dict[str, Any]) -> str:
    """Sign an OIDC ID token using authlib (HS256, symmetric key).

    Uses the same HMAC secret as the application's access tokens
    (:func:`src.core.auth.get_jwt_secret`) so the OIDC provider is a
    single signing authority. authlib handles the JWS encoding; the
    resulting token is interoperable with any standards-compliant JWT
    library (PyJWT, jose4j, etc.).
    """
    header = {"alg": "HS256", "typ": "JWT", "kid": _JWT_KID}
    token: str | bytes = authlib_jwt.encode(header, claims, get_jwt_secret())
    if isinstance(token, bytes):
        return token.decode("utf-8")
    return token


# ── Models ───────────────────────────────────────────────────────────


class OidcClient(BaseModel):
    client_id: str
    client_secret: str
    redirect_uris: list[str]
    name: str = ""


class TokenRequest(BaseModel):
    grant_type: str
    code: str | None = None
    redirect_uri: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    refresh_token: str | None = None


# ── Discovery ────────────────────────────────────────────────────────


@router.get("/.well-known/openid-configuration", include_in_schema=False)
async def discovery(request: Request) -> dict[str, Any]:
    """OIDC discovery document."""
    issuer = _issuer(request)
    return {
        "issuer": issuer,
        "authorization_endpoint": f"{issuer}/api/v1/oidc/authorize",
        "token_endpoint": f"{issuer}/api/v1/oidc/token",
        "userinfo_endpoint": f"{issuer}/api/v1/oidc/userinfo",
        "jwks_uri": f"{issuer}/api/v1/oidc/jwks",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["HS256"],
        "scopes_supported": ["openid", "profile", "email"],
    }


# ── Authorize ────────────────────────────────────────────────────────


@router.get("/authorize", summary="OIDC authorize")
async def authorize(
    response_type: str = Query(...),
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    scope: str = Query("openid profile"),
    state: str = Query(""),
    nonce: str = Query(""),
    user: UserInfo = Depends(get_current_user),
) -> RedirectResponse:
    """Authorization endpoint — requires authenticated user."""
    clients = _load_clients()
    client = clients.get(client_id)
    if not client or redirect_uri not in client.get("redirect_uris", []):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Invalid client_id or redirect_uri"
        )

    if response_type != "code":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Only 'code' response_type is supported"
        )

    code = uuid.uuid4().hex
    _auth_codes[code] = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "user": user.model_dump(),
        "scope": scope,
        "nonce": nonce,
        "expires_at": time.time() + 300,  # 5 min
    }

    sep = "&" if "?" in redirect_uri else "?"
    return RedirectResponse(
        url=f"{redirect_uri}{sep}code={code}&state={state}",
        status_code=302,
    )


# ── Token ────────────────────────────────────────────────────────────


@router.post("/token", summary="OIDC token exchange")
async def token(body: TokenRequest, request: Request) -> dict[str, Any]:
    """Exchange authorization code for tokens.

    This is a **public** endpoint (listed in ``_PUBLIC_PREFIXES``) —
    external applications call it without a bearer token, authenticating
    with their ``client_id`` / ``client_secret`` instead.
    """
    if body.grant_type == "authorization_code":
        if not body.code or body.code not in _auth_codes:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Invalid authorization code"
            )

        code_data = _auth_codes.pop(body.code)
        if time.time() > code_data["expires_at"]:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Authorization code expired"
            )

        if body.client_id != code_data["client_id"]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Client ID mismatch")

        # ── Client authentication ──────────────────────────────────
        # Validate the client credentials against the registry. Without
        # this check any holder of a valid auth code could mint tokens.
        clients = _load_clients()
        client = clients.get(body.client_id) if body.client_id else None
        if not client:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown client_id")
        if not body.client_secret or body.client_secret != client.get("client_secret"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid client_secret")

        # redirect_uri (if provided) must match the one bound at authorize
        if body.redirect_uri and body.redirect_uri != code_data["redirect_uri"]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "redirect_uri mismatch")

        user = code_data["user"]
        access_token = create_access_token(
            {
                "sub": user["username"],
                "scope": code_data["scope"],
                "oidc": True,
                **user,
            }
        )
        id_token = _sign_id_token(
            {
                "sub": user["username"],
                "name": user.get("display_name", ""),
                "email": user.get("email", ""),
                "aud": body.client_id,
                "iss": _issuer(request),
                "nonce": code_data.get("nonce", ""),
            }
        )

        return {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": 28800,
            "id_token": id_token,
            "scope": code_data["scope"],
        }

    raise HTTPException(
        status.HTTP_400_BAD_REQUEST, f"Unsupported grant_type: {body.grant_type}"
    )


# ── UserInfo ─────────────────────────────────────────────────────────


@router.get("/userinfo", summary="OIDC UserInfo")
async def userinfo(user: UserInfo = Depends(get_current_user)) -> dict[str, Any]:
    """Return user info in OIDC standard claims format."""
    return {
        "sub": user.username,
        "name": user.display_name,
        "email": user.email,
        "role": user.role,
        "groups": user.groups,
    }


# ── JWKS ─────────────────────────────────────────────────────────────


@router.get("/jwks", summary="OIDC JWKS")
async def jwks() -> dict[str, Any]:
    """Return the JSON Web Key Set.

    This provider signs tokens with a **symmetric** HMAC key (HS256). Per
    the JWK / OIDC specifications a symmetric key cannot be safely
    published — exposing its material would let anyone forge tokens. The
    ``keys`` array is therefore intentionally empty; resource servers
    that need to verify tokens must obtain the shared secret
    out-of-band (e.g. via a secrets manager).

    The extra top-level fields document the limitation for operators and
    tooling: ``id_token_signing_alg_values_supported`` in the discovery
    document advertises ``HS256`` as the signing algorithm.
    """
    return {
        "keys": [],
        "alg": "HS256",
        "kid": _JWT_KID,
        "use": "sig",
        "note": (
            "This issuer uses a symmetric signing key (HS256). The shared "
            "secret is not published here; clients/resource servers obtain "
            "it out-of-band. See id_token_signing_alg_values_supported in "
            "the discovery document."
        ),
    }


# ── Client management ────────────────────────────────────────────────


class ClientCreateRequest(BaseModel):
    name: str
    redirect_uris: list[str]


@router.post("/clients", status_code=201, summary="Register OIDC client")
async def register_client(
    body: ClientCreateRequest,
    user: UserInfo = Depends(get_current_user),
) -> dict[str, Any]:
    """Register a new OIDC client application."""
    client_id = uuid.uuid4().hex[:16]
    client_secret = uuid.uuid4().hex
    clients = _load_clients()
    clients[client_id] = {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uris": body.redirect_uris,
        "name": body.name,
    }
    _save_clients(clients)
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "name": body.name,
    }


@router.get("/clients", summary="List OIDC clients")
async def list_clients(
    user: UserInfo = Depends(get_current_user),
) -> list[dict[str, Any]]:
    clients = _load_clients()
    return [
        {
            "client_id": c["client_id"],
            "name": c.get("name", ""),
            "redirect_uris": c["redirect_uris"],
        }
        for c in clients.values()
    ]
