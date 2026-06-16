"""SPDX-License-Identifier: Apache-2.0

Application configuration loaded from environment variables.

Environment selection (``APP_MODE``):

* ``mock``  — in-memory directory for local development & T0 unit tests (default)
* ``ldap``  — connect to a real Samba 4 AD DC via ldap3 + samba-tool

Secrets are **never** hard-coded. They are read from environment variables or a
git-excluded ``.env`` file (see ``.env.example``).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralised application settings.

    All fields default to mock/local values so the app boots with zero config
    for development. Production values are injected via environment variables
    or a ``.env`` file.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Runtime ---
    app_name: str = "Samba 4 AD Manager"
    app_version: str = "0.1.0"
    app_mode: Literal["mock", "ldap"] = "mock"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])

    # --- LDAP connection (used when app_mode == "ldap") ---
    ldap_host: str = "127.0.0.1"
    ldap_port: int = 389
    ldap_use_ssl: bool = False
    ldap_bind_dn: str = ""
    ldap_bind_password: SecretStr = SecretStr("")
    ldap_search_base: str = ""
    ldap_timeout: float = 30.0
    ldap_page_size: int = 1000

    # --- samba-tool (subprocess wrapper) ---
    samba_tool_path: str = "samba-tool"
    # Path to smb.conf — required by most samba-tool domain operations.
    samba_config: str = "/etc/samba/smb.conf"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, v: object) -> object:
        if isinstance(v, str) and not v.startswith("["):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance."""
    return Settings()


settings = get_settings()
