"""SPDX-License-Identifier: Apache-2.0

FastAPI application entry point.

Run (dev)::

    uvicorn src.main:app --reload

The app exposes the OpenAPI schema at ``/docs`` and ``/redoc``. Every route is
mounted under the configured ``api_v1_prefix`` (default ``/api/v1``).

In production, serves the React SPA from ``frontend/dist/``.

Authentication: JWT-based. All API routes require a valid bearer token except
the public routes listed in ``_PUBLIC_PREFIXES``.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from src.api.router import api_router
from src.core.auth import decode_token
from src.core.config import settings
from src.models.common import ErrorDetail
from src.services.directory import DirectoryError


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup validation and shutdown hooks."""
    startup_logger = logging.getLogger("startup")

    sys_user = settings.system_admin_user
    sys_pass = settings.system_admin_password.get_secret_value()

    if not sys_pass:
        startup_logger.warning(
            "SYSTEM_ADMIN_PASSWORD is not set — "
            "local admin login is disabled. "
            "Set it in /etc/samba-ad-manager/env"
        )
    elif sys_user.lower() == "root":
        startup_logger.warning(
            "SYSTEM_ADMIN_USER is 'root' — "
            "using root for web login is not recommended. "
            "Create a dedicated admin user instead."
        )

    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Web-based admin portal for a Samba 4 Active Directory Domain "
        "Controller. Built **Data First → Contract First → No Dead Buttons** "
        "per the project governance (DESIGN-INTEGRATION.md)."
    ),
    default_response_class=JSONResponse,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth middleware ───────────────────────────────────────────────────

_PUBLIC_PREFIXES = (
    "/health",
    "/api/v1/auth/login",
    "/api/v1/setup",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/favicon",
    "/assets/",
)


class AuthMiddleware(BaseHTTPMiddleware):
    """Reject requests without a valid JWT on protected routes.

    Only ``/api/v1/*`` routes require authentication (except login and setup).
    Static assets, docs, health checks, and SPA routes are always public.
    OPTIONS (CORS preflight) are always allowed.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        # Always allow CORS preflight
        if method == "OPTIONS":
            return await call_next(request)

        # Non-API paths are always public (SPA, static, docs)
        if not path.startswith("/api/v1/"):
            return await call_next(request)

        # Explicitly public API routes
        if any(path.startswith(p) for p in _PUBLIC_PREFIXES):
            return await call_next(request)

        # Protected API route — check JWT or API Key
        auth_header = request.headers.get("Authorization", "")

        # 1. JWT Bearer token
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                payload = decode_token(token)  # raises on invalid
                # Store user info for PBAC middleware
                request.state.user = {
                    "username": payload.get("sub", ""),
                    "groups": payload.get("groups", []),
                    "role": payload.get("role", "admin"),
                }
                return await call_next(request)
            except HTTPException:
                pass  # invalid token → fall through to 401

        # 2. API Key
        if auth_header.startswith("Api-Key "):
            from src.core.api_keys import verify_api_key

            key_info = verify_api_key(auth_header[8:])
            if key_info:
                request.state.user = {
                    "username": key_info.get("name", "api-key"),
                    "groups": [],
                    "role": "service",
                }
                return await call_next(request)

        return JSONResponse(
            status_code=401,
            content=ErrorDetail(
                code="UNAUTHORIZED",
                message="Authentication required. Provide a valid Bearer token.",
            ).model_dump(),
            headers={"WWW-Authenticate": "Bearer"},
        )


app.add_middleware(AuthMiddleware)

# ── PBAC middleware (policy-based access control) ─────────────────────
from src.core.pbac_middleware import PBACMiddleware  # noqa: E402

app.add_middleware(PBACMiddleware)

# ── Audit middleware (always-on, independent of PBAC) ─────────────────
from src.core.audit_middleware import AuditMiddleware  # noqa: E402

app.add_middleware(AuditMiddleware)

# ── Routes ────────────────────────────────────────────────────────────

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.exception_handler(DirectoryError)
async def directory_error_handler(_request, exc: DirectoryError) -> JSONResponse:
    """Translate directory-layer errors into the standard error envelope."""
    status_map = {
        "LDAP_ENTRY_NOT_FOUND": 404,
        "LDAP_ENTRY_EXISTS": 409,
        "LDAP_INSUFFICIENT_RIGHTS": 403,
        "INVALID_ARGUMENT": 422,
    }
    return JSONResponse(
        status_code=status_map.get(exc.code, 500),
        content=ErrorDetail(code=exc.code, message=exc.message).model_dump(),
    )


@app.exception_handler(ValueError)
async def value_error_handler(_request, exc: ValueError) -> JSONResponse:
    """Malformed opaque ids / bad arguments → 400 INVALID_ARGUMENT."""
    return JSONResponse(
        status_code=400,
        content=ErrorDetail(
            code="INVALID_ARGUMENT",
            message=str(exc) or "Invalid argument",
        ).model_dump(),
    )


@app.get("/health", tags=["meta"], summary="Liveness probe")
def root_health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name, "mode": settings.app_mode}


# ── Serve React SPA in production ────────────────────────────────────
# When ``frontend/dist`` exists (built via ``npm run build``), mount it as
# static files.  In dev, the Vite dev server (port 5173) proxies API calls.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    from fastapi.responses import FileResponse

    # Static assets (JS, CSS, images)
    app.mount(
        "/assets",
        StaticFiles(directory=_FRONTEND_DIST / "assets"),
        name="frontend-assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> FileResponse:
        """SPA catch-all — serve index.html for client-side routing."""
        candidate = _FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_FRONTEND_DIST / "index.html")
else:
    # Dev mode — no frontend build, expose service info at root
    @app.get("/", tags=["meta"], summary="Service info")
    def root() -> dict[str, str]:
        return {
            "service": settings.app_name,
            "version": settings.app_version,
            "docs": "/docs",
            "mode": settings.app_mode,
        }
