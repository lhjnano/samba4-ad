"""SPDX-License-Identifier: Apache-2.0

Health & system-resource schemas (dashboard service status, CPU/Mem/Disk).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from src.models.domain import DOMAIN_SERVICES


class ServiceStatus(BaseModel):
    """One domain service health entry (LDAP, Kerberos, DNS, SMB, Replication)."""

    name: str
    port: int
    healthy: bool
    latency_ms: float = Field(ge=0)
    kind: str


class SystemResources(BaseModel):
    """Host resource usage gauges."""

    cpu_percent: float = Field(ge=0, le=100)
    memory_used_gb: float = Field(ge=0)
    memory_total_gb: float = Field(ge=0)
    disk_used_gb: float = Field(ge=0)
    disk_total_gb: float = Field(ge=0)


class HealthReport(BaseModel):
    """Aggregated health snapshot for the dashboard."""

    dc_status: str = Field(description="healthy / unhealthy")
    uptime_percent: float
    services: list[ServiceStatus]
    system: SystemResources


class VersionInfo(BaseModel):
    """About / version info."""

    app: str
    app_version: str
    samba_version: str | None = None
    domain_functional_level: str | None = None
    server_os: str | None = None
    kernel: str | None = None


# Default service catalogue (used by mock provider & docs)
DEFAULT_SERVICES = [  # type: ignore[var-annotated]
    ServiceStatus(**svc, healthy=True, latency_ms=0.0)  # type: ignore[arg-type]
    for svc in DOMAIN_SERVICES
]
