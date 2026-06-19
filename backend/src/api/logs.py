"""SPDX-License-Identifier: Apache-2.0

System logs routes — ``/api/v1/logs``.

Reads real log entries from systemd journald in LDAP mode.
In mock mode returns an empty list (no logs for a fresh domain).
"""

from __future__ import annotations

import subprocess
from datetime import UTC, datetime

from fastapi import APIRouter, Query
from pydantic import BaseModel

from src.core.config import settings

router = APIRouter(prefix="/logs", tags=["logs"])


class LogEntry(BaseModel):
    id: str
    timestamp: str
    severity: str  # info | warning | critical
    source: str
    message: str


class PaginatedLogs(BaseModel):
    items: list[LogEntry]
    total: int
    page: int
    page_size: int
    pages: int


# ── Priority mapping (syslog priority → our severity) ─────────────────

_PRIORITY_MAP: dict[int, str] = {
    0: "critical",  # emerg
    1: "critical",  # alert
    2: "critical",  # crit
    3: "critical",  # err
    4: "warning",  # warning
    5: "info",  # notice
    6: "info",  # info
    7: "info",  # debug
}

# Services to monitor
_MONITORED_UNITS = [
    "samba-ad.service",
    "samba-ad-dc.service",
    "samba-ad-manager.service",
]


def _fetch_journald(limit: int = 500) -> list[LogEntry]:  # pragma: no cover
    """Fetch recent log entries from systemd journald.

    Returns entries from Samba AD DC and the web management service.
    """
    cmd = [
        "journalctl",
        *[f"-u{unit}" for unit in _MONITORED_UNITS],
        "--no-pager",
        f"-n{limit}",
        "-o",
        "json",
        "--since",
        "7 days ago",
    ]

    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=10, check=False
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []

    if proc.returncode != 0 or not proc.stdout:
        return []

    entries: list[LogEntry] = []
    for line in proc.stdout.strip().splitlines():
        import json

        try:
            raw = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            continue

        # Parse timestamp (microseconds since epoch)
        ts_us = raw.get("__REALTIME_TIMESTAMP", "")
        if ts_us:
            try:
                dt = datetime.fromtimestamp(int(ts_us) / 1_000_000, tz=UTC)
                timestamp = dt.isoformat()
            except (ValueError, OSError):
                timestamp = ""
        else:
            timestamp = raw.get("__CURSOR", "")

        prio = int(raw.get("PRIORITY", 6))
        severity = _PRIORITY_MAP.get(prio, "info")
        unit = raw.get("_SYSTEMD_UNIT", raw.get("SYSLOG_IDENTIFIER", "system"))
        # Shorten unit name (remove .service suffix)
        source = unit.replace(".service", "") if unit else "system"
        message = raw.get("MESSAGE", "")

        if not message:
            continue

        # Generate stable ID from cursor
        entry_id = raw.get("__CURSOR", f"{timestamp}-{len(entries)}")

        entries.append(
            LogEntry(
                id=entry_id,
                timestamp=timestamp,
                severity=severity,
                source=source,
                message=message,
            )
        )

    # Reverse to show newest first
    entries.reverse()
    return entries


# ── Endpoints ─────────────────────────────────────────────────────────


@router.get("", response_model=PaginatedLogs)
def list_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    severity: str | None = Query(None),
    source: str | None = Query(None),
    q: str | None = Query(None),
) -> PaginatedLogs:
    """List system logs with optional filtering and pagination."""
    # Fetch real logs in LDAP mode; empty in mock mode
    all_logs = _fetch_journald(limit=1000) if settings.app_mode == "ldap" else []

    # Apply filters
    filtered = all_logs
    if severity:
        filtered = [e for e in filtered if e.severity == severity]
    if source:
        filtered = [e for e in filtered if source.lower() in e.source.lower()]
    if q:
        filtered = [e for e in filtered if q.lower() in e.message.lower()]

    total = len(filtered)
    pages = (total + page_size - 1) // page_size if total else 0
    start = (page - 1) * page_size
    items = filtered[start : start + page_size]

    return PaginatedLogs(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )
