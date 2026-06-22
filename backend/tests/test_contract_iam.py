"""SPDX-License-Identifier: Apache-2.0

CDC contract tests for MFA-related API endpoints.
"""

from __future__ import annotations

import pytest


class TestContractMFA:
    """Verify MFA endpoints exist in OpenAPI schema."""

    @pytest.mark.unit
    def test_mfa_verify_endpoint(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/auth/mfa-verify" in paths, "Missing POST /auth/mfa-verify"
        assert "post" in paths["/api/v1/auth/mfa-verify"]

    @pytest.mark.unit
    def test_mfa_status_endpoint(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/auth/mfa/status" in paths, "Missing GET /auth/mfa/status"
        assert "get" in paths["/api/v1/auth/mfa/status"]

    @pytest.mark.unit
    def test_mfa_setup_endpoint(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/auth/mfa/setup" in paths, "Missing POST /auth/mfa/setup"
        assert "post" in paths["/api/v1/auth/mfa/setup"]

    @pytest.mark.unit
    def test_mfa_enroll_endpoints(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/auth/mfa/enroll" in paths, "Missing /auth/mfa/enroll"
        assert "post" in paths["/api/v1/auth/mfa/enroll"], (
            "Missing POST /auth/mfa/enroll"
        )
        assert "delete" in paths["/api/v1/auth/mfa/enroll"], (
            "Missing DELETE /auth/mfa/enroll"
        )

    @pytest.mark.unit
    def test_mfa_verify_request_schema(self, openapi_schema: dict) -> None:
        schemas = openapi_schema["components"]["schemas"]
        assert "MfaVerifyRequest" in schemas
        props = schemas["MfaVerifyRequest"]["properties"]
        assert "username" in props
        assert "code" in props

    @pytest.mark.unit
    def test_mfa_status_response_schema(self, openapi_schema: dict) -> None:
        schemas = openapi_schema["components"]["schemas"]
        assert "MfaStatusResponse" in schemas
        props = schemas["MfaStatusResponse"]["properties"]
        assert "enabled" in props
        assert "enrolled" in props
        assert "required" in props

    @pytest.mark.unit
    def test_login_or_mfa_schema(self, openapi_schema: dict) -> None:
        """Login response supports both JWT and MFA challenge."""
        schemas = openapi_schema["components"]["schemas"]
        assert "LoginOrMfaResponse" in schemas
        props = schemas["LoginOrMfaResponse"]["properties"]
        assert "access_token" in props
        assert "mfa_required" in props


class TestContractSelfService:
    """Verify self-service endpoints exist."""

    @pytest.mark.unit
    def test_change_password_endpoint(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/self-service/change-password" in paths
        assert "post" in paths["/api/v1/self-service/change-password"]

    @pytest.mark.unit
    def test_profile_endpoints(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/self-service/profile" in paths
        assert "get" in paths["/api/v1/self-service/profile"]
        assert "patch" in paths["/api/v1/self-service/profile"]


class TestContractApiKeys:
    """Verify API key endpoints exist."""

    @pytest.mark.unit
    def test_api_key_endpoints(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/iam/api-keys" in paths, "Missing /iam/api-keys"
        assert "get" in paths["/api/v1/iam/api-keys"], "Missing GET /iam/api-keys"
        assert "post" in paths["/api/v1/iam/api-keys"], "Missing POST /iam/api-keys"

    @pytest.mark.unit
    def test_api_key_revoke_endpoint(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/iam/api-keys/{key_id}" in paths
        assert "delete" in paths["/api/v1/iam/api-keys/{key_id}"]


class TestContractAccessIntelligence:
    """Verify access intelligence endpoints exist."""

    @pytest.mark.unit
    def test_effective_permissions_endpoint(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/iam/effective-permissions" in paths
        assert "get" in paths["/api/v1/iam/effective-permissions"]

    @pytest.mark.unit
    def test_usage_stats_endpoint(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/iam/usage-stats" in paths
        assert "get" in paths["/api/v1/iam/usage-stats"]


class TestContractSambaLogs:
    """Verify Samba log endpoints exist."""

    @pytest.mark.unit
    def test_samba_events_endpoint(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/logs/samba" in paths
        assert "get" in paths["/api/v1/logs/samba"]

    @pytest.mark.unit
    def test_auth_timeline_endpoint(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/logs/auth-timeline" in paths
        assert "get" in paths["/api/v1/logs/auth-timeline"]

    @pytest.mark.unit
    def test_auth_stats_endpoint(self, openapi_schema: dict) -> None:
        paths = openapi_schema["paths"]
        assert "/api/v1/logs/auth-stats" in paths
        assert "get" in paths["/api/v1/logs/auth-stats"]
