"""SPDX-License-Identifier: Apache-2.0

Health & system-resource routes — ``/api/v1/health`` (dashboard service
status, CPU/Mem/Disk, version info).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from src.core.config import settings
from src.core.deps import get_directory
from src.models.health import HealthReport, ServiceStatus, SystemResources, VersionInfo
from src.services.directory import DirectoryBackend

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/services", response_model=list[ServiceStatus])
def services_status(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[ServiceStatus]:
    return directory.services_status()


@router.get("/system", response_model=SystemResources)
def system_resources(
    directory: DirectoryBackend = Depends(get_directory),
) -> SystemResources:
    return directory.system_resources()


@router.get("", response_model=HealthReport)
def health_report(directory: DirectoryBackend = Depends(get_directory)) -> HealthReport:
    services = directory.services_status()
    all_healthy = all(s.healthy for s in services)
    return HealthReport(
        dc_status="healthy" if all_healthy else "unhealthy",
        uptime_percent=99.9 if all_healthy else 97.5,
        services=services,
        system=directory.system_resources(),
    )


@router.get("/version", response_model=VersionInfo)
def version(directory: DirectoryBackend = Depends(get_directory)) -> VersionInfo:
    info = directory.domain_info()
    return VersionInfo(
        app=settings.app_name,
        app_version=settings.app_version,
        samba_version=info.samba_version,
        domain_functional_level=info.domain_functional_level,
        server_os=info.server_os,
    )
