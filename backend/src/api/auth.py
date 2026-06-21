"""SPDX-License-Identifier: Apache-2.0

Authentication endpoints: login, refresh, current-user info.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from src.core.audit import get_audit
from src.core.auth import (
    create_access_token,
    get_current_user,
    verify_credentials,
)
from src.models.auth import LoginRequest, RefreshResponse, TokenResponse, UserInfo

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login", response_model=TokenResponse, summary="Authenticate and receive a JWT"
)
def login(body: LoginRequest, request: Request) -> TokenResponse:
    client_ip = request.client.host if request.client else ""

    user = verify_credentials(body.username, body.password)
    if not user:
        # Audit: failed login attempt
        get_audit().log(
            actor=body.username,
            action="auth:LoginFailed",
            actor_ip=client_ip,
            decision="DENY",
            severity="warning",
            detail="Invalid credentials",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    info = UserInfo(
        username=body.username,
        display_name=user["display_name"],
        email=user.get("email"),
        role=user.get("role", "admin"),
        groups=user.get("groups", []),
    )

    # Audit: successful login
    get_audit().log(
        actor=body.username,
        action="auth:LoginSuccess",
        actor_ip=client_ip,
        decision="ALLOW",
        severity="info",
    )

    token = create_access_token({"sub": info.username, **info.model_dump()})
    return TokenResponse(
        access_token=token,
        expires_in=8 * 3600,
        user=info,
    )


@router.post(
    "/refresh", response_model=RefreshResponse, summary="Refresh an expiring token"
)
def refresh(current: UserInfo = Depends(get_current_user)) -> RefreshResponse:
    token = create_access_token({"sub": current.username, **current.model_dump()})
    return RefreshResponse(access_token=token, expires_in=8 * 3600)


@router.get("/me", response_model=UserInfo, summary="Get current authenticated user")
def me(current: UserInfo = Depends(get_current_user)) -> UserInfo:
    return current
