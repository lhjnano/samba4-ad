"""SPDX-License-Identifier: Apache-2.0

Setup wizard routes — ``/api/v1/setup`` (domain provisioning, status).

These endpoints are only used during first-run setup. Once the domain is
provisioned, the regular management endpoints take over.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from src.core.config import settings as global_settings
from src.models.setup import ProvisionRequest, ProvisionResult, SetupStatus
from src.services.provisioning import ProvisioningService

router = APIRouter(prefix="/setup", tags=["setup"])


@router.get(
    "/status",
    response_model=SetupStatus,
    summary="Check if domain is provisioned",
)
def get_setup_status() -> SetupStatus:
    """Returns whether the AD domain is already set up on this server."""
    service = ProvisioningService(global_settings)
    return service.get_status()


@router.post(
    "/provision",
    response_model=ProvisionResult,
    summary="Provision a new AD domain (first-run setup)",
)
def provision_domain(req: ProvisionRequest) -> ProvisionResult:
    """Run ``samba-tool domain provision`` to create a new AD domain.

    This is a destructive operation — it configures this server as the
    primary Domain Controller. Only call when the domain is not yet set up.
    """
    service = ProvisioningService(global_settings)
    current = service.get_status()
    if current.provisioned:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ALREADY_PROVISIONED",
                "message": f"Domain already provisioned: {current.realm}",
            },
        )
    try:
        return service.provision(req)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_INPUT",
                "message": str(err),
            },
        ) from err
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "PROVISION_FAILED",
                "message": str(err),
            },
        ) from err
