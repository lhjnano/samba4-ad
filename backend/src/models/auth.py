"""SPDX-License-Identifier: Apache-2.0

Auth-related Pydantic models.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., examples=["admin", "CORP\\Administrator"])
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int = Field(..., description="Token lifetime in seconds")
    user: UserInfo


class UserInfo(BaseModel):
    username: str
    display_name: str
    email: str | None = None
    role: str = "admin"
    groups: list[str] = Field(default_factory=list)


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int
