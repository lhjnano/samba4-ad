"""SPDX-License-Identifier: Apache-2.0

Tests for the audit logger.
"""

from __future__ import annotations

import json

import pytest
from src.core.audit import get_audit, reset_audit


class TestAuditLogger:
    @pytest.mark.unit
    def test_log_writes_to_file(self, tmp_path):
        """Audit log should write JSON to the log file."""
        from src.core import audit as audit_mod

        audit_mod.settings.audit_log_path = str(tmp_path / "audit.log")
        audit_mod.settings.audit_retention_days = 90
        reset_audit()
        logger = get_audit()

        logger.log(
            actor="testadmin",
            action="users:Delete",
            resource_type="user",
            resource_id="CN=testuser,...",
            severity="critical",
        )

        log_file = tmp_path / "audit.log"
        assert log_file.exists()
        lines = log_file.read_text().strip().splitlines()
        assert len(lines) == 1
        entry = json.loads(lines[0])
        assert entry["actor"] == "testadmin"
        assert entry["action"] == "users:Delete"
        assert entry["resource_type"] == "user"
        assert entry["severity"] == "critical"

        reset_audit()

    @pytest.mark.unit
    def test_log_with_before_after(self, tmp_path):
        from src.core import audit as audit_mod

        audit_mod.settings.audit_log_path = str(tmp_path / "audit.log")
        audit_mod.settings.audit_retention_days = 90
        reset_audit()
        logger = get_audit()

        logger.log(
            actor="admin",
            action="users:SetStatus",
            before={"status": "active"},
            after={"status": "inactive"},
        )

        log_file = tmp_path / "audit.log"
        entry = json.loads(log_file.read_text().strip())
        assert entry["before"] == {"status": "active"}
        assert entry["after"] == {"status": "inactive"}

        reset_audit()

    @pytest.mark.unit
    def test_read_entries_with_filter(self, tmp_path):
        from src.core import audit as audit_mod

        audit_mod.settings.audit_log_path = str(tmp_path / "audit.log")
        audit_mod.settings.audit_retention_days = 90
        reset_audit()
        logger = get_audit()

        logger.log(actor="alice", action="users:Create", severity="info")
        logger.log(actor="bob", action="users:Delete", severity="critical")
        logger.log(actor="alice", action="dns:AddRecord", severity="info")

        alice_entries = logger.read_entries(actor="alice")
        assert len(alice_entries) == 2

        critical = logger.read_entries(severity="critical")
        assert len(critical) == 1
        assert critical[0]["action"] == "users:Delete"

        dns_entries = logger.read_entries(action_prefix="dns:")
        assert len(dns_entries) == 1

        reset_audit()

    @pytest.mark.unit
    def test_log_never_raises(self):
        """Audit log must not raise even if file is unwritable."""
        from src.core import audit as audit_mod

        audit_mod.settings.audit_log_path = "/nonexistent/path/audit.log"
        audit_mod.settings.audit_retention_days = 90
        reset_audit()
        logger = get_audit()

        # Should not raise
        logger.log(actor="test", action="test:Action")

        reset_audit()
