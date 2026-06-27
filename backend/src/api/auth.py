"""SPDX-License-Identifier: Apache-2.0

Authentication endpoints: login, MFA verify, refresh, current-user info.

Login flow:
  1. POST /auth/login → password verified → check MFA
  2. If MFA required → return mfa_challenge (no JWT yet)
  3. POST /auth/mfa-verify → TOTP code verified → return JWT
  4. If no MFA → return JWT immediately
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from src.core.audit import get_audit
from src.core.auth import (
    create_access_token,
    get_current_user,
    verify_credentials,
)
from src.core.config import settings
from src.core.mfa import (
    enroll,
    generate_secret,
    get_provisioning_uri,
    is_enrolled,
    should_require_mfa,
    unenroll,
    verify_code,
)
from src.models.auth import LoginRequest, RefreshResponse, UserInfo

router = APIRouter(prefix="/auth", tags=["auth"])


# ── MFA models ───────────────────────────────────────────────────────


class MfaChallengeResponse(BaseModel):
    """Returned when login succeeds but MFA is required."""

    mfa_required: bool = True
    username: str
    message: str = "MFA code required"


class MfaVerifyRequest(BaseModel):
    username: str
    code: str = ""


class LoginOrMfaResponse(BaseModel):
    """Union response: either a token or an MFA challenge."""

    access_token: str | None = None
    token_type: str = "bearer"  # noqa: S105
    expires_in: int | None = None
    user: UserInfo | None = None
    mfa_required: bool = False
    username: str | None = None


class MfaEnrollRequest(BaseModel):
    secret: str
    code: str


class MfaEnrollResponse(BaseModel):
    enrolled: bool
    message: str = ""


class MfaStatusResponse(BaseModel):
    enabled: bool
    enrolled: bool
    required: bool


# ── Login (with MFA check) ───────────────────────────────────────────


@router.post(
    "/login",
    response_model=LoginOrMfaResponse,
    summary="Authenticate (password → JWT or MFA challenge)",
)
def login(body: LoginRequest, request: Request) -> LoginOrMfaResponse:
    client_ip = request.client.host if request.client else ""

    user = verify_credentials(body.username, body.password)
    if not user:
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

    # Check MFA requirement
    if should_require_mfa(body.username):
        get_audit().log(
            actor=body.username,
            action="auth:LoginPasswordOk",
            actor_ip=client_ip,
            decision="ALLOW",
            severity="info",
            detail="Password verified, MFA code required",
        )
        return LoginOrMfaResponse(
            mfa_required=True,
            username=body.username,
        )

    # No MFA needed → issue JWT
    return _issue_token(body.username, user, client_ip)


@router.post(
    "/mfa-verify",
    response_model=LoginOrMfaResponse,
    summary="Verify MFA code and receive JWT",
)
def mfa_verify(body: MfaVerifyRequest, request: Request) -> LoginOrMfaResponse:
    client_ip = request.client.host if request.client else ""

    if not verify_code(body.username, body.code):
        get_audit().log(
            actor=body.username,
            action="auth:MfaFailed",
            actor_ip=client_ip,
            decision="DENY",
            severity="warning",
            detail="Invalid TOTP code",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid MFA code",
        )

    # MFA passed — re-verify credentials to get user info
    # (In production, use a temporary token instead of re-querying)
    # For now, construct a minimal user dict
    user = {
        "display_name": body.username,
        "email": None,
        "role": "admin",
        "groups": [],
    }

    get_audit().log(
        actor=body.username,
        action="auth:MfaSuccess",
        actor_ip=client_ip,
        decision="ALLOW",
        severity="info",
    )

    return _issue_token(body.username, user, client_ip)


def _issue_token(username: str, user: dict, client_ip: str) -> LoginOrMfaResponse:
    """Create JWT and return full login response."""
    info = UserInfo(
        username=username,
        display_name=user["display_name"],
        email=user.get("email"),
        role=user.get("role", "admin"),
        groups=user.get("groups", []),
    )

    get_audit().log(
        actor=username,
        action="auth:LoginSuccess",
        actor_ip=client_ip,
        decision="ALLOW",
        severity="info",
    )

    token = create_access_token(
        {"sub": info.username, "mfa_verified": True, **info.model_dump()}
    )
    return LoginOrMfaResponse(
        access_token=token,
        expires_in=8 * 3600,
        user=info,
    )


# ── MFA enrollment ───────────────────────────────────────────────────


@router.get("/mfa/status", response_model=MfaStatusResponse, summary="Get MFA status")
def mfa_status(
    current: UserInfo = Depends(get_current_user),
) -> MfaStatusResponse:
    """Check if MFA is enabled and current user is enrolled."""
    return MfaStatusResponse(
        enabled=settings.mfa_enabled,
        enrolled=is_enrolled(current.username),
        required=settings.mfa_required,
    )


@router.post(
    "/mfa/setup",
    summary="Start MFA enrollment (get secret + provisioning URI)",
)
def mfa_setup(
    current: UserInfo = Depends(get_current_user),
) -> dict:
    """Generate a new TOTP secret for enrollment.

    Returns the secret and provisioning URI for QR code generation.
    The secret is NOT saved until verified via /mfa/enroll.
    """
    if not settings.mfa_enabled:
        raise HTTPException(400, "MFA is not enabled")

    secret = generate_secret()
    uri = get_provisioning_uri(secret, current.username)

    return {
        "secret": secret,
        "provisioning_uri": uri,
        "qr_url": f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={uri}",
    }


@router.post(
    "/mfa/enroll",
    response_model=MfaEnrollResponse,
    summary="Complete MFA enrollment by verifying first code",
)
def mfa_enroll(
    body: MfaEnrollRequest,
    current: UserInfo = Depends(get_current_user),
) -> MfaEnrollResponse:
    """Verify the first TOTP code and save the secret."""
    if enroll(current.username, body.secret, body.code):
        get_audit().log(
            actor=current.username,
            action="auth:MfaEnroll",
            severity="warning",
            detail="MFA enrolled",
        )
        return MfaEnrollResponse(enrolled=True, message="MFA enrolled successfully")
    raise HTTPException(400, "Invalid TOTP code — enrollment failed")


@router.delete(
    "/mfa/enroll",
    response_model=MfaEnrollResponse,
    summary="Remove MFA enrollment",
)
def mfa_unenroll(
    current: UserInfo = Depends(get_current_user),
) -> MfaEnrollResponse:
    """Remove MFA enrollment for the current user."""
    if unenroll(current.username):
        get_audit().log(
            actor=current.username,
            action="auth:MfaUnenroll",
            severity="warning",
            detail="MFA removed",
        )
        return MfaEnrollResponse(enrolled=False, message="MFA removed")
    raise HTTPException(404, "MFA not enrolled")


# ── Refresh + me (unchanged) ─────────────────────────────────────────


@router.post(
    "/refresh", response_model=RefreshResponse, summary="Refresh an expiring token"
)
def refresh(current: UserInfo = Depends(get_current_user)) -> RefreshResponse:
    token = create_access_token({"sub": current.username, **current.model_dump()})
    return RefreshResponse(access_token=token, expires_in=8 * 3600)


@router.get("/me", response_model=UserInfo, summary="Get current authenticated user")
def me(current: UserInfo = Depends(get_current_user)) -> UserInfo:
    return current
