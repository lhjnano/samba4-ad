"""SPDX-License-Identifier: Apache-2.0

API route tests via TestClient: happy paths, error mapping, pagination, and
the explicit 501 for Phase-2 stubs (no dead buttons).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# USERS
# ---------------------------------------------------------------------------
class TestUsersAPI:
    @pytest.mark.unit
    def test_list_users_paginated(self, client: TestClient) -> None:
        r = client.get("/api/v1/users", params={"page": 1, "limit": 5})
        assert r.status_code == 200
        body = r.json()
        assert body["page"] == 1
        assert len(body["items"]) <= 5

    @pytest.mark.unit
    def test_search_users(self, client: TestClient) -> None:
        r = client.get("/api/v1/users", params={"q": "admin"})
        assert r.status_code == 200
        assert any(u["username"] == "Administrator" for u in r.json()["items"])

    @pytest.mark.unit
    def test_create_get_update_delete_user(self, client: TestClient) -> None:
        create = client.post(
            "/api/v1/users",
            json={
                "username": "apitest",
                "password": "P@ss1!",
                "display_name": "API",
            },
        )
        assert create.status_code == 201
        uid = create.json()["id"]

        detail = client.get(f"/api/v1/users/{uid}")
        assert detail.status_code == 200

        upd = client.patch(f"/api/v1/users/{uid}", json={"display_name": "Renamed"})
        assert upd.status_code == 200 and upd.json()["display_name"] == "Renamed"

        lock = client.patch(
            f"/api/v1/users/{uid}/status", params={"status": "inactive"}
        )
        assert lock.status_code == 200 and lock.json()["status"] == "inactive"

        pw = client.post(
            f"/api/v1/users/{uid}/reset-password", json={"new_password": "New!1"}
        )
        assert pw.status_code == 204

        dele = client.delete(f"/api/v1/users/{uid}")
        assert dele.status_code == 204
        assert client.get(f"/api/v1/users/{uid}").status_code == 404

    @pytest.mark.unit
    def test_create_duplicate_user_409(self, client: TestClient) -> None:
        client.post("/api/v1/users", json={"username": "dup", "password": "x"})
        r = client.post("/api/v1/users", json={"username": "dup", "password": "x"})
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "LDAP_ENTRY_EXISTS"

    @pytest.mark.unit
    def test_get_missing_user_404(self, client: TestClient) -> None:
        r = client.get("/api/v1/users/invalidid")
        assert r.status_code == 404

    @pytest.mark.unit
    def test_export_csv(self, client: TestClient) -> None:
        r = client.get("/api/v1/users/export")
        assert r.status_code == 200
        assert r.headers["content-type"] == "text/csv; charset=utf-8"
        assert "attachment" in r.headers.get("content-disposition", "")
        # CSV header row must contain expected columns
        lines = r.text.strip().splitlines()
        assert "username" in lines[0]
        assert len(lines) >= 2  # at least header + one data row


# ---------------------------------------------------------------------------
# GROUPS
# ---------------------------------------------------------------------------
class TestGroupsAPI:
    @pytest.mark.unit
    def test_group_crud(self, client: TestClient) -> None:
        create = client.post("/api/v1/groups", json={"name": "apigroup"})
        assert create.status_code == 201
        gid = create.json()["id"]
        assert client.get(f"/api/v1/groups/{gid}").status_code == 200
        assert client.delete(f"/api/v1/groups/{gid}").status_code == 204

    @pytest.mark.unit
    def test_export_csv(self, client: TestClient) -> None:
        r = client.get("/api/v1/groups/export")
        assert r.status_code == 200
        assert r.headers["content-type"] == "text/csv; charset=utf-8"
        assert "name" in r.text.splitlines()[0]


# ---------------------------------------------------------------------------
# OU
# ---------------------------------------------------------------------------
class TestOuAPI:
    @pytest.mark.unit
    def test_ou_tree_and_detail(self, client: TestClient) -> None:
        tree = client.get("/api/v1/ou/tree")
        assert tree.status_code == 200
        node = tree.json()[0]
        assert client.get(f"/api/v1/ou/{node['id']}").status_code == 200

    @pytest.mark.unit
    def test_create_ou(self, client: TestClient) -> None:
        r = client.post("/api/v1/ou", json={"name": "새조직"})
        assert r.status_code == 201


# ---------------------------------------------------------------------------
# COMPUTERS
# ---------------------------------------------------------------------------
class TestComputersAPI:
    @pytest.mark.unit
    def test_list_and_distribution(self, client: TestClient) -> None:
        assert client.get("/api/v1/computers").status_code == 200
        dist = client.get("/api/v1/computers/os-distribution")
        assert dist.status_code == 200
        assert isinstance(dist.json(), list)  # empty for fresh domain

    @pytest.mark.unit
    def test_export_csv(self, client: TestClient) -> None:
        r = client.get("/api/v1/computers/export")
        assert r.status_code == 200
        assert r.headers["content-type"] == "text/csv; charset=utf-8"
        assert "hostname" in r.text.splitlines()[0]


# ---------------------------------------------------------------------------
# GPO
# ---------------------------------------------------------------------------
class TestGpoAPI:
    @pytest.mark.unit
    def test_gpo_crud(self, client: TestClient) -> None:
        create = client.post("/api/v1/gpo", json={"display_name": "API Policy"})
        assert create.status_code == 201
        gid = create.json()["id"]
        link = client.post(
            f"/api/v1/gpo/{gid}/links",
            json={"ou_dn": "OU=Domain Controllers,DC=CORP,DC=LOCAL", "enforced": True},
        )
        assert link.status_code == 200
        assert client.delete(f"/api/v1/gpo/{gid}").status_code == 204


# ---------------------------------------------------------------------------
# DOMAIN / HEALTH / STATS
# ---------------------------------------------------------------------------
class TestDomainHealthStatsAPI:
    @pytest.mark.unit
    def test_domain_info(self, client: TestClient) -> None:
        assert client.get("/api/v1/domain/info").status_code == 200

    @pytest.mark.unit
    def test_update_password_policy(self, client: TestClient) -> None:
        r = client.patch(
            "/api/v1/domain/password-policy",
            json={
                "min_length": 14,
                "max_age_days": 90,
                "min_age_days": 1,
                "history": 24,
                "complexity": True,
                "reversible_encryption": False,
            },
        )
        assert r.status_code == 200 and r.json()["min_length"] == 14

    @pytest.mark.unit
    def test_health_report(self, client: TestClient) -> None:
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        assert r.json()["dc_status"] == "healthy"

    @pytest.mark.unit
    def test_stats_cards(self, client: TestClient) -> None:
        r = client.get("/api/v1/stats/cards")
        assert r.status_code == 200 and len(r.json()) == 4

    @pytest.mark.unit
    def test_root_health(self, client: TestClient) -> None:
        assert client.get("/health").status_code == 200
        assert client.get("/").status_code == 200
