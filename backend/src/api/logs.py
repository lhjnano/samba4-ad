"""SPDX-License-Identifier: Apache-2.0

System logs routes — ``/api/v1/logs``.

Returns paginated log entries. In mock mode these are generated
deterministically. In production they can read from journald or
``/var/log/samba/``.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta

from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter(prefix="/logs", tags=["logs"])


class LogEntry(BaseModel):
    id: str
    timestamp: str
    level: str  # info | warning | error
    source: str
    message: str


class PaginatedLogs(BaseModel):
    items: list[LogEntry]
    total: int
    page: int
    page_size: int
    pages: int


# ── Deterministic mock data ───────────────────────────────────────────

_SOURCES = ["samba", "kerberos", "ldap", "dns", "systemd-samba"]
_LEVELS = ["info", "warning", "error"]
_MESSAGES = [
    "User '{user}' authenticated successfully",
    "Kerberos ticket renewed for '{user}'",
    "LDAP search request from {ip}",
    "DNS query for {domain} resolved",
    "Failed login attempt for '{user}' from {ip}",
    "Password changed for '{user}'",
    "Computer '{host}' joined domain",
    "Group membership modified for '{user}'",
    "GPO '{gpo}' linked to OU '{ou}'",
    "Service samba-ad-dc restarted",
    "Replication completed from {host}",
    "Schema update applied",
    "DNS zone {domain} updated",
    "Account locked: '{user}' after failed attempts",
    "New session opened for '{user}'",
]
_USERS = ["admin", "hkim", "lee", "park", "sysadmin", "service_ldap"]
_HOSTS = ["WS-001", "WS-002", "DC02", "FS01", "DEV-MAC"]
_DOMAINS = ["corp.local", "_ldap._tcp.corp.local", "dc01.corp.local"]
_GPOS = ["Default Domain Policy", "Desktop Lockdown", "Drive Mapping"]
_OUS = ["OU=Sales", "OU=IT", "OU=Finance"]


def _gen_logs(count: int = 200) -> list[LogEntry]:
    """Generate deterministic-ish mock log entries."""
    rng = random.Random(42)  # noqa: S311
    now = datetime.now()
    logs: list[LogEntry] = []
    for i in range(count):
        mins_ago = rng.randint(0, 7 * 24 * 60)  # within last 7 days
        ts = now - timedelta(minutes=mins_ago)
        tmpl = rng.choice(_MESSAGES)
        msg = tmpl.format(
            user=rng.choice(_USERS),
            ip=f"192.168.1.{rng.randint(2, 254)}",
            host=rng.choice(_HOSTS),
            domain=rng.choice(_DOMAINS),
            gpo=rng.choice(_GPOS),
            ou=rng.choice(_OUS),
        )
        level = rng.choices(_LEVELS, weights=[70, 20, 10])[0]
        logs.append(
            LogEntry(
                id=f"log-{i + 1:05d}",
                timestamp=ts.strftime("%Y-%m-%d %H:%M:%S"),
                level=level,
                source=rng.choice(_SOURCES),
                message=msg,
            )
        )
    logs.sort(key=lambda x: x.timestamp, reverse=True)
    return logs


_all_logs: list[LogEntry] = _gen_logs()


@router.get("", response_model=PaginatedLogs)
def list_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    level: str | None = Query(None),
    source: str | None = Query(None),
    q: str | None = Query(None),
) -> PaginatedLogs:
    """List system logs with optional filtering and pagination."""
    filtered = _all_logs
    if level:
        filtered = [e for e in filtered if e.level == level]
    if source:
        filtered = [e for e in filtered if e.source == source]
    if q:
        filtered = [e for e in filtered if q.lower() in e.message.lower()]

    total = len(filtered)
    pages = (total + limit - 1) // limit
    start = (page - 1) * limit
    items = filtered[start : start + limit]

    return PaginatedLogs(
        items=items,
        total=total,
        page=page,
        page_size=limit,
        pages=pages,
    )
