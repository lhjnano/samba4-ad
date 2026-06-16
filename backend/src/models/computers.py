"""SPDX-License-Identifier: Apache-2.0

Computer / domain-joined device schemas.

Maps to LDAP ``objectClass=computer``.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from src.models.common import encode_id
from src.models.domain import ComputerStatus


class ComputerSummary(BaseModel):
    """Compact representation for the device table."""

    id: str
    hostname: str
    dns_hostname: str | None = None
    operating_system: str | None = None
    operating_system_version: str | None = None
    ip_address: str | None = None
    ou: str
    status: ComputerStatus
    last_logon: datetime | None = None
    join_date: datetime | None = None

    @field_validator("id", mode="before")
    @classmethod
    def _encode(cls, v: object) -> object:
        if isinstance(v, str) and "," in v and "=" in v:
            return encode_id(v)
        return v


class ComputerDetail(ComputerSummary):
    """Full computer representation."""

    dn: str
    object_sid: str | None = None


class ComputerStats(BaseModel):
    """Aggregate counts for the domain-join header."""

    total: int = Field(ge=0)
    active: int = Field(ge=0)
    inactive: int = Field(ge=0)
    stale: int = Field(ge=0)
    joined_today: int = Field(ge=0)


class OsDistribution(BaseModel):
    """One OS bucket in the distribution chart."""

    os: str
    count: int = Field(ge=0)


class JoinTrendPoint(BaseModel):
    """One day in the 7-day join trend."""

    date: str
    count: int = Field(ge=0)
