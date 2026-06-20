"""SPDX-License-Identifier: Apache-2.0

PBAC middleware — automatically enforces policy-based access control
on all API requests by mapping HTTP method + path → action.

When PBAC is disabled (``pbac_enabled=false``), this middleware is a no-op.
"""

from __future__ import annotations

import logging
import re

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# ── Route → Action mapping ────────────────────────────────────────────
# Maps URL path patterns to PBAC actions.
# Format: (HTTP method, path regex, action)

# Read operations (GET)
_READ_MAP: list[tuple[re.Pattern, str]] = [
    (re.compile(r"^/api/v1/users(/|$)"), "users:Read"),
    (re.compile(r"^/api/v1/groups(/|$)"), "groups:Read"),
    (re.compile(r"^/api/v1/computers(/|$)"), "computers:Read"),
    (re.compile(r"^/api/v1/ou(/|$)"), "ous:Read"),
    (re.compile(r"^/api/v1/gpo(/|$)"), "gpos:Read"),
    (re.compile(r"^/api/v1/dns(/|$)"), "dns:Read"),
    (re.compile(r"^/api/v1/domain(/|$)"), "domain:Read"),
    (re.compile(r"^/api/v1/dashboard(/|$)"), "dashboard:Read"),
    (re.compile(r"^/api/v1/logs(/|$)"), "logs:Read"),
    (re.compile(r"^/api/v1/policies(/|$)"), "policies:Read"),
    (re.compile(r"^/api/v1/iam(/|$)"), "iam:Read"),
    (re.compile(r"^/api/v1/settings(/|$)"), "settings:Read"),
    (re.compile(r"^/api/v1/stats(/|$)"), "dashboard:Read"),
    (re.compile(r"^/api/v1/health(/|$)"), "dashboard:Read"),
    (re.compile(r"^/api/v1/alerts(/|$)"), "dashboard:Read"),
]

# Write operations (POST/PATCH/PUT/DELETE)
_WRITE_MAP: list[tuple[re.Pattern, str]] = [
    # Users
    (re.compile(r"^/api/v1/users$"), "users:Create"),  # POST
    (re.compile(r"^/api/v1/users/[^/]+/status"), "users:SetStatus"),  # PATCH
    (re.compile(r"^/api/v1/users/[^/]+/reset-password"), "users:ResetPassword"),
    (re.compile(r"^/api/v1/users/[^/]+$"), "users:Update"),  # PATCH
    (re.compile(r"^/api/v1/users/[^/]+$"), "users:Delete"),  # DELETE
    # Groups
    (re.compile(r"^/api/v1/groups$"), "groups:Create"),
    (re.compile(r"^/api/v1/groups/[^/]+/members"), "groups:AddMember"),  # POST
    (re.compile(r"^/api/v1/groups/[^/]+/members"), "groups:RemoveMember"),  # DELETE
    (re.compile(r"^/api/v1/groups/[^/]+$"), "groups:Update"),  # PATCH
    (re.compile(r"^/api/v1/groups/[^/]+$"), "groups:Delete"),  # DELETE
    # Computers
    (re.compile(r"^/api/v1/computers/[^/]+/status"), "computers:SetStatus"),
    (re.compile(r"^/api/v1/computers/[^/]+/reset"), "computers:Reset"),
    (re.compile(r"^/api/v1/computers/[^/]+$"), "computers:Delete"),
    # OUs
    (re.compile(r"^/api/v1/ou$"), "ous:Create"),
    (re.compile(r"^/api/v1/ou/[^/]+$"), "ous:Update"),  # PATCH
    (re.compile(r"^/api/v1/ou/[^/]+$"), "ous:Delete"),  # DELETE
    # GPOs
    (re.compile(r"^/api/v1/gpo$"), "gpos:Create"),
    (re.compile(r"^/api/v1/gpo/[^/]+/status"), "gpos:SetStatus"),
    (re.compile(r"^/api/v1/gpo/[^/]+/links"), "gpos:Link"),  # POST
    (re.compile(r"^/api/v1/gpo/[^/]+$"), "gpos:Delete"),  # DELETE
    # DNS
    (re.compile(r"^/api/v1/dns/zones/[^/]+/records"), "dns:AddRecord"),  # POST
    (re.compile(r"^/api/v1/dns/zones/[^/]+/records"), "dns:DeleteRecord"),  # DELETE
    # Policies
    (re.compile(r"^/api/v1/policies/"), "policies:Update"),  # PATCH
    # Settings
    (re.compile(r"^/api/v1/settings/"), "settings:Update"),  # PATCH
]

# Paths that never require PBAC
_PUBLIC_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/setup/status",
    "/api/v1/setup/provision",
}


def _resolve_action(method: str, path: str) -> str | None:
    """Map HTTP method + path to a PBAC action string."""
    if path in _PUBLIC_PATHS or path.startswith("/docs") or path.startswith("/openapi"):
        return None

    if method in ("POST", "PATCH", "PUT", "DELETE"):
        for pattern, action in _WRITE_MAP:
            if pattern.search(path):
                return action

    if method == "GET":
        for pattern, action in _READ_MAP:
            if pattern.search(path):
                return action

    return None


class PBACMiddleware(BaseHTTPMiddleware):
    """Enforce PBAC policy on every API request.

    When ``pbac_enabled=false``, passes all requests through.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        from src.core.config import settings

        if not settings.pbac_enabled:
            return await call_next(request)

        path = request.url.path
        method = request.method

        # Only check API paths
        if not path.startswith("/api/v1/"):
            return await call_next(request)

        action = _resolve_action(method, path)
        if action is None:
            return await call_next(request)

        # Get user from request state (set by auth middleware)
        user = getattr(request.state, "user", None)
        if user is None:
            # Auth middleware hasn't set user — let auth handle 401
            return await call_next(request)

        from src.core.pbac import get_engine

        engine = get_engine()
        if engine is None:
            return await call_next(request)

        # user is a dict set by AuthMiddleware
        allowed, matched_policy = engine.evaluate(
            user_dn=user.get("username", ""),
            group_dns=user.get("groups", []),
            action=action,
            resource="*",
        )

        if not allowed:
            logger.info(
                "PBAC DENY: %s %s → %s (user=%s)",
                method,
                path,
                action,
                user.get("username", "?"),
            )
            # Audit log: denied access attempt
            from src.core.audit import audit

            audit.log(
                actor=user.get("username", ""),
                actor_ip=request.client.host if request.client else "",
                action=action,
                resource_id=path,
                decision="DENY",
                severity="warning",
                detail=f"Matched policy: {matched_policy}",
            )
            return JSONResponse(
                status_code=403,
                content={
                    "code": "ACCESS_DENIED",
                    "message": f"Permission denied: {action}",
                    "matched_policy": matched_policy,
                },
            )

        # Audit log: write operations only (don't audit reads to reduce noise)
        if method in ("POST", "PATCH", "PUT", "DELETE"):
            from src.core.audit import audit

            audit.log(
                actor=user.get("username", ""),
                actor_ip=request.client.host if request.client else "",
                action=action,
                resource_id=path,
                decision="ALLOW",
                severity="info",
            )

        return await call_next(request)
