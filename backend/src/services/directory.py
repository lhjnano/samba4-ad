"""SPDX-License-Identifier: Apache-2.0

Directory backend protocol + exceptions + factory.

The :class:`DirectoryBackend` protocol defines the domain-level operations the
services rely on. Two concrete implementations exist:

* :class:`src.services.mock.MockDirectory` — in-memory, deterministic, used for
  local development and all T0 unit tests.
* :class:`src.services.ldap3_backend.Ldap3Backend` — real Samba 4 AD DC via
  ``ldap3`` + ``samba-tool``.

The factory :func:`get_backend` selects one based on ``Settings.app_mode``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    from src.models.computers import (
        ComputerDetail,
        ComputerStats,
        ComputerSummary,
        JoinTrendPoint,
        OsDistribution,
    )
    from src.models.domain_info import (
        DnsServer,
        DomainInfo,
        FsmoRoleHolder,
        LockoutPolicy,
        PasswordPolicy,
    )
    from src.models.gpo import GpoDetail, GpoStats, GpoSummary
    from src.models.groups import GroupCreate, GroupDetail, GroupStats, GroupSummary
    from src.models.health import ServiceStatus, SystemResources
    from src.models.ou import OuCreate, OuDetail, OuStats, OuTreeNode
    from src.models.stats import AlertItem, LoginTrendPoint, OuDistributionEntry
    from src.models.users import (
        LoginEvent,
        UserCreate,
        UserDetail,
        UserStats,
        UserSummary,
    )


class DirectoryError(Exception):
    """Base error for all directory operations.

    Carries a machine-readable ``code`` (see src.models.common error constants)
    so routes can map it to the right HTTP status without sniffing messages.
    """

    def __init__(self, message: str, code: str = "LDAP_OPERATION_FAILED") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


class EntryNotFoundError(DirectoryError):
    def __init__(self, message: str = "Entry not found") -> None:
        super().__init__(message, code="LDAP_ENTRY_NOT_FOUND")


class EntryExistsError(DirectoryError):
    def __init__(self, message: str = "Entry already exists") -> None:
        super().__init__(message, code="LDAP_ENTRY_EXISTS")


class InsufficientRightsError(DirectoryError):
    def __init__(self, message: str = "Insufficient permissions") -> None:
        super().__init__(message, code="LDAP_INSUFFICIENT_RIGHTS")


class OperationFailedError(DirectoryError):
    def __init__(self, message: str = "Operation failed") -> None:
        super().__init__(message, code="LDAP_OPERATION_FAILED")


@runtime_checkable
class DirectoryBackend(Protocol):
    """Domain-level directory operations.

    Every method returns plain ``src.models.*`` Pydantic instances (or lists),
    keeping the service layer thin. Implementations are responsible for LDAP
    / mock data shaping and error translation.
    """

    # --- users -----------------------------------------------------------
    def list_users(
        self,
        q: str | None = None,
        ou: str | None = None,
        status: str | None = None,
        page: int = 1,
        limit: int = 20,
        sort: str = "username",
        order: str = "asc",
    ) -> tuple[list[UserSummary], int]: ...

    def get_user(self, item_id: str) -> UserDetail: ...
    def create_user(self, payload: UserCreate) -> UserDetail: ...
    def update_user(self, item_id: str, **fields: object) -> UserDetail: ...
    def set_user_status(self, item_id: str, status: str) -> UserDetail: ...
    def reset_password(self, item_id: str, new_password: str) -> None: ...
    def delete_user(self, item_id: str) -> None: ...
    def user_stats(self) -> UserStats: ...
    def user_login_history(self, item_id: str) -> list[LoginEvent]: ...

    # --- groups ----------------------------------------------------------
    def list_groups(
        self,
        q: str | None = None,
        category: str | None = None,
        scope: str | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[GroupSummary], int]: ...

    def get_group(self, item_id: str) -> GroupDetail: ...
    def create_group(self, payload: GroupCreate) -> GroupDetail: ...
    def update_group(self, item_id: str, **fields: object) -> GroupDetail: ...
    def add_group_members(self, item_id: str, member_dns: list[str]) -> GroupDetail: ...
    def remove_group_member(self, item_id: str, member_dn: str) -> GroupDetail: ...
    def delete_group(self, item_id: str) -> None: ...
    def group_stats(self) -> GroupStats: ...

    # --- OUs -------------------------------------------------------------
    def ou_tree(self) -> list[OuTreeNode]: ...
    def get_ou(self, item_id: str) -> OuDetail: ...
    def create_ou(self, payload: OuCreate) -> OuTreeNode: ...
    def update_ou(self, item_id: str, **fields: object) -> OuDetail: ...
    def delete_ou(self, item_id: str) -> None: ...
    def ou_stats(self) -> OuStats: ...

    # --- computers -------------------------------------------------------
    def list_computers(
        self,
        q: str | None = None,
        os_filter: str | None = None,
        status: str | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[ComputerSummary], int]: ...
    def get_computer(self, item_id: str) -> ComputerDetail: ...
    def set_computer_status(self, item_id: str, status: str) -> ComputerDetail: ...
    def reset_computer(self, item_id: str) -> None: ...
    def delete_computer(self, item_id: str) -> None: ...
    def computer_stats(self) -> ComputerStats: ...
    def computer_os_distribution(self) -> list[OsDistribution]: ...
    def computer_join_trend(self) -> list[JoinTrendPoint]: ...

    # --- GPOs ------------------------------------------------------------
    def list_gpos(
        self,
        q: str | None = None,
        status: str | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[GpoSummary], int]: ...

    def get_gpo(self, item_id: str) -> GpoDetail: ...
    def create_gpo(self, display_name: str, ou_dn: str | None) -> GpoDetail: ...
    def link_gpo(self, gpo_id: str, ou_dn: str, enforced: bool) -> GpoDetail: ...
    def unlink_gpo(self, gpo_id: str, ou_dn: str) -> GpoDetail: ...
    def delete_gpo(self, item_id: str) -> None: ...
    def gpo_stats(self) -> GpoStats: ...
    def set_gpo_status(self, gpo_id: str, status: str) -> GpoDetail: ...

    # --- domain ----------------------------------------------------------
    def domain_info(self) -> DomainInfo: ...
    def fsmo_roles(self) -> list[FsmoRoleHolder]: ...
    def dns_servers(self) -> list[DnsServer]: ...
    def password_policy(self) -> PasswordPolicy: ...
    def lockout_policy(self) -> LockoutPolicy: ...
    def set_password_policy(self, **fields: object) -> PasswordPolicy: ...
    def set_lockout_policy(self, **fields: object) -> LockoutPolicy: ...

    # --- health / system -------------------------------------------------
    def services_status(self) -> list[ServiceStatus]: ...
    def system_resources(self) -> SystemResources: ...

    # --- dashboard stats -------------------------------------------------
    def login_trend(self, days: int = 7) -> list[LoginTrendPoint]: ...
    def ou_distribution(self) -> list[OuDistributionEntry]: ...
    def recent_alerts(self, limit: int = 10) -> list[AlertItem]: ...


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_backend: DirectoryBackend | None = None


def get_backend() -> DirectoryBackend:
    """Return the process-wide directory backend, lazily created.

    Selected by ``Settings.app_mode``:

    * ``mock`` → :class:`MockDirectory`
    * ``ldap`` → :class:`Ldap3Backend`
    """
    global _backend
    if _backend is None:
        from src.core.config import settings

        if settings.app_mode == "ldap":
            from src.services.ldap3_backend import Ldap3Backend

            _backend = Ldap3Backend(settings)
        else:
            from src.services.mock import MockDirectory

            _backend = MockDirectory(settings)
    return _backend


def set_backend(backend: DirectoryBackend) -> None:
    """Override the backend (used by tests to inject a fresh mock)."""
    global _backend
    _backend = backend


def reset_backend() -> None:
    """Clear the cached backend (forces re-creation on next ``get_backend``)."""
    global _backend
    _backend = None
