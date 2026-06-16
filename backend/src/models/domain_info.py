"""SPDX-License-Identifier: Apache-2.0

Domain-level schemas: domain info, FSMO roles, DNS, password & lockout policy.

These map to ``rootDSE``, the domain NC head attributes, and
``samba-tool domain`` commands.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class DomainInfo(BaseModel):
    """High-level domain metadata (settings → About, dashboard pill)."""

    fqdn: str = Field(examples=["TEST.LOCAL"])
    netbios_name: str = Field(examples=["TEST"])
    forest_name: str
    domain_functional_level: str
    forest_functional_level: str
    dc_hostname: str | None = None
    dc_ip: str | None = None
    object_count: int = Field(ge=0)
    created: str | None = None
    samba_version: str | None = None
    server_os: str | None = None


class FsmoRoleHolder(BaseModel):
    """One Flexible Single Master Operation role assignment."""

    role: str
    holder: str


class DnsServer(BaseModel):
    address: str
    is_forwarder: bool = False


class PasswordPolicy(BaseModel):
    """Domain default password policy.

    Read from the domain NC head attributes; editable via ``samba-tool domain
    passwordsettings set``.
    """

    min_length: int = Field(ge=0, le=256)
    max_age_days: int = Field(ge=0)
    min_age_days: int = Field(ge=0)
    history: int = Field(ge=0, le=1024)
    complexity: bool = True
    reversible_encryption: bool = False


class PasswordPolicyUpdate(PasswordPolicy):
    """PATCH /api/v1/domain/password-policy — all fields required for clarity."""


class LockoutPolicy(BaseModel):
    """Domain account-lockout policy."""

    threshold: int = Field(ge=0, description="0 = never lock out")
    duration_minutes: int = Field(ge=0)
    observation_window_minutes: int = Field(ge=0)


class LockoutPolicyUpdate(LockoutPolicy):
    """PATCH /api/v1/domain/lockout-policy."""


class DomainSecurityFlags(BaseModel):
    """Additional domain security toggles shown in settings → Security."""

    ldap_signing_required: bool = False
    smb_signing_required: bool = False
    block_anonymous_ldap: bool = True
