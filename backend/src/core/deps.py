"""SPDX-License-Identifier: Apache-2.0

FastAPI dependency providers.

Routes depend on :class:`DirectoryBackend`, injected here so tests can swap in
a fresh mock via ``set_backend``.
"""

from __future__ import annotations

from collections.abc import Iterator

from src.services.directory import DirectoryBackend, get_backend


def get_directory() -> Iterator[DirectoryBackend]:
    """Yield the active directory backend for the request."""
    yield get_backend()
