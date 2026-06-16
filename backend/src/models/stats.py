"""SPDX-License-Identifier: Apache-2.0

Statistics schemas for the dashboard (login trend, OU distribution, etc.).
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class StatCard(BaseModel):
    """One top-level dashboard stat card."""

    label: str
    value: int = Field(ge=0)
    delta: int = 0
    delta_label: str | None = None
    accent: str = "blue"


class LoginTrendPoint(BaseModel):
    """One day in the 7-day login trend."""

    date: str
    success: int = Field(ge=0)
    fail: int = Field(ge=0)


class OuDistributionEntry(BaseModel):
    """One OU bucket in the user-distribution chart."""

    ou: str
    count: int = Field(ge=0)


class AlertItem(BaseModel):
    """One recent alert row."""

    id: str
    level: str = Field(description="critical | warning | info")
    message: str
    timestamp: str
