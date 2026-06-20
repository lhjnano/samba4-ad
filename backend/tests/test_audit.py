"""SPDX-License-Identifier: Apache-2.0

Tests for the audit logger.
"""

from __future__ import annotations

import json
import logging

import pytest
from src.core.audit import audit


class TestAuditLogger:
    @pytest.mark.unit
    def test_log_emits_json(self, caplog):
        """Audit log should produce a JSON-parsable message."""
        with caplog.at_level(logging.INFO, logger="audit"):
            audit.log(
                actor="testadmin",
                action="users:Delete",
                resource_type="user",
                resource_id="CN=testuser,...",
                severity="critical",
            )

        # Find the audit log record
        audit_records = [r for r in caplog.records if r.name == "audit"]
        assert len(audit_records) == 1

        entry = json.loads(audit_records[0].message)
        assert entry["audit"] is True
        assert entry["actor"] == "testadmin"
        assert entry["action"] == "users:Delete"
        assert entry["resource_id"] == "CN=testuser,..."
        assert entry["decision"] == "ALLOW"
        assert entry["severity"] == "critical"
        assert "timestamp" in entry

    @pytest.mark.unit
    def test_log_with_before_after(self, caplog):
        """Audit log should include before/after state changes."""
        with caplog.at_level(logging.INFO, logger="audit"):
            audit.log(
                actor="admin",
                action="users:SetStatus",
                before={"status": "active"},
                after={"status": "inactive"},
            )

        entry = json.loads(caplog.records[-1].message)
        assert entry["before"] == {"status": "active"}
        assert entry["after"] == {"status": "inactive"}

    @pytest.mark.unit
    def test_log_minimal_fields(self, caplog):
        """Audit log should work with only required fields."""
        with caplog.at_level(logging.INFO, logger="audit"):
            audit.log(actor="admin", action="test:Action")

        entry = json.loads(caplog.records[-1].message)
        assert entry["actor"] == "admin"
        assert entry["action"] == "test:Action"
        assert entry["decision"] == "ALLOW"  # default
        assert entry["severity"] == "info"  # default
