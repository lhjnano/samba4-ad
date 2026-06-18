"""SPDX-License-Identifier: Apache-2.0

Real Samba 4 AD DC backend using ``ldap3`` + ``samba-tool``.

This is the production implementation of :class:`DirectoryBackend`. It reads
from LDAP via ``ldap3`` and delegates domain-provisioning/GPO/password-policy
operations to :class:`src.services.samba_tool.SambaTool`.

Only exercised against a live Samba 4 AD DC (integration/e2e tests). T0 unit
tests use :class:`src.services.mock.MockDirectory`.
"""

from __future__ import annotations

import re
import socket
import ssl
from datetime import UTC, datetime
from typing import Any

from ldap3 import ALL, SUBTREE, Connection, Server, Tls

from src.core.config import Settings
from src.models.common import decode_id, encode_id
from src.models.computers import (
    ComputerDetail,
    ComputerStats,
    ComputerStatus,
    ComputerSummary,
    JoinTrendPoint,
    OsDistribution,
)
from src.models.domain import (
    DOMAIN_SERVICES,
    AccountStatus,
    GpoLinkMode,
    GpoStatus,
    GroupCategory,
    UserAccountControl,
)
from src.models.domain_info import (
    DnsServer,
    DomainInfo,
    FsmoRoleHolder,
    LockoutPolicy,
    PasswordPolicy,
)
from src.models.gpo import GpoDetail, GpoStats, GpoSummary, LinkedOu
from src.models.groups import (
    GroupCreate,
    GroupDetail,
    GroupMemberRef,
    GroupStats,
    GroupSummary,
    _parse_group_type,
)
from src.models.health import ServiceStatus, SystemResources
from src.models.ou import GpoLinkRef, OuCreate, OuDetail, OuStats, OuTreeNode
from src.models.stats import AlertItem, LoginTrendPoint, OuDistributionEntry
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
    EntryNotFoundError,
)


def _ad_time_to_dt(raw: str | datetime | None) -> datetime | None:
    """Convert an AD LDAP Generalized Time / interval to a datetime.

    ldap3 may return datetime objects directly (auto-parsed) or raw
    strings in Generalized Time format (YYYYMMDDHHMMSS.0Z).
    """
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=UTC)
    try:
        # Generalized time: YYYYMMDDHHMMSS.0Z
        return datetime.strptime(str(raw).split(".")[0], "%Y%m%d%H%M%S").replace(
            tzinfo=UTC
        )
    except (ValueError, TypeError):
        return None


def _status_from_uac(uac: int) -> AccountStatus:
    flags = UserAccountControl(uac)
    if UserAccountControl.LOCKOUT in flags:
        return AccountStatus.LOCKED
    if UserAccountControl.ACCOUNTDISABLE in flags:
        return AccountStatus.INACTIVE
    return AccountStatus.ACTIVE


def _parent_ou_name(dn: str) -> str:
    for part in dn.split(","):
        part = part.strip()
        if part.upper().startswith("OU="):
            return part[3:]
    return "Users"


def _escape(value: str) -> str:
    """Escape special characters in an LDAP filter value (RFC 4515)."""
    return (
        value.replace("\\", "\\5c")
        .replace("(", "\\28")
        .replace(")", "\\29")
        .replace("*", "\\2a")
        .replace("\x00", "\\00")
    )


def _rdn_value(dn: str) -> str:
    """Extract the value of the first RDN component from a DN."""
    first = dn.split(",")[0]
    if "=" in first:
        return first.split("=", 1)[1]
    return first


def _parent_dn(dn: str) -> str:
    """Return the parent DN (everything after the first comma)."""
    parts = dn.split(",", 1)
    if len(parts) < 2:
        return ""
    return parts[1]


def _parse_gplink(gplink: str) -> list[GpoLinkRef]:
    """Parse an AD ``gPLink`` attribute into structured refs.

    Format: ``[LDAP://<gpo_dn>;<flag>]...``
    Flags: 0 = linked (inherited), 2 = enforced.
    """
    if not gplink:
        return []
    refs: list[GpoLinkRef] = []
    for match in re.finditer(r"\[LDAP://([^;]+);(\d+)\]", gplink):
        gpo_dn, flag = match.group(1), match.group(2)
        mode = GpoLinkMode.ENFORCED if flag == "2" else GpoLinkMode.INHERITED
        refs.append(
            GpoLinkRef(
                gpo_id=encode_id(gpo_dn),
                display_name=_rdn_value(gpo_dn),
                mode=mode,
            )
        )
    return refs


def _probe_port(host: str, port: int, timeout: float = 2.0) -> tuple[bool, float]:
    """TCP-probe a host:port. Returns ``(reachable, latency_ms)``."""
    import time

    start = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            elapsed = (time.monotonic() - start) * 1000
            return True, round(elapsed, 1)
    except OSError:
        return False, 0.0


