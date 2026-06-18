"""SPDX-License-Identifier: Apache-2.0

DNS zones & records routes — ``/api/v1/dns``.

Queries the Samba 4 internal DNS via ``samba-tool dns`` commands.
In mock mode, returns a minimal built-in zone set.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.core.config import settings
from src.core.deps import get_directory
from src.services.directory import DirectoryBackend
from src.services.samba_tool import SambaTool

router = APIRouter(prefix="/dns", tags=["dns"])


# ── Models ────────────────────────────────────────────────────────────


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


class DNSRecordDelete(BaseModel):
    type: str = "A"
    value: str


# ── samba-tool dns helpers ────────────────────────────────────────────


def _dns_tool() -> SambaTool:  # pragma: no cover
    return SambaTool(settings)


def _run_dns(*parts: str) -> Any:  # pragma: no cover
    tool = _dns_tool()
    res = tool._run(tool._base_cmd("dns", *parts))
    return res


def _parse_zones(stdout: str) -> list[DNSZone]:  # pragma: no cover
    """Parse 'samba-tool dns zonelist' output."""
    zones: list[DNSZone] = []
    current_name = ""
    current_type = ""
    for line in stdout.splitlines():
        line = line.strip()
        if line.startswith("pszZoneName"):
            current_name = line.split(":", 1)[1].strip()
        elif line.startswith("ZoneType"):
            raw_type = line.split(":", 1)[1].strip()
            current_type = "Primary" if "PRIMARY" in raw_type else raw_type
        elif current_name and current_type and not line:
            # blank line = end of zone block
            if current_name not in [z.name for z in zones]:
                zones.append(DNSZone(name=current_name, zone_type=current_type))
            current_name = ""
            current_type = ""
    # Catch last zone if no trailing blank line
    if current_name and current_name not in [z.name for z in zones]:
        zones.append(DNSZone(name=current_name, zone_type=current_type))
    return zones


def _parse_records(stdout: str) -> list[DNSRecord]:  # pragma: no cover
    """Parse 'samba-tool dns query' output into DNSRecord list."""
    records: list[DNSRecord] = []
    current_name = ""

    for line in stdout.splitlines():
        stripped = line.strip()
        if stripped.startswith("Name="):
            # Extract node name (empty = @ root)
            name_part = stripped.split(",", 1)[0]  # "Name=" or "Name=_tcp"
            current_name = name_part.split("=", 1)[1] if "=" in name_part else ""
            if not current_name:
                current_name = "@"
            continue

        if not current_name or not stripped:
            continue

        # Parse record lines: "A: 192.168.39.1 (flags=f0, serial=1, ttl=900)"
        # or "SOA: serial=19, refresh=900, ... (flags=..., serial=19, ttl=3600)"
        # or "SRV: dom39-forest01.corp.local. (3268, 0, 100) (flags=..., serial=1, ttl=900)"
        # or "NS: dom39-forest01.corp.local. (flags=..., serial=1, ttl=900)"
        match = re.match(
            r"^(\w+):\s+(.+?)\s*\(flags=([^,]+),\s*serial=\d+,\s*ttl=(\d+)\)$", stripped
        )
        if match:
            rtype = match.group(1)
            raw_value = match.group(2).strip()
            ttl = int(match.group(4))

            # Clean up value
            if rtype == "SOA":
                # Extract ns and email from the verbose SOA output
                ns_match = re.search(r"ns=([^,]+)", raw_value)
                email_match = re.search(r"email=([^,\s]+)", raw_value)
                ns = ns_match.group(1) if ns_match else raw_value
                email = email_match.group(1) if email_match else ""
                value = f"{ns} {email}".strip()
            elif rtype == "SRV":
                # "dom39-forest01.corp.local. (3268, 0, 100)" → "0 100 3268 dom39-forest01.corp.local."
                srv_match = re.match(
                    r"^(.+?)\s*\((\d+),\s*(\d+),\s*(\d+)\)$", raw_value
                )
                if srv_match:
                    host = srv_match.group(1).strip()
                    port = srv_match.group(2)
                    weight = srv_match.group(3)
                    priority = srv_match.group(4)
                    value = f"{priority} {weight} {port} {host}"
                else:
                    value = raw_value
            else:
                value = raw_value

            records.append(
                DNSRecord(name=current_name, type=rtype, value=value, ttl=ttl)
            )

    return records


def _query_zone_records(zone: str) -> list[DNSRecord]:  # pragma: no cover
    """Query all records in a zone, recursing into child nodes."""
    all_records: list[DNSRecord] = []

    # Query root (@) first
    res = _run_dns("query", settings.ldap_host, zone, "@", "ALL")
    if not res.ok:
        return all_records
    all_records.extend(_parse_records(res.stdout))

    # Find child nodes and query them
    children: list[str] = []
    for line in res.stdout.splitlines():
        line = line.strip()
        if line.startswith("Name=") and "Children=" in line:
            name_part = line.split(",", 1)[0]
            child_name = name_part.split("=", 1)[1] if "=" in name_part else ""
            children_count = 0
            m = re.search(r"Children=(\d+)", line)
            if m:
                children_count = int(m.group(1))
            if children_count > 0 and child_name:
                children.append(child_name)

    # Query each child with children
    for child in children:
        child_res = _run_dns("query", settings.ldap_host, zone, child, "ALL")
        if child_res.ok:
            all_records.extend(_parse_records(child_res.stdout))

    return all_records


# ── Mock fallback ─────────────────────────────────────────────────────


_MOCK_DNS_ZONES: list[DNSZone] = [
    DNSZone(
        name="corp.local",
        zone_type="Primary",
        serial=1,
        records=[
            DNSRecord(name="@", type="A", value="192.168.39.1"),
            DNSRecord(name="dom39-forest01", type="A", value="192.168.39.1"),
        ],
    ),
    DNSZone(
        name="39.168.192.in-addr.arpa",
        zone_type="Primary",
        serial=1,
        records=[
            DNSRecord(name="1", type="PTR", value="dom39-forest01.corp.local."),
        ],
    ),
]

_MOCK_RECORD_STORE: dict[str, list[DNSRecord]] = {
    z.name: list(z.records) for z in _MOCK_DNS_ZONES
}


def _mock_zone_names() -> set[str]:
    return {z.name for z in _MOCK_DNS_ZONES}


# ── Endpoints ─────────────────────────────────────────────────────────


@router.get("/zones", response_model=list[DNSZone])
def list_zones(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[DNSZone]:
    """List all DNS zones via samba-tool dns zonelist."""
    if settings.app_mode != "ldap":
        return _MOCK_DNS_ZONES

    res = _run_dns("zonelist", settings.ldap_host)
    if not res.ok:
        return _MOCK_DNS_ZONES

    zones = _parse_zones(res.stdout)
    for zone in zones:
        zone.records = _query_zone_records(zone.name)

    return zones


@router.get("/zones/{zone_name}/records", response_model=list[DNSRecord])
def list_records(
    zone_name: str,
    directory: DirectoryBackend = Depends(get_directory),
) -> list[DNSRecord]:
    """List all records in a zone via samba-tool dns query."""
    if settings.app_mode != "ldap":
        if zone_name not in _mock_zone_names():
            raise HTTPException(status_code=404, detail=f"Zone '{zone_name}' not found")
        return _MOCK_RECORD_STORE.get(zone_name, [])

    records = _query_zone_records(zone_name)
    return records


@router.post("/zones/{zone_name}/records", response_model=DNSRecord, status_code=201)
def create_record(
    zone_name: str,
    payload: DNSRecordCreate,
    directory: DirectoryBackend = Depends(get_directory),
) -> DNSRecord:
    """Add a DNS record via samba-tool dns add."""
    if settings.app_mode != "ldap":
        if zone_name not in _mock_zone_names():
            raise HTTPException(status_code=404, detail=f"Zone '{zone_name}' not found")
        record = DNSRecord(**payload.model_dump())
        _MOCK_RECORD_STORE.setdefault(zone_name, []).append(record)
        return record

    name = "@" if payload.name == "@" else payload.name
    res = _run_dns(
        "add",
        settings.ldap_host,
        zone_name,
        name,
        payload.type.upper(),
        payload.value,
    )
    if not res.ok:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to add DNS record: {res.stderr or res.stdout}",
        )
    return DNSRecord(**payload.model_dump())


@router.delete("/zones/{zone_name}/records/{record_name}", status_code=204)
def delete_record(
    zone_name: str,
    record_name: str,
    rtype: str = "A",
    value: str = "",
    directory: DirectoryBackend = Depends(get_directory),
) -> None:
    """Delete a DNS record via samba-tool dns delete."""
    if settings.app_mode != "ldap":
        if zone_name not in _mock_zone_names():
            raise HTTPException(status_code=404, detail=f"Zone '{zone_name}' not found")
        store = _MOCK_RECORD_STORE.get(zone_name, [])
        _MOCK_RECORD_STORE[zone_name] = [r for r in store if r.name != record_name]
        return

    name = "@" if record_name == "@" else record_name
    cmd_parts = [
        "delete",
        settings.ldap_host,
        zone_name,
        name,
        rtype.upper(),
    ]
    if value:
        cmd_parts.append(value)

    res = _run_dns(*cmd_parts)
    if not res.ok:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to delete DNS record: {res.stderr or res.stdout}",
        )
