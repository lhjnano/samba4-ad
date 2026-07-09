"""SPDX-License-Identifier: Apache-2.0

MFA Settings API integration tests — verify actual HTTP behavior of the
``/api/v1/settings/mfa`` endpoints (feature flag + enforcement policy).

These tests exercise the full request → response cycle through TestClient,
verifying authentication, default state, persistence, validation (422), and
that ``mfa_enabled`` is a read-only feature flag that PATCH cannot mutate.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from src.core.config import settings
from src.main import app


class TestSettingsMfaApi:
    """MFA Settings endpoints — real HTTP round-trip verification."""

    @pytest.mark.unit
    def test_get_mfa_settings_requires_auth(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        """Unauthenticated GET /settings/mfa returns 401."""
        with TestClient(app) as c:
            r = c.get("/api/v1/settings/mfa")
            assert r.status_code == 401

    @pytest.mark.unit
    def test_get_mfa_settings_authenticated(self, client: TestClient) -> None:
        """Authenticated GET /settings/mfa returns 200 with both fields."""
        r = client.get("/api/v1/settings/mfa")
        assert r.status_code == 200
        body = r.json()
        assert "mfa_enabled" in body
        assert "mfa_required" in body
        assert isinstance(body["mfa_enabled"], bool)
        assert isinstance(body["mfa_required"], bool)

    @pytest.mark.unit
    def test_get_mfa_settings_default_values(self, client: TestClient) -> None:
        """Default MFA settings: mfa_enabled=False, mfa_required=False."""
        original_required = settings.mfa_required
        try:
            settings.mfa_required = False
            r = client.get("/api/v1/settings/mfa")
            assert r.status_code == 200
            body = r.json()
            assert body["mfa_enabled"] is False
            assert body["mfa_required"] is False
        finally:
            settings.mfa_required = original_required

    @pytest.mark.unit
    def test_patch_mfa_settings_requires_auth(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        """Unauthenticated PATCH /settings/mfa returns 401."""
        with TestClient(app) as c:
            r = c.patch("/api/v1/settings/mfa", json={"mfa_required": True})
            assert r.status_code == 401

    @pytest.mark.unit
    def test_patch_mfa_settings_toggle_required(self, client: TestClient) -> None:
        """PATCH toggles mfa_required on then back off, restoring original."""
        original = settings.mfa_required
        try:
            # Toggle ON
            r = client.patch("/api/v1/settings/mfa", json={"mfa_required": True})
            assert r.status_code == 200
            assert r.json()["mfa_required"] is True

            # Toggle OFF (restore original False)
            r = client.patch("/api/v1/settings/mfa", json={"mfa_required": False})
            assert r.status_code == 200
            assert r.json()["mfa_required"] is False
        finally:
            settings.mfa_required = original

    @pytest.mark.unit
    def test_patch_mfa_settings_persists(self, client: TestClient) -> None:
        """After PATCH, a subsequent GET returns the persisted value."""
        original = settings.mfa_required
        try:
            client.patch("/api/v1/settings/mfa", json={"mfa_required": True})

            r = client.get("/api/v1/settings/mfa")
            assert r.status_code == 200
            assert r.json()["mfa_required"] is True
        finally:
            settings.mfa_required = original

    @pytest.mark.unit
    def test_patch_mfa_settings_invalid_body(self, client: TestClient) -> None:
        """PATCH missing the required mfa_required field returns 422."""
        original = settings.mfa_required
        try:
            r = client.patch("/api/v1/settings/mfa", json={})
            assert r.status_code == 422
        finally:
            settings.mfa_required = original

    @pytest.mark.unit
    def test_mfa_enabled_is_read_only(self, client: TestClient) -> None:
        """PATCH mfa_required must NOT change the read-only mfa_enabled flag."""
        original = settings.mfa_required
        enabled_before = settings.mfa_enabled
        try:
            r = client.patch("/api/v1/settings/mfa", json={"mfa_required": True})
            assert r.status_code == 200
            body = r.json()
            assert body["mfa_required"] is True
            # mfa_enabled is a read-only feature flag — unchanged by PATCH
            assert body["mfa_enabled"] == enabled_before
            assert settings.mfa_enabled == enabled_before
        finally:
            settings.mfa_required = original
