"""SPDX-License-Identifier: Apache-2.0

Tests for the IAM API endpoints (policy CRUD + assignments).
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient


class TestIamPolicyCRUD:
    """Test custom policy create/read/update/delete."""

    @pytest.mark.unit
    def test_list_policies_empty(self, client: TestClient) -> None:
        r = client.get("/api/v1/iam/policies")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    @pytest.mark.unit
    def test_create_custom_policy(
        self, client: TestClient, tmp_path, monkeypatch
    ) -> None:
        """Create a custom policy and verify it appears in list."""
        from src.core import config as config_mod
        from src.core import pbac as pbac_mod

        # Point PBAC to temp dir with system policies
        policy_dir = tmp_path / "policies"
        system_dir = policy_dir / "system"
        system_dir.mkdir(parents=True)
        (system_dir / "viewer.json").write_text(
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
        custom_dir = policy_dir / "custom"
        custom_dir.mkdir()
        (policy_dir / "assignments.json").write_text(
            json.dumps(
                {
                    "group_assignments": {},
                    "user_assignments": {},
                    "default_policy": "system/viewer.json",
                }
            )
        )

        monkeypatch.setattr(config_mod.settings, "pbac_enabled", True)
        monkeypatch.setattr(config_mod.settings, "pbac_policy_dir", str(policy_dir))
        pbac_mod.reset_engine()

        r = client.post(
            "/api/v1/iam/policies",
            json={
                "path": "custom/test-policy.json",
                "statement": [
                    {"effect": "Allow", "action": ["users:Read"], "resource": ["*"]},
                ],
            },
        )
        assert r.status_code == 201
        doc = r.json()
        assert doc["statement"][0]["action"] == ["users:Read"]

        # Verify file exists
        assert (custom_dir / "test-policy.json").exists()

        # Verify in list
        r2 = client.get("/api/v1/iam/policies")
        paths = [p["path"] for p in r2.json()]
        assert "custom/test-policy.json" in paths

        pbac_mod.reset_engine()

    @pytest.mark.unit
    def test_create_rejects_system_prefix(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/iam/policies",
            json={
                "path": "system/evil.json",
                "statement": [{"effect": "Allow", "action": ["*"], "resource": ["*"]}],
            },
        )
        assert r.status_code == 400

    @pytest.mark.unit
    def test_create_rejects_duplicate(
        self, client: TestClient, tmp_path, monkeypatch
    ) -> None:
        from src.core import config as config_mod
        from src.core import pbac as pbac_mod

        policy_dir = tmp_path / "policies"
        custom_dir = policy_dir / "custom"
        custom_dir.mkdir(parents=True)
        (custom_dir / "assignments.json").write_text("{}")

        monkeypatch.setattr(config_mod.settings, "pbac_enabled", True)
        monkeypatch.setattr(config_mod.settings, "pbac_policy_dir", str(policy_dir))
        pbac_mod.reset_engine()

        # Create
        client.post(
            "/api/v1/iam/policies",
            json={
                "path": "custom/dup.json",
                "statement": [
                    {"effect": "Allow", "action": ["x:Read"], "resource": ["*"]}
                ],
            },
        )

        # Duplicate
        r = client.post(
            "/api/v1/iam/policies",
            json={
                "path": "custom/dup.json",
                "statement": [
                    {"effect": "Allow", "action": ["y:Read"], "resource": ["*"]}
                ],
            },
        )
        assert r.status_code == 409

        pbac_mod.reset_engine()

    @pytest.mark.unit
    def test_delete_custom_policy(
        self, client: TestClient, tmp_path, monkeypatch
    ) -> None:
        from src.core import config as config_mod
        from src.core import pbac as pbac_mod

        policy_dir = tmp_path / "policies"
        custom_dir = policy_dir / "custom"
        custom_dir.mkdir(parents=True)
        (custom_dir / "trash.json").write_text(
            json.dumps(
                {
                    "version": "2026-06-20",
                    "statement": [
                        {"effect": "Allow", "action": ["x:Read"], "resource": ["*"]}
                    ],
                }
            )
        )
        (policy_dir / "assignments.json").write_text("{}")

        monkeypatch.setattr(config_mod.settings, "pbac_enabled", True)
        monkeypatch.setattr(config_mod.settings, "pbac_policy_dir", str(policy_dir))
        pbac_mod.reset_engine()

        r = client.delete("/api/v1/iam/policies/custom/trash.json")
        assert r.status_code == 204
        assert not (custom_dir / "trash.json").exists()

        pbac_mod.reset_engine()

    @pytest.mark.unit
    def test_delete_rejects_system(self, client: TestClient) -> None:
        r = client.delete("/api/v1/iam/policies/system/viewer.json")
        assert r.status_code == 403


class TestIamAssignments:
    """Test assignment management."""

    @pytest.mark.unit
    def test_update_assignments(
        self, client: TestClient, tmp_path, monkeypatch
    ) -> None:
        from src.core import config as config_mod
        from src.core import pbac as pbac_mod

        policy_dir = tmp_path / "policies"
        system_dir = policy_dir / "system"
        system_dir.mkdir(parents=True)
        (system_dir / "viewer.json").write_text(
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
        (policy_dir / "assignments.json").write_text(
            json.dumps(
                {
                    "group_assignments": {},
                    "user_assignments": {},
                    "default_policy": "system/viewer.json",
                }
            )
        )

        monkeypatch.setattr(config_mod.settings, "pbac_enabled", True)
        monkeypatch.setattr(config_mod.settings, "pbac_policy_dir", str(policy_dir))
        pbac_mod.reset_engine()

        r = client.put(
            "/api/v1/iam/assignments",
            json={
                "group_assignments": {
                    "CN=TestGroup,CN=Users,DC=corp,DC=local": ["system/viewer.json"],
                },
            },
        )
        assert r.status_code == 200
        result = r.json()
        assert any("TestGroup" in k for k in result["group_assignments"])

        pbac_mod.reset_engine()

    @pytest.mark.unit
    def test_update_default_policy(
        self, client: TestClient, tmp_path, monkeypatch
    ) -> None:
        from src.core import config as config_mod
        from src.core import pbac as pbac_mod

        policy_dir = tmp_path / "policies"
        system_dir = policy_dir / "system"
        system_dir.mkdir(parents=True)
        (system_dir / "viewer.json").write_text("{}")
        (system_dir / "auditor.json").write_text("{}")
        (policy_dir / "assignments.json").write_text(
            json.dumps(
                {
                    "group_assignments": {},
                    "user_assignments": {},
                    "default_policy": "system/viewer.json",
                }
            )
        )

        monkeypatch.setattr(config_mod.settings, "pbac_enabled", True)
        monkeypatch.setattr(config_mod.settings, "pbac_policy_dir", str(policy_dir))
        pbac_mod.reset_engine()

        r = client.put(
            "/api/v1/iam/assignments",
            json={"default_policy": "system/auditor.json"},
        )
        assert r.status_code == 200
        assert r.json()["default_policy"] == "system/auditor.json"

        pbac_mod.reset_engine()