class Ldap3Backend:
    """Production ``DirectoryBackend`` backed by ldap3 + samba-tool."""

    def __init__(self, settings: Settings) -> None:
        self._cfg = settings
        # Samba AD requires TLS for simple binds.  Self-signed certs are
        # auto-generated during provisioning, so we disable validation.
        self._tls = Tls(
            validate=ssl.CERT_NONE,
            version=ssl.PROTOCOL_TLS_CLIENT,
        )
        self._server = Server(
            settings.ldap_host,
            port=settings.ldap_port,
            use_ssl=settings.ldap_use_ssl,
            tls=self._tls,
            get_info=ALL,
            # Python 3.14 struct.pack rejects float timeouts — use int
            connect_timeout=int(settings.ldap_timeout),
        )

    # ------------------------------------------------------------------
    # Connection helpers
    # ------------------------------------------------------------------
    def _connect(self) -> Connection:
        conn = Connection(
            self._server,
            user=self._cfg.ldap_bind_dn,
            password=self._cfg.ldap_bind_password.get_secret_value(),
            auto_bind=False,
            read_only=False,
            receive_timeout=int(self._cfg.ldap_timeout),
        )
        # StartTLS upgrade before bind (Samba requires transport encryption)
        conn.open(read_server_info=False)
        if not self._cfg.ldap_use_ssl:
            conn.start_tls(read_server_info=False)
        conn.bind()
        return conn

    def _search(
        self, conn: Connection, base: str, filt: str, attributes: list[str]
    ) -> list[dict[str, Any]]:
        conn.search(
            search_base=base,
            search_filter=filt,
            search_scope=SUBTREE,
            attributes=attributes,
            paged_size=self._cfg.ldap_page_size,
        )
        out: list[dict[str, Any]] = []
        for entry in conn.entries:
            attrs: dict[str, Any] = {}
            for attr in attributes:
                val = entry[attr].value if attr in entry else None
                attrs[attr] = val
            attrs["dn"] = entry.entry_dn
            out.append(attrs)
        return out

    def _base(self) -> str:
        return self._cfg.ldap_search_base or "DC=TEST,DC=LOCAL"

    # ==================================================================
    # USERS
    # ==================================================================
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
        filt = "(&(objectClass=user)(objectCategory=person))"
        if q:
            safe_q = q.replace("(", "").replace(")", "").replace("*", "\\2a")
            filt += f"(|(sAMAccountName=*{safe_q}*)(displayName=*{safe_q}*)(mail=*{safe_q}*))"
        with self._connect() as conn:
            rows = self._search(
                conn,
                self._base(),
                filt,
                [
                    "sAMAccountName",
                    "displayName",
                    "mail",
                    "distinguishedName",
                    "userAccountControl",
                    "lastLogonTimestamp",
                ],
            )
        if ou and ou != "All OUs":
            rows = [r for r in rows if f"OU={ou}," in r["dn"]]
        summaries: list[UserSummary] = []
        for r in rows:
            uac = int(r.get("userAccountControl") or 0)
            st = _status_from_uac(uac)
            if status and status != "all" and st.value != status:
                continue
            summaries.append(
                UserSummary(
                    id=encode_id(r["dn"]),
                    username=r.get("sAMAccountName") or "",
                    display_name=r.get("displayName"),
                    email=r.get("mail"),
                    ou=_parent_ou_name(r["dn"]),
                    status=st,
                    last_logon=_ad_time_to_dt(r.get("lastLogonTimestamp")),
                )
            )
        summaries.sort(
            key=lambda u: getattr(u, sort, u.username), reverse=(order == "desc")
        )
        total = len(summaries)
        start = (page - 1) * limit
        return summaries[start : start + limit], total

    def get_user(self, item_id: str) -> UserDetail:
        dn = decode_id(item_id)
        with self._connect() as conn:
            rows = self._search(
                conn,
                dn,
                "(objectClass=user)",
                [
                    "sAMAccountName",
                    "displayName",
                    "givenName",
                    "sn",
                    "mail",
                    "telephoneNumber",
                    "userAccountControl",
                    "whenCreated",
                    "pwdLastSet",
                    "objectSid",
                    "memberOf",
                    "lastLogon",
                ],
            )
        if not rows:
            raise EntryNotFoundError(f"User not found: {dn}")
        r = rows[0]
        uac = int(r.get("userAccountControl") or 0)
        groups = [
            UserGroupMembership(
                id=encode_id(g), name=g.split(",")[0].split("=", 1)[-1], dn=g
            )
            for g in (r.get("memberOf") or [])
        ]
        return UserDetail(
            id=encode_id(dn),
            username=r.get("sAMAccountName") or "",
            display_name=r.get("displayName"),
            first_name=r.get("givenName"),
            last_name=r.get("sn"),
            email=r.get("mail"),
            phone=r.get("telephoneNumber"),
            dn=dn,
            ou=_parent_ou_name(dn),
            status=_status_from_uac(uac),
            user_account_control=uac,
            when_created=_ad_time_to_dt(r.get("whenCreated")),
            object_sid=str(r.get("objectSid") or "") or None,
            groups=groups,
            login_history=[],
        )

    def create_user(self, payload: UserCreate) -> UserDetail:
        from src.services.samba_tool import SambaTool

        tool = SambaTool(self._cfg)
        res = tool.user_create(
            payload.username,
            payload.password,
            given_name=payload.first_name,
            surname=payload.last_name,
            mail=str(payload.email) if payload.email else None,
            ou_dn=payload.ou_dn,
        )
        if not res.ok:
            raise RuntimeError(res.stderr or res.stdout)
        dn = f"CN={payload.username},{payload.ou_dn or f'CN=Users,{self._base()}'}"
        return self.get_user(encode_id(dn))

    def update_user(self, item_id: str, **fields: object) -> UserDetail:
        from ldap3 import MODIFY_REPLACE

        dn = decode_id(item_id)
        changes: dict[str, tuple] = {}
        if fields.get("display_name") is not None:
            changes["displayName"] = (MODIFY_REPLACE, [fields["display_name"]])
        if fields.get("email") is not None:
            changes["mail"] = (MODIFY_REPLACE, [fields["email"]])
        if fields.get("phone") is not None:
            changes["telephoneNumber"] = (MODIFY_REPLACE, [fields["phone"]])
        with self._connect() as conn:
            if changes:
                conn.modify(dn, changes)
            if fields.get("ou_dn"):
                conn.modify_dn(
                    dn,
                    f"CN={dn.split(',')[0].split('=', 1)[1]}",
                    new_superior=str(fields["ou_dn"]),
                )
        return self.get_user(item_id)

    def set_user_status(self, item_id: str, status: str) -> UserDetail:
        from src.services.samba_tool import SambaTool

        dn = decode_id(item_id)
        username = dn.split(",")[0].split("=", 1)[1]
        tool = SambaTool(self._cfg)
        if status == AccountStatus.INACTIVE.value:
            tool.user_disable(username)
        else:
            tool.user_enable(username)
        return self.get_user(item_id)

    def reset_password(self, item_id: str, new_password: str) -> None:
        from src.services.samba_tool import SambaTool

        dn = decode_id(item_id)
        username = dn.split(",")[0].split("=", 1)[1]
        tool = SambaTool(self._cfg)
        res = tool.user_setpassword(username, new_password)
        if not res.ok:
            raise RuntimeError(res.stderr)

    def delete_user(self, item_id: str) -> None:
        from src.services.samba_tool import SambaTool

        dn = decode_id(item_id)
        username = dn.split(",")[0].split("=", 1)[1]
        tool = SambaTool(self._cfg)
        res = tool.user_delete(username)
        if not res.ok:
            raise RuntimeError(res.stderr)

    def user_stats(self) -> UserStats:
        # Count via LDAP — exact numbers computed from real directory.
        counts = {
            AccountStatus.ACTIVE: 0,
            AccountStatus.INACTIVE: 0,
            AccountStatus.LOCKED: 0,
        }
        with self._connect() as conn:
            for r in self._search(
                conn,
                self._base(),
                "(&(objectClass=user)(objectCategory=person))",
                ["userAccountControl"],
            ):
                uac = int(r.get("userAccountControl") or 0)
                counts[_status_from_uac(uac)] = counts.get(_status_from_uac(uac), 0) + 1
        total = sum(counts.values())
        return UserStats(
            total=total,
            active=counts[AccountStatus.ACTIVE],
            inactive=counts[AccountStatus.INACTIVE],
            locked=counts[AccountStatus.LOCKED],
            created_today=0,
        )

    def user_login_history(self, item_id: str) -> list[LoginEvent]:
        # Full login history requires Samba audit log parsing — placeholder
        # returns lastLogon-derived single event. (Phase 2 enhancement.)
        return []

    # ==================================================================
    # GROUPS
    # ==================================================================
    def _group_filter(
        self, q: str | None, category: str | None, scope: str | None
    ) -> str:
        filt = "(objectClass=group)"
        if q:
            safe = _escape(q)
            filt += f"(|(cn=*{safe}*)(name=*{safe}*)(displayName=*{safe}*))"
        if category == GroupCategory.SECURITY.value:
            # security groups have the high bit set → negative groupType
            filt += "(groupType<=0)"
        elif category == GroupCategory.DISTRIBUTION.value:
            filt += "(groupType>=0)"
        return filt

    def list_groups(self, q=None, category=None, scope=None, page=1, limit=20):
        with self._connect() as conn:
            rows = self._search(
                conn,
                self._base(),
                self._group_filter(q, category, scope),
                [
                    "cn",
                    "name",
                    "groupType",
                    "description",
                    "member",
                    "managedBy",
                    "distinguishedName",
                ],
            )
        summaries: list[GroupSummary] = []
        for r in rows:
            gtype = int(r.get("groupType") or 0)
            cat, parsed_scope = _parse_group_type(gtype)
            if scope and parsed_scope.value != scope:
                continue
            member = r.get("member")
            member_list = (
                member if isinstance(member, list) else ([member] if member else [])
            )
            summaries.append(
                GroupSummary(
                    id=encode_id(r["dn"]),
                    name=r.get("cn") or r.get("name") or "",
                    category=cat,
                    scope=parsed_scope,
                    member_count=len(member_list),
                    description=r.get("description"),
                    managed_by=r.get("managedBy"),
                )
            )
        total = len(summaries)
        start = (page - 1) * limit
        return summaries[start : start + limit], total

    def get_group(self, item_id: str) -> GroupDetail:
        dn = decode_id(item_id)
        with self._connect() as conn:
            rows = self._search(
                conn,
                dn,
                "(objectClass=group)",
                [
                    "cn",
                    "name",
                    "groupType",
                    "description",
                    "member",
                    "managedBy",
                    "whenCreated",
                    "whenChanged",
                    "objectSid",
                ],
            )
        if not rows:
            raise EntryNotFoundError(f"Group not found: {dn}")
        r = rows[0]
        gtype = int(r.get("groupType") or 0)
        cat, parsed_scope = _parse_group_type(gtype)
        member = r.get("member")
        member_list = (
            member if isinstance(member, list) else ([member] if member else [])
        )
        members = [
            GroupMemberRef(id=encode_id(m), name=_rdn_value(m), dn=m)
            for m in member_list
        ]
        return GroupDetail(
            id=encode_id(dn),
            name=r.get("cn") or r.get("name") or "",
            dn=dn,
            category=cat,
            scope=parsed_scope,
            description=r.get("description"),
            member_count=len(member_list),
            managed_by=r.get("managedBy"),
            when_created=_ad_time_to_dt(r.get("whenCreated")),
            when_changed=_ad_time_to_dt(r.get("whenChanged")),
            object_sid=str(r.get("objectSid") or "") or None,
            members=members,
            nested_groups=[m for m in members if "Groups" in m.dn],
        )

    def create_group(self, payload: GroupCreate) -> GroupDetail:
        from src.services.samba_tool import SambaTool

        tool = SambaTool(self._cfg)
        res = tool.group_add(payload.name, ou_dn=payload.ou_dn)
        if not res.ok:
            raise RuntimeError(res.stderr or res.stdout)
        # samba-tool uses CN=...; locate the new group and return detail
        with self._connect() as conn:
            conn.search(
                self._base(),
                f"(&(objectClass=group)(cn={_escape(payload.name)}))",
                attributes=["distinguishedName"],
            )
            if conn.entries:
                return self.get_group(encode_id(conn.entries[0].entry_dn))
        raise EntryNotFoundError(f"Created group not locatable: {payload.name}")

    def update_group(self, item_id: str, **fields: object) -> GroupDetail:
        from ldap3 import MODIFY_REPLACE

        dn = decode_id(item_id)
        changes: dict[str, tuple] = {}
        if fields.get("description") is not None:
            changes["description"] = (MODIFY_REPLACE, [fields["description"]])
        if fields.get("managed_by") is not None:
            changes["managedBy"] = (MODIFY_REPLACE, [fields["managed_by"]])
        with self._connect() as conn:
            if changes:
                conn.modify(dn, changes)
        return self.get_group(item_id)

    def add_group_members(self, item_id: str, member_dns: list[str]) -> GroupDetail:
        from ldap3 import MODIFY_ADD

        dn = decode_id(item_id)
        with self._connect() as conn:
            conn.modify(dn, {"member": (MODIFY_ADD, member_dns)})
        return self.get_group(item_id)

    def remove_group_member(self, item_id: str, member_dn: str) -> GroupDetail:
        from ldap3 import MODIFY_DELETE

        dn = decode_id(item_id)
        with self._connect() as conn:
            conn.modify(dn, {"member": (MODIFY_DELETE, [member_dn])})
        return self.get_group(item_id)

    def delete_group(self, item_id: str) -> None:
        from src.services.samba_tool import SambaTool

        dn = decode_id(item_id)
        name = _rdn_value(dn)
        tool = SambaTool(self._cfg)
        res = tool.group_delete(name)
        if not res.ok:
            raise RuntimeError(res.stderr)

    def group_stats(self) -> GroupStats:
        with self._connect() as conn:
            rows = self._search(
                conn,
                self._base(),
                "(objectClass=group)",
                ["groupType", "member"],
            )
        sec = dist = nested = 0
        for r in rows:
            cat, _ = _parse_group_type(int(r.get("groupType") or 0))
            if cat == GroupCategory.SECURITY:
                sec += 1
            else:
                dist += 1
            member = r.get("member")
            member_list = (
                member if isinstance(member, list) else ([member] if member else [])
            )
            if any("Groups" in m for m in member_list):
                nested += 1
        total = sec + dist
        return GroupStats(total=total, security=sec, distribution=dist, nested=nested)

    # ==================================================================
    # OUs
    # ==================================================================
    def ou_tree(self) -> list[OuTreeNode]:
        with self._connect() as conn:
            rows = self._search(
                conn,
                self._base(),
                "(objectClass=organizationalUnit)",
                ["ou", "name", "description", "distinguishedName"],
            )
            user_rows = self._search(
                conn,
                self._base(),
                "(&(objectClass=user)(objectCategory=person))",
                ["distinguishedName"],
            )
            comp_rows = self._search(
                conn,
                self._base(),
                "(objectClass=computer)",
                ["distinguishedName"],
            )
        user_ous = {_parent_dn(u["dn"]) for u in user_rows}
        comp_ous = {_parent_dn(c["dn"]) for c in comp_rows}

        def children_of(parent: str) -> list[OuTreeNode]:
            nodes = []
            for r in rows:
                if _parent_dn(r["dn"]) == parent:
                    node = OuTreeNode(
                        id=encode_id(r["dn"]),
                        name=r.get("ou") or r.get("name") or "",
                        dn=r["dn"],
                        description=r.get("description"),
                        user_count=sum(1 for uo in user_ous if r["dn"] in uo),
                        computer_count=sum(1 for co in comp_ous if r["dn"] in co),
                        gpo_count=0,  # GPO links resolved lazily in get_ou
                        children=children_of(r["dn"]),
                    )
                    nodes.append(node)
            return nodes

        return children_of(self._base())

    def get_ou(self, item_id: str) -> OuDetail:
        dn = decode_id(item_id)
        with self._connect() as conn:
            rows = self._search(
                conn,
                dn,
                "(objectClass=organizationalUnit)",
                [
                    "ou",
                    "name",
                    "description",
                    "managedBy",
                    "gPOptions",
                    "gPLink",
                    "whenCreated",
                    "whenChanged",
                ],
            )
        if not rows:
            raise EntryNotFoundError(f"OU not found: {dn}")
        r = rows[0]
        name = r.get("ou") or r.get("name") or ""
        gp_link = r.get("gPLink") or ""
        linked = _parse_gplink(gp_link)
        gp_options = r.get("gPOptions")
        node = self._ou_node_simple(dn, name)
        return OuDetail(
            id=encode_id(dn),
            name=name,
            dn=dn,
            description=r.get("description"),
            when_created=_ad_time_to_dt(r.get("whenCreated")),
            when_changed=_ad_time_to_dt(r.get("whenChanged")),
            managed_by=r.get("managedBy"),
            inherit_gpo=(int(gp_options or 0) == 0),
            user_count=node.user_count,
            computer_count=node.computer_count,
            linked_gpos=linked,
            child_ous=node.children,
        )

    def _ou_node_simple(self, dn: str, name: str) -> OuTreeNode:
        """Build a lightweight OU node with child/user/computer counts."""
        with self._connect() as conn:
            users = self._search(
                conn,
                dn,
                "(&(objectClass=user)(objectCategory=person))",
                ["distinguishedName"],
            )
            comps = self._search(
                conn,
                dn,
                "(objectClass=computer)",
                ["distinguishedName"],
            )
            child_ous = self._search(
                conn,
                dn,
                "(objectClass=organizationalUnit)",
                ["ou", "name", "distinguishedName"],
            )
        children = [
            OuTreeNode(
                id=encode_id(c["dn"]),
                name=c.get("ou") or c.get("name") or "",
                dn=c["dn"],
                user_count=0,
                computer_count=0,
                gpo_count=0,
            )
            for c in child_ous
            if c["dn"] != dn
        ]
        return OuTreeNode(
            id=encode_id(dn),
            name=name,
            dn=dn,
            user_count=len(users),
            computer_count=len(comps),
            gpo_count=0,
            children=children,
        )

    def create_ou(self, payload: OuCreate) -> OuTreeNode:
        parent = payload.parent_dn or self._base()
        rdn = payload.name
        dn = f"OU={rdn},{parent}"
        with self._connect() as conn:
            conn.add(
                dn,
                ["organizationalUnit"],
                {
                    "ou": rdn,
                    **(
                        {"description": [payload.description]}
                        if payload.description
                        else {}
                    ),
                },
            )
        return OuTreeNode(
            id=encode_id(dn),
            name=rdn,
            dn=dn,
            description=payload.description,
            user_count=0,
            computer_count=0,
            gpo_count=0,
        )

    def update_ou(self, item_id: str, **fields: object) -> OuDetail:
        from ldap3 import MODIFY_REPLACE

        dn = decode_id(item_id)
        changes: dict[str, tuple] = {}
        if fields.get("description") is not None:
            changes["description"] = (MODIFY_REPLACE, [fields["description"]])
        if fields.get("managed_by") is not None:
            changes["managedBy"] = (MODIFY_REPLACE, [fields["managed_by"]])
        if fields.get("inherit_gpo") is not None:
            changes["gPOptions"] = (MODIFY_REPLACE, [0 if fields["inherit_gpo"] else 1])
        with self._connect() as conn:
            if changes:
                conn.modify(dn, changes)
        return self.get_ou(item_id)

    def delete_ou(self, item_id: str) -> None:
        dn = decode_id(item_id)
        with self._connect() as conn:
            conn.delete(dn)

    def ou_stats(self) -> OuStats:
        with self._connect() as conn:
            ou_count = self._search(
                conn,
                self._base(),
                "(objectClass=organizationalUnit)",
                ["distinguishedName"],
            )
            user_count = self._search(
                conn,
                self._base(),
                "(&(objectClass=user)(objectCategory=person))",
                ["distinguishedName"],
            )
            comp_count = self._search(
                conn,
                self._base(),
                "(objectClass=computer)",
                ["distinguishedName"],
            )
        return OuStats(
            total=len(ou_count),
            user_objects=len(user_count),
            computer_objects=len(comp_count),
            linked_gpos=0,
        )

    # ==================================================================
    # COMPUTERS
    # ==================================================================
    def _computer_status(self, uac: int, last_logon: datetime | None) -> ComputerStatus:
        flags = UserAccountControl(uac)
        if UserAccountControl.ACCOUNTDISABLE in flags:
            return ComputerStatus.INACTIVE
        if last_logon:
            days = (datetime.now(UTC) - last_logon).days
            if days > 90:
                return ComputerStatus.STALE
        return ComputerStatus.ACTIVE

    def list_computers(self, q=None, os_filter=None, status=None, page=1, limit=20):
        filt = "(objectClass=computer)"
        if q:
            safe = _escape(q)
            filt += f"(|(cn=*{safe}*)(dNSHostName=*{safe}*))"
        with self._connect() as conn:
            rows = self._search(
                conn,
                self._base(),
                filt,
                [
                    "cn",
                    "name",
                    "dNSHostName",
                    "operatingSystem",
                    "operatingSystemVersion",
                    "userAccountControl",
                    "lastLogonTimestamp",
                    "whenCreated",
                ],
            )
        summaries: list[ComputerSummary] = []
        for r in rows:
            os_name = r.get("operatingSystem") or "Unknown"
            if os_filter and os_name != os_filter:
                continue
            last = _ad_time_to_dt(r.get("lastLogonTimestamp"))
            st = self._computer_status(int(r.get("userAccountControl") or 0), last)
            if status and st.value != status:
                continue
            summaries.append(
                ComputerSummary(
                    id=encode_id(r["dn"]),
                    hostname=r.get("cn") or r.get("name") or "",
                    dns_hostname=r.get("dNSHostName"),
                    operating_system=os_name,
                    operating_system_version=r.get("operatingSystemVersion"),
                    ip_address=None,
                    ou=_parent_ou_name(r["dn"]),
                    status=st,
                    last_logon=last,
                    join_date=_ad_time_to_dt(r.get("whenCreated")),
                )
            )
        total = len(summaries)
        start = (page - 1) * limit
        return summaries[start : start + limit], total

    def get_computer(self, item_id: str) -> ComputerDetail:
        dn = decode_id(item_id)
        with self._connect() as conn:
            rows = self._search(
                conn,
                dn,
                "(objectClass=computer)",
                [
                    "cn",
                    "name",
                    "dNSHostName",
                    "operatingSystem",
                    "operatingSystemVersion",
                    "userAccountControl",
                    "lastLogonTimestamp",
                    "whenCreated",
                    "objectSid",
                ],
            )
        if not rows:
            raise EntryNotFoundError(f"Computer not found: {dn}")
        r = rows[0]
        last = _ad_time_to_dt(r.get("lastLogonTimestamp"))
        st = self._computer_status(int(r.get("userAccountControl") or 0), last)
        return ComputerDetail(
            id=encode_id(dn),
            hostname=r.get("cn") or r.get("name") or "",
            dns_hostname=r.get("dNSHostName"),
            operating_system=r.get("operatingSystem") or "Unknown",
            operating_system_version=r.get("operatingSystemVersion"),
            ip_address=None,
            ou=_parent_ou_name(dn),
            status=st,
            last_logon=last,
            join_date=_ad_time_to_dt(r.get("whenCreated")),
            dn=dn,
            object_sid=str(r.get("objectSid") or "") or None,
        )

    def set_computer_status(self, item_id: str, status: str) -> ComputerDetail:
        from ldap3 import MODIFY_REPLACE

        dn = decode_id(item_id)
        # Read current UAC, flip the disable bit
        with self._connect() as conn:
            rows = self._search(
                conn, dn, "(objectClass=computer)", ["userAccountControl"]
            )
        uac = int(rows[0].get("userAccountControl") or 0) if rows else 0
        want = ComputerStatus(status)
        if want == ComputerStatus.INACTIVE:
            uac |= int(UserAccountControl.ACCOUNTDISABLE)
        else:
            uac &= ~int(UserAccountControl.ACCOUNTDISABLE)
        with self._connect() as conn:
            conn.modify(dn, {"userAccountControl": (MODIFY_REPLACE, [str(uac)])})
        return self.get_computer(item_id)

    def reset_computer(self, item_id: str) -> None:
        dn = decode_id(item_id)
        # Reset computer account: set UAC back to default workstation trust
        from ldap3 import MODIFY_REPLACE

        uac = int(UserAccountControl.WORKSTATION_TRUST_ACCOUNT)
        with self._connect() as conn:
            conn.modify(dn, {"userAccountControl": (MODIFY_REPLACE, [str(uac)])})

    def delete_computer(self, item_id: str) -> None:
        from src.services.samba_tool import SambaTool

        dn = decode_id(item_id)
        name = _rdn_value(dn)
        tool = SambaTool(self._cfg)
        res = tool._run(tool._base_cmd("computer", "delete", name))
        if not res.ok:
            raise RuntimeError(res.stderr)

    def computer_stats(self) -> ComputerStats:
        with self._connect() as conn:
            rows = self._search(
                conn,
                self._base(),
                "(objectClass=computer)",
                [
                    "userAccountControl",
                    "lastLogonTimestamp",
                    "whenCreated",
                ],
            )
        active = inactive = stale = joined_today = 0
        today = datetime.now(UTC).date()
        for r in rows:
            last = _ad_time_to_dt(r.get("lastLogonTimestamp"))
            st = self._computer_status(int(r.get("userAccountControl") or 0), last)
            if st == ComputerStatus.ACTIVE:
                active += 1
            elif st == ComputerStatus.INACTIVE:
                inactive += 1
            else:
                stale += 1
            created = _ad_time_to_dt(r.get("whenCreated"))
            if created and created.date() == today:
                joined_today += 1
        return ComputerStats(
            total=len(rows),
            active=active,
            inactive=inactive,
            stale=stale,
            joined_today=joined_today,
        )

    def computer_os_distribution(self) -> list[OsDistribution]:
        with self._connect() as conn:
            rows = self._search(
                conn,
                self._base(),
                "(objectClass=computer)",
                ["operatingSystem"],
            )
        counts: dict[str, int] = {}
        for r in rows:
            os_name = r.get("operatingSystem") or "Other"
            counts[os_name] = counts.get(os_name, 0) + 1
        return [OsDistribution(os=k, count=v) for k, v in counts.items()]

    def computer_join_trend(self) -> list[JoinTrendPoint]:
        # Last 7 days by whenCreated — limited resolution but real data.
        from datetime import timedelta

        with self._connect() as conn:
            rows = self._search(
                conn,
                self._base(),
                "(objectClass=computer)",
                ["whenCreated"],
            )
        buckets: dict[str, int] = {}
        today = datetime.now(UTC).date()
        labels = []
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            key = d.isoformat()
            buckets[key] = 0
            labels.append(key)
        for r in rows:
            created = _ad_time_to_dt(r.get("whenCreated"))
            if created:
                key = created.date().isoformat()
                if key in buckets:
                    buckets[key] += 1
        return [JoinTrendPoint(date=k, count=buckets[k]) for k in labels]

    # ==================================================================
    # GPOs
    # ==================================================================
    def _gpo_base(self) -> str:
        return f"CN=Policies,CN=System,{self._base()}"

    def list_gpos(self, q=None, status=None, page=1, limit=20):
        filt = "(objectClass=groupPolicyContainer)"
        if q:
            filt += f"(displayName=*{_escape(q)}*)"
        with self._connect() as conn:
            rows = self._search(
                conn,
                self._gpo_base(),
                filt,
                [
                    "displayName",
                    "cn",
                    "name",
                    "flags",
                    "whenCreated",
                    "whenChanged",
                ],
            )
            # Count links across OUs
            ou_rows = self._search(
                conn,
                self._base(),
                "(objectClass=organizationalUnit)",
                ["gPLink"],
            )
        link_counts: dict[str, int] = {}
        for o in ou_rows:
            for ref in _parse_gplink(o.get("gPLink") or ""):
                link_counts[ref.gpo_id] = link_counts.get(ref.gpo_id, 0) + 1
        summaries: list[GpoSummary] = []
        for r in rows:
            flags = int(r.get("flags") or 0)
            gpo_status = GpoStatus.DISABLED if flags & 3 else GpoStatus.ENABLED
            if status and gpo_status.value != status:
                continue
            gid = encode_id(r["dn"])
            summaries.append(
                GpoSummary(
                    id=gid,
                    display_name=r.get("displayName") or "",
                    status=gpo_status,
                    description=None,
                    link_count=link_counts.get(gid, 0),
                )
            )
        total = len(summaries)
        start = (page - 1) * limit
        return summaries[start : start + limit], total

    def get_gpo(self, item_id: str) -> GpoDetail:
        dn = decode_id(item_id)
        with self._connect() as conn:
            rows = self._search(
                conn,
                dn,
                "(objectClass=groupPolicyContainer)",
                [
                    "displayName",
                    "cn",
                    "name",
                    "flags",
                    "versionNumber",
                    "gPCWQLFilter",
                    "whenCreated",
                    "whenChanged",
                ],
            )
            ou_rows = self._search(
                conn,
                self._base(),
                "(objectClass=organizationalUnit)",
                ["distinguishedName", "gPLink"],
            )
        if not rows:
            raise EntryNotFoundError(f"GPO not found: {dn}")
        r = rows[0]
        flags = int(r.get("flags") or 0)
        gpo_status = GpoStatus.DISABLED if flags & 3 else GpoStatus.ENABLED
        guid = r.get("cn") or r.get("name") or ""
        linked: list[LinkedOu] = [
            LinkedOu(ou_id=encode_id(o["dn"]), ou_dn=o["dn"], mode=ref.mode)
            for o in ou_rows
            for ref in _parse_gplink(o.get("gPLink") or "")
            if ref.gpo_id == encode_id(dn)
        ]
        version = int(r.get("versionNumber") or 0)
        return GpoDetail(
            id=encode_id(dn),
            guid=guid,
            display_name=r.get("displayName") or "",
            dn=dn,
            status=gpo_status,
            description=None,
            when_created=_ad_time_to_dt(r.get("whenCreated")),
            when_changed=_ad_time_to_dt(r.get("whenChanged")),
            version_user=(version >> 16) & 0xFFFF,
            version_computer=version & 0xFFFF,
            wmi_filter=r.get("gPCWQLFilter"),
            linked_ous=linked,
            settings=[],
        )

    def create_gpo(self, display_name: str, ou_dn: str | None) -> GpoDetail:
        from src.services.samba_tool import SambaTool

        tool = SambaTool(self._cfg)
        res = tool.gpo_create(display_name)
        if not res.ok:
            raise RuntimeError(res.stderr or res.stdout)
        # Locate the created GPO by display name
        with self._connect() as conn:
            conn.search(
                self._gpo_base(),
                f"(&(objectClass=groupPolicyContainer)(displayName={_escape(display_name)}))",
                attributes=["distinguishedName"],
            )
            if conn.entries:
                gpo = self.get_gpo(encode_id(conn.entries[0].entry_dn))
                if ou_dn:
                    return self.link_gpo(gpo.id, ou_dn, enforced=False)
                return gpo
        raise EntryNotFoundError(f"Created GPO not locatable: {display_name}")

    def link_gpo(self, gpo_id: str, ou_dn: str, enforced: bool) -> GpoDetail:
        from ldap3 import MODIFY_REPLACE

        gpo_dn = decode_id(gpo_id)
        # Build/extend the gPLink attribute: [LDAP://<dn>;<flags>;]
        flag = "2" if enforced else "0"
        new_entry = f"[LDAP://{gpo_dn};{flag}]"
        with self._connect() as conn:
            conn.search(ou_dn, "(objectClass=*)", attributes=["gPLink"])
            existing = (
                str(conn.entries[0].gPLink)
                if conn.entries and conn.entries[0].gPLink
                else ""
            )
            # Remove any prior reference to this GPO, then append
            cleaned = re.sub(
                r"\[LDAP://" + re.escape(gpo_dn) + r";[0-2]\]", "", existing
            )
            new_link = cleaned + new_entry
            conn.modify(ou_dn, {"gPLink": (MODIFY_REPLACE, [new_link])})
        return self.get_gpo(gpo_id)

    def unlink_gpo(self, gpo_id: str, ou_dn: str) -> GpoDetail:
        from ldap3 import MODIFY_REPLACE

        gpo_dn = decode_id(gpo_id)
        with self._connect() as conn:
            conn.search(ou_dn, "(objectClass=*)", attributes=["gPLink"])
            existing = (
                str(conn.entries[0].gPLink)
                if conn.entries and conn.entries[0].gPLink
                else ""
            )
            new_link = re.sub(
                r"\[LDAP://" + re.escape(gpo_dn) + r";[0-2]\]", "", existing
            )
            conn.modify(ou_dn, {"gPLink": (MODIFY_REPLACE, [new_link])})
        return self.get_gpo(gpo_id)

    def set_gpo_status(self, gpo_id: str, status: str) -> GpoDetail:
        from ldap3 import MODIFY_REPLACE

        dn = decode_id(gpo_id)
        want = GpoStatus(status)
        # flags: bit0=user disabled, bit1=computer disabled; 0 = enabled
        flags = 3 if want == GpoStatus.DISABLED else 0
        with self._connect() as conn:
            conn.modify(dn, {"flags": (MODIFY_REPLACE, [str(flags)])})
        return self.get_gpo(gpo_id)

    def delete_gpo(self, item_id: str) -> None:
        from src.services.samba_tool import SambaTool

        dn = decode_id(item_id)
        guid = _rdn_value(dn)
        tool = SambaTool(self._cfg)
        res = tool.gpo_delete(guid)
        if not res.ok:
            raise RuntimeError(res.stderr)

    def gpo_stats(self) -> GpoStats:
        items, total = self.list_gpos(page=1, limit=10000)
        active = sum(1 for g in items if g.status == GpoStatus.ENABLED)
        disabled = sum(1 for g in items if g.status == GpoStatus.DISABLED)
        enforced = sum(1 for g in items if g.link_count > 0)  # approximation
        return GpoStats(
            total=total, active=active, enforced=enforced, disabled=disabled
        )

    # ==================================================================
    # DOMAIN (read policies from the domain NC head)
    # ==================================================================
    def domain_info(self) -> DomainInfo:
        from src.services.samba_tool import SambaTool

        tool = SambaTool(self._cfg)
        res = tool.domain_info()
        # Parse samba-tool domain info output (key: value lines)
        info: dict[str, str] = {}
        if res.ok and res.stdout:
            for line in res.stdout.splitlines():
                if ":" in line:
                    key, _, val = line.partition(":")
                    info[key.strip().lower().replace(" ", "_")] = val.strip()

        # Also pull rootDSE for functional levels
        rootdse = None
        try:
            with self._connect() as conn:
                conn.search(
                    "",
                    "(objectClass=*)",
                    search_scope="BASE",
                    attributes=[
                        "defaultNamingContext",
                        "rootDomainNamingContext",
                        "domainControllerFunctionality",
                        "forestFunctionality",
                        "domainFunctionality",
                        "dnsHostName",
                        "serverName",
                    ],
                )
                rootdse = conn.entries[0] if conn.entries else None
        except Exception:  # noqa: S110 — RootDSE is best-effort
            # RootDSE may fail on some Samba AD configurations — fall back
            # gracefully to samba-tool output only.
            pass

        base = self._base()
        fqdn = ".".join(
            part.split("=", 1)[1]
            for part in base.split(",")
            if part.upper().startswith("DC=")
        )
        netbios = fqdn.split(".")[0] if fqdn else "DOMAIN"

        def _func_level(val: object) -> str:
            """Map AD integer functional level to human-readable string."""
            mapping = {
                0: "2000",
                1: "2003_Interim",
                2: "2003",
                3: "2008",
                4: "2008_R2",
                5: "2012",
                6: "2012_R2",
                7: "2016",
            }
            try:
                return mapping.get(int(str(val)), str(val))
            except (ValueError, TypeError):
                return str(val) if val else "unknown"

        return DomainInfo(
            fqdn=info.get("domain", fqdn),
            netbios_name=info.get("netbios_domain_name", netbios),
            forest_name=info.get("forest", fqdn),
            domain_functional_level=(
                _func_level(rootdse.domainFunctionality.value)
                if rootdse and rootdse.domainFunctionality
                else info.get("domain_functional_level", "unknown")
            ),
            forest_functional_level=(
                _func_level(rootdse.forestFunctionality.value)
                if rootdse and rootdse.forestFunctionality
                else "unknown"
            ),
            dc_hostname=(
                str(rootdse.dnsHostName.value).split(".")[0]
                if rootdse and rootdse.dnsHostName
                else info.get("dc_hostname")
            ),
            dc_ip=self._cfg.ldap_host,
            object_count=0,
            created=info.get("creation_time"),
            samba_version=info.get("samba_version"),
            server_os=info.get("operating_system"),
        )

    def fsmo_roles(self) -> list[FsmoRoleHolder]:
        # FSMO roles are stored in fsmoRoleOwner attributes across several objects.
        role_map = {
            "SchemaMaster": f"CN=Schema,CN=Configuration,{self._base()}",
            "DomainNamingMaster": "CN=Partitions,CN=Configuration," + self._base(),
            "PDCEmulator": self._base(),
            "RIDMaster": "CN=RID Manager$,CN=System," + self._base(),
            "InfrastructureMaster": "CN=Infrastructure," + self._base(),
        }
        out: list[FsmoRoleHolder] = []
        with self._connect() as conn:
            for role, search_dn in role_map.items():
                conn.search(
                    search_dn,
                    "(objectClass=*)",
                    attributes=["fsmoRoleOwner"],
                )
                if conn.entries:
                    holder = (
                        str(conn.entries[0].fsmoRoleOwner)
                        if conn.entries[0].fsmoRoleOwner
                        else ""
                    )
                    out.append(FsmoRoleHolder(role=role, holder=holder))
        return out

    def dns_servers(self) -> list[DnsServer]:
        # Read nameServer records from the domain DNS zone.
        from src.services.samba_tool import SambaTool

        tool = SambaTool(self._cfg)
        # Primary DC DNS is the LDAP host; forwarders from samba-tool dns query
        servers = [DnsServer(address=self._cfg.ldap_host)]
        res = tool._run(tool._base_cmd("dns", "query", self._cfg.ldap_host, ".", "NS"))
        if res.ok and res.stdout:
            for line in res.stdout.splitlines():
                line = line.strip()
                if line and line not in (self._cfg.ldap_host,):
                    servers.append(DnsServer(address=line, is_forwarder=True))
        return servers

    def password_policy(self) -> PasswordPolicy:
        with self._connect() as conn:
            conn.search(
                self._base(),
                "(objectClass=domainDNS)",
                attributes=[
                    "minPwdLen",
                    "maxPwdAge",
                    "minPwdAge",
                    "pwdHistoryLength",
                    "pwdProperties",
                ],
            )
            if not conn.entries:
                return PasswordPolicy(
                    min_length=0,
                    max_age_days=0,
                    min_age_days=0,
                    history=0,
                )
            e = conn.entries[0]

            # AD stores time as -100ns intervals; negative = duration in 100ns units
            def to_days(val: object) -> int:
                try:
                    v = int(str(val))
                    return abs(v) // (10_000_000 * 86400) if v else 0
                except (ValueError, TypeError):
                    return 0

            props = int(str(e.pwdProperties)) if e.pwdProperties else 0
            return PasswordPolicy(
                min_length=int(str(e.minPwdLen)) if e.minPwdLen else 0,
                max_age_days=to_days(e.maxPwdAge),
                min_age_days=to_days(e.minPwdAge),
                history=int(str(e.pwdHistoryLength)) if e.pwdHistoryLength else 0,
                complexity=bool(props & 1),
                reversible_encryption=bool(props & 16),
            )

    def lockout_policy(self) -> LockoutPolicy:
        with self._connect() as conn:
            conn.search(
                self._base(),
                "(objectClass=domainDNS)",
                attributes=[
                    "lockoutThreshold",
                    "lockoutDuration",
                    "lockOutObservationWindow",
                ],
            )
            if not conn.entries:
                return LockoutPolicy(
                    threshold=0, duration_minutes=0, observation_window_minutes=0
                )
            e = conn.entries[0]

            def to_min(val: object) -> int:
                try:
                    v = int(str(val))
                    return abs(v) // (10_000_000 * 60) if v else 0
                except (ValueError, TypeError):
                    return 0

            return LockoutPolicy(
                threshold=int(str(e.lockoutThreshold)) if e.lockoutThreshold else 0,
                duration_minutes=to_min(e.lockoutDuration),
                observation_window_minutes=to_min(e.lockOutObservationWindow),
            )

    def set_password_policy(self, **fields: object) -> PasswordPolicy:
        from src.services.samba_tool import SambaTool

        tool = SambaTool(self._cfg)
        opts = {
            "min_pwd_len": fields.get("min_length"),
            "pwd_complexity": "on" if fields.get("complexity") else "off",
            "history_length": fields.get("history"),
            "min_pwd_age": fields.get("min_age_days"),
            "max_pwd_age": fields.get("max_age_days"),
        }
        tool.domain_password_set(**{k: v for k, v in opts.items() if v is not None})
        return self.password_policy()

    def set_lockout_policy(self, **fields: object) -> LockoutPolicy:
        from src.services.samba_tool import SambaTool

        tool = SambaTool(self._cfg)
        opts = {
            "account_lockout_threshold": fields.get("threshold"),
            "account_lockout_duration": fields.get("duration_minutes"),
            "account_lockout_observation_window": fields.get(
                "observation_window_minutes"
            ),
        }
        tool.domain_password_set(**{k: v for k, v in opts.items() if v is not None})
        return self.lockout_policy()

    def services_status(self) -> list[ServiceStatus]:
        """TCP-probe each well-known AD service port on the DC host."""
        results: list[ServiceStatus] = []
        for svc in DOMAIN_SERVICES:
            port = int(svc["port"])  # type: ignore[index]
            healthy, latency = _probe_port(self._cfg.ldap_host, port)
            results.append(
                ServiceStatus(
                    name=str(svc["name"]),  # type: ignore[index]
                    port=port,
                    kind=str(svc["kind"]),  # type: ignore[index]
                    healthy=healthy,
                    latency_ms=latency,
                )
            )
        return results

    def system_resources(self) -> SystemResources:
        """Read CPU / memory / disk usage from the host OS via psutil."""
        import psutil

        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        return SystemResources(
            cpu_percent=psutil.cpu_percent(interval=0.5),
            memory_used_gb=round(mem.used / 1024**3, 1),
            memory_total_gb=round(mem.total / 1024**3, 1),
            disk_used_gb=round(disk.used / 1024**3, 1),
            disk_total_gb=round(disk.total / 1024**3, 1),
        )

    # ==================================================================
    # DASHBOARD STATS (extensions beyond the core Protocol)
    # ==================================================================
    def login_trend(self, days: int = 7) -> list[LoginTrendPoint]:
        """Login success/fail counts per day.

        Full audit-log parsing requires Samba event logging. When audit data
        is unavailable we return zero-filled buckets so the dashboard never
        crashes.
        """
        from datetime import timedelta

        today = datetime.now(UTC).date()
        labels = []
        for i in range(days - 1, -1, -1):
            d = today - timedelta(days=i)
            labels.append(d.strftime("%m-%d"))
        return [LoginTrendPoint(date=label, success=0, fail=0) for label in labels]

    def ou_distribution(self) -> list[OuDistributionEntry]:
        """Count users per OU from LDAP."""
        with self._connect() as conn:
            rows = self._search(
                conn,
                self._base(),
                "(&(objectClass=user)(objectCategory=person))",
                ["distinguishedName"],
            )
        counts: dict[str, int] = {}
        for r in rows:
            ou = _parent_ou_name(r["dn"])
            counts[ou] = counts.get(ou, 0) + 1
        return [OuDistributionEntry(ou=k, count=v) for k, v in counts.items()]

    def recent_alerts(self, limit: int = 10) -> list[AlertItem]:
        """Recent security alerts.

        Requires Samba audit log integration. Returns an empty list when
        audit data is unavailable — the dashboard shows "no alerts".
        """
        return []


_: type[DirectoryBackend] = Ldap3Backend  # type: ignore[assignment]
