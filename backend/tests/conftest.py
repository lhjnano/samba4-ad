"""SPDX-License-Identifier: Apache-2.0

Shared pytest fixtures.

Every test gets a **fresh** :class:`MockDirectory` injected via
``set_backend`` so there is no cross-test state leakage.

The ``client`` fixture automatically authenticates as ``admin`` so that
existing API tests don't need to pass auth headers manually.
"""

from __future__ import annotations

import contextlib

import pytest
from fastapi.testclient import TestClient
from src.core import mfa as mfa_service
from src.core.config import Settings
from src.core.config import settings as global_settings
from src.main import app
from src.services.directory import set_backend
from src.services.mock import MockDirectory


@pytest.fixture(autouse=True)
def _tmp_mfa_store(tmp_path, monkeypatch):
    """Redirect MFA + audit file storage to a temp directory.

    Without this, MFA secrets try to write to /var/log/samba-ad-manager/
    which is not writable in the test environment.
    """
    tmp_log = tmp_path / "audit.log"
    monkeypatch.setattr(global_settings, "audit_log_path", str(tmp_log))
    with contextlib.suppress(Exception):
        mfa_service.unenroll("admin")
    yield
    with contextlib.suppress(Exception):
        mfa_service.unenroll("admin")


@pytest.fixture(scope="module")
def openapi_schema() -> dict:
    """Get the OpenAPI schema once for all contract tests."""
    return app.openapi()


@pytest.fixture()
def settings() -> Settings:
    return Settings(app_mode="mock")


@pytest.fixture()
def mock_backend(settings: Settings) -> MockDirectory:
    backend = MockDirectory(settings)
    set_backend(backend)
    return backend


@pytest.fixture()
def auth_token(mock_backend: MockDirectory) -> str:
    """Login as admin and return the JWT token."""
    with TestClient(app) as c:
        resp = c.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "admin"},
        )
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        return resp.json()["access_token"]


@pytest.fixture()
def client(mock_backend: MockDirectory, auth_token: str) -> TestClient:
    """TestClient with Authorization header pre-set."""
    with TestClient(app) as c:
        c.headers.update({"Authorization": f"Bearer {auth_token}"})
        yield c
