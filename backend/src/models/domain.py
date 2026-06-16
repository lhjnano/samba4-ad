"""SPDX-License-Identifier: Apache-2.0

Gate 1 — Domain Model: Active Directory schema mapping.

This module is the **single source of truth** for how the AD domain maps to
LDAP object classes, attributes, and ``samba-tool`` CLI commands.

Governance principle (DESIGN-INTEGRATION §1.3):

    "Data First" — LDAP object classes/attributes are derived from Active
    Directory domain requirements. **Never reverse-engineered from preview
    screens.**

The attribute maps below were derived from real AD/Samba4 LDAP semantics, then
validated against the data surfaced by the design previews. They do **not**
define the schema — AD does. They merely document which standard LDAP
attributes back each UI concept.
"""

from __future__ import annotations

from enum import IntFlag, StrEnum

# ============================================================================
# userAccountControl bitmask — the canonical AD account-status encoding
# (defined by Microsoft; Samba 4 honours the same flags).
# ============================================================================


class UserAccountControl(IntFlag):
    """Bit flags of the ``userAccountControl`` LDAP attribute.

    Source: MS-ADTS / Samba 4 ``libds`` — these are domain constants, *not*
    values we invented to fit the UI. The preview status badges
    (active/inactive/locked) are *derived* from these flags in
    :mod:`src.services.user_service`.
    """

    SCRIPT = 0x0001
    ACCOUNTDISABLE = 0x0002
    HOMEDIR_REQUIRED = 0x0008
    LOCKOUT = 0x0010
    PASSWD_NOTREQD = 0x0020
    PASSWD_CANT_CHANGE = 0x0040
    ENCRYPTED_TEXT_PASSWORD_ALLOWED = 0x0080
    NORMAL_ACCOUNT = 0x0200
    INTERDOMAIN_TRUST_ACCOUNT = 0x0800
    WORKSTATION_TRUST_ACCOUNT = 0x1000
    SERVER_TRUST_ACCOUNT = 0x2000
    DONT_EXPIRE_PASSWD = 0x10000
    MNS_LOGON_ACCOUNT = 0x20000
    SMARTCARD_REQUIRED = 0x40000
    TRUSTED_FOR_DELEGATION = 0x80000
    NOT_DELEGATED = 0x100000
    USE_DES_KEY_ONLY = 0x200000
    DONT_REQUIRE_PREAUTH = 0x400000
    PASSWORD_EXPIRED = 0x800000
    TRUSTED_TO_AUTHENTICATE_FOR_DELEGATION = 0x1000000

    # Common composite values seen in real domains
    ENABLED_NORMAL = NORMAL_ACCOUNT | DONT_EXPIRE_PASSWD
    DISABLED_NORMAL = NORMAL_ACCOUNT | ACCOUNTDISABLE | DONT_EXPIRE_PASSWD


class AccountStatus(StrEnum):
    """Derived UI status (computed from :class:`UserAccountControl`)."""

    ACTIVE = "active"
    INACTIVE = "inactive"  # disabled
    LOCKED = "locked"


class ComputerStatus(StrEnum):
    """Derived computer status (computed from lastLogon + UAC)."""

    ACTIVE = "active"  # logged in within 30 days
    INACTIVE = "inactive"  # disabled account
    STALE = "stale"  # no login > 90 days


class GroupTypeFlag(IntFlag):
    """``groupType`` LDAP attribute bit flags (MS-ADTS).

    Bits ``0x80000000`` (security) vs ``0x00000000`` (distribution), combined
    with scope ``-1/2/4`` (universal/global/domain-local). Negative values use
    two's-complement 32-bit ints in LDAP.
    """

    SECURITY_ENABLED = 0x80000000
    # Scope (lower nibble)
    SCOPE_DOMAIN_LOCAL = 0x00000004
    SCOPE_GLOBAL = 0x00000002
    SCOPE_UNIVERSAL = 0x00000008

    BUILTIN_MASK = 0x00000001  # internal helper — not a real flag


class GroupCategory(StrEnum):
    """Derived group category (security vs distribution)."""

    SECURITY = "security"
    DISTRIBUTION = "distribution"


class GroupScope(StrEnum):
    """Derived group scope."""

    DOMAIN_LOCAL = "domain"
    GLOBAL = "global"
    UNIVERSAL = "universal"


class GpoLinkMode(StrEnum):
    """GPO link enforcement mode parsed from the ``gPLink`` attribute."""

    INHERITED = "inherited"  # not enforced
    ENFORCED = "enforced"


class GpoStatus(StrEnum):
    """GPO enablement status."""

    ENABLED = "enabled"
    DISABLED = "disabled"


# ============================================================================
# LDAP object classes — used to scope search filters per resource.
# ============================================================================

OBJECT_CLASS_USER = "user"
OBJECT_CLASS_GROUP = "group"
OBJECT_CLASS_COMPUTER = "computer"
OBJECT_CLASS_OU = "organizationalUnit"
# GPOs use a separate container under CN=Policies,CN=System with the LDAP
# object class "groupPolicyContainer".

