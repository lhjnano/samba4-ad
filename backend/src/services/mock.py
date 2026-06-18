"""SPDX-License-Identifier: Apache-2.0

In-memory mock directory — the T0 / local-development backend.

Provides deterministic, realistic data that mirrors the shapes shown in the
design previews. **No real LDAP is touched.** This lets every service and
route run with zero infrastructure and be fully unit-tested.

The data is seeded once per instance and mutated in place by write operations,
so tests observe realistic state transitions.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from src.core.config import Settings
from src.models.common import decode_id, encode_id
from src.models.computers import (
    ComputerDetail,
    ComputerStats,
    ComputerSummary,
    JoinTrendPoint,
    OsDistribution,
)
from src.models.domain import (
    AccountStatus,
    GpoLinkMode,
    GpoStatus,
    GroupCategory,
    GroupScope,
    UserAccountControl,
)
from src.models.domain import (
    ComputerStatus as ComputerStatusEnum,
)
from src.models.domain_info import (
    DnsServer,
    DomainInfo,
    FsmoRoleHolder,
    LockoutPolicy,
    PasswordPolicy,
)
from src.models.gpo import (
    GpoDetail,
    GpoStats,
    GpoSummary,
    LinkedOu,
    PolicyValue,
)
from src.models.groups import (
    GroupCreate,
    GroupDetail,
    GroupMemberRef,
    GroupStats,
    GroupSummary,
)
from src.models.health import ServiceStatus, SystemResources
from src.models.ou import (
    GpoLinkRef,
    OuCreate,
    OuDetail,
    OuStats,
    OuTreeNode,
)
from src.models.users import (
    LoginEvent,
    UserCreate,
    UserDetail,
    UserGroupMembership,
    UserStats,
    UserSummary,
)
from src.services.directory import (
    DirectoryBackend,
    EntryExistsError,
    EntryNotFoundError,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _parent_ou_name(dn: str) -> str:
    """Extract a human OU label from a DN (e.g. 'OU=개발팀,DC=...' → '개발팀')."""
    for part in dn.split(","):
        part = part.strip()
        if part.upper().startswith("OU="):
            return part[3:]
    return "Users"


def _ou_dn_from(dn: str) -> str:
    """Return the parent OU DN (everything after the first RDN)."""
    return ",".join(dn.split(",")[1:])


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

_DOMAIN = "DC=CORP,DC=LOCAL"
_OUS = [
    ("Domain Controllers", "Default container for domain controllers"),
]


class MockDirectory:
    """In-memory implementation of :class:`DirectoryBackend`."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._seed()

    # ====================================================================
    # Seeding
    # ====================================================================
    def _seed(self) -> None:
        # --- OUs ---
        self.ous: dict[str, dict[str, Any]] = {}
        for idx, (name, desc) in enumerate(_OUS):
            dn = f"OU={name},{_DOMAIN}"
            self.ous[dn] = {
                "name": name,
                "dn": dn,
                "description": desc,
                "managed_by": None,
                "gp_options": 0,  # inherit
                "gp_link": "",
                "when_created": _now() - timedelta(days=500 - idx),
                "when_changed": _now() - timedelta(days=30),
            }

        # --- Users (built-in accounts in CN=Users) ---
        self.users: dict[str, dict[str, Any]] = {}
        builtin_users = [
            ("Administrator", "Administrator", AccountStatus.ACTIVE),
            ("Guest", "Guest", AccountStatus.INACTIVE),
            ("krbtgt", "krbtgt", AccountStatus.INACTIVE),
        ]
        for i, (username, display, status) in enumerate(builtin_users, start=1):
            dn = f"CN={username},CN=Users,{_DOMAIN}"
            uac = self._status_to_uac(status)
            self.users[dn] = {
                "username": username,
                "display_name": display,
                "first_name": username,
                "last_name": "",
                "email": None,
                "phone": None,
                "dn": dn,
                "user_account_control": uac,
                "when_created": _now() - timedelta(days=500),
                "pwd_last_set": str(_now().timestamp()),
                "last_logon": None,
                "object_sid": f"S-1-5-21-100-{i}",
                "member_of": [],
                "status": status,
            }

        # --- Groups (built-in domain groups in CN=Users) ---
        self.groups: dict[str, dict[str, Any]] = {}
        gdefs = [
            ("Domain Admins", GroupCategory.SECURITY, GroupScope.GLOBAL),
            ("Domain Users", GroupCategory.SECURITY, GroupScope.GLOBAL),
            ("Domain Guests", GroupCategory.SECURITY, GroupScope.GLOBAL),
            ("Domain Computers", GroupCategory.SECURITY, GroupScope.GLOBAL),
            ("Domain Controllers", GroupCategory.SECURITY, GroupScope.GLOBAL),
            ("Enterprise Admins", GroupCategory.SECURITY, GroupScope.UNIVERSAL),
            ("Schema Admins", GroupCategory.SECURITY, GroupScope.UNIVERSAL),
            ("Cert Publishers", GroupCategory.SECURITY, GroupScope.GLOBAL),
        ]
        for idx, (name, cat, scope) in enumerate(gdefs):
            dn = f"CN={name},CN=Users,{_DOMAIN}"
            self.groups[dn] = {
                "name": name,
                "dn": dn,
                "group_type": self._scope_cat_to_type(scope, cat),
                "description": f"{name} group",
                "member": [],
                "managed_by": None,
                "when_created": _now() - timedelta(days=400 - idx),
                "when_changed": _now() - timedelta(days=10),
                "object_sid": f"S-1-5-21-200-{idx}",
            }

        # --- Computers (none joined yet) ---
        self.computers: dict[str, dict[str, Any]] = {}

        # --- GPOs (default policies) ---
        self.gpos: dict[str, dict[str, Any]] = {}
        gpdefs = [
            ("Default Domain Policy", GpoStatus.ENABLED),
            ("Default Domain Controllers Policy", GpoStatus.ENABLED),
        ]
        for idx, (name, st) in enumerate(gpdefs):
            guid = "{" + str(uuid.uuid4()).upper() + "}"
            dn = f"CN={guid},CN=Policies,CN=System,{_DOMAIN}"
            self.gpos[dn] = {
                "guid": guid,
                "display_name": name,
                "dn": dn,
                "status": st,
                "description": f"{name} policy",
                "when_created": _now() - timedelta(days=300 - idx),
                "when_changed": _now() - timedelta(days=5),
                "version_user": idx,
                "version_computer": idx,
                "wmi_filter": None,
                "links": [],  # list of (ou_dn, enforced)
            }

        # --- Domain / policy ---
        self._password_policy = PasswordPolicy(
            min_length=12,
            max_age_days=90,
            min_age_days=1,
            history=24,
            complexity=True,
            reversible_encryption=False,
        )
        self._lockout_policy = LockoutPolicy(
            threshold=5,
            duration_minutes=30,
            observation_window_minutes=30,
        )

    # ====================================================================
    # Helpers
    # ====================================================================
    @staticmethod
    def _status_to_uac(status: AccountStatus) -> int:
        if status == AccountStatus.INACTIVE:
            return int(
                UserAccountControl.NORMAL_ACCOUNT | UserAccountControl.ACCOUNTDISABLE
            )
        if status == AccountStatus.LOCKED:
            return int(UserAccountControl.NORMAL_ACCOUNT | UserAccountControl.LOCKOUT)
        return int(
            UserAccountControl.NORMAL_ACCOUNT | UserAccountControl.DONT_EXPIRE_PASSWD
        )

    @staticmethod
    def _scope_cat_to_type(scope: GroupScope, cat: GroupCategory) -> int:
        security = 0x80000000 if cat == GroupCategory.SECURITY else 0
        scope_bit = {
            GroupScope.GLOBAL: 0x2,
            GroupScope.DOMAIN_LOCAL: 0x4,
            GroupScope.UNIVERSAL: 0x8,
        }[scope]
        return security | scope_bit

    def _resolve(self, item_id: str) -> str:
        """Resolve an opaque id to a DN. Tolerates raw DN input for convenience."""
        if (
            item_id in self.users
            or item_id in self.groups
            or item_id in self.ous
            or item_id in self.computers
            or item_id in self.gpos
        ):
            return item_id
        return decode_id(item_id)

    # ====================================================================
    # USERS
    # ====================================================================
    def list_users(
        self,
        q=None,
        ou=None,
        status=None,
        page=1,
        limit=20,
        sort="username",
        order="asc",
    ):
        rows = list(self.users.values())
        if q:
            ql = q.lower()
            rows = [
                u
                for u in rows
                if ql in u["username"].lower()
                or ql in (u["display_name"] or "").lower()
                or ql in (u["email"] or "").lower()
            ]
        if ou and ou != "All OUs":
            rows = [u for u in rows if f"OU={ou}," in u["dn"]]
        if status and status != "all":
            rows = [u for u in rows if u["status"].value == status]
        rows.sort(key=lambda u: u.get(sort, u["username"]), reverse=(order == "desc"))
        total = len(rows)
        start = (page - 1) * limit
        items = [self._user_summary(u) for u in rows[start : start + limit]]
        return items, total

    def _user_summary(self, u: dict[str, Any]) -> UserSummary:
        return UserSummary(
            id=encode_id(u["dn"]),
            username=u["username"],
            display_name=u["display_name"],
            email=u["email"],
            ou=_parent_ou_name(u["dn"]),
            status=u["status"],
            last_logon=u["last_logon"],
        )

    def get_user(self, item_id: str) -> UserDetail:
        dn = self._resolve(item_id)
        if dn not in self.users:
            raise EntryNotFoundError(f"User not found: {dn}")
        u = self.users[dn]
        groups = [
            UserGroupMembership(id=encode_id(g), name=g.split(",")[0][3:], dn=g)
            for g in u["member_of"]
            if g in self.groups
        ]
        return UserDetail(
            id=encode_id(dn),
            username=u["username"],
            display_name=u["display_name"],
            first_name=u["first_name"],
            last_name=u["last_name"],
            email=u["email"],
            phone=u["phone"],
            dn=dn,
            ou=_parent_ou_name(dn),
            status=u["status"],
            user_account_control=u["user_account_control"],
            when_created=u["when_created"],
            password_expires=_now() + timedelta(days=90),
            object_sid=u["object_sid"],
            groups=groups,
            login_history=self.user_login_history(dn),
        )

    def create_user(self, payload: UserCreate) -> UserDetail:
        dn = f"CN={payload.username},{payload.ou_dn or f'CN=Users,{_DOMAIN}'}"
        if dn in self.users:
            raise EntryExistsError(f"User already exists: {payload.username}")
        u = {
            "username": payload.username,
            "display_name": payload.display_name or payload.username,
            "first_name": payload.first_name,
            "last_name": payload.last_name,
            "email": str(payload.email) if payload.email else None,
            "phone": payload.phone,
            "dn": dn,
            "user_account_control": self._status_to_uac(AccountStatus.ACTIVE),
            "when_created": _now(),
            "pwd_last_set": "0",
            "last_logon": None,
            "object_sid": f"S-1-5-21-100-{len(self.users) + 1}",
            "member_of": [f"CN=Domain Users,CN=Users,{_DOMAIN}"],
            "status": AccountStatus.ACTIVE,
        }
        self.users[dn] = u
        return self.get_user(dn)

    def update_user(self, item_id: str, **fields: object) -> UserDetail:
        dn = self._resolve(item_id)
        if dn not in self.users:
            raise EntryNotFoundError(f"User not found: {dn}")
        u = self.users[dn]
        new_ou = fields.pop("ou_dn", None)
        for k, v in fields.items():
            if v is not None and k in u:
                u[k] = v
        if new_ou and isinstance(new_ou, str):
            new_dn = f"CN={u['username']},{new_ou}"
            self.users[new_dn] = self.users.pop(dn)
            u = self.users[new_dn]
            u["dn"] = new_dn
            dn = new_dn
        u["when_changed"] = _now()
        return self.get_user(dn)

    def set_user_status(self, item_id: str, status: str) -> UserDetail:
        dn = self._resolve(item_id)
        if dn not in self.users:
            raise EntryNotFoundError(f"User not found: {dn}")
        u = self.users[dn]
        new_status = AccountStatus(status)
        u["status"] = new_status
        u["user_account_control"] = self._status_to_uac(new_status)
        return self.get_user(dn)

    def reset_password(self, item_id: str, new_password: str) -> None:
        dn = self._resolve(item_id)
        if dn not in self.users:
            raise EntryNotFoundError(f"User not found: {dn}")
        self.users[dn]["pwd_last_set"] = str(_now().timestamp())

    def delete_user(self, item_id: str) -> None:
        dn = self._resolve(item_id)
        if dn not in self.users:
            raise EntryNotFoundError(f"User not found: {dn}")
        del self.users[dn]

    def user_stats(self) -> UserStats:
        status_counts = {
            AccountStatus.ACTIVE: 0,
            AccountStatus.INACTIVE: 0,
            AccountStatus.LOCKED: 0,
        }
        for u in self.users.values():
            status_counts[u["status"]] = status_counts.get(u["status"], 0) + 1
        created_today = sum(
            1 for u in self.users.values() if u["when_created"].date() == _now().date()
        )
        return UserStats(
            total=len(self.users),
            active=status_counts[AccountStatus.ACTIVE],
            inactive=status_counts[AccountStatus.INACTIVE],
            locked=status_counts[AccountStatus.LOCKED],
            created_today=created_today,
        )

    def user_login_history(self, item_id: str) -> list[LoginEvent]:
        self._resolve(item_id)  # validate id exists
        return []

    # ====================================================================
    # GROUPS
    # ====================================================================
    def list_groups(self, q=None, category=None, scope=None, page=1, limit=20):
        rows = list(self.groups.values())
        if q:
            ql = q.lower()
            rows = [g for g in rows if ql in g["name"].lower()]
        from src.models.groups import _parse_group_type

        def cat_of(g):
            return _parse_group_type(g["group_type"])[0].value

        def scope_of(g):
            return _parse_group_type(g["group_type"])[1].value

        if category:
            rows = [g for g in rows if cat_of(g) == category]
        if scope:
            rows = [g for g in rows if scope_of(g) == scope]
        total = len(rows)
        start = (page - 1) * limit
        items = [self._group_summary(g) for g in rows[start : start + limit]]
        return items, total

    def _group_summary(self, g: dict[str, Any]) -> GroupSummary:
        from src.models.groups import _parse_group_type

        cat, scope = _parse_group_type(g["group_type"])
        return GroupSummary(
            id=encode_id(g["dn"]),
            name=g["name"],
            category=cat,
            scope=scope,
            member_count=len(g["member"]),
            description=g["description"],
            managed_by=g["managed_by"],
        )

    def get_group(self, item_id: str) -> GroupDetail:
        dn = self._resolve(item_id)
        if dn not in self.groups:
            raise EntryNotFoundError(f"Group not found: {dn}")
        g = self.groups[dn]
        from src.models.groups import _parse_group_type

        cat, scope = _parse_group_type(g["group_type"])
        members = [
            GroupMemberRef(id=encode_id(m), name=self._member_name(m), dn=m)
            for m in g["member"]
        ]
        nested = [
            GroupMemberRef(id=encode_id(m), name=self._member_name(m), dn=m)
            for m in g["member"]
            if m in self.groups
        ]
        return GroupDetail(
            id=encode_id(dn),
            name=g["name"],
            dn=dn,
            category=cat,
            scope=scope,
            description=g["description"],
            member_count=len(g["member"]),
            managed_by=g["managed_by"],
            when_created=g["when_created"],
            when_changed=g["when_changed"],
            object_sid=g["object_sid"],
            members=members,
            nested_groups=nested,
        )

    def _member_name(self, dn: str) -> str:
        rdn = dn.split(",")[0]
        return rdn.split("=", 1)[1] if "=" in rdn else dn

    def create_group(self, payload: GroupCreate) -> GroupDetail:
        dn = f"CN={payload.name},{payload.ou_dn or f'CN=Users,{_DOMAIN}'}"
        if dn in self.groups:
            raise EntryExistsError(f"Group already exists: {payload.name}")
        gtype = self._scope_cat_to_type(payload.scope, payload.category)
        self.groups[dn] = {
            "name": payload.name,
            "dn": dn,
            "group_type": gtype,
            "description": payload.description,
            "member": [],
            "managed_by": None,
            "when_created": _now(),
            "when_changed": _now(),
            "object_sid": f"S-1-5-21-200-{len(self.groups)}",
        }
        return self.get_group(dn)

    def update_group(self, item_id: str, **fields: object) -> GroupDetail:
        dn = self._resolve(item_id)
        if dn not in self.groups:
            raise EntryNotFoundError(f"Group not found: {dn}")
        g = self.groups[dn]
        for k, v in fields.items():
            if v is not None and k in g:
                g[k] = v
        g["when_changed"] = _now()
        return self.get_group(dn)

    def add_group_members(self, item_id: str, member_dns: list[str]) -> GroupDetail:
        dn = self._resolve(item_id)
        if dn not in self.groups:
            raise EntryNotFoundError(f"Group not found: {dn}")
        g = self.groups[dn]
        for mdn in member_dns:
            if mdn not in g["member"]:
                g["member"].append(mdn)
        return self.get_group(dn)

    def remove_group_member(self, item_id: str, member_dn: str) -> GroupDetail:
        dn = self._resolve(item_id)
        if dn not in self.groups:
            raise EntryNotFoundError(f"Group not found: {dn}")
        self.groups[dn]["member"] = [
            m for m in self.groups[dn]["member"] if m != member_dn
        ]
        return self.get_group(dn)

    def delete_group(self, item_id: str) -> None:
        dn = self._resolve(item_id)
        if dn not in self.groups:
            raise EntryNotFoundError(f"Group not found: {dn}")
        del self.groups[dn]

    def group_stats(self) -> GroupStats:
        from src.models.groups import _parse_group_type

        sec = sum(
            1
            for g in self.groups.values()
            if _parse_group_type(g["group_type"])[0] == GroupCategory.SECURITY
        )
        dist = len(self.groups) - sec
        nested = sum(
            1
            for g in self.groups.values()
            if any(m in self.groups for m in g["member"])
        )
        return GroupStats(
            total=len(self.groups),
            security=sec,
            distribution=dist,
            nested=nested,
        )

    # ====================================================================
    # OUs
    # ====================================================================
    def ou_tree(self) -> list[OuTreeNode]:
        roots = [d for d in self.ous if _ou_dn_from(d) == _DOMAIN]
        return [self._ou_node(d) for d in roots]

    def _ou_node(self, dn: str) -> OuTreeNode:
        o = self.ous[dn]
        children = [d for d in self.ous if _ou_dn_from(d) == dn]
        return OuTreeNode(
            id=encode_id(dn),
            name=o["name"],
            dn=dn,
            description=o["description"],
            user_count=sum(
                1 for u in self.users.values() if f"OU={o['name']}," in u["dn"]
            ),
            computer_count=sum(
                1 for c in self.computers.values() if f"OU={o['name']}," in c["dn"]
            ),
            gpo_count=sum(
                1
                for g in self.gpos.values()
                if any(link[0] == dn for link in g["links"])
            ),
            children=[self._ou_node(c) for c in children],
        )

    def get_ou(self, item_id: str) -> OuDetail:
        dn = self._resolve(item_id)
        if dn not in self.ous:
            raise EntryNotFoundError(f"OU not found: {dn}")
        o = self.ous[dn]
        node = self._ou_node(dn)
        linked = []
        for g in self.gpos.values():
            for l_ou, enforced in g["links"]:
                if l_ou == dn:
                    linked.append(
                        GpoLinkRef(
                            gpo_id=encode_id(g["dn"]),
                            display_name=g["display_name"],
                            mode=GpoLinkMode.ENFORCED
                            if enforced
                            else GpoLinkMode.INHERITED,
                        )
                    )
        return OuDetail(
            id=encode_id(dn),
            name=o["name"],
            dn=dn,
            description=o["description"],
            when_created=o["when_created"],
            when_changed=o["when_changed"],
            managed_by=o["managed_by"],
            inherit_gpo=(o["gp_options"] == 0),
            user_count=node.user_count,
            computer_count=node.computer_count,
            linked_gpos=linked,
            child_ous=node.children,
        )

    def create_ou(self, payload: OuCreate) -> OuTreeNode:
        parent = payload.parent_dn or _DOMAIN
        dn = f"OU={payload.name},{parent}"
        if dn in self.ous:
            raise EntryExistsError(f"OU already exists: {payload.name}")
        self.ous[dn] = {
            "name": payload.name,
            "dn": dn,
            "description": payload.description,
            "managed_by": None,
            "gp_options": 0,
            "gp_link": "",
            "when_created": _now(),
            "when_changed": _now(),
        }
        return self._ou_node(dn)

    def update_ou(self, item_id: str, **fields: object) -> OuDetail:
        dn = self._resolve(item_id)
        if dn not in self.ous:
            raise EntryNotFoundError(f"OU not found: {dn}")
        o = self.ous[dn]
        if "description" in fields and fields["description"] is not None:
            o["description"] = fields["description"]
        if "managed_by" in fields and fields["managed_by"] is not None:
            o["managed_by"] = fields["managed_by"]
        if "inherit_gpo" in fields and fields["inherit_gpo"] is not None:
            o["gp_options"] = 0 if fields["inherit_gpo"] else 1
        o["when_changed"] = _now()
        return self.get_ou(dn)

    def delete_ou(self, item_id: str) -> None:
        dn = self._resolve(item_id)
        if dn not in self.ous:
            raise EntryNotFoundError(f"OU not found: {dn}")
        if any(dn in u["dn"] for u in self.users.values()):
            raise EntryExistsError(
                "OU is not empty; move or delete child objects first."
            )
        del self.ous[dn]

    def ou_stats(self) -> OuStats:
        return OuStats(
            total=len(self.ous),
            user_objects=len(self.users),
            computer_objects=len(self.computers),
            linked_gpos=sum(len(g["links"]) for g in self.gpos.values()),
        )

    # ====================================================================
    # COMPUTERS
    # ====================================================================
    def list_computers(self, q=None, os_filter=None, status=None, page=1, limit=20):
        rows = list(self.computers.values())
        if q:
            ql = q.lower()
            rows = [
                c
                for c in rows
                if ql in c["hostname"].lower() or ql in (c["ip_address"] or "").lower()
            ]
        if os_filter and os_filter != "All OS":
            rows = [c for c in rows if c["operating_system"] == os_filter]
        if status and status != "all":
            rows = [c for c in rows if c["status"].value == status]
        total = len(rows)
        start = (page - 1) * limit
        items = [self._computer_summary(c) for c in rows[start : start + limit]]
        return items, total

    def _computer_summary(self, c: dict[str, Any]) -> ComputerSummary:
        return ComputerSummary(
            id=encode_id(c["dn"]),
            hostname=c["hostname"],
            dns_hostname=c["dns_hostname"],
            operating_system=c["operating_system"],
            operating_system_version=c["operating_system_version"],
            ip_address=c["ip_address"],
            ou=_parent_ou_name(c["dn"]),
            status=c["status"],
            last_logon=c["last_logon"],
            join_date=c["when_created"],
        )

    def get_computer(self, item_id: str) -> ComputerDetail:
        dn = self._resolve(item_id)
        if dn not in self.computers:
            raise EntryNotFoundError(f"Computer not found: {dn}")
        c = self.computers[dn]
        return ComputerDetail(
            **self._computer_summary(c).model_dump(), dn=dn, object_sid=c["object_sid"]
        )

    def set_computer_status(self, item_id: str, status: str) -> ComputerDetail:
        dn = self._resolve(item_id)
        if dn not in self.computers:
            raise EntryNotFoundError(f"Computer not found: {dn}")
        self.computers[dn]["status"] = ComputerStatusEnum(status)
        return self.get_computer(dn)

    def reset_computer(self, item_id: str) -> None:
        dn = self._resolve(item_id)
        if dn not in self.computers:
            raise EntryNotFoundError(f"Computer not found: {dn}")

    def delete_computer(self, item_id: str) -> None:
        dn = self._resolve(item_id)
        if dn not in self.computers:
            raise EntryNotFoundError(f"Computer not found: {dn}")
        del self.computers[dn]

    def computer_stats(self) -> ComputerStats:
        active = sum(
            1
            for c in self.computers.values()
            if c["status"] == ComputerStatusEnum.ACTIVE
        )
        stale = sum(
            1
            for c in self.computers.values()
            if c["status"] == ComputerStatusEnum.STALE
        )
        joined_today = sum(
            1
            for c in self.computers.values()
            if c["when_created"].date() == _now().date()
        )
        return ComputerStats(
            total=len(self.computers),
            active=active,
            inactive=len(self.computers) - active - stale,
            stale=stale,
            joined_today=joined_today,
        )

    def computer_os_distribution(self) -> list[OsDistribution]:
        counts: dict[str, int] = {}
        for c in self.computers.values():
            counts[c["operating_system"]] = counts.get(c["operating_system"], 0) + 1
        return [OsDistribution(os=k, count=v) for k, v in counts.items()]

    def computer_join_trend(self) -> list[JoinTrendPoint]:
        days = ["월", "화", "수", "목", "금", "토", "일"]
        counts = [3, 1, 0, 2, 5, 0, 2]
        return [
            JoinTrendPoint(date=d, count=c) for d, c in zip(days, counts, strict=True)
        ]

    # ====================================================================
    # GPOs
    # ====================================================================
    def list_gpos(self, q=None, status=None, page=1, limit=20):
        rows = list(self.gpos.values())
        if q:
            ql = q.lower()
            rows = [g for g in rows if ql in g["display_name"].lower()]
        if status and status != "all":
            want = GpoStatus(status)
            rows = [g for g in rows if g["status"] == want]
        total = len(rows)
        start = (page - 1) * limit
        items = [self._gpo_summary(g) for g in rows[start : start + limit]]
        return items, total

    def _gpo_summary(self, g: dict[str, Any]) -> GpoSummary:
        return GpoSummary(
            id=encode_id(g["dn"]),
            display_name=g["display_name"],
            status=g["status"],
            description=g["description"],
            link_count=len(g["links"]),
        )

    def get_gpo(self, item_id: str) -> GpoDetail:
        dn = self._resolve(item_id)
        if dn not in self.gpos:
            raise EntryNotFoundError(f"GPO not found: {dn}")
        g = self.gpos[dn]
        links = [
            LinkedOu(
                ou_id=encode_id(ou),
                ou_dn=ou,
                mode=GpoLinkMode.ENFORCED if enf else GpoLinkMode.INHERITED,
            )
            for (ou, enf) in g["links"]
        ]
        settings = [
            PolicyValue(name="최소 비밀번호 길이", value="12자"),
            PolicyValue(name="비밀번호 복잡성", value="필수"),
            PolicyValue(name="계정 잠금 임계값", value="5회"),
            PolicyValue(name="비밀번호 최대 사용 기간", value="90일"),
        ]
        return GpoDetail(
            id=encode_id(dn),
            guid=g["guid"],
            display_name=g["display_name"],
            dn=dn,
            status=g["status"],
            description=g["description"],
            when_created=g["when_created"],
            when_changed=g["when_changed"],
            version_user=g["version_user"],
            version_computer=g["version_computer"],
            wmi_filter=g["wmi_filter"],
            linked_ous=links,
            settings=settings,
        )

    def create_gpo(self, display_name: str, ou_dn: str | None) -> GpoDetail:
        guid = "{" + str(uuid.uuid4()).upper() + "}"
        dn = f"CN={guid},CN=Policies,CN=System,{_DOMAIN}"
        if display_name and any(
            g["display_name"] == display_name for g in self.gpos.values()
        ):
            raise EntryExistsError(f"GPO already exists: {display_name}")
        self.gpos[dn] = {
            "guid": guid,
            "display_name": display_name,
            "dn": dn,
            "status": GpoStatus.ENABLED,
            "description": None,
            "when_created": _now(),
            "when_changed": _now(),
            "version_user": 0,
            "version_computer": 0,
            "wmi_filter": None,
            "links": [(ou_dn, False)] if ou_dn else [],
        }
        return self.get_gpo(dn)

    def link_gpo(self, gpo_id: str, ou_dn: str, enforced: bool) -> GpoDetail:
        dn = self._resolve(gpo_id)
        if dn not in self.gpos:
            raise EntryNotFoundError(f"GPO not found: {dn}")
        links = self.gpos[dn]["links"]
        links = [(o, e) for (o, e) in links if o != ou_dn]
        links.append((ou_dn, enforced))
        self.gpos[dn]["links"] = links
        return self.get_gpo(dn)

    def unlink_gpo(self, gpo_id: str, ou_dn: str) -> GpoDetail:
        dn = self._resolve(gpo_id)
        if dn not in self.gpos:
            raise EntryNotFoundError(f"GPO not found: {dn}")
        self.gpos[dn]["links"] = [
            (o, e) for (o, e) in self.gpos[dn]["links"] if o != ou_dn
        ]
        return self.get_gpo(dn)

    def set_gpo_status(self, gpo_id: str, status: str) -> GpoDetail:
        dn = self._resolve(gpo_id)
        if dn not in self.gpos:
            raise EntryNotFoundError(f"GPO not found: {dn}")
        self.gpos[dn]["status"] = GpoStatus(status)
        return self.get_gpo(dn)

    def delete_gpo(self, item_id: str) -> None:
        dn = self._resolve(item_id)
        if dn not in self.gpos:
            raise EntryNotFoundError(f"GPO not found: {dn}")
        del self.gpos[dn]

    def gpo_stats(self) -> GpoStats:
        active = sum(1 for g in self.gpos.values() if g["status"] == GpoStatus.ENABLED)
        enforced = sum(1 for g in self.gpos.values() if any(e for _, e in g["links"]))
        disabled = sum(
            1 for g in self.gpos.values() if g["status"] == GpoStatus.DISABLED
        )
        return GpoStats(
            total=len(self.gpos),
            active=active,
            enforced=enforced,
            disabled=disabled,
        )

    # ====================================================================
    # DOMAIN
    # ====================================================================
    def domain_info(self) -> DomainInfo:
        return DomainInfo(
            fqdn="CORP.LOCAL",
            netbios_name="CORP",
            forest_name="CORP.LOCAL",
            domain_functional_level="2012_R2",
            forest_functional_level="2012_R2",
            dc_hostname="dom39-forest01.corp.local",
            dc_ip="192.168.39.1",
            object_count=len(self.users) + len(self.groups) + len(self.computers),
            created="",
            samba_version="",
            server_os="",
        )

    def fsmo_roles(self) -> list[FsmoRoleHolder]:
        roles = [
            "SchemaMaster",
            "DomainNamingMaster",
            "PDCEmulator",
            "RIDMaster",
            "InfrastructureMaster",
        ]
        return [
            FsmoRoleHolder(role=r, holder="CN=NTDS Settings,CN=dom39-forest01")
            for r in roles
        ]

    def dns_servers(self) -> list[DnsServer]:
        return [
            DnsServer(address="192.168.39.1"),
            DnsServer(address="8.8.8.8", is_forwarder=True),
        ]

    def password_policy(self) -> PasswordPolicy:
        return self._password_policy

    def lockout_policy(self) -> LockoutPolicy:
        return self._lockout_policy

    def set_password_policy(self, **fields: object) -> PasswordPolicy:
        self._password_policy = PasswordPolicy(
            **{**self._password_policy.model_dump(), **fields}
        )
        return self._password_policy

    def set_lockout_policy(self, **fields: object) -> LockoutPolicy:
        self._lockout_policy = LockoutPolicy(
            **{**self._lockout_policy.model_dump(), **fields}
        )
        return self._lockout_policy

    # ====================================================================
    # HEALTH / SYSTEM
    # ====================================================================
    def services_status(self) -> list[ServiceStatus]:
        from src.models.domain import DOMAIN_SERVICES

        return [
            ServiceStatus(**svc, healthy=True, latency_ms=float(i + 1))
            for i, svc in enumerate(DOMAIN_SERVICES)
        ]

    def system_resources(self) -> SystemResources:
        """Read real host CPU / memory / disk usage via psutil.

        System resources are host-level metrics, not AD data.  Even in
        mock mode we report *real* values so the dashboard always reflects
        the actual server state.
        """
        import psutil

        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        return SystemResources(
            cpu_percent=round(psutil.cpu_percent(interval=0.5), 1),
            memory_used_gb=round(mem.used / 1024**3, 1),
            memory_total_gb=round(mem.total / 1024**3, 1),
            disk_used_gb=round(disk.used / 1024**3, 1),
            disk_total_gb=round(disk.total / 1024**3, 1),
        )

    # ====================================================================
    # DASHBOARD STATS
    # ====================================================================
    def login_trend(self, days: int = 7) -> list:
        return []

    def ou_distribution(self) -> list:
        return []

    def recent_alerts(self, limit: int = 10) -> list:
        return []


# Keep type-checkers happy: the class satisfies the protocol.
_: type[DirectoryBackend] = MockDirectory  # type: ignore[assignment]
