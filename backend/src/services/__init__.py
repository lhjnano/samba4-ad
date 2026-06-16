"""SPDX-License-Identifier: Apache-2.0

Services package — the business/service layer.

Architecture
------------
::

    FastAPI routes  →  *Service   →  DirectoryBackend (Protocol)
                          ↓                  ↓
                       samba_tool       ┌────┴────┐
                       (subprocess)     Mock      ldap3
                                       (T0/dev)  (prod)

The services hold the domain logic; the ``DirectoryBackend`` is an injectable
dependency selected by ``Settings.app_mode``. This makes every service fully
testable against the in-memory :class:`MockDirectory` without a Samba DC.
"""

from src.services.directory import (
    DirectoryBackend,
    DirectoryError,
    EntryExistsError,
    EntryNotFoundError,
    InsufficientRightsError,
    OperationFailedError,
    get_backend,
)

__all__ = [
    "DirectoryBackend",
    "DirectoryError",
    "EntryExistsError",
    "EntryNotFoundError",
    "InsufficientRightsError",
    "OperationFailedError",
    "get_backend",
]
