"""SPDX-License-Identifier: Apache-2.0

MFA API integration tests — verify actual HTTP behavior, not just schema.

These tests exercise the full request → response cycle through TestClient,
catching issues that contract-only tests miss (e.g. 400 from gate logic,
401 from missing auth, actual TOTP code verification).
"""

from __future__ import annotations

import pyotp
import pytest
from fastapi.testclient import TestClient
from src.core import mfa as mfa_service
from src.core.config import settings
from src.main import app


class TestMfaApi:
    """MFA endpoints — real HTTP round-trip verification."""

    @pytest.mark.unit
    def test_mfa_status_requires_auth(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        """Unauthenticated request to mfa/status returns 401."""
        with TestClient(app) as c:
            r = c.get("/api/v1/auth/mfa/status")
            assert r.status_code == 401

    @pytest.mark.unit
    def test_mfa_status_authenticated(self, client: TestClient) -> None:
        """Authenticated user gets status with correct fields."""
        r = client.get("/api/v1/auth/mfa/status")
        assert r.status_code == 200
        body = r.json()
        assert "enabled" in body
        assert "enrolled" in body
        assert "required" in body
        # MFA feature should be available (self-service) even if globally off
        assert body["enabled"] is True
        assert body["enrolled"] is False  # admin hasn't enrolled in mock

    @pytest.mark.unit
    def test_mfa_setup_returns_secret_and_qr(self, client: TestClient) -> None:
        """setup returns secret + qr_url — never 400 from mfa_enabled gate."""
        r = client.post("/api/v1/auth/mfa/setup")
        assert r.status_code == 200
        body = r.json()
        assert "secret" in body
        assert len(body["secret"]) >= 16  # base32 secret
        assert "qr_url" in body
        assert "provisioning_uri" in body

    @pytest.mark.unit
    def test_mfa_setup_requires_auth(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        """Unauthenticated setup returns 401."""
        with TestClient(app) as c:
            r = c.post("/api/v1/auth/mfa/setup")
            assert r.status_code == 401

    @pytest.mark.unit
    def test_mfa_enroll_full_flow(self, client: TestClient) -> None:
        """Complete enrollment: setup → generate valid TOTP → enroll → verify."""
        # 1. Setup — get secret
        r = client.post("/api/v1/auth/mfa/setup")
        assert r.status_code == 200
        secret = r.json()["secret"]

        # 2. Generate valid TOTP code
        totp = pyotp.TOTP(secret)
        code = totp.now()

        # 3. Enroll with valid code
        r = client.post(
            "/api/v1/auth/mfa/enroll",
            json={"secret": secret, "code": code},
        )
        assert r.status_code == 200
        assert r.json()["enrolled"] is True

        # 4. Verify status reflects enrollment
        r = client.get("/api/v1/auth/mfa/status")
        assert r.status_code == 200
        assert r.json()["enrolled"] is True

        # 5. Cleanup — unenroll
        r = client.delete("/api/v1/auth/mfa/enroll")
        assert r.status_code == 200

    @pytest.mark.unit
    def test_mfa_enroll_invalid_code(self, client: TestClient) -> None:
        """Wrong TOTP code → 400."""
        r = client.post("/api/v1/auth/mfa/setup")
        secret = r.json()["secret"]

        r = client.post(
            "/api/v1/auth/mfa/enroll",
            json={"secret": secret, "code": "000000"},
        )
        assert r.status_code == 400

    @pytest.mark.unit
    def test_mfa_unenroll_when_not_enrolled(self, client: TestClient) -> None:
        """Unenroll when not enrolled returns 404."""
        # Ensure clean state
        mfa_service.unenroll("admin")
        r = client.delete("/api/v1/auth/mfa/enroll")
        assert r.status_code == 404

    @pytest.mark.unit
    def test_mfa_enroll_then_login_requires_mfa(
        self,
        client: TestClient,
        mock_backend,  # type: ignore[no-untyped-def]
    ) -> None:
        """After enrollment, login should trigger MFA challenge."""
        # Enroll admin
        r = client.post("/api/v1/auth/mfa/setup")
        secret = r.json()["secret"]
        code = pyotp.TOTP(secret).now()
        r = client.post(
            "/api/v1/auth/mfa/enroll",
            json={"secret": secret, "code": code},
        )
        assert r.status_code == 200

        # Now login should return mfa_required
        with TestClient(app) as c:
            r = c.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "admin"},
            )
            assert r.status_code == 200
            body = r.json()
            assert body.get("mfa_required") is True
            assert "access_token" not in body or body.get("access_token") is None

        # Cleanup
        mfa_service.unenroll("admin")

    @pytest.mark.unit
    def test_mfa_verify_with_valid_code(
        self,
        client: TestClient,
        mock_backend,  # type: ignore[no-untyped-def]
    ) -> None:
        """MFA verify endpoint accepts valid TOTP and returns JWT."""
        # Enroll
        r = client.post("/api/v1/auth/mfa/setup")
        secret = r.json()["secret"]
        totp = pyotp.TOTP(secret)
        enroll_code = totp.now()
        client.post(
            "/api/v1/auth/mfa/enroll",
            json={"secret": secret, "code": enroll_code},
        )

        # Verify via endpoint
        verify_code = totp.now()
        with TestClient(app) as c:
            r = c.post(
                "/api/v1/auth/mfa-verify",
                json={"username": "admin", "code": verify_code},
            )
            assert r.status_code == 200
            body = r.json()
            assert "access_token" in body
            assert body["user"]["username"] == "admin"

        # Cleanup
        mfa_service.unenroll("admin")

    @pytest.mark.unit
    def test_mfa_verify_with_invalid_code(self, client: TestClient) -> None:
        """MFA verify rejects wrong code with 401."""
        # Enroll first
        r = client.post("/api/v1/auth/mfa/setup")
        secret = r.json()["secret"]
        code = pyotp.TOTP(secret).now()
        client.post(
            "/api/v1/auth/mfa/enroll",
            json={"secret": secret, "code": code},
        )

        with TestClient(app) as c:
            r = c.post(
                "/api/v1/auth/mfa-verify",
                json={"username": "admin", "code": "999999"},
            )
            assert r.status_code == 401

        mfa_service.unenroll("admin")

    @pytest.mark.unit
    def test_should_require_mfa_logic(self) -> None:
        """Unit test the should_require_mfa decision logic."""
        mfa_service.unenroll("testuser_mfa_logic")

        # Not enrolled, not required → False
        assert mfa_service.should_require_mfa("testuser_mfa_logic") is False

        # Enroll with valid code
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        code = totp.now()
        assert mfa_service.enroll("testuser_mfa_logic", secret, code) is True

        # Enrolled but not required → True (self-service MFA)
        assert mfa_service.should_require_mfa("testuser_mfa_logic") is True

        mfa_service.unenroll("testuser_mfa_logic")

    @pytest.mark.unit
    def test_should_require_mfa_when_globally_required(self) -> None:
        """When mfa_required=True, all users need MFA even if not enrolled."""
        original = settings.mfa_required
        try:
            settings.mfa_required = True
            mfa_service.unenroll("nonexistent_user_xyz")
            assert mfa_service.should_require_mfa("nonexistent_user_xyz") is True
        finally:
            settings.mfa_required = original
