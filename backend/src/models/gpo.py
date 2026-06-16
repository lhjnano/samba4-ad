"""SPDX-License-Identifier: Apache-2.0

Group Policy Object (GPO) schemas.

GPOs live under ``CN=Policies,CN=System,<base>`` as
``objectClass=groupPolicyContainer``. Links are stored on OUs via ``gPLink``.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from src.models.common import encode_id
from src.models.domain import GpoLinkMode, GpoStatus


class PolicyValue(BaseModel):
    """A single key policy setting (e.g. min password length)."""

    name: str
    value: str


class LinkedOu(BaseModel):
    """An OU linked to a GPO."""

    ou_id: str
    ou_dn: str
    mode: GpoLinkMode


class GpoCreate(BaseModel):
    """POST /api/v1/gpo body."""

    display_name: str = Field(min_length=1, max_length=255)
    ou_dn: str | None = Field(
        default=None, description="OU to link the new GPO to (optional)."
    )


class GpoSummary(BaseModel):
    """Compact GPO representation for the list view."""

    id: str
    display_name: str
    status: GpoStatus
    description: str | None = None
    link_count: int = Field(ge=0)

    @field_validator("id", mode="before")
    @classmethod
    def _encode(cls, v: object) -> object:
        if isinstance(v, str) and ("{" in v or ("," in v and "=" in v)):
            return encode_id(v)
        return v


class GpoDetail(BaseModel):
    """Full GPO representation (detail panel)."""

    id: str
    guid: str
    display_name: str
    dn: str
    status: GpoStatus
    description: str | None = None
    when_created: datetime | None = None
    when_changed: datetime | None = None
    version_user: int = Field(default=0, ge=0)
    version_computer: int = Field(default=0, ge=0)
    wmi_filter: str | None = None
    linked_ous: list[LinkedOu] = Field(default_factory=list)
    settings: list[PolicyValue] = Field(default_factory=list)


class GpoStats(BaseModel):
    """Aggregate counts for the GPO header."""

    total: int = Field(ge=0)
    active: int = Field(ge=0)
    enforced: int = Field(ge=0)
    disabled: int = Field(ge=0)


class GpoLinkTargetRequest(BaseModel):
    """POST /api/v1/gpo/{id}/links body — link GPO to an OU."""

    ou_dn: str
    enforced: bool = False
