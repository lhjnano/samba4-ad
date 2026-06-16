"""SPDX-License-Identifier: Apache-2.0

Domain-level routes — ``/api/v1/domain`` (info, FSMO, DNS, password/lockout
policy).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from src.api._errors import to_http_error
from src.core.deps import get_directory
from src.models.domain_info import (
    DnsServer,
    DomainInfo,
    DomainSecurityFlags,
    FsmoRoleHolder,
    LockoutPolicy,
    LockoutPolicyUpdate,
    PasswordPolicy,
    PasswordPolicyUpdate,
)
from src.services.directory import DirectoryBackend, DirectoryError

router = APIRouter(prefix="/domain", tags=["domain"])


@router.get("/info", response_model=DomainInfo)
def domain_info(directory: DirectoryBackend = Depends(get_directory)) -> DomainInfo:
    return directory.domain_info()


@router.get("/fsmo", response_model=list[FsmoRoleHolder])
def fsmo_roles(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[FsmoRoleHolder]:
    try:
        return directory.fsmo_roles()
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.get("/dns", response_model=list[DnsServer])
def dns_servers(
    directory: DirectoryBackend = Depends(get_directory),
) -> list[DnsServer]:
    try:
        return directory.dns_servers()
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.get("/password-policy", response_model=PasswordPolicy)
def get_password_policy(
    directory: DirectoryBackend = Depends(get_directory),
) -> PasswordPolicy:
    try:
        return directory.password_policy()
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.patch("/password-policy", response_model=PasswordPolicy)
def update_password_policy(
    payload: PasswordPolicyUpdate,
    directory: DirectoryBackend = Depends(get_directory),
) -> PasswordPolicy:
    try:
        return directory.set_password_policy(**payload.model_dump())
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.get("/lockout-policy", response_model=LockoutPolicy)
def get_lockout_policy(
    directory: DirectoryBackend = Depends(get_directory),
) -> LockoutPolicy:
    try:
        return directory.lockout_policy()
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.patch("/lockout-policy", response_model=LockoutPolicy)
def update_lockout_policy(
    payload: LockoutPolicyUpdate,
    directory: DirectoryBackend = Depends(get_directory),
) -> LockoutPolicy:
    try:
        return directory.set_lockout_policy(**payload.model_dump())
    except DirectoryError as e:
        raise to_http_error(e) from e


@router.get("/security-flags", response_model=DomainSecurityFlags)
def security_flags() -> DomainSecurityFlags:
    """Static defaults — wired to samba-tool / smb.conf in deployment."""
    return DomainSecurityFlags()
