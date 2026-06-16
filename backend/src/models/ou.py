"""SPDX-License-Identifier: Apache-2.0

Organizational Unit schemas — tree view + detail.

Maps to LDAP ``objectClass=organizationalUnit``.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from src.models.common import encode_id
from src.models.domain import GpoLinkMode


class GpoLinkRef(BaseModel):
    """A GPO linked to an OU (parsed from the ``gPLink`` attribute)."""

    gpo_id: str
    display_name: str
    mode: GpoLinkMode


class OuCreate(BaseModel):
    """POST /api/v1/ou body."""

    name: str = Field(min_length=1, examples=["HR"])
    parent_dn: str | None = Field(
        default=None,
        description="Parent OU DN. Root-level when omitted.",
        examples=["DC=TEST,DC=LOCAL"],
    )
    description: str | None = None


class OuUpdate(BaseModel):
    """PATCH /api/v1/ou/{id} body."""

    description: str | None = None
    managed_by: str | None = None
    inherit_gpo: bool | None = None


class OuTreeNode(BaseModel):
    """A node in the OU tree (recursive)."""

    id: str
    name: str
    dn: str
    description: str | None = None
    user_count: int = Field(ge=0)
    computer_count: int = Field(ge=0)
    gpo_count: int = Field(ge=0)
    children: list[OuTreeNode] = Field(default_factory=list)

    @field_validator("id", mode="before")
    @classmethod
    def _encode(cls, v: object) -> object:
        if isinstance(v, str) and "," in v and "=" in v:
            return encode_id(v)
        return v


class OuDetail(BaseModel):
    """Full OU representation (detail panel)."""

    id: str
    name: str
    dn: str
    description: str | None = None
    when_created: datetime | None = None
    when_changed: datetime | None = None
    managed_by: str | None = None
    inherit_gpo: bool = True
    user_count: int = Field(ge=0)
    computer_count: int = Field(ge=0)
    linked_gpos: list[GpoLinkRef] = Field(default_factory=list)
    child_ous: list[OuTreeNode] = Field(default_factory=list)


class OuStats(BaseModel):
    """Aggregate counts for the OU management header."""

    total: int = Field(ge=0)
    user_objects: int = Field(ge=0)
    computer_objects: int = Field(ge=0)
    linked_gpos: int = Field(ge=0)


class GpoLinkRequest(BaseModel):
    """POST /api/v1/ou/{id}/gpo-links body — link a GPO to this OU."""

    gpo_id: str
    enforced: bool = False
