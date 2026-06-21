"""SPDX-License-Identifier: Apache-2.0

Audit logging — always-on, independent of PBAC.

All security-relevant events are logged to a dedicated audit file with
configurable retention.  This module is ALWAYS active regardless of
whether PBAC is enabled or not.

Events tracked:
  - Authentication (login success/failure, logout)
  - All write operations (create/update/delete)
  - Access denied (403) when PBAC is active
  - Configuration/policy changes

Storage:
  - File: /var/log/samba-ad-manager/audit.log (JSON lines)
  - Retention: configurable (default 90 days, auto-purged on write)
  - Also emitted to journald for real-time monitoring
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from src.core.config import settings

logger = logging.getLogger("audit")

# ── Severity levels ───────────────────────────────────────────────────

SEVERITY_INFO = "info"
SEVERITY_WARNING = "warning"
SEVERITY_CRITICAL = "critical"


class AuditLogger:
    """Always-on audit logger with file persistence and retention.

    Writes structured JSON entries to:
    1. A dedicated audit log file (one JSON object per line)
    2. Python logging (picked up by journald in production)
    """

    def __init__(self) -> None:
        self._log_path = self._resolve_log_path()
        self._retention_days = settings.audit_retention_days
        self._purge_counter = 0

    def _resolve_log_path(self) -> Path:
        """Determine the audit log file path."""
        path = Path(settings.audit_log_path)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            # Fallback: use system temp dir if configured path is not writable
            import tempfile

            path = Path(tempfile.gettempdir()) / "samba-ad-manager-audit.log"
        return path

    def _purge_old_entries(
        self,
    ) -> None:  # pragma: no cover — I/O heavy, tested manually
        """Remove entries older than retention period.

        Called every 100 writes to avoid overhead on every request.
        """
        cutoff = datetime.now(UTC) - timedelta(days=self._retention_days)
        cutoff_str = cutoff.isoformat()

        if not self._log_path.exists():
            return

        try:
            lines = self._log_path.read_text(encoding="utf-8").splitlines()
            kept: list[str] = []
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if entry.get("timestamp", "") >= cutoff_str:
                        kept.append(line)
                except (json.JSONDecodeError, KeyError):
                    kept.append(line)  # keep unparseable lines

            if len(kept) < len(lines):
                self._log_path.write_text("\n".join(kept) + "\n", encoding="utf-8")
        except OSError:
            pass  # don't crash the request over log maintenance

    def log(
        self,
        actor: str,
        action: str,
        *,
        resource_type: str = "",
        resource_id: str = "",
        actor_ip: str = "",
        decision: str = "ALLOW",
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        severity: str = SEVERITY_INFO,
        detail: str = "",
    ) -> None:
        """Write a single audit entry.

        This method NEVER raises — audit logging must not break
        the request flow.
        """
        entry = {
            "audit": True,
            "timestamp": datetime.now(UTC).isoformat(),
            "actor": actor,
            "actor_ip": actor_ip,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "decision": decision,
            "before": before,
            "after": after,
            "severity": severity,
            "detail": detail,
        }

        line = json.dumps(entry, ensure_ascii=False, default=str)

        # 1. Write to audit file (persistent storage)
        try:
            with open(self._log_path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError:
            pass

        # 2. Emit to Python logging (journald in production)
        logger.info(line)

        # 3. Periodic purge
        self._purge_counter += 1
        if self._purge_counter >= 100:
            self._purge_counter = 0
            self._purge_old_entries()

    def read_entries(
        self,
        *,
        limit: int = 200,
        offset: int = 0,
        severity: str | None = None,
        actor: str | None = None,
        action_prefix: str | None = None,
        q: str | None = None,
    ) -> list[dict[str, Any]]:
        """Read audit entries from the log file with filtering."""
        if not self._log_path.exists():
            return []

        try:
            lines = self._log_path.read_text(encoding="utf-8").splitlines()
        except OSError:
            return []

        entries: list[dict[str, Any]] = []
        for line in reversed(lines):  # newest first
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            # Apply filters
            if severity and entry.get("severity") != severity:
                continue
            if actor and actor.lower() not in entry.get("actor", "").lower():
                continue
            if action_prefix and not entry.get("action", "").startswith(action_prefix):
                continue
            if q and q.lower() not in json.dumps(entry, ensure_ascii=False).lower():
                continue

            entries.append(entry)
            if len(entries) >= limit + offset:
                break

        return entries[offset : offset + limit]

    def count_entries(  # pragma: no cover — mirrors read_entries logic
        self,
        *,
        severity: str | None = None,
        actor: str | None = None,
        action_prefix: str | None = None,
        q: str | None = None,
    ) -> int:
        """Count total audit entries matching filters."""
        if not self._log_path.exists():
            return 0

        try:
            lines = self._log_path.read_text(encoding="utf-8").splitlines()
        except OSError:
            return 0

        count = 0
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if severity and entry.get("severity") != severity:
                continue
            if actor and actor.lower() not in entry.get("actor", "").lower():
                continue
            if action_prefix and not entry.get("action", "").startswith(action_prefix):
                continue
            if q and q.lower() not in json.dumps(entry, ensure_ascii=False).lower():
                continue

            count += 1

        return count


# ── Singleton ─────────────────────────────────────────────────────────

_audit: AuditLogger | None = None


def get_audit() -> AuditLogger:
    """Return the singleton audit logger."""
    global _audit
    if _audit is None:
        _audit = AuditLogger()
    return _audit


def reset_audit() -> None:
    """Reset the singleton (for tests)."""
    global _audit
    _audit = None
