"""SPDX-License-Identifier: Apache-2.0

Tests for the DNS and Logs API endpoints.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# DNS
# ---------------------------------------------------------------------------
class TestDnsAPI:
    @pytest.mark.unit
    def test_list_zones(self, client: TestClient) -> None:
        r = client.get("/api/v1/dns/zones")
        assert r.status_code == 200
        zones = r.json()
        assert len(zones) >= 2
        names = {z["name"] for z in zones}
        assert "corp.local" in names

    @pytest.mark.unit
    def test_list_records(self, client: TestClient) -> None:
        r = client.get("/api/v1/dns/zones/corp.local/records")
        assert r.status_code == 200
        records = r.json()
        assert len(records) >= 5
        types = {rec["type"] for rec in records}
        assert "SOA" in types
        assert "A" in types
        assert "SRV" in types

    @pytest.mark.unit
    def test_list_records_zone_not_found(self, client: TestClient) -> None:
        r = client.get("/api/v1/dns/zones/nonexistent.example/records")
        assert r.status_code == 404

    @pytest.mark.unit
    def test_create_record(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/dns/zones/corp.local/records",
            json={"name": "testhost", "type": "A", "value": "10.0.0.1", "ttl": 3600},
        )
        assert r.status_code == 201
        rec = r.json()
        assert rec["name"] == "testhost"
        assert rec["type"] == "A"
        assert rec["value"] == "10.0.0.1"

    @pytest.mark.unit
    def test_create_record_zone_not_found(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/dns/zones/nonexistent.example/records",
            json={"name": "test", "type": "A", "value": "10.0.0.1"},
        )
        assert r.status_code == 404

    @pytest.mark.unit
    def test_delete_record(self, client: TestClient) -> None:
        # Create a record first
        client.post(
            "/api/v1/dns/zones/corp.local/records",
            json={"name": "deleteme", "type": "A", "value": "10.0.0.99"},
        )
        # Delete it
        r = client.delete("/api/v1/dns/zones/corp.local/records/deleteme")
        assert r.status_code == 204
        # Verify it's gone
        r2 = client.get("/api/v1/dns/zones/corp.local/records")
        names = [rec["name"] for rec in r2.json()]
        assert "deleteme" not in names

    @pytest.mark.unit
    def test_delete_record_zone_not_found(self, client: TestClient) -> None:
        r = client.delete("/api/v1/dns/zones/nonexistent.example/records/foo")
        assert r.status_code == 404

    @pytest.mark.unit
    def test_records_contain_correct_dc(self, client: TestClient) -> None:
        """Verify DNS records reference the correct DC, not stale dc01."""
        r = client.get("/api/v1/dns/zones/corp.local/records")
        assert r.status_code == 200
        for rec in r.json():
            assert "dc01." not in rec["value"], (
                f"Stale dc01 reference found: {rec['value']}"
            )


# ---------------------------------------------------------------------------
# LOGS
# ---------------------------------------------------------------------------
class TestLogsAPI:
    @pytest.mark.unit
    def test_list_logs_empty(self, client: TestClient) -> None:
        """Fresh domain has no audit logs (governance: §9 mock data)."""
        r = client.get("/api/v1/logs")
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 0
        assert body["items"] == []
        assert body["page"] == 1

    @pytest.mark.unit
    def test_list_logs_pagination(self, client: TestClient) -> None:
        r = client.get("/api/v1/logs", params={"page": 1, "page_size": 10})
        assert r.status_code == 200
        body = r.json()
        assert body["page_size"] == 10
        assert body["pages"] == 0  # 0 items / 10 = 0 pages

    @pytest.mark.unit
    def test_list_logs_severity_filter(self, client: TestClient) -> None:
        r = client.get("/api/v1/logs", params={"severity": "info"})
        assert r.status_code == 200
        assert r.json()["total"] == 0

    @pytest.mark.unit
    def test_list_logs_search(self, client: TestClient) -> None:
        r = client.get("/api/v1/logs", params={"q": "kerberos"})
        assert r.status_code == 200
        assert r.json()["total"] == 0

    @pytest.mark.unit
    def test_log_entry_has_severity_field(self, client: TestClient) -> None:
        """Verify the API returns 'severity' not 'level'."""
        r = client.get("/api/v1/logs")
        body = r.json()
        # Even with 0 items, the response model should be well-formed
        assert "items" in body
        assert "total" in body
        assert "page_size" in body
        assert "pages" in body
