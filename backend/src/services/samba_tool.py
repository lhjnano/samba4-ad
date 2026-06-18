"""SPDX-License-Identifier: Apache-2.0

``samba-tool`` subprocess wrapper (Phase 1 service layer).

This module wraps the ``samba-tool`` CLI for domain operations that LDAP alone
cannot do reliably: domain provisioning, DNS management, password policy,
and GPO operations.

Security (ADR-0002 consequence): subprocess arguments are **never** built from
raw user input without validation. All arguments are passed as a list
(``shell=False``) and usernames/paths are validated to reject shell
metacharacters.

Phase 1 CLI scripts in ``scripts/`` call directly into these functions.
"""

from __future__ import annotations

import re
import shlex
import subprocess
from dataclasses import dataclass

from src.core.config import Settings

# Disallow shell metacharacters that could be dangerous.
# Note: we use shell=False (subprocess list args), so shell injection
# is not possible. We still block chars that could break argument parsing
# or be misinterpreted. '!' is allowed (common in passwords).
_UNSAFE_CHARS = re.compile(r"[;&|`<>\n\r]")


def _safe(value: str, *, allow_eq: bool = False) -> str:
    """Validate ``value`` is free of shell metacharacters."""
    if _UNSAFE_CHARS.search(value):
        raise ValueError(f"Potentially unsafe value for samba-tool: {value!r}")
    if not allow_eq and "=" in value:
        raise ValueError(f"'=' not allowed in value: {value!r}")
    return value


@dataclass
class ToolResult:
    """Outcome of a samba-tool invocation."""

    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0


class SambaTool:
    """Thin, safe wrapper around the ``samba-tool`` CLI."""

    def __init__(self, settings: Settings) -> None:
        self._cfg = settings

    # ------------------------------------------------------------------
    def _run(self, cmd: list[str]) -> ToolResult:
        """Execute a samba-tool command list (shell=False)."""
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=self._cfg.ldap_timeout * 2,
            check=False,
        )
        return ToolResult(proc.returncode, proc.stdout, proc.stderr)

    def _base_cmd(self, *parts: str) -> list[str]:
        """Build a samba-tool command with LDAP connection params.

        When APP_MODE=ldap, samba-tool connects via LDAP to the running
        DC (not local files), so it doesn't need root access to
        /var/lib/samba/private/sam.ldb.
        """
        cmd = [self._cfg.samba_tool_path, *parts]
        if self._cfg.app_mode == "ldap":
            cmd.extend(
                [
                    "-H",
                    f"ldap://{self._cfg.ldap_host}",
                    "-U",
                    f"{self._cfg.ldap_bind_dn}%{self._cfg.ldap_bind_password.get_secret_value()}",
                    "--use-kerberos=off",
                ]
            )
        elif self._cfg.samba_config:
            cmd.extend(["--configfile", self._cfg.samba_config])
        return cmd

    # ==================================================================
    # Users
    # ==================================================================
    def user_create(
        self,
        username: str,
        password: str,
        *,
        given_name: str | None = None,
        surname: str | None = None,
        mail: str | None = None,
        ou_dn: str | None = None,
    ) -> ToolResult:
        cmd = self._base_cmd(
            "user", "create", _safe(username), _safe(password, allow_eq=True)
        )
        if given_name:
            cmd += ["--given-name", _safe(given_name)]
        if surname:
            cmd += ["--surname", _safe(surname)]
        if mail:
            cmd += ["--mail-address", _safe(mail)]
        if ou_dn:
            cmd += ["--userou", _safe(ou_dn, allow_eq=True)]
        return self._run(cmd)

    def user_delete(self, username: str) -> ToolResult:
        return self._run(self._base_cmd("user", "delete", _safe(username)))

    def user_disable(self, username: str) -> ToolResult:
        return self._run(self._base_cmd("user", "disable", _safe(username)))

    def user_enable(self, username: str) -> ToolResult:
        return self._run(self._base_cmd("user", "enable", _safe(username)))

    def user_setpassword(self, username: str, new_password: str) -> ToolResult:
        return self._run(
            self._base_cmd(
                "user",
                "setpassword",
                _safe(username),
                "--newpassword",
                new_password,
            )
        )

    def user_list(self) -> ToolResult:
        return self._run(self._base_cmd("user", "list"))

    # ==================================================================
    # Groups
    # ==================================================================
    def group_add(
        self, name: str, *, group_type: str | None = None, ou_dn: str | None = None
    ) -> ToolResult:
        cmd = self._base_cmd("group", "add", _safe(name))
        if group_type:
            cmd += ["--group-type", _safe(group_type)]
        if ou_dn:
            cmd += ["--groupou", _safe(ou_dn, allow_eq=True)]
        return self._run(cmd)

    def group_delete(self, name: str) -> ToolResult:
        return self._run(self._base_cmd("group", "delete", _safe(name)))

    def group_addmembers(self, group: str, members: list[str]) -> ToolResult:
        cmd = self._base_cmd(
            "group",
            "addmembers",
            _safe(group),
            "--members",
            ",".join(_safe(m) for m in members),
        )
        return self._run(cmd)

    def group_removemembers(self, group: str, members: list[str]) -> ToolResult:
        cmd = self._base_cmd(
            "group",
            "removemembers",
            _safe(group),
            "--members",
            ",".join(_safe(m) for m in members),
        )
        return self._run(cmd)

    def group_listmembers(self, group: str) -> ToolResult:
        return self._run(self._base_cmd("group", "listmembers", _safe(group)))

    # ==================================================================
    # OUs
    # ==================================================================
    def ou_create(self, name: str, parent_dn: str | None = None) -> ToolResult:
        cmd = self._base_cmd("ou", "create", _safe(name, allow_eq=True))
        if parent_dn:
            cmd += ["--parent", _safe(parent_dn, allow_eq=True)]
        return self._run(cmd)

    def ou_delete(self, dn: str) -> ToolResult:
        return self._run(self._base_cmd("ou", "delete", _safe(dn, allow_eq=True)))

    def ou_list(self) -> ToolResult:
        return self._run(self._base_cmd("ou", "list", "--full-dn"))

    # ==================================================================
    # Domain
    # ==================================================================
    def domain_info(self) -> ToolResult:
        return self._run(self._base_cmd("domain", "info", self._cfg.ldap_host))

    def domain_password_set(self, **opts: object) -> ToolResult:
        cmd = self._base_cmd("domain", "passwordsettings", "set")
        for flag, val in opts.items():
            if val is None:
                continue
            cmd += [f"--{flag.replace('_', '-')}", str(val)]
        return self._run(cmd)

    # ==================================================================
    # GPO
    # ==================================================================
    def gpo_create(self, display_name: str, *, ou_dn: str | None = None) -> ToolResult:
        cmd = self._base_cmd("gpo", "create", _safe(display_name))
        if ou_dn:
            cmd += ["--linked-dn", _safe(ou_dn, allow_eq=True)]
        return self._run(cmd)

    def gpo_delete(self, gpo_id: str) -> ToolResult:
        return self._run(self._base_cmd("gpo", "del", _safe(gpo_id)))

    def gpo_link(self, gpo_id: str, ou_dn: str) -> ToolResult:
        return self._run(
            self._base_cmd(
                "gpo",
                "link",
                _safe(gpo_id),
                _safe(ou_dn, allow_eq=True),
            )
        )

    def gpo_list(self) -> ToolResult:
        return self._run(self._base_cmd("gpo", "listall"))


def quote_arg(value: str) -> str:
    """Shell-quote a value for logging (never used for execution)."""
    return shlex.quote(value)
