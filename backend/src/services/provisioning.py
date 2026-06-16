"""SPDX-License-Identifier: Apache-2.0

Samba 4 AD DC domain provisioning service.

Handles first-run domain setup via ``samba-tool domain provision``.
"""

from __future__ import annotations

import os
import re
import subprocess

from src.core.config import Settings
from src.models.setup import (
    ProvisionRequest,
    ProvisionResult,
    ProvisionStepStatus,
    SetupStatus,
)

_UNSAFE_CHARS = re.compile(r"[;&|`$<>!\n\r]")


def _validate_input(value: str, field_name: str) -> str:
    """Reject shell metacharacters in user-supplied values."""
    if _UNSAFE_CHARS.search(value):
        raise ValueError(f"Unsafe characters in {field_name}: {value!r}")
    return value


class ProvisioningService:
    """Manages Samba 4 AD DC domain provisioning."""

    def __init__(self, settings: Settings) -> None:
        self._cfg = settings
        self._smb_conf = settings.samba_config or "/etc/samba/smb.conf"

    # ------------------------------------------------------------------
    # Status detection
    # ------------------------------------------------------------------
    def get_status(self) -> SetupStatus:
        """Check whether the domain is already provisioned."""
        provisioned = self._is_provisioned()
        if not provisioned:
            return SetupStatus(provisioned=False)

        realm = self._read_smb_conf_value("realm")
        domain = self._read_smb_conf_value("workgroup") or self._read_smb_conf_value(
            "netbios name"
        )

        return SetupStatus(
            provisioned=True,
            realm=realm,
            domain_name=domain,
            smb_conf_path=self._smb_conf,
            samba_running=self._is_samba_running(),
            ldap_reachable=self._is_ldap_reachable(),
        )

    # ------------------------------------------------------------------
    # Domain provisioning
    # ------------------------------------------------------------------
    def provision(self, req: ProvisionRequest) -> ProvisionResult:
        """Run ``samba-tool domain provision`` to create a new AD domain."""
        # Validate all user inputs
        realm = _validate_input(req.realm.upper(), "realm")
        domain = _validate_input(req.domain_name.upper(), "domain_name")
        dns_fwd = _validate_input(req.dns_forwarder, "dns_forwarder")

        steps = [
            ProvisionStepStatus(
                name="check_prereq", label="Checking prerequisites", done=True
            ),
            ProvisionStepStatus(
                name="provision", label="Provisioning domain", in_progress=True
            ),
            ProvisionStepStatus(name="configure_dns", label="Configuring DNS"),
            ProvisionStepStatus(name="start_services", label="Starting services"),
            ProvisionStepStatus(name="verify", label="Verifying domain"),
        ]

        log_lines: list[str] = []

        # Guard: already provisioned
        if self._is_provisioned():
            return ProvisionResult(
                success=False,
                realm=realm,
                domain_name=domain,
                steps=steps,
                error="Domain is already provisioned. Re-provisioning requires "
                "manual cleanup (remove smb.conf and stop samba).",
            )

        # Step 1: Run samba-tool domain provision
        cmd = [
            self._cfg.samba_tool_path,
            "domain",
            "provision",
            "--use-rfc2307",
            f"--realm={realm}",
            f"--domain={domain}",
            f"--adminpass={req.admin_password}",
            "--server-role=dc",
            f"--dns-backend={req.dns_backend}",
            f"--option=dns forwarder = {dns_fwd}",
        ]

        log_lines.append(f"$ {' '.join(cmd[:6])} ... (adminpass hidden)")

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
        except FileNotFoundError:
            steps[1].in_progress = False
            steps[1].error = "samba-tool not found. Install samba-ad-dc package."
            return ProvisionResult(
                success=False,
                realm=realm,
                domain_name=domain,
                steps=steps,
                log="\n".join(log_lines),
                error="samba-tool not found. Install samba-ad-dc package.",
            )
        except subprocess.TimeoutExpired:
            steps[1].in_progress = False
            steps[1].error = "Provisioning timed out after 120 seconds."
            return ProvisionResult(
                success=False,
                realm=realm,
                domain_name=domain,
                steps=steps,
                log="\n".join(log_lines),
                error="Provisioning timed out after 120 seconds.",
            )

        log_lines.append(proc.stdout)
        if proc.stderr:
            log_lines.append(f"[stderr] {proc.stderr}")

        if proc.returncode != 0:
            steps[1].in_progress = False
            steps[1].error = proc.stderr or proc.stdout or "Unknown error"
            return ProvisionResult(
                success=False,
                realm=realm,
                domain_name=domain,
                steps=steps,
                log="\n".join(log_lines),
                error=f"samba-tool domain provision failed (exit {proc.returncode})",
            )

        # Provision succeeded
        steps[1].done = True
        steps[1].in_progress = False
        steps[2].in_progress = True
        log_lines.append("[OK] Domain provisioned successfully")

        # Step 2: DNS configuration (already done by provision, mark complete)
        steps[2].done = True
        steps[2].in_progress = False
        steps[3].in_progress = True
        log_lines.append("[OK] DNS configured (SAMBA_INTERNAL backend)")

        # Step 3: Start samba service
        start_ok = self._start_samba()
        log_lines.append(
            f"{'[OK]' if start_ok else '[WARN]'} Samba service {'started' if start_ok else 'start attempted'}"
        )
        steps[3].done = True
        steps[3].in_progress = False
        steps[4].in_progress = True

        # Step 4: Verify domain
        ldap_ok = self._is_ldap_reachable()
        steps[4].done = True
        steps[4].in_progress = False
        log_lines.append(
            f"{'[OK]' if ldap_ok else '[WARN]'} LDAP {'reachable' if ldap_ok else 'not yet reachable (service may still be starting)'}"
        )

        return ProvisionResult(
            success=True,
            realm=realm,
            domain_name=domain,
            steps=steps,
            log="\n".join(log_lines),
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------
    def _is_provisioned(self) -> bool:
        """Check if smb.conf exists and has domain controller role."""
        if not os.path.isfile(self._smb_conf):
            return False
        try:
            with open(self._smb_conf, encoding="utf-8") as f:
                content = f.read()
            return "server role" in content and "dc" in content.lower()
        except OSError:
            return False

    def _read_smb_conf_value(self, key: str) -> str | None:
        """Read a value from smb.conf [global] section."""
        if not os.path.isfile(self._smb_conf):
            return None
        try:
            with open(self._smb_conf, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.lower().startswith(f"{key}"):
                        parts = line.split("=", 1)
                        if len(parts) == 2:
                            return parts[1].strip()
        except OSError:
            pass
        return None

    def _is_samba_running(self) -> bool:
        """Check if the samba process is running."""
        try:
            result = subprocess.run(
                ["pgrep", "-x", "samba"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    def _is_ldap_reachable(self) -> bool:
        """Check if LDAP port 389 is open on localhost."""
        import socket

        try:
            with socket.create_connection(("127.0.0.1", 389), timeout=2):
                return True
        except OSError:
            return False

    def _start_samba(self) -> bool:
        """Start the samba service. Tries systemd, then direct binary."""
        # Try systemd first
        try:
            result = subprocess.run(
                ["systemctl", "start", "samba-ad-dc"],
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
            if result.returncode == 0:
                return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

        # Fall back to direct binary
        try:
            subprocess.Popen(
                ["samba", "-D"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return True
        except FileNotFoundError:
            return False
