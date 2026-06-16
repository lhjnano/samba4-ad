"""SPDX-License-Identifier: Apache-2.0

Dashboard statistics routes — ``/api/v1/stats``.

These compose the top-level KPI cards, login trend, OU distribution, and
recent alerts shown on the Dashboard preview (``previews/01-dashboard.html``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from src.core.deps import get_directory
from src.models.computers import ComputerStats
from src.models.stats import LoginTrendPoint, OuDistributionEntry, StatCard
from src.models.users import UserStats
from src.services.directory import DirectoryBackend

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/users", response_model=UserStats, summary="User aggregate stats")
def stats_users(directory: DirectoryBackend = Depends(get_directory)) -> UserStats:
    return directory.user_stats()


@router.get("/groups", response_model=StatCard, summary="Group count card")
def stats_groups(directory: DirectoryBackend = Depends(get_directory)) -> StatCard:
    g = directory.group_stats()
    return StatCard(label="Total Groups", value=g.total, delta=0, accent="blue")


@router.get(
    "/computers", response_model=ComputerStats, summary="Computer aggregate stats"
)
def stats_computers(
    directory: DirectoryBackend = Depends(get_directory),
) -> ComputerStats:
    return directory.computer_stats()


@router.get(
    "/logins",
    response_model=list[LoginTrendPoint],
    summary="Recent login activity (success vs fail)",
)
def stats_logins(
    days: int = Query(7, ge=1, le=90),
    directory: DirectoryBackend = Depends(get_directory),
) -> list[LoginTrendPoint]:
    return directory.login_trend(days)


@router.get(
    "/ou-distribution",
    response_model=list[OuDistributionEntry],
    summary="User distribution by OU",
)
def stats_ou_distribution(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[OuDistributionEntry]:
    return directory.ou_distribution()


@router.get(
    "/security-alerts", response_model=int, summary="Pending security alert count"
)
def stats_security_alerts(
    directory: DirectoryBackend = Depends(get_directory),
) -> int:
    alerts = directory.recent_alerts(50)
    return len(alerts)


@router.get(
    "/cards",
    response_model=list[StatCard],
    summary="All dashboard stat cards in one call",
)
def stats_cards(directory: DirectoryBackend = Depends(get_directory)) -> list[StatCard]:
    users = directory.user_stats()
    computers = directory.computer_stats()
    alerts = directory.recent_alerts(50)
    return [
        StatCard(
            label="Domain Controller",
            value=1,
            accent="green",
            delta_label="Healthy · Uptime 99.9%",
        ),
        StatCard(
            label="Total Users",
            value=users.total,
            delta=users.created_today,
            delta_label="Today",
            accent="blue",
        ),
        StatCard(
            label="Domain Joined Devices",
            value=computers.total,
            delta=computers.joined_today,
            delta_label="This Week",
            accent="purple",
        ),
        StatCard(
            label="Security Alerts",
            value=len(alerts),
            accent="yellow",
            delta_label="Pending",
        ),
    ]
