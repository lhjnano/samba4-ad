"""SPDX-License-Identifier: Apache-2.0

Audit middleware — always-on, independent of PBAC.

Logs all write operations (POST/PATCH/PUT/DELETE) to the audit trail.
This middleware is ALWAYS active, regardless of whether PBAC is enabled.

Read operations (GET) are not audited to reduce noise — they are
already tracked in access logs (journald).

If PBAC denies a request (403), the PBAC middleware handles that audit
entry.  This middleware only logs requests that reach the route handler.
"""

from __future__ import annotations

import logging
import re

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Map URL patterns to audit action + resource type
_AUDIT_MAP: list[tuple[re.Pattern, str, str]] = [
    # (path regex, action prefix, resource type)
    (re.compile(r"^/api/v1/users/[^/]+/reset-password"), "users:ResetPassword", "user"),
    (re.compile(r"^/api/v1/users/[^/]+/status"), "users:SetStatus", "user"),
    (re.compile(r"^/api/v1/users/[^/]+$"), "users:Update", "user"),
    (re.compile(r"^/api/v1/users$"), "users:Create", "user"),
    (re.compile(r"^/api/v1/groups/[^/]+/members"), "groups:ModifyMember", "group"),
    (re.compile(r"^/api/v1/groups/[^/]+$"), "groups:Update", "group"),
    (re.compile(r"^/api/v1/groups$"), "groups:Create", "group"),
    (re.compile(r"^/api/v1/computers/[^/]+/status"), "computers:SetStatus", "computer"),
    (re.compile(r"^/api/v1/computers/[^/]+/reset"), "computers:Reset", "computer"),
    (re.compile(r"^/api/v1/computers/[^/]+$"), "computers:Delete", "computer"),
    (re.compile(r"^/api/v1/ou/[^/]+$"), "ous:Update", "ou"),
    (re.compile(r"^/api/v1/ou$"), "ous:Create", "ou"),
    (re.compile(r"^/api/v1/gpo/[^/]+/status"), "gpos:SetStatus", "gpo"),
    (re.compile(r"^/api/v1/gpo/[^/]+/links"), "gpos:Link", "gpo"),
    (re.compile(r"^/api/v1/gpo/[^/]+$"), "gpos:Delete", "gpo"),
    (re.compile(r"^/api/v1/gpo$"), "gpos:Create", "gpo"),
    (re.compile(r"^/api/v1/dns/zones/[^/]+/records"), "dns:ModifyRecord", "dns"),
    (re.compile(r"^/api/v1/policies/"), "policies:Update", "policy"),
    (re.compile(r"^/api/v1/settings/"), "settings:Update", "settings"),
    (re.compile(r"^/api/v1/setup/"), "setup:Provision", "domain"),
]


def _resolve_audit(
    path: str, method: str
) -> tuple[str, str] | None:  # pragma: no cover
    """Map path+method to (action, resource_type). Returns None for reads."""
    if method not in ("POST", "PATCH", "PUT", "DELETE"):
        return None

    for pattern, action, resource_type in _AUDIT_MAP:
        if pattern.search(path):
            # Refine action for DELETE vs PATCH
            if method == "DELETE" and not action.endswith("Delete"):
                base = action.split(":")[0]
                action = f"{base}:Delete"
            elif method == "POST" and action.endswith("Update"):
                action = action.replace("Update", "Create")
            return action, resource_type

    return None


class AuditMiddleware(BaseHTTPMiddleware):  # pragma: no cover — requires running server
    """Always-on audit logging for write operations."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path
        method = request.method

        # Only audit API write operations
        if not path.startswith("/api/v1/"):
            return await call_next(request)

        audit_info = _resolve_audit(path, method)
        if audit_info is None:
            return await call_next(request)

        # Process the request first
        response = await call_next(request)

        # Log after completion (we know the outcome)
        action, resource_type = audit_info
        user = getattr(request.state, "user", None)
        actor = user.get("username", "") if user else "anonymous"
        client_ip = request.client.host if request.client else ""

        # Extract resource ID from path (best effort)
        resource_id = path

        from src.core.audit import get_audit

        get_audit().log(
            actor=actor,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            actor_ip=client_ip,
            decision="ALLOW" if response.status_code < 400 else "ERROR",
            severity="info" if response.status_code < 400 else "warning",
            detail=f"HTTP {response.status_code}",
        )

        return response
