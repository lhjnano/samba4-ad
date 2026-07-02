"""SPDX-License-Identifier: Apache-2.0

MFA (Multi-Factor Authentication) service using TOTP.

Implements RFC 6238 Time-based One-Time Password with Google
Authenticator compatibility.

Flow:
  1. User logs in with username/password → LDAP/system admin auth
  2. Server checks if MFA secret exists for user
  3. If exists → return mfa_required=true (don't issue JWT yet)
  4. User submits 6-digit TOTP code
  5. Server verifies with pyotp → issue JWT with mfa_verified claim

Storage:
  - Local system admin: secret stored in SQLite (future)
  - AD users: secret stored in LDAP attribute (extensionAttribute1)
  - For now: secrets stored in a local JSON file for simplicity
"""

from __future__ import annotations

import contextlib
import json
from pathlib import Path

import pyotp

from src.core.config import settings


def _store_path() -> Path:
    """Return the path to the MFA secrets store."""
    p = Path(settings.audit_log_path).parent / "mfa_secrets.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _load_store() -> dict[str, str]:
    """Load the MFA secrets store (username → base32 secret)."""
    p = _store_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_store(data: dict[str, str]) -> None:
    """Save the MFA secrets store."""
    p = _store_path()
    with contextlib.suppress(OSError):
        p.write_text(json.dumps(data, indent=2), encoding="utf-8")


def generate_secret() -> str:
    """Generate a new random TOTP secret (base32)."""
    return pyotp.random_base32()


def get_provisioning_uri(secret: str, username: str) -> str:
    """Generate otpauth:// URI for QR code scanning."""
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=username,
        issuer_name=settings.mfa_issuer,
    )


def is_enrolled(username: str) -> bool:
    """Check if a user has MFA enrolled."""
    store = _load_store()
    return username.lower() in {k.lower() for k in store}


def verify_code(username: str, code: str) -> bool:
    """Verify a 6-digit TOTP code for the given user.

    Returns True if the code is valid, False otherwise.
    Also accepts 8-character backup codes (future feature).
    """
    store = _load_store()
    # Case-insensitive lookup
    secret = None
    for k, v in store.items():
        if k.lower() == username.lower():
            secret = v
            break

    if not secret:
        return False

    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def enroll(username: str, secret: str, verify_code_str: str) -> bool:
    """Enroll a user with a TOTP secret after verifying first code.

    Returns True if enrollment succeeded (code verified + saved).
    """
    totp = pyotp.TOTP(secret)
    if not totp.verify(verify_code_str, valid_window=1):
        return False

    store = _load_store()

    # Remove old entry with different case
    for k in list(store.keys()):
        if k.lower() == username.lower():
            del store[k]

    store[username] = secret
    _save_store(store)
    return True


def unenroll(username: str) -> bool:
    """Remove MFA enrollment for a user."""
    store = _load_store()
    removed = False
    for k in list(store.keys()):
        if k.lower() == username.lower():
            del store[k]
            removed = True
    if removed:
        _save_store(store)
    return removed


def should_require_mfa(username: str) -> bool:
    """Determine if MFA should be required for this user.

    Logic:
    1. If MFA is required globally → True
    2. If user has enrolled (self-service) → True
    3. Otherwise → False
    """
    if settings.mfa_required:
        return True

    return is_enrolled(username)
