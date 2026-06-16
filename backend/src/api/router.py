"""SPDX-License-Identifier: Apache-2.0

API router aggregator — mounts all resource routers under one prefix.
"""

from __future__ import annotations

from fastapi import APIRouter

from src.api import (
    alerts,
    auth,
    computers,
    domain,
    gpo,
    groups,
    health,
    ou,
    settings,
    setup,
    stats,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(setup.router)
api_router.include_router(users.router)
api_router.include_router(groups.router)
api_router.include_router(ou.router)
api_router.include_router(computers.router)
api_router.include_router(gpo.router)
api_router.include_router(domain.router)
api_router.include_router(health.router)
api_router.include_router(stats.router)
api_router.include_router(alerts.router)
api_router.include_router(settings.router)
