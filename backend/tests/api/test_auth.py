"""SPDX-License-Identifier: Apache-2.0

Authentication tests: login success/failure, JWT verification,
protected route rejection, and current-user info.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from src.main import app


class TestAuth:
    @pytest.mark.unit
    def test_login_success(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        """Valid credentials return a JWT + user info."""
        with TestClient(app) as c:
            r = c.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "admin"},
            )
            assert r.status_code == 200
            body = r.json()
            assert "access_token" in body
            assert body["token_type"] == "bearer"
            assert body["expires_in"] == 8 * 3600
            assert body["user"]["username"] == "admin"
            assert body["user"]["display_name"] == "Administrator"

    @pytest.mark.unit
    def test_login_wrong_password(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        with TestClient(app) as c:
            r = c.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "wrong"},
            )
            assert r.status_code == 401
            assert "Invalid" in r.json()["detail"]

    @pytest.mark.unit
    def test_login_unknown_user(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        with TestClient(app) as c:
            r = c.post(
                "/api/v1/auth/login",
                json={"username": "ghost", "password": "x"},
            )
            assert r.status_code == 401

    @pytest.mark.unit
    def test_protected_route_without_token(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        """Protected routes return 401 without a token."""
        with TestClient(app) as c:
            r = c.get("/api/v1/users")
            assert r.status_code == 401

    @pytest.mark.unit
    def test_protected_route_with_invalid_token(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        with TestClient(app) as c:
            r = c.get(
                "/api/v1/users",
                headers={"Authorization": "Bearer invalid.token.here"},
            )
            assert r.status_code == 401

    @pytest.mark.unit
    def test_protected_route_with_valid_token(self, client: TestClient) -> None:
        """Authenticated requests succeed."""
        r = client.get("/api/v1/users")
        assert r.status_code == 200

    @pytest.mark.unit
    def test_public_routes_dont_require_auth(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        """Health and setup endpoints are public."""
        with TestClient(app) as c:
            assert c.get("/health").status_code == 200
            assert c.get("/api/v1/setup/status").status_code in (200, 404)

    @pytest.mark.unit
    def test_me_endpoint(self, client: TestClient) -> None:
        r = client.get("/api/v1/auth/me")
        assert r.status_code == 200
        assert r.json()["username"] == "admin"

    @pytest.mark.unit
    def test_refresh_token(self, client: TestClient) -> None:
        r = client.post("/api/v1/auth/refresh")
        assert r.status_code == 200
        assert "access_token" in r.json()
