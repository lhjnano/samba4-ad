"""SPDX-License-Identifier: Apache-2.0

Group schemas — request/response models for group management.

Maps to LDAP ``objectClass=group``.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from src.models.common import encode_id
from src.models.domain import GroupCategory, GroupScope


def _parse_group_type(group_type: int) -> tuple[GroupCategory, GroupScope]:
    """Decode the signed 32-bit ``groupType`` into (category, scope).

    Real AD semantics: the security bit is 0x80000000 and the value is stored
    as a *negative* (two's-complement) integer for security groups.
    """
    raw = group_type & 0xFFFFFFFF
    is_security = bool(raw & 0x80000000)
    scope_bits = raw & 0x00000007  # 2=global, 4=domain-local, 8(or 1..)=universal
    if scope_bits & 0x2:
        scope = GroupScope.GLOBAL
    elif scope_bits & 0x4:
        scope = GroupScope.DOMAIN_LOCAL
    else:
        scope = GroupScope.UNIVERSAL
    category = GroupCategory.SECURITY if is_security else GroupCategory.DISTRIBUTION
    return category, scope


class GroupCreate(BaseModel):
    """POST /api/v1/groups body."""

    name: str = Field(min_length=1, max_length=63, examples=["vpn-users"])
    description: str | None = None
    category: GroupCategory = GroupCategory.SECURITY
    scope: GroupScope = GroupScope.GLOBAL
    ou_dn: str | None = None


class GroupUpdate(BaseModel):
    """PATCH /api/v1/groups/{id} body."""

    description: str | None = None
    managed_by: str | None = Field(default=None, description="DN of the manager")


class GroupMemberRef(BaseModel):
    """A member reference inside a group."""

    id: str
    name: str
    dn: str


class GroupSummary(BaseModel):
    """Compact group representation for table rows."""

    id: str
    name: str
    category: GroupCategory
    scope: GroupScope
    member_count: int = Field(ge=0)
    description: str | None = None
    managed_by: str | None = None

    @field_validator("id", mode="before")
    @classmethod
    def _encode(cls, v: object) -> object:
        if isinstance(v, str) and "," in v and "=" in v:
            return encode_id(v)
        return v


class GroupDetail(BaseModel):
    """Full group representation (detail panel)."""

    id: str
    name: str
    dn: str
    category: GroupCategory
    scope: GroupScope
    description: str | None = None
    member_count: int = Field(ge=0)
    managed_by: str | None = None
    when_created: datetime | None = None
    when_changed: datetime | None = None
    object_sid: str | None = None
    members: list[GroupMemberRef] = Field(default_factory=list)
    nested_groups: list[GroupMemberRef] = Field(default_factory=list)


class GroupStats(BaseModel):
    """Aggregate counts for the group management header."""

    total: int = Field(ge=0)
    security: int = Field(ge=0)
    distribution: int = Field(ge=0)
    nested: int = Field(ge=0)


class AddMembersRequest(BaseModel):
    """POST /api/v1/groups/{id}/members body."""

    member_dns: list[str] = Field(min_length=1, description="DNs to add")
