"""SPDX-License-Identifier: Apache-2.0

Audit logging — structured admin action tracking via journald.

All administrative operations (create/update/delete) are logged to
journald as structured JSON, queryable via the existing ``/api/v1/logs``
endpoint (filtered by ``source=audit``).
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("audit")


class AuditLogger:
    """Emit structured audit events to journald/stderr logging.

    Usage::

        from src.core.audit import audit

        audit.log(
            actor="Administrator",
            action="users:Delete",
            resource_id="CN=testuser,...",
            severity="warning",
        )
    """

    def log(
        self,
        actor: str,
        action: str,
        resource_type: str = "",
        resource_id: str = "",
        actor_ip: str = "",
        decision: str = "ALLOW",
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        severity: str = "info",
        detail: str = "",
    ) -> None:
        """Write a single audit event."""
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
        # Emit as structured JSON — picked up by journald
        logger.info(json.dumps(entry, ensure_ascii=False, default=str))


# Singleton
audit = AuditLogger()
