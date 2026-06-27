"""SPDX-License-Identifier: Apache-2.0

Samba AD log collector — reads infrastructure events from journald
and Samba log files.

Collects authentication and access events from:
  - journald (samba-ad.service / samba-ad-dc.service)
  - /var/log/samba/ directory

Events are normalized into a common format for the auth timeline.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


# pragma: no cover
@dataclass
class InfraEvent:
    """A normalized infrastructure event."""

    timestamp: str = ""
    source: str = ""  # smb | ldap | kerberos | web | system
    event_type: str = ""  # auth_success | auth_failure | session | search | file_access
    actor: str = ""
    host: str = ""
    detail: str = ""
    result: str = "success"  # success | failure
    raw: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "source": self.source,
            "event_type": self.event_type,
            "actor": self.actor,
            "host": self.host,
            "detail": self.detail,
            "result": self.result,
        }


# ── Journald reader ──────────────────────────────────────────────────


_SAMBA_UNITS = ["samba-ad.service", "samba-ad-dc.service", "samba.service"]


def _fetch_journald_samba(limit: int = 500) -> list[InfraEvent]:  # pragma: no cover
    """Read Samba AD service events from journald."""
    import json

    cmd = [
        "journalctl",
        *[f"-u{u}" for u in _SAMBA_UNITS],
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

    events: list[InfraEvent] = []
    for line in proc.stdout.strip().splitlines():
        try:
            raw = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            continue

        msg = raw.get("MESSAGE", "")
        if not msg:
            continue

        ts_us = raw.get("__REALTIME_TIMESTAMP", "")
        timestamp = ""
        if ts_us:
            try:
                dt = datetime.fromtimestamp(int(ts_us) / 1_000_000, tz=UTC)
                timestamp = dt.isoformat()
            except (ValueError, OSError):
                pass

        parsed = _parse_samba_message(msg)
        if parsed:
            parsed.timestamp = timestamp
            parsed.raw = msg
            events.append(parsed)

    events.reverse()
    return events


# ── Samba log file reader ────────────────────────────────────────────


def _read_samba_log_files(limit: int = 200) -> list[InfraEvent]:
    """Read recent entries from /var/log/samba/ directory."""
    log_dir = Path("/var/log/samba")
    if not log_dir.exists():
        return []

    events: list[InfraEvent] = []
    for log_file in log_dir.glob("log.*"):
        try:
            lines = log_file.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue

        for line in lines[-limit:]:
            parsed = _parse_samba_message(line)
            if parsed:
                # Try to extract timestamp from Samba log format
                ts_match = re.match(r"\[(.+?)\]", line)
                if ts_match:
                    parsed.timestamp = ts_match.group(1)
                parsed.raw = line
                events.append(parsed)

    return events


# ── Message parser ───────────────────────────────────────────────────


_PATTERNS: list[tuple[re.Pattern, str, str, str]] = [
    (
        re.compile(
            r"session setup.*?(?:for|as)\s+(?:user\s+)?(\S+).*from\s+(\d+\.\d+\.\d+)",
            re.I,
        ),
        "smb",
        "session",
        "success",
    ),
    (
        re.compile(r"authenticated user.*?(\S+).*?(\d+\.\d+\.\d+)", re.I),
        "smb",
        "auth_success",
        "success",
    ),
    (
        re.compile(
            r"(?:failed|denied).*?auth.*?(?:user\s+)?(\S+).*?(\d+\.\d+\.\d+)", re.I
        ),
        "smb",
        "auth_failure",
        "failure",
    ),
    (
        re.compile(r"bad password.*?(?:user\s+)?(\S+).*?(\d+\.\d+\.\d+)", re.I),
        "smb",
        "auth_failure",
        "failure",
    ),
    (
        re.compile(r"unknown user.*?(\S+).*?(\d+\.\d+\.\d+)", re.I),
        "smb",
        "auth_failure",
        "failure",
    ),
    (
        re.compile(r"file (?:open|read|write|close|delete).*?(\S+)", re.I),
        "smb",
        "file_access",
        "success",
    ),
    # LDAP patterns
    (
        re.compile(r"ldap bind.*?(?:success|ok).*?(?:cn|uid)=(\S+?)[,)]", re.I),
        "ldap",
        "auth_success",
        "success",
    ),
    (
        re.compile(r"ldap bind.*?(?:fail|error|invalid).*?(?:cn|uid)=(\S+?)[,)]", re.I),
        "ldap",
        "auth_failure",
        "failure",
    ),
    (
        re.compile(r"ldap search.*?(?:cn|uid)=(\S+?)[,)]", re.I),
        "ldap",
        "search",
        "success",
    ),
    # Kerberos patterns
    (
        re.compile(r"AS-REQ.*?(?:for\s+)?(\S+@\S+)", re.I),
        "kerberos",
        "auth_success",
        "success",
    ),
    (
        re.compile(r"TGT.*?issued.*?(?:for\s+)?(\S+@\S+)", re.I),
        "kerberos",
        "auth_success",
        "success",
    ),
    (
        re.compile(r"KERBEROS.*?FAIL.*?(\S+@\S+)", re.I),
        "kerberos",
        "auth_failure",
        "failure",
    ),
]


def _parse_samba_message(msg: str) -> InfraEvent | None:
    """Parse a raw Samba/journald message into a structured event."""
    for pattern, source, event_type, result in _PATTERNS:
        match = pattern.search(msg)
        if match:
            actor = match.group(1).rstrip(",$)")
            host = match.group(2) if match.lastindex >= 2 else ""
            return InfraEvent(
                source=source,
                event_type=event_type,
                actor=actor,
                host=host,
                detail=msg.strip()[:200],
                result=result,
            )

    # Check for generic keywords
    lower = msg.lower()
    if any(kw in lower for kw in [" smb ", "cifs", "session setup"]):
        return InfraEvent(source="smb", event_type="info", detail=msg.strip()[:200])
    if "ldap" in lower and ("bind" in lower or "search" in lower):
        return InfraEvent(source="ldap", event_type="info", detail=msg.strip()[:200])
    if "kerberos" in lower or "kdc" in lower:
        return InfraEvent(
            source="kerberos", event_type="info", detail=msg.strip()[:200]
        )

    return None


# ── Public API ───────────────────────────────────────────────────────


def collect_samba_events(limit: int = 500) -> list[dict[str, Any]]:
    """Collect infrastructure events from all sources.

    Returns events sorted newest-first.
    """
    events: list[InfraEvent] = []

    # From journald (primary source in production)
    events.extend(_fetch_journald_samba(limit))

    # From log files (fallback/supplemental)
    if not events:
        events.extend(_read_samba_log_files(limit // 2))

    # Deduplicate by timestamp + detail
    seen: set[str] = set()
    unique: list[InfraEvent] = []
    for e in events:
        key = f"{e.timestamp}:{e.detail[:50]}"
        if key not in seen:
            seen.add(key)
            unique.append(e)

    return [e.to_dict() for e in unique[:limit]]


def collect_auth_timeline(limit: int = 100) -> list[dict[str, Any]]:
    """Collect authentication events only (success + failure).

    Combines Samba infra events with web audit log auth events
    into a single timeline.
    """
    events = collect_samba_events(limit)

    # Filter to auth-related events only
    auth_events = [
        e
        for e in events
        if e.get("event_type", "").startswith("auth_")
        or e.get("event_type") == "session"
    ]

    return auth_events