# ----------------------------------------------------------------------------
# LDAP attribute maps per resource.
#
# Mapping: key  -> canonical API field name (snake_case, returned to client)
#          value-> LDAP attribute name(s) to read (tuple means concatenate/parse)
# ----------------------------------------------------------------------------

USER_ATTRIBUTES: dict[str, tuple[str, ...]] = {
    "username": ("sAMAccountName",),
    "display_name": ("displayName", "cn"),
    "first_name": ("givenName",),
    "last_name": ("sn",),
    "email": ("mail",),
    "phone": ("telephoneNumber",),
    "dn": ("distinguishedName",),
    "user_account_control": ("userAccountControl",),
    "when_created": ("whenCreated",),
    "when_changed": ("whenChanged",),
    "pwd_last_set": ("pwdLastSet",),
    "last_logon": ("lastLogon", "lastLogonTimestamp"),
    "object_sid": ("objectSid",),
    "member_of": ("memberOf",),
    "object_class": ("objectClass",),
}

GROUP_ATTRIBUTES: dict[str, tuple[str, ...]] = {
    "name": ("cn", "name"),
    "dn": ("distinguishedName",),
    "group_type": ("groupType",),
    "description": ("description",),
    "member": ("member",),
    "managed_by": ("managedBy",),
    "when_created": ("whenCreated",),
    "when_changed": ("whenChanged",),
    "object_sid": ("objectSid",),
}

OU_ATTRIBUTES: dict[str, tuple[str, ...]] = {
    "name": ("ou", "name"),
    "dn": ("distinguishedName",),
    "description": ("description",),
    "managed_by": ("managedBy",),
    "gp_options": ("gPOptions",),
    "gp_link": ("gPLink",),
    "when_created": ("whenCreated",),
    "when_changed": ("whenChanged",),
}

COMPUTER_ATTRIBUTES: dict[str, tuple[str, ...]] = {
    "hostname": ("cn", "name"),
    "dns_hostname": ("dNSHostName",),
    "operating_system": ("operatingSystem",),
    "operating_system_version": ("operatingSystemVersion",),
    "dn": ("distinguishedName",),
    "user_account_control": ("userAccountControl",),
    "when_created": ("whenCreated",),
    "last_logon": ("lastLogon", "lastLogonTimestamp"),
    "object_sid": ("objectSid",),
}

GPO_ATTRIBUTES: dict[str, tuple[str, ...]] = {
    "display_name": ("displayName",),
    "name": ("cn", "name"),  # GUID form, e.g. {31B2F340-...}
    "dn": ("distinguishedName",),
    "gpc_machine_scope": ("gPCMachineScope",),
    "version_number": ("versionNumber",),
    "flags": ("flags",),
    "when_created": ("whenCreated",),
    "when_changed": ("whenChanged",),
    "wmi_filter": ("gPCWQLFilter",),
}

# ============================================================================
# samba-tool CLI command mapping.
#
# Documents the Phase 1 wrapper surface. Each entry maps an *operation* to the
# underlying ``samba-tool`` subcommand so CLI scripts (Phase 1) and the
# service layer share one definition of "what command does what".
# ============================================================================

SAMBA_TOOL_COMMANDS: dict[str, str] = {
    # --- user ---
    "user.create": "samba-tool user create",
    "user.delete": "samba-tool user delete",
    "user.disable": "samba-tool user disable",
    "user.enable": "samba-tool user enable",
    "user.setpassword": "samba-tool user setpassword",
    "user.setexpiry": "samba-tool user setexpiry",
    "user.move": "samba-tool user move",
    "user.list": "samba-tool user list",
    # --- group ---
    "group.create": "samba-tool group add",
    "group.delete": "samba-tool group delete",
    "group.addmember": "samba-tool group addmembers",
    "group.delmember": "samba-tool group removemembers",
    "group.list": "samba-tool group list",
    "group.listmembers": "samba-tool group listmembers",
    # --- ou ---
    "ou.create": "samba-tool ou create",
    "ou.delete": "samba-tool ou delete",
    "ou.list": "samba-tool ou list",
    # --- computer ---
    "computer.create": "samba-tool computer create",
    "computer.delete": "samba-tool computer delete",
    # --- domain ---
    "domain.info": "samba-tool domain info",
    "domain.passwordsettings": "samba-tool domain passwordsettings set",
    "domain.levelset": "samba-tool domain functional-level set",
    # --- gpo ---
    "gpo.create": "samba-tool gpo create",
    "gpo.delete": "samba-tool gpo delete",
    "gpo.link": "samba-tool gpo link",
    "gpo.unlink": "samba-tool gpo unlink",
    "gpo.list": "samba-tool gpo list",
    "gpo.backup": "samba-tool gpo backup",
}


# ============================================================================
# Service/protocol metadata (used by the health & stats endpoints).
# ============================================================================

DOMAIN_SERVICES: tuple[dict[str, object], ...] = (
    {"name": "LDAP", "port": 389, "kind": "ldap"},
    {"name": "Kerberos", "port": 88, "kind": "kerberos"},
    {"name": "DNS", "port": 53, "kind": "dns"},
    {"name": "SMB/CIFS", "port": 445, "kind": "smb"},
    {"name": "Replication", "port": 135, "kind": "replication"},
)
