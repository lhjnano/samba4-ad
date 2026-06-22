"""SPDX-License-Identifier: Apache-2.0

Kerberos SSO (SPNEGO/Negotiate) authentication.

Allows domain-joined machines to authenticate automatically without
entering a password. The browser sends a Kerberos ticket via the
Authorization: Negotiate header.

Prerequisites:
  1. Service principal registered in AD:
     samba-tool spn add HTTP/ad-manager.corp.local dom39-forest01$
  2. Keytab extracted:
     samba-tool domain exportkeytab /etc/krb5.keytab \
         --principal=HTTP/ad-manager.corp.local@CORP.LOCAL
  3. Config:
     KERBEROS_ENABLED=true
     KERBEROS_KEYTAB=/etc/krb5.keytab

Flow:
  1. Browser sends request without auth header
  2. Server responds 401 + WWW-Authenticate: Negotiate
  3. Browser obtains Kerberos ticket from KDC (Samba AD)
  4. Browser resends with Authorization: Negotiate <base64-ticket>
  5. Server validates ticket via gssapi.AcceptContext()
  6. Extracts principal → maps to AD user → issues JWT
"""

from __future__ import annotations

import base64
import logging
from typing import Any

from src.core.config import settings

logger = logging.getLogger("kerberos")


def is_kerberos_enabled() -> bool:
    """Check if Kerberos SSO is enabled and configured."""
    return settings.kerberos_enabled and bool(settings.kerberos_keytab)


def try_negotiate_auth(negotiate_token: str) -> dict[str, Any] | None:
    """Attempt to authenticate a Negotiate (SPNEGO) token.

    Returns user info dict on success, None on failure.
    The returned dict has the same shape as verify_credentials() output.

    This function requires the `gssapi` Python package and a valid keytab.
    If gssapi is not installed or the keytab is invalid, returns None.
    """
    if not is_kerberos_enabled():
        return None

    try:
        import gssapi  # type: ignore[import-not-found]
    except ImportError:
        logger.debug("gssapi not installed — Kerberos SSO unavailable")
        return None

    try:
        # Decode the base64 token from the browser
        token_bytes = base64.b64decode(negotiate_token)

        # Load the service credentials from keytab
        # The SPN must match what was registered in AD
        spn = settings.kerberos_spn or f"HTTP/{settings.ldap_host}"
        name = gssapi.Name(spn, gssapi.NameType.kerberos_principal)
        store = {"keytab": True, "keytab_file": settings.kerberos_keytab}

        # Create security context (server side)
        server_creds = gssapi.Credentials(
            usage="accept",
            store=store,
        )

        ctx = gssapi.SecurityContext(name=name, creds=server_creds, usage="accept")

        # Accept the token from the client
        ctx.step(token_bytes)

        if not ctx.complete:
            logger.debug("Kerberos context not complete — multi-step not supported")
            return None

        # Extract the authenticated principal
        principal = str(ctx.initiator_name)

        # Extract username from principal (user@REALM → user)
        username = principal.split("@")[0] if "@" in principal else principal

        logger.info("Kerberos auth success: %s", principal)

        return {
            "display_name": username,
            "email": None,
            "role": "admin",
            "groups": [],  # Groups would need separate LDAP lookup
        }

    except Exception as e:
        logger.debug("Kerberos auth failed: %s", e)
        return None


def get_www_authenticate_header() -> str:
    """Return the WWW-Authenticate header value for Negotiate."""
    return "Negotiate"
