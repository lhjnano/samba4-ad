"""SPDX-License-Identifier: Apache-2.0

DNS zones & records routes — ``/api/v1/dns``.

In mock mode these return deterministic sample data. In LDAP mode they
will query the Samba 4 internal DNS via ``samba-tool dns``.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.core.deps import get_directory
from src.services.directory import DirectoryBackend

router = APIRouter(prefix="/dns", tags=["dns"])


# ── Models (match frontend types/api.ts) ──────────────────────────────


class DNSRecord(BaseModel):
    name: str
    type: str
    value: str
    ttl: int = 3600


class DNSZone(BaseModel):
    name: str
    zone_type: str = "Primary"
    serial: int = 1
    records: list[DNSRecord] = Field(default_factory=list)


class DNSRecordCreate(BaseModel):
    name: str
    type: str = "A"
    value: str
    ttl: int = 3600


# ── Mock data ─────────────────────────────────────────────────────────

_mock_zones: dict[str, DNSZone] = {
    "corp.local": DNSZone(
        name="corp.local",
        zone_type="Primary",
        serial=int(time.time()),
        records=[
            DNSRecord(
                name="@", type="SOA", value="dc01.corp.local. hostmaster.corp.local."
            ),
            DNSRecord(name="@", type="NS", value="dc01.corp.local."),
            DNSRecord(name="@", type="A", value="192.168.1.10"),
            DNSRecord(name="dc01", type="A", value="192.168.1.10"),
            DNSRecord(
                name="_ldap._tcp", type="SRV", value="0 100 389 dc01.corp.local."
            ),
            DNSRecord(
                name="_kerberos._tcp", type="SRV", value="0 100 88 dc01.corp.local."
            ),
            DNSRecord(
                name="_ldap._tcp.Default-First-Site._sites",
                type="SRV",
                value="0 100 389 dc01.corp.local.",
            ),
        ],
    ),
    "1.168.192.in-addr.arpa": DNSZone(
        name="1.168.192.in-addr.arpa",
        zone_type="Primary",
        serial=int(time.time()),
        records=[
            DNSRecord(
                name="@", type="SOA", value="dc01.corp.local. hostmaster.corp.local."
            ),
            DNSRecord(name="@", type="NS", value="dc01.corp.local."),
            DNSRecord(name="10", type="PTR", value="dc01.corp.local."),
        ],
    ),
}


# ── Endpoints ─────────────────────────────────────────────────────────


@router.get("/zones", response_model=list[DNSZone])
def list_zones(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[DNSZone]:
    """List all DNS zones."""
    return list(_mock_zones.values())


@router.get("/zones/{zone_name}/records", response_model=list[DNSRecord])
def list_records(
    zone_name: str,
    directory: DirectoryBackend = Depends(get_directory),
) -> list[DNSRecord]:
    """List all records in a zone."""
    zone = _mock_zones.get(zone_name)
    if not zone:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_name}' not found")
    return zone.records


@router.post("/zones/{zone_name}/records", response_model=DNSRecord, status_code=201)
def create_record(
    zone_name: str,
    payload: DNSRecordCreate,
    directory: DirectoryBackend = Depends(get_directory),
) -> DNSRecord:
    """Add a DNS record to a zone."""
    zone = _mock_zones.get(zone_name)
    if not zone:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_name}' not found")
    record = DNSRecord(**payload.model_dump())
    zone.records.append(record)
    zone.serial = int(time.time())
    return record


@router.delete("/zones/{zone_name}/records/{record_name}", status_code=204)
def delete_record(
    zone_name: str,
    record_name: str,
    directory: DirectoryBackend = Depends(get_directory),
) -> None:
    """Delete a DNS record from a zone."""
    zone = _mock_zones.get(zone_name)
    if not zone:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_name}' not found")
    zone.records = [r for r in zone.records if r.name != record_name]
    zone.serial = int(time.time())
