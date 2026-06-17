"""SPDX-License-Identifier: Apache-2.0

User schemas — request/response models for user management.

Maps to LDAP ``objectClass=user``. See :mod:`src.models.domain` for the
attribute mapping (Gate 1).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from src.models.common import Email, encode_id
from src.models.domain import AccountStatus, UserAccountControl


def _status_from_uac(uac: int) -> AccountStatus:
    """Derive the UI status from a raw userAccountControl integer."""
    flags = UserAccountControl(uac)
    if UserAccountControl.LOCKOUT in flags:
        return AccountStatus.LOCKED
    if UserAccountControl.ACCOUNTDISABLE in flags:
        return AccountStatus.INACTIVE
    return AccountStatus.ACTIVE


class UserBase(BaseModel):
    """Editable user fields shared by create/update payloads."""

    username: str = Field(min_length=1, max_length=104, examples=["jdoe"])
    display_name: str | None = Field(default=None, examples=["John Doe"])
    first_name: str | None = None
    last_name: str | None = None
    email: Email | None = None
    phone: str | None = None
    ou_dn: str | None = Field(
        default=None,
        description="DN of the parent OU to create the user in. "
        "Defaults to CN=Users,<search base> when omitted.",
        examples=["OU=Engineering,DC=TEST,DC=LOCAL"],
    )


class UserCreate(UserBase):
    """POST /api/v1/users body."""

    password: str = Field(min_length=1, description="Initial password")


class UserUpdate(BaseModel):
    """PATCH /api/v1/users/{id} body — all fields optional."""

    display_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: Email | None = None
    phone: str | None = None
    ou_dn: str | None = Field(
        default=None,
        description="New parent OU — triggers an LDAP move operation.",
    )


class UserSummary(BaseModel):
    """Compact representation used in table rows / lists."""

    id: str = Field(description="Opaque id (base64url-encoded DN)")
    username: str
    display_name: str | None = None
    email: Email | None = None
    ou: str = Field(description="Parent OU name extracted from DN")
    status: AccountStatus
    enabled: bool = True
    locked: bool = False
    last_logon: datetime | None = None

    @model_validator(mode="after")
    def _derive_status_fields(self) -> UserSummary:
        """Derive enabled/locked booleans from status if not explicitly set."""
        if self.status == AccountStatus.LOCKED:
            self.locked = True
        if self.status == AccountStatus.INACTIVE:
            self.enabled = False
        return self

    @field_validator("id", mode="before")
    @classmethod
    def _encode(cls, v: object) -> object:
        if isinstance(v, str) and "," in v and "=" in v:
            return encode_id(v)
        return v


class UserGroupMembership(BaseModel):
    """A single group the user belongs to."""

    id: str
    name: str
    dn: str


class LoginEvent(BaseModel):
    """One entry in the user's login history."""

    hostname: str
    timestamp: datetime
    ip_address: str | None = None
    success: bool


class UserDetail(BaseModel):
    """Full user representation shown in the detail slide-panel."""

    id: str
    username: str
    display_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: Email | None = None
    phone: str | None = None
    dn: str
    ou: str
    status: AccountStatus
    enabled: bool = True
    locked: bool = False
    user_account_control: int
    when_created: datetime | None = None
    password_expires: datetime | None = None
    object_sid: str | None = None
    groups: list[UserGroupMembership] = Field(default_factory=list)
    login_history: list[LoginEvent] = Field(default_factory=list)

    @model_validator(mode="after")
    def _derive_status_fields(self) -> UserDetail:
        """Derive enabled/locked booleans from status."""
        if self.status == AccountStatus.LOCKED:
            self.locked = True
        if self.status == AccountStatus.INACTIVE:
            self.enabled = False
        return self


class UserStats(BaseModel):
    """Aggregate counts for the user management header."""

    total: int = Field(ge=0)
    active: int = Field(ge=0)
    inactive: int = Field(ge=0)
    locked: int = Field(ge=0)
    created_today: int = Field(ge=0)


class ResetPasswordRequest(BaseModel):
    """POST /api/v1/users/{id}/reset-password body."""

    new_password: str = Field(min_length=1)
