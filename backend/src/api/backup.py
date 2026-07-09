"""SPDX-License-Identifier: Apache-2.0

Backup & Restore routes — /api/v1/backups.

Allows administrators to create, list, download, and restore
Samba AD DC configuration backups.
"""

from __future__ import annotations

import subprocess
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from src.core.auth import get_current_user
from src.core.config import settings
from src.models.auth import UserInfo

router = APIRouter(prefix="/backups", tags=["backups"])

# Backup directory
_BACKUP_DIR = Path("/var/lib/samba/backups/ad-manager")
_SAMBA_PRIVATE = Path("/var/lib/samba/private")
_SAMBA_CONF = Path("/etc/samba/smb.conf")


class BackupInfo(BaseModel):
    id: str
    name: str
    created_at: str
    size_bytes: int
    type: str  # full, config
    status: str  # available, corrupted


class BackupListResponse(BaseModel):
    items: list[BackupInfo]
    total: int


class BackupCreateRequest(BaseModel):
    name: str = Field(default="", description="Backup name (auto-generated if empty)")
    backup_type: str = Field(default="config", description="full or config")


class BackupCreateResponse(BaseModel):
    id: str
    name: str
    created_at: str
    size_bytes: int
    type: str
    message: str


class RestoreRequest(BaseModel):
    confirm: bool = Field(default=False, description="Must be true to confirm restore")


class RestoreResponse(BaseModel):
    id: str
    success: bool
    message: str


def _ensure_backup_dir() -> None:
    try:
        _BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise HTTPException(500, f"Cannot create backup directory: {e}") from e


def _list_backups() -> list[BackupInfo]:
    backups: list[BackupInfo] = []
    if not _BACKUP_DIR.exists():
        return backups
    try:
        entries = sorted(
            _BACKUP_DIR.iterdir(),
            key=lambda e: e.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        return backups
    for entry in entries:
        if entry.is_file() and entry.suffix == ".tar.gz":
            stat = entry.stat()
            name = entry.stem.replace(".tar", "")
            # Extract the type token from the backup name (config or full).
            parts = name.split("-", 2)
            backup_type = parts[1] if len(parts) > 1 else "config"
            backups.append(
                BackupInfo(
                    id=entry.name,
                    name=name,
                    created_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    size_bytes=stat.st_size,
                    type=backup_type,
                    status="available",
                )
            )
    return backups


def _create_backup(name: str, backup_type: str) -> BackupCreateResponse:
    _ensure_backup_dir()
    if not name:
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        name = f"backup-{backup_type}-{ts}"

    filename = f"{name}.tar.gz"
    filepath = _BACKUP_DIR / filename

    # Build tar archive of relevant files
    sources = []
    if backup_type == "full":
        if _SAMBA_PRIVATE.exists():
            sources.append(str(_SAMBA_PRIVATE))
        if _SAMBA_CONF.exists():
            sources.append(str(_SAMBA_CONF))
        # Include policies
        policy_dir = Path(settings.pbac_policy_dir)
        if policy_dir.exists():
            sources.append(str(policy_dir))
        # Include app config
        env_file = Path("/etc/samba-ad-manager/env")
        if env_file.exists():
            sources.append(str(env_file))
    else:  # config only
        if _SAMBA_CONF.exists():
            sources.append(str(_SAMBA_CONF))
        policy_dir = Path(settings.pbac_policy_dir)
        if policy_dir.exists():
            sources.append(str(policy_dir))
        env_file = Path("/etc/samba-ad-manager/env")
        if env_file.exists():
            sources.append(str(env_file))

    if not sources:
        raise HTTPException(500, "No files found to backup")

    try:
        result = subprocess.run(
            ["tar", "czf", str(filepath), *sources],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            raise HTTPException(500, f"tar failed: {result.stderr}")
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Backup timed out") from None
    except FileNotFoundError:
        raise HTTPException(500, "tar command not found") from None

    stat = filepath.stat()
    return BackupCreateResponse(
        id=filename,
        name=name,
        created_at=datetime.now().isoformat(),
        size_bytes=stat.st_size,
        type=backup_type,
        message=f"Backup created: {filename}",
    )


@router.get("", response_model=BackupListResponse, summary="List backups")
def list_backups(
    user: UserInfo = Depends(get_current_user),
) -> BackupListResponse:
    """List all available backups."""
    items = _list_backups()
    return BackupListResponse(items=items, total=len(items))


@router.post(
    "",
    response_model=BackupCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create backup",
)
def create_backup(
    body: BackupCreateRequest,
    user: UserInfo = Depends(get_current_user),
) -> BackupCreateResponse:
    """Create a new backup of Samba AD DC configuration."""
    if body.backup_type not in ("full", "config"):
        raise HTTPException(400, "backup_type must be 'full' or 'config'")

    result = _create_backup(body.name, body.backup_type)

    from src.core.audit import get_audit

    get_audit().log(
        actor=user.username,
        action="backup:Create",
        resource_type="backup",
        resource_id=result.id,
        severity="critical",
        detail=f"Created {body.backup_type} backup",
    )

    return result


@router.get("/{backup_id}/download", summary="Download backup")
def download_backup(
    backup_id: str,
    user: UserInfo = Depends(get_current_user),
) -> FileResponse:
    """Download a backup file."""
    filepath = _BACKUP_DIR / backup_id
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(404, f"Backup not found: {backup_id}")
    return FileResponse(
        path=str(filepath),
        filename=backup_id,
        media_type="application/gzip",
    )


@router.post(
    "/{backup_id}/restore", response_model=RestoreResponse, summary="Restore backup"
)
def restore_backup(
    backup_id: str,
    body: RestoreRequest,
    user: UserInfo = Depends(get_current_user),
) -> RestoreResponse:
    """Restore from a backup. Requires confirm=true."""
    if not body.confirm:
        raise HTTPException(400, "Set confirm=true to restore")

    filepath = _BACKUP_DIR / backup_id
    if not filepath.exists():
        raise HTTPException(404, f"Backup not found: {backup_id}")

    try:
        result = subprocess.run(
            ["tar", "xzf", str(filepath), "-C", "/"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        success = result.returncode == 0
        message = "Restore completed" if success else f"Restore failed: {result.stderr}"
    except Exception as e:
        success = False
        message = f"Restore failed: {e}"

    from src.core.audit import get_audit

    get_audit().log(
        actor=user.username,
        action="backup:Restore",
        resource_type="backup",
        resource_id=backup_id,
        severity="critical",
        detail=message,
    )

    return RestoreResponse(id=backup_id, success=success, message=message)


@router.delete(
    "/{backup_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete backup",
)
def delete_backup(
    backup_id: str,
    user: UserInfo = Depends(get_current_user),
) -> None:
    """Delete a backup file."""
    filepath = _BACKUP_DIR / backup_id
    if not filepath.exists():
        raise HTTPException(404, f"Backup not found: {backup_id}")

    filepath.unlink()

    from src.core.audit import get_audit

    get_audit().log(
        actor=user.username,
        action="backup:Delete",
        resource_type="backup",
        resource_id=backup_id,
        severity="warning",
    )
