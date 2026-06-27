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


# ── Audit log endpoint (always available, independent of PBAC) ────────


class AuditEntry(BaseModel):
    audit: bool = True
    timestamp: str
    actor: str = ""
    actor_ip: str = ""
    action: str = ""
    resource_type: str = ""
    resource_id: str = ""
    decision: str = "ALLOW"
    before: dict | None = None
    after: dict | None = None
    severity: str = "info"
    detail: str = ""


class PaginatedAudit(BaseModel):
    items: list[AuditEntry]
    total: int
    page: int
    page_size: int
    pages: int


@router.get("/audit", response_model=PaginatedAudit)
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    severity: str | None = Query(None),
    actor: str | None = Query(None),
    action: str | None = Query(None, description="Action prefix (e.g. 'users:')"),
    q: str | None = Query(None),
) -> PaginatedAudit:
    """List audit log entries from the persistent audit trail."""
    from src.core.audit import get_audit

    audit_logger = get_audit()
    total = audit_logger.count_entries(
        severity=severity, actor=actor, action_prefix=action, q=q
    )
    entries = audit_logger.read_entries(
        limit=page_size,
        offset=(page - 1) * page_size,
        severity=severity,
        actor=actor,
        action_prefix=action,
        q=q,
    )
    pages = (total + page_size - 1) // page_size if total else 0

    return PaginatedAudit(
        items=[AuditEntry(**e) for e in entries],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


# ── Infrastructure events (Samba AD logs) ─────────────────────────────


class InfraLogEntry(BaseModel):
    timestamp: str = ""
    source: str = ""
    event_type: str = ""
    actor: str = ""
    host: str = ""
    detail: str = ""
    result: str = "success"


class PaginatedInfra(BaseModel):
    items: list[InfraLogEntry]
    total: int
    page: int
    page_size: int
    pages: int


class AuthStats(BaseModel):
    auth_success_24h: int = 0
    auth_failure_24h: int = 0
    active_sessions: int = 0
    denied_access_24h: int = 0
    by_source: dict[str, int] = {}


@router.get("/samba", response_model=PaginatedInfra)
def list_samba_logs(  # pragma: no cover
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    source: str | None = Query(None, description="Filter: smb, ldap, kerberos"),
    result: str | None = Query(None, description="Filter: success, failure"),
    q: str | None = Query(None),
) -> PaginatedInfra:
    """List Samba AD infrastructure events (SMB, LDAP, Kerberos)."""
    from src.services.samba_logs import collect_samba_events

    all_events = collect_samba_events(limit=500)

    # Apply filters
    filtered = all_events
    if source:
        filtered = [e for e in filtered if e.get("source") == source]
    if result:
        filtered = [e for e in filtered if e.get("result") == result]
    if q:
        filtered = [e for e in filtered if q.lower() in str(e).lower()]

    total = len(filtered)
    pages = (total + page_size - 1) // page_size if total else 0
    start = (page - 1) * page_size
    items = filtered[start : start + page_size]

    return PaginatedInfra(
        items=[InfraLogEntry(**e) for e in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/auth-timeline", response_model=PaginatedInfra)
def list_auth_timeline(  # pragma: no cover
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    source: str | None = Query(None),
    result: str | None = Query(None),
    q: str | None = Query(None),
) -> PaginatedInfra:
    """Combined authentication timeline from all sources."""
    from src.services.samba_logs import collect_auth_timeline

    all_events = collect_auth_timeline(limit=200)

    filtered = all_events
    if source:
        filtered = [e for e in filtered if e.get("source") == source]
    if result:
        filtered = [e for e in filtered if e.get("result") == result]
    if q:
        filtered = [e for e in filtered if q.lower() in str(e).lower()]

    total = len(filtered)
    pages = (total + page_size - 1) // page_size if total else 0
    start = (page - 1) * page_size
    items = filtered[start : start + page_size]

    return PaginatedInfra(
        items=[InfraLogEntry(**e) for e in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/auth-stats", response_model=AuthStats)
def get_auth_stats() -> AuthStats:  # pragma: no cover
    """Summary of authentication events for dashboard cards."""
    from src.services.samba_logs import collect_samba_events

    events = collect_samba_events(limit=500)

    success = sum(
        1
        for e in events
        if e.get("result") == "success" and "auth" in e.get("event_type", "")
    )
    failure = sum(1 for e in events if e.get("result") == "failure")
    sessions = sum(1 for e in events if e.get("event_type") == "session")

    by_source: dict[str, int] = {}
    for e in events:
        src = e.get("source", "unknown")
        by_source[src] = by_source.get(src, 0) + 1

    # Count denied from audit log
    denied = 0
    try:
        from src.core.audit import get_audit

        audit = get_audit()
        denied = audit.count_entries(severity="warning")
    except Exception:  # noqa: S110
        pass

    return AuthStats(
        auth_success_24h=success,
        auth_failure_24h=failure,
        active_sessions=sessions,
        denied_access_24h=denied,
        by_source=by_source,
    )
