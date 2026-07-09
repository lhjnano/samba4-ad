"""SPDX-License-Identifier: Apache-2.0

OIDC Provider API tests: discovery, userinfo auth, authorize auth guard,
token error handling, and client registration/listing.
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient
from src.core.auth import get_jwt_secret
from src.main import app

_TEST_REDIRECT = "https://app.example/cb"


def _code_from_redirect(response: TestClient) -> str:
    """Extract the ``code`` query param from a 302 Location header."""
    location = response.headers["location"]
    params = parse_qs(urlparse(location).query)
    return params["code"][0]


def _register_client(client: TestClient, name: str = "Test App") -> dict:
    """Register an OIDC client and return its id/secret."""
    r = client.post(
        "/api/v1/oidc/clients",
        json={"name": name, "redirect_uris": [_TEST_REDIRECT]},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _authorize(client: TestClient, client_id: str, redirect_uri: str) -> str:
    """Drive the authorize endpoint as the logged-in user; return the code."""
    r = client.get(
        "/api/v1/oidc/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
        },
        follow_redirects=False,
    )
    assert r.status_code == 302, r.text
    return _code_from_redirect(r)


class TestOidcDiscovery:
    @pytest.mark.unit
    def test_discovery_returns_expected_fields(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        """The well-known discovery document advertises all OIDC endpoints."""
        with TestClient(app) as c:
            r = c.get("/.well-known/openid-configuration")
            assert r.status_code == 200
            body = r.json()
            assert body["issuer"]
            # Issuer is derived from OIDC_ISSUER env var or request host
            assert body["issuer"].startswith("http"), body["issuer"]
            for field in (
                "authorization_endpoint",
                "token_endpoint",
                "userinfo_endpoint",
                "jwks_uri",
            ):
                assert field in body
                assert body[field].startswith("http")
            assert body["response_types_supported"] == ["code"]
            assert "authorization_code" in body["grant_types_supported"]
            assert "openid" in body["scopes_supported"]


class TestOidcPublicEndpoints:
    """The token and JWKS endpoints must be reachable WITHOUT a bearer
    token — external clients (and resource servers doing discovery) have
    no JWT yet. These are listed in ``_PUBLIC_PREFIXES``.
    """

    @pytest.mark.unit
    def test_token_reachable_without_auth(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        with TestClient(app) as c:
            r = c.post(
                "/api/v1/oidc/token",
                json={"grant_type": "authorization_code", "code": "x"},
            )
            # Must NOT be 401 — it reached the handler (400 = bad code).
            assert r.status_code != 401
            assert r.status_code == 400

    @pytest.mark.unit
    def test_jwks_reachable_without_auth(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        with TestClient(app) as c:
            r = c.get("/api/v1/oidc/jwks")
            assert r.status_code == 200
            body = r.json()
            assert "keys" in body
            # Symmetric-key limitation is documented
            assert body.get("alg") == "HS256"


class TestOidcUserInfo:
    @pytest.mark.unit
    def test_userinfo_requires_auth(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        """UserInfo rejects unauthenticated requests with 401."""
        with TestClient(app) as c:
            r = c.get("/api/v1/oidc/userinfo")
            assert r.status_code == 401

    @pytest.mark.unit
    def test_userinfo_authenticated(self, client: TestClient) -> None:
        """Authenticated UserInfo returns standard OIDC claims."""
        r = client.get("/api/v1/oidc/userinfo")
        assert r.status_code == 200
        body = r.json()
        assert body["sub"] == "admin"
        assert body["name"] == "Administrator"
        assert "groups" in body

    @pytest.mark.unit
    def test_userinfo_returns_correct_claims(self, client: TestClient) -> None:
        """UserInfo returns the standard OIDC claim set: sub, name, email."""
        r = client.get("/api/v1/oidc/userinfo")
        assert r.status_code == 200
        body = r.json()
        assert body["sub"] == "admin"
        assert body["name"] == "Administrator"
        assert body["email"] == "admin@corp.local"
        assert isinstance(body["groups"], list)
        assert "role" in body


class TestOidcAuthorize:
    @pytest.mark.unit
    def test_authorize_requires_auth(self, mock_backend) -> None:  # type: ignore[no-untyped-def]
        """Authorize endpoint rejects unauthenticated requests with 401."""
        with TestClient(app) as c:
            r = c.get(
                "/api/v1/oidc/authorize",
                params={
                    "response_type": "code",
                    "client_id": "x",
                    "redirect_uri": "https://app.example/cb",
                },
            )
            assert r.status_code == 401

    @pytest.mark.unit
    def test_authorize_invalid_client(self, client: TestClient) -> None:
        """An unknown client_id is rejected with 400 (no redirect issued)."""
        r = client.get(
            "/api/v1/oidc/authorize",
            params={
                "response_type": "code",
                "client_id": "does-not-exist",
                "redirect_uri": _TEST_REDIRECT,
            },
            follow_redirects=False,
        )
        assert r.status_code == 400

    @pytest.mark.unit
    def test_authorize_invalid_redirect_uri(self, client: TestClient) -> None:
        """A redirect_uri not registered for the client is rejected 400."""
        cli = _register_client(client, name="Redirect Guard")
        r = client.get(
            "/api/v1/oidc/authorize",
            params={
                "response_type": "code",
                "client_id": cli["client_id"],
                "redirect_uri": "https://attacker.example/evil",
            },
            follow_redirects=False,
        )
        assert r.status_code == 400


class TestOidcToken:
    @pytest.mark.unit
    def test_token_invalid_code(self, client: TestClient) -> None:
        """Token exchange with a bogus code returns 400."""
        r = client.post(
            "/api/v1/oidc/token",
            json={
                "grant_type": "authorization_code",
                "code": "does-not-exist",
                "client_id": "x",
                "redirect_uri": "https://app.example/cb",
            },
        )
        assert r.status_code == 400

    @pytest.mark.unit
    def test_token_valid_code_exchange(self, client: TestClient) -> None:
        """Full flow: register → authorize → exchange code for tokens.

        The token POST is made WITHOUT an Authorization header, proving the
        token endpoint is reachable by external clients (public route).
        """
        cli = _register_client(client, name="Exchange Flow")
        code = _authorize(client, cli["client_id"], _TEST_REDIRECT)

        # Exchange as an unauthenticated external client.
        with TestClient(app) as unauth:
            r = unauth.post(
                "/api/v1/oidc/token",
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": cli["client_id"],
                    "client_secret": cli["client_secret"],
                    "redirect_uri": _TEST_REDIRECT,
                },
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["token_type"] == "Bearer"
        assert body["access_token"]
        assert body["id_token"]
        assert body["scope"]

    @pytest.mark.unit
    def test_token_id_token_contains_oidc_claims(self, client: TestClient) -> None:
        """The ID token (signed by authlib) carries sub/iss/aud claims."""
        cli = _register_client(client, name="ID Token Claims")
        code = _authorize(client, cli["client_id"], _TEST_REDIRECT)

        with TestClient(app) as unauth:
            r = unauth.post(
                "/api/v1/oidc/token",
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": cli["client_id"],
                    "client_secret": cli["client_secret"],
                    "redirect_uri": _TEST_REDIRECT,
                },
            )
        assert r.status_code == 200, r.text
        id_token = r.json()["id_token"]

        # Verify signature with the app's signing secret and inspect claims.
        # A resource server verifies the ID token is addressed to its
        # client_id, hence audience=cli["client_id"].
        claims = pyjwt.decode(
            id_token,
            get_jwt_secret(),
            algorithms=["HS256"],
            audience=cli["client_id"],
        )
        assert claims["sub"] == "admin"
        assert claims["aud"] == cli["client_id"]
        assert claims["iss"].startswith("http")
        assert claims["name"] == "Administrator"

    @pytest.mark.unit
    def test_token_client_secret_mismatch(self, client: TestClient) -> None:
        """A wrong client_secret is rejected with 400 (credentials checked)."""
        cli = _register_client(client, name="Secret Guard")
        code = _authorize(client, cli["client_id"], _TEST_REDIRECT)

        r = client.post(
            "/api/v1/oidc/token",
            json={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": cli["client_id"],
                "client_secret": "totally-wrong-secret",
                "redirect_uri": _TEST_REDIRECT,
            },
        )
        assert r.status_code == 400

    @pytest.mark.unit
    def test_token_missing_client_secret(self, client: TestClient) -> None:
        """Omitting client_secret entirely is rejected with 400."""
        cli = _register_client(client, name="Missing Secret")
        code = _authorize(client, cli["client_id"], _TEST_REDIRECT)

        r = client.post(
            "/api/v1/oidc/token",
            json={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": cli["client_id"],
                "redirect_uri": _TEST_REDIRECT,
            },
        )
        assert r.status_code == 400

    @pytest.mark.unit
    def test_token_redirect_uri_mismatch(self, client: TestClient) -> None:
        """A redirect_uri differing from the authorized one is rejected."""
        cli = _register_client(client, name="Redirect Match")
        code = _authorize(client, cli["client_id"], _TEST_REDIRECT)

        r = client.post(
            "/api/v1/oidc/token",
            json={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": cli["client_id"],
                "client_secret": cli["client_secret"],
                "redirect_uri": "https://attacker.example/evil",
            },
        )
        assert r.status_code == 400


class TestOidcClients:
    @pytest.mark.unit
    def test_register_and_list_clients(self, client: TestClient) -> None:
        """Registering a client makes it appear in the list."""
        create = client.post(
            "/api/v1/oidc/clients",
            json={
                "name": "Test App",
                "redirect_uris": ["https://app.example/cb"],
            },
        )
        assert create.status_code == 201
        created = create.json()
        assert created["client_id"]
        assert created["client_secret"]
        assert created["name"] == "Test App"

        listed = client.get("/api/v1/oidc/clients")
        assert listed.status_code == 200
        names = [c["name"] for c in listed.json()]
        assert "Test App" in names
        match = next(c for c in listed.json() if c["name"] == "Test App")
        assert "https://app.example/cb" in match["redirect_uris"]
