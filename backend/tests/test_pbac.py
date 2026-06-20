"""SPDX-License-Identifier: Apache-2.0

Tests for the PBAC (Policy-Based Access Control) engine.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from src.core.pbac import PolicyEngine


@pytest.fixture
def policy_dir(tmp_path: Path) -> Path:
    """Create a temporary policy directory with test policies."""
    system = tmp_path / "system"
    system.mkdir()

    # super-admin
    (system / "super-admin.json").write_text(
        json.dumps(
            {
                "version": "2026-06-20",
                "statement": [{"effect": "Allow", "action": ["*"], "resource": ["*"]}],
            }
        )
    )

    # user-admin
    (system / "user-admin.json").write_text(
        json.dumps(
            {
                "version": "2026-06-20",
                "statement": [
                    {
                        "effect": "Allow",
                        "action": [
                            "users:List",
                            "users:Read",
                            "users:Create",
                            "users:Update",
                            "users:ResetPassword",
                        ],
                        "resource": ["*"],
                    },
                    {
                        "effect": "Deny",
                        "action": ["users:Delete"],
                        "resource": ["cn=Administrator,cn=Users,*"],
                    },
                ],
            }
        )
    )

    # viewer
    (system / "viewer.json").write_text(
        json.dumps(
            {
                "version": "2026-06-20",
                "statement": [
                    {
                        "effect": "Allow",
                        "action": ["dashboard:Read"],
                        "resource": ["*"],
                    }
                ],
            }
        )
    )

    # assignments
    (tmp_path / "assignments.json").write_text(
        json.dumps(
            {
                "group_assignments": {
                    "CN=Domain Admins,CN=Users,DC=corp,DC=local": [
                        "system/super-admin.json"
                    ],
                    "CN=Help Desk,CN=Users,DC=corp,DC=local": [
                        "system/user-admin.json"
                    ],
                },
                "user_assignments": {},
                "default_policy": "system/viewer.json",
            }
        )
    )

    return tmp_path


@pytest.fixture
def engine(policy_dir: Path) -> PolicyEngine:
    return PolicyEngine(str(policy_dir))


class TestPatternMatching:
    @pytest.mark.unit
    def test_action_wildcard_match(self):
        assert PolicyEngine._match_action("users:Create", ["users:*"])
        assert PolicyEngine._match_action("users:Delete", ["users:*"])
        assert PolicyEngine._match_action("users:Create", ["*"])
        assert not PolicyEngine._match_action("groups:Create", ["users:*"])

    @pytest.mark.unit
    def test_action_exact_match(self):
        assert PolicyEngine._match_action("users:Create", ["users:Create"])
        assert not PolicyEngine._match_action("users:Update", ["users:Create"])

    @pytest.mark.unit
    def test_action_read_suffix(self):
        assert PolicyEngine._match_action("users:Read", ["*:Read"])
        assert PolicyEngine._match_action("groups:Read", ["*:Read"])
        assert not PolicyEngine._match_action("users:Create", ["*:Read"])

    @pytest.mark.unit
    def test_resource_wildcard(self):
        assert PolicyEngine._match_resource("ou=Sales,DC=corp", ["*"])
        assert PolicyEngine._match_resource("cn=Admin", ["*"])

    @pytest.mark.unit
    def test_resource_dn_pattern(self):
        assert PolicyEngine._match_resource(
            "ou=Sales,DC=corp,DC=local", ["ou=*,DC=corp,DC=local"]
        )
        assert PolicyEngine._match_resource(
            "CN=Administrator,CN=Users,DC=corp,DC=local",
            ["cn=Administrator,cn=Users,*"],
        )
        assert not PolicyEngine._match_resource(
            "CN=Guest,CN=Users,DC=corp,DC=local",
            ["cn=Administrator,cn=Users,*"],
        )

    @pytest.mark.unit
    def test_resource_case_insensitive(self):
        assert PolicyEngine._match_resource(
            "CN=Admin,CN=Users,DC=CORP", ["cn=admin,cn=users,*"]
        )


class TestPolicyEvaluation:
    @pytest.mark.unit
    def test_super_admin_allows_everything(self, engine):
        allowed, policy = engine.evaluate(
            user_dn="admin",
            group_dns=["CN=Domain Admins,CN=Users,DC=corp,DC=local"],
            action="users:Delete",
            resource="cn=testuser,*",
        )
        assert allowed is True
        assert policy == "system/super-admin.json"

    @pytest.mark.unit
    def test_help_desk_allows_user_create(self, engine):
        allowed, _ = engine.evaluate(
            user_dn="helpdesk1",
            group_dns=["CN=Help Desk,CN=Users,DC=corp,DC=local"],
            action="users:Create",
            resource="*",
        )
        assert allowed is True

    @pytest.mark.unit
    def test_help_desk_denies_delete_admin(self, engine):
        """Explicit Deny overrides Allow for deleting Administrator."""
        allowed, policy = engine.evaluate(
            user_dn="helpdesk1",
            group_dns=["CN=Help Desk,CN=Users,DC=corp,DC=local"],
            action="users:Delete",
            resource="CN=Administrator,CN=Users,DC=corp,DC=local",
        )
        assert allowed is False
        assert policy == "system/user-admin.json"

    @pytest.mark.unit
    def test_help_desk_denies_gpo_management(self, engine):
        """No Allow statement for gpo:* in user-admin policy."""
        allowed, _ = engine.evaluate(
            user_dn="helpdesk1",
            group_dns=["CN=Help Desk,CN=Users,DC=corp,DC=local"],
            action="gpos:Create",
            resource="*",
        )
        assert allowed is False

    @pytest.mark.unit
    def test_default_viewer_only_dashboard(self, engine):
        """User with no group assignment gets default viewer policy."""
        allowed, _ = engine.evaluate(
            user_dn="regularuser",
            group_dns=["CN=Domain Users,CN=Users,DC=corp,DC=local"],
            action="dashboard:Read",
            resource="*",
        )
        assert allowed is True

    @pytest.mark.unit
    def test_default_viewer_denied_user_management(self, engine):
        allowed, _ = engine.evaluate(
            user_dn="regularuser",
            group_dns=["CN=Domain Users,CN=Users,DC=corp,DC=local"],
            action="users:Create",
            resource="*",
        )
        assert allowed is False

    @pytest.mark.unit
    def test_no_policy_no_access(self, engine):
        """User with no matching policy gets nothing."""
        allowed, _ = engine.evaluate(
            user_dn="nobody",
            group_dns=["CN=Some Other Group,..."],
            action="users:Read",
            resource="*",
        )
        assert allowed is False


class TestIPMatching:
    @pytest.mark.unit
    def test_ip_exact_match(self):
        from src.core.pbac import _ip_matches

        assert _ip_matches("192.168.1.5", ["192.168.1.5"])
        assert not _ip_matches("192.168.1.6", ["192.168.1.5"])

    @pytest.mark.unit
    def test_ip_cidr_match(self):
        from src.core.pbac import _ip_matches

        assert _ip_matches("192.168.1.5", ["192.168.0.0/16"])
        assert _ip_matches("10.0.0.1", ["10.0.0.0/8"])
        assert not _ip_matches("172.16.0.1", ["192.168.0.0/16"])

    @pytest.mark.unit
    def test_ip_invalid(self):
        from src.core.pbac import _ip_matches

        assert not _ip_matches("not-an-ip", ["192.168.0.0/16"])
