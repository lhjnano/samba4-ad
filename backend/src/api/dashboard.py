"""SPDX-License-Identifier: Apache-2.0

Dashboard aggregator routes — ``/api/v1/dashboard``.

These endpoints match the exact response shapes expected by the React
frontend Dashboard page. They compose data from the directory backend
and re-map field names to the frontend's TypeScript interfaces.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from src.core.deps import get_directory
from src.services.directory import DirectoryBackend

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ── Response models (match frontend types/api.ts exactly) ─────────────


class DashboardStats(BaseModel):
    total_users: int = 0
    active_users: int = 0
    total_groups: int = 0
    total_computers: int = 0
    total_ous: int = 0
    total_gpos: int = 0
    domain_functional_level: str = ""
    forest_functional_level: str = ""
    domain_controllers: list[str] = Field(default_factory=list)


class SystemHealth(BaseModel):
    cpu_percent: float = 0
    memory_percent: float = 0
    disk_percent: float = 0
    uptime: str = ""


class ServicesStatusItem(BaseModel):
    name: str
    status: str  # "healthy" | "degraded" | "down"
    port: int | None = None
    detail: str | None = None


class LoginTrendItem(BaseModel):
    date: str
    count: int


class OUDistributionItem(BaseModel):
    ou: str
    user_count: int


class RecentAlertItem(BaseModel):
    id: str
    severity: str  # "info" | "warning" | "critical"
    message: str
    timestamp: str


# ── Endpoints ─────────────────────────────────────────────────────────


@router.get("/stats", response_model=DashboardStats)
def dashboard_stats(
    directory: DirectoryBackend = Depends(get_directory),
) -> DashboardStats:
    """Aggregate counts for the dashboard stat cards."""
    users = directory.user_stats()
    computers = directory.computer_stats()
    groups = directory.group_stats()
    ous = directory.ou_stats()
    gpos = directory.gpo_stats()
    info = directory.domain_info()
    return DashboardStats(
        total_users=users.total,
        active_users=users.active,
        total_groups=groups.total,
        total_computers=computers.total,
        total_ous=ous.total,
        total_gpos=gpos.total,
        domain_functional_level=info.domain_functional_level,
        forest_functional_level=info.forest_functional_level,
        domain_controllers=[info.dc_hostname]
        if info.dc_hostname
        else [info.netbios_name],
    )


@router.get("/system-health", response_model=SystemHealth)
def system_health(
    directory: DirectoryBackend = Depends(get_directory),
) -> SystemHealth:
    """CPU / memory / disk percentages for the resource gauges."""
    sys = directory.system_resources()
    mem_pct = (
        (sys.memory_used_gb / sys.memory_total_gb * 100) if sys.memory_total_gb else 0
    )
    disk_pct = (sys.disk_used_gb / sys.disk_total_gb * 100) if sys.disk_total_gb else 0
    return SystemHealth(
        cpu_percent=round(sys.cpu_percent, 1),
        memory_percent=round(mem_pct, 1),
        disk_percent=round(disk_pct, 1),
        uptime="—",
    )


@router.get("/services", response_model=list[ServicesStatusItem])
def services(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[ServicesStatusItem]:
    """Service health list for the dashboard."""
    svcs = directory.services_status()
    return [
        ServicesStatusItem(
            name=s.name,
            status="healthy" if s.healthy else "down",
            port=s.port,
            detail=s.kind,
        )
        for s in svcs
    ]


@router.get("/login-trend", response_model=list[LoginTrendItem])
def login_trend(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[LoginTrendItem]:
    """7-day login trend (total logins per day)."""
    trend = directory.login_trend(7)
    return [LoginTrendItem(date=p.date, count=p.success + p.fail) for p in trend]


@router.get("/ou-distribution", response_model=list[OUDistributionItem])
def ou_distribution(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[OUDistributionItem]:
    """User distribution across OUs."""
    dist = directory.ou_distribution()
    return [OUDistributionItem(ou=d.ou, user_count=d.count) for d in dist]


@router.get("/recent-alerts", response_model=list[RecentAlertItem])
def recent_alerts(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[RecentAlertItem]:
    """Recent security alerts."""
    alerts = directory.recent_alerts(10)
    return [
        RecentAlertItem(
            id=a.id,
            severity=a.level,
            message=a.message,
            timestamp=a.timestamp,
        )
        for a in alerts
    ]
