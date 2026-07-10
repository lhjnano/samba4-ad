"""SPDX-License-Identifier: Apache-2.0

Unit tests for ``_detect_public_ip`` — dual-stack (IPv4/IPv6) selection rules.

The function resolves the local hostname via ``socket.getaddrinfo`` and picks
the address shown to clients in the web manual / domain info:

- loopback, link-local (incl. zone IDs), and unspecified addresses are skipped
- a global IPv4 address is preferred
- otherwise the first usable IPv6 address is returned
- nothing usable → empty string (caller falls back to ``ldap_host``)
"""

from __future__ import annotations

import socket
from unittest.mock import patch

import pytest
from src.services.ldap3_backend import _detect_public_ip


def _addrinfo(raw: str) -> object:
    """Build a minimal getaddrinfo-style tuple for *raw*."""
    family = socket.AF_INET6 if ":" in raw else socket.AF_INET
    return (family, None, None, "", (raw, 0))


def _resolve_to(*raws: str) -> list:
    return [_addrinfo(r) for r in raws]


class TestDetectPublicIp:
    @pytest.mark.unit
    def test_prefers_ipv4_over_ipv6(self) -> None:
        with (
            patch("socket.gethostname", return_value="dc01"),
            patch(
                "socket.getaddrinfo",
                return_value=_resolve_to(
                    "127.0.0.1", "fe80::1", "192.168.39.1", "2001:db8::1"
                ),
            ),
        ):
            assert _detect_public_ip() == "192.168.39.1"

    @pytest.mark.unit
    def test_ipv6_only_returns_global_ipv6(self) -> None:
        with (
            patch("socket.gethostname", return_value="dc01"),
            patch(
                "socket.getaddrinfo",
                return_value=_resolve_to("::1", "fe80::a", "2001:db8::5"),
            ),
        ):
            assert _detect_public_ip() == "2001:db8::5"

    @pytest.mark.unit
    def test_skips_loopback_and_link_local(self) -> None:
        with (
            patch("socket.gethostname", return_value="dc01"),
            patch(
                "socket.getaddrinfo",
                return_value=_resolve_to("127.0.0.1", "127.0.1.1", "::1", "fe80::1"),
            ),
        ):
            assert _detect_public_ip() == ""

    @pytest.mark.unit
    def test_strips_ipv6_zone_id(self) -> None:
        with (
            patch("socket.gethostname", return_value="dc01"),
            patch(
                "socket.getaddrinfo",
                return_value=_resolve_to("fe80::1%eth0", "fd00::10"),
            ),
        ):
            assert _detect_public_ip() == "fd00::10"

    @pytest.mark.unit
    def test_resolver_failure_returns_empty(self) -> None:
        with (
            patch("socket.gethostname", return_value="dc01"),
            patch("socket.getaddrinfo", side_effect=OSError("no dns")),
        ):
            assert _detect_public_ip() == ""

    @pytest.mark.unit
    def test_invalid_entries_are_ignored(self) -> None:
        with (
            patch("socket.gethostname", return_value="dc01"),
            patch(
                "socket.getaddrinfo", return_value=_resolve_to("not-an-ip", "10.0.0.1")
            ),
        ):
            assert _detect_public_ip() == "10.0.0.1"
