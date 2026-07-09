"""SPDX-License-Identifier: Apache-2.0

Services API integration tests.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from src.main import app


class TestServicesApi:
    """Services endpoints — real HTTP round-trip verification."""

    @pytest.mark.unit
    def test_list_services_requires_auth(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        with TestClient(app) as c:
            r = c.get("/api/v1/services")
            assert r.status_code == 401

    @pytest.mark.unit
    def test_list_services_authenticated(self, client: TestClient) -> None:
        r = client.get("/api/v1/services")
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, list)
        assert len(body) > 0
        for svc in body:
            assert "name" in svc
            assert "display_name" in svc
            assert "active" in svc
            assert "status" in svc
            assert "enabled" in svc

    @pytest.mark.unit
    def test_get_service_status(self, client: TestClient) -> None:
        r = client.get("/api/v1/services/samba-ad-dc")
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "samba-ad-dc"

    @pytest.mark.unit
    def test_get_unknown_service_400(self, client: TestClient) -> None:
        r = client.get("/api/v1/services/nonexistent")
        assert r.status_code == 400

    @pytest.mark.unit
    def test_service_action_unknown_service_400(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/services/nonexistent/action",
            json={"action": "restart"},
        )
        assert r.status_code == 400

    @pytest.mark.unit
    def test_service_action_invalid_action(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/services/samba-ad-dc/action",
            json={"action": "explode"},
        )
        assert r.status_code == 422

    @pytest.mark.unit
    def test_service_action_requires_auth(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        with TestClient(app) as c:
            r = c.post(
                "/api/v1/services/samba-ad-dc/action",
                json={"action": "restart"},
            )
            assert r.status_code == 401
