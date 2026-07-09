"""SPDX-License-Identifier: Apache-2.0

Backup API integration tests.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from src.main import app


class TestBackupApi:
    """Backup endpoints — real HTTP round-trip verification."""

    @pytest.mark.unit
    def test_list_backups_requires_auth(self, mock_backend) -> None:
        with TestClient(app) as c:
            r = c.get("/api/v1/backups")
            assert r.status_code == 401

    @pytest.mark.unit
    def test_list_backups_authenticated(self, client: TestClient) -> None:
        r = client.get("/api/v1/backups")
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert isinstance(body["items"], list)

    @pytest.mark.unit
    def test_create_backup_invalid_type(self, client: TestClient) -> None:
        r = client.post("/api/v1/backups", json={"backup_type": "invalid"})
        assert r.status_code == 400

    @pytest.mark.unit
    def test_create_backup_requires_auth(self, mock_backend) -> None:
        with TestClient(app) as c:
            r = c.post("/api/v1/backups", json={"backup_type": "config"})
            assert r.status_code == 401

    @pytest.mark.unit
    def test_restore_requires_confirm(self, client: TestClient) -> None:
        r = client.post("/api/v1/backups/nonexistent/restore", json={"confirm": False})
        assert r.status_code == 400

    @pytest.mark.unit
    def test_restore_nonexistent_404(self, client: TestClient) -> None:
        r = client.post("/api/v1/backups/nonexistent/restore", json={"confirm": True})
        assert r.status_code == 404

    @pytest.mark.unit
    def test_download_nonexistent_404(self, client: TestClient) -> None:
        r = client.get("/api/v1/backups/nonexistent/download")
        assert r.status_code == 404

    @pytest.mark.unit
    def test_delete_nonexistent_404(self, client: TestClient) -> None:
        r = client.delete("/api/v1/backups/nonexistent")
        assert r.status_code == 404

    @pytest.mark.unit
    def test_delete_requires_auth(self, mock_backend) -> None:
        with TestClient(app) as c:
            r = c.delete("/api/v1/backups/nonexistent")
            assert r.status_code == 401
