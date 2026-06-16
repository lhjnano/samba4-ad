"""SPDX-License-Identifier: Apache-2.0

Shared pytest fixtures.

Every test gets a **fresh** :class:`MockDirectory` injected via
``set_backend`` so there is no cross-test state leakage.

The ``client`` fixture automatically authenticates as ``admin`` so that
existing API tests don't need to pass auth headers manually.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from src.core.config import Settings
from src.main import app
from src.services.directory import set_backend
from src.services.mock import MockDirectory


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
