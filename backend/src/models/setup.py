"""SPDX-License-Identifier: Apache-2.0

Setup wizard schemas — domain provisioning request/response models.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ProvisionRequest(BaseModel):
    """Request body for POST /setup/provision — creates a new AD domain."""

    realm: str = Field(
        ...,
        min_length=3,
        max_length=255,
        description="Domain FQDN (e.g. CORP.LOCAL)",
        examples=["CORP.LOCAL"],
    )
    domain_name: str = Field(
        ...,
        min_length=1,
        max_length=15,
        description="NetBIOS domain name (max 15 chars, shown on Windows)",
        examples=["CORP"],
    )
    admin_password: str = Field(
        ...,
        min_length=7,
        description="Administrator account password",
    )
    dns_forwarder: str = Field(
        default="8.8.8.8",
        description="Upstream DNS server for external resolution",
    )
    server_role: str = Field(
        default="dc",
        description="Samba server role (always 'dc' for domain controller)",
    )
    dns_backend: str = Field(
        default="SAMBA_INTERNAL",
        description="DNS backend (SAMBA_INTERNAL recommended)",
    )


class ProvisionStepStatus(BaseModel):
    """One step in the provisioning progress."""

    name: str
    label: str
    done: bool = False
    in_progress: bool = False
    error: str | None = None


class ProvisionResult(BaseModel):
    """Result of domain provisioning."""

    success: bool
    realm: str
    domain_name: str
    steps: list[ProvisionStepStatus]
    log: str | None = None
    error: str | None = None


class SetupStatus(BaseModel):
    """Current setup status — tells the UI whether provisioning is needed."""

    provisioned: bool
    realm: str | None = None
    domain_name: str | None = None
    smb_conf_path: str | None = None
    samba_running: bool = False
    ldap_reachable: bool = False
