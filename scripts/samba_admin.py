#!/usr/bin/env python3
"""SPDX-License-Identifier: Apache-2.0

Samba 4 AD Manager — Phase 1 CLI (samba-tool wrappers).

Provides bulk operations that wrap ``samba-tool`` via the backend service layer
(:mod:`src.services.samba_tool`). These CLI tools are independently useful and
double as operational runbooks (ADR-0003).

Examples
--------
::

    # Create a batch of users in the 개발팀 OU
    samba-admin users bulk-create --file users.csv --ou "OU=개발팀,DC=TEST,DC=LOCAL"

    # Disable a list of accounts
    samba-admin users disable alice bob charlie

    # Create a group and add members
    samba-admin groups create vpn-users
    samba-admin groups add-members vpn-users --members alice,bob

    # List all OUs
    samba-admin ou list
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

# Allow importing the backend package when run as a standalone script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from src.core.config import Settings
from src.services.samba_tool import SambaTool, ToolResult


def _settings() -> Settings:
    return Settings(app_mode="ldap")


def _tool() -> SambaTool:
    return SambaTool(_settings())


def _report(res: ToolResult, ok_msg: str) -> int:
    if res.ok:
        print(ok_msg)
        return 0
    print(
        f"ERROR (exit {res.returncode}): {res.stderr.strip() or res.stdout.strip()}",
        file=sys.stderr,
    )
    return res.returncode


# ---------------------------------------------------------------------------
# users
# ---------------------------------------------------------------------------
def cmd_users(args: argparse.Namespace) -> int:
    tool = _tool()
    action = args.action

    if action == "bulk-create":
        ou = args.ou
        created, failed = 0, 0
        with Path(args.file).open(newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                username = (row.get("username") or "").strip()
                password = (row.get("password") or "").strip()
                if not username or not password:
                    continue
                res = tool.user_create(
                    username,
                    password,
                    given_name=row.get("first_name"),
                    surname=row.get("last_name"),
                    mail=row.get("email"),
                    ou_dn=ou,
                )
                if res.ok:
                    created += 1
                else:
                    failed += 1
                    print(f"  ✗ {username}: {res.stderr.strip()}", file=sys.stderr)
        print(f"Created {created} user(s); {failed} failed.")
        return 0 if failed == 0 else 1

    if action == "disable":
        rc = 0
        for u in args.usernames:
            rc |= _report(tool.user_disable(u), f"✓ Disabled {u}")
        return rc

    if action == "enable":
        rc = 0
        for u in args.usernames:
            rc |= _report(tool.user_enable(u), f"✓ Enabled {u}")
        return rc

    if action == "set-password":
        return _report(
            tool.user_setpassword(args.username, args.password),
            f"✓ Password set for {args.username}",
        )

    if action == "list":
        return _print_stdout(tool.user_list())

    return 1


def _print_stdout(res: ToolResult) -> int:
    if res.stdout:
        print(res.stdout, end="")
    return 0 if res.ok else res.returncode


# ---------------------------------------------------------------------------
# groups
# ---------------------------------------------------------------------------
def cmd_groups(args: argparse.Namespace) -> int:
    tool = _tool()
    if args.action == "create":
        return _report(
            tool.group_add(args.name, group_type=args.type, ou_dn=args.ou),
            f"✓ Created group {args.name}",
        )
    if args.action == "delete":
        return _report(tool.group_delete(args.name), f"✓ Deleted group {args.name}")
    if args.action == "add-members":
        members = [m.strip() for m in args.members.split(",") if m.strip()]
        return _report(
            tool.group_addmembers(args.name, members),
            f"✓ Added {len(members)} member(s) to {args.name}",
        )
    if args.action == "list-members":
        return _print_stdout(tool.group_listmembers(args.name))
    return 1


# ---------------------------------------------------------------------------
# ou
# ---------------------------------------------------------------------------
def cmd_ou(args: argparse.Namespace) -> int:
    tool = _tool()
    if args.action == "create":
        return _report(
            tool.ou_create(args.name, parent_dn=args.parent),
            f"✓ Created OU {args.name}",
        )
    if args.action == "delete":
        return _report(tool.ou_delete(args.dn), f"✓ Deleted OU {args.dn}")
    if args.action == "list":
        return _print_stdout(tool.ou_list())
    return 1


# ---------------------------------------------------------------------------
# argparse wiring
# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="samba-admin",
        description="Samba 4 AD Manager — Phase 1 CLI (samba-tool wrappers)",
    )
    sub = p.add_subparsers(dest="resource", required=True)

    # users
    up = sub.add_parser("users", help="User operations")
    ua = up.add_subparsers(dest="action", required=True)
    bc = ua.add_parser("bulk-create", help="Create users from a CSV file")
    bc.add_argument(
        "--file",
        required=True,
        help="CSV with columns: username,password,first_name,last_name,email",
    )
    bc.add_argument("--ou", default=None, help="Parent OU DN")
    ud = ua.add_parser("disable", help="Disable one or more users")
    ud.add_argument("usernames", nargs="+")
    ue = ua.add_parser("enable", help="Enable one or more users")
    ue.add_argument("usernames", nargs="+")
    usp = ua.add_parser("set-password", help="Set a user's password")
    usp.add_argument("username")
    usp.add_argument("password")
    ua.add_parser("list", help="List all users")
    up.set_defaults(func=cmd_users)

    # groups
    gp = sub.add_parser("groups", help="Group operations")
    ga = gp.add_subparsers(dest="action", required=True)
    gc = ga.add_parser("create", help="Create a group")
    gc.add_argument("name")
    gc.add_argument("--type", default=None, help="Group type")
    gc.add_argument("--ou", default=None, help="Parent OU DN")
    ga.add_parser("delete").add_argument("name")
    gam = ga.add_parser("add-members", help="Add members to a group")
    gam.add_argument("name")
    gam.add_argument("--members", required=True, help="Comma-separated member names")
    glm = ga.add_parser("list-members", help="List members of a group")
    glm.add_argument("name")
    gp.set_defaults(func=cmd_groups)

    # ou
    op = sub.add_parser("ou", help="Organizational Unit operations")
    oa = op.add_subparsers(dest="action", required=True)
    oc = oa.add_parser("create", help="Create an OU")
    oc.add_argument("name")
    oc.add_argument("--parent", default=None, help="Parent OU DN")
    od = oa.add_parser("delete", help="Delete an OU")
    od.add_argument("dn")
    oa.add_parser("list", help="List all OUs")
    op.set_defaults(func=cmd_ou)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
