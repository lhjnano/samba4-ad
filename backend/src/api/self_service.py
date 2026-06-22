"""SPDX-License-Identifier: Apache-2.0

Self-service endpoints — password change and account info for the
currently authenticated user (no admin required).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from src.core.audit import get_audit
from src.core.auth import UserInfo, get_current_user

router = APIRouter(prefix="/self-service", tags=["self-service"])


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class PasswordChangeResponse(BaseModel):
    success: bool
    message: str = ""


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    email: str | None = None


@router.post("/change-password", response_model=PasswordChangeResponse)
def change_password(
    body: PasswordChangeRequest,
    user: UserInfo = Depends(get_current_user),
) -> PasswordChangeResponse:
    """Change the current user's password.

    Requires current password verification before setting new one.
    """
    from src.core.auth import verify_credentials

    # Verify current password
    verified = verify_credentials(user.username, body.current_password)
    if not verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    # Validate new password complexity
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not any(c.isupper() for c in body.new_password):
        raise HTTPException(400, "Password must contain an uppercase letter")
    if not any(c.islower() for c in body.new_password):
        raise HTTPException(400, "Password must contain a lowercase letter")
    if not any(c.isdigit() for c in body.new_password):
        raise HTTPException(400, "Password must contain a digit")

    # Change password via the directory backend
    from src.core.deps import get_directory

    directory = get_directory()
    try:
        # Find user ID by username
        users, _ = directory.list_users(q=user.username, page=1, limit=1)
        if not users:
            # System admin — can't change via LDAP
            raise HTTPException(400, "Password change not available for local admin")

        user_id = users[0].id
        directory.reset_password(user_id, body.new_password)

        get_audit().log(
            actor=user.username,
            action="self:ChangePassword",
            resource_type="user",
            resource_id=user_id,
            severity="warning",
        )

        return PasswordChangeResponse(
            success=True, message="Password changed successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to change password: {e}") from e


@router.get("/profile", response_model=UserInfo)
def get_profile(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """Get the current user's profile."""
    return user


@router.patch("/profile", response_model=UserInfo)
def update_profile(
    body: ProfileUpdateRequest,
    user: UserInfo = Depends(get_current_user),
) -> UserInfo:
    """Update the current user's profile (display name, email)."""
    from src.core.deps import get_directory

    directory = get_directory()
    try:
        users, _ = directory.list_users(q=user.username, page=1, limit=1)
        if not users:
            raise HTTPException(400, "Profile update not available for local admin")

        user_id = users[0].id
        updates: dict[str, str | None] = {}
        if body.display_name is not None:
            updates["display_name"] = body.display_name
        if body.email is not None:
            updates["email"] = body.email

        if updates:
            directory.update_user(user_id, **updates)

        get_audit().log(
            actor=user.username,
            action="self:UpdateProfile",
            resource_type="user",
            resource_id=user_id,
            severity="info",
        )

        # Return updated info
        updated = directory.get_user(user_id)
        return UserInfo(
            username=updated.username,
            display_name=updated.display_name or updated.username,
            email=updated.email,
            role=user.role,
            groups=user.groups,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to update profile: {e}") from e
