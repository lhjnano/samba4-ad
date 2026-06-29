"""SPDX-License-Identifier: Apache-2.0

API Key management — service-to-service authentication.

API keys allow external systems to authenticate without JWT.
Keys are stored as bcrypt hashes in SQLite.

Usage:
  Authorization: Api-Key sk-ad-manager-xxxxx...
"""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.core.config import settings


def _db_path() -> Path:
    p = Path(settings.audit_log_path).parent / "apikeys.db"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_db() -> None:
    conn = _get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            key_hash TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            scopes TEXT NOT NULL DEFAULT '[]',
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            last_used_at TEXT,
            revoked INTEGER DEFAULT 0,
            usage_count INTEGER DEFAULT 0
        )
        """
    )
    conn.commit()
    conn.close()


def _hash_key(raw_key: str) -> str:
    """Hash an API key using SHA-256 (fast lookup, not a password)."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


def create_key(
    name: str,
    created_by: str,
    scopes: list[str] | None = None,
    expires_at: str | None = None,
) -> tuple[str, str]:
    """Create a new API key.

    Returns (key_id, raw_key). The raw_key is only returned once.
    """
    _init_db()
    raw_key = f"sk-ad-manager-{secrets.token_urlsafe(32)}"
    key_id = f"key_{secrets.token_hex(8)}"
    key_hash = _hash_key(raw_key)

    conn = _get_db()
    conn.execute(
        """
        INSERT INTO api_keys (id, key_hash, name, scopes, created_by, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            key_id,
            key_hash,
            name,
            str(scopes or []),
            created_by,
            datetime.now(UTC).isoformat(),
            expires_at,
        ),
    )
    conn.commit()
    conn.close()
    return key_id, raw_key


def list_keys() -> list[dict[str, Any]]:
    """List all API keys (without the raw key)."""
    _init_db()
    conn = _get_db()
    rows = conn.execute(
        "SELECT id, name, scopes, created_by, created_at, expires_at, last_used_at, revoked, usage_count FROM api_keys ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    import json

    return [
        {
            "id": r["id"],
            "name": r["name"],
            "scopes": json.loads(r["scopes"]),
            "created_by": r["created_by"],
            "created_at": r["created_at"],
            "expires_at": r["expires_at"],
            "last_used_at": r["last_used_at"],
            "revoked": bool(r["revoked"]),
            "usage_count": r["usage_count"],
        }
        for r in rows
    ]


def revoke_key(key_id: str) -> bool:
    """Revoke an API key."""
    _init_db()
    conn = _get_db()
    cursor = conn.execute("UPDATE api_keys SET revoked = 1 WHERE id = ?", (key_id,))
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def verify_api_key(raw_key: str) -> dict[str, Any] | None:
    """Verify an API key and return key info.

    Returns None if invalid, revoked, or expired.
    Updates last_used_at and usage_count.
    """
    if not raw_key.startswith("sk-ad-manager-"):
        return None

    _init_db()
    key_hash = _hash_key(raw_key)
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM api_keys WHERE key_hash = ?", (key_hash,)
    ).fetchone()

    if row is None or row["revoked"]:
        conn.close()
        return None

    # Check expiry
    if row["expires_at"]:
        try:
            exp = datetime.fromisoformat(row["expires_at"])
            if datetime.now(UTC) > exp:
                conn.close()
                return None
        except ValueError:
            pass

    # Update usage
    now = datetime.now(UTC).isoformat()
    conn.execute(
        "UPDATE api_keys SET last_used_at = ?, usage_count = usage_count + 1 WHERE id = ?",
        (now, row["id"]),
    )
    conn.commit()

    import json

    result = {
        "id": row["id"],
        "name": row["name"],
        "scopes": json.loads(row["scopes"]),
        "created_by": row["created_by"],
    }
    conn.close()
    return result


def delete_key(key_id: str) -> bool:
    """Permanently delete an API key."""
    _init_db()
    conn = _get_db()
    cursor = conn.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
    conn.commit()
    conn.close()
    return cursor.rowcount > 0
