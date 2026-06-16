"""SPDX-License-Identifier: Apache-2.0

Domain-model unit tests (Gate 1): UAC flag derivation, group-type decoding,
DN/id encoding round-trips.
"""

from __future__ import annotations

import pytest
from src.models.common import decode_id, encode_id
from src.models.domain import (
    AccountStatus,
    GroupCategory,
    GroupScope,
    UserAccountControl,
)
from src.models.groups import _parse_group_type
from src.models.users import _status_from_uac


class TestUserAccountControl:
    @pytest.mark.unit
    def test_active_normal_account(self) -> None:
        uac = int(
            UserAccountControl.NORMAL_ACCOUNT | UserAccountControl.DONT_EXPIRE_PASSWD
        )
        assert _status_from_uac(uac) == AccountStatus.ACTIVE

    @pytest.mark.unit
    def test_disabled_account(self) -> None:
        uac = int(UserAccountControl.NORMAL_ACCOUNT | UserAccountControl.ACCOUNTDISABLE)
        assert _status_from_uac(uac) == AccountStatus.INACTIVE

    @pytest.mark.unit
    def test_locked_account(self) -> None:
        uac = int(UserAccountControl.NORMAL_ACCOUNT | UserAccountControl.LOCKOUT)
        assert _status_from_uac(uac) == AccountStatus.LOCKED

    @pytest.mark.unit
    def test_lockout_takes_precedence_over_disabled(self) -> None:
        uac = int(
            UserAccountControl.NORMAL_ACCOUNT
            | UserAccountControl.ACCOUNTDISABLE
            | UserAccountControl.LOCKOUT
        )
        assert _status_from_uac(uac) == AccountStatus.LOCKED


class TestGroupType:
    @pytest.mark.unit
    @pytest.mark.parametrize(
        ("raw", "cat", "scope"),
        [
            (-2147483646, GroupCategory.SECURITY, GroupScope.GLOBAL),  # 0x80000002
            (
                -2147483644,
                GroupCategory.SECURITY,
                GroupScope.DOMAIN_LOCAL,
            ),  # 0x80000004
            (2, GroupCategory.DISTRIBUTION, GroupScope.GLOBAL),
            (4, GroupCategory.DISTRIBUTION, GroupScope.DOMAIN_LOCAL),
            (8, GroupCategory.DISTRIBUTION, GroupScope.UNIVERSAL),
        ],
    )
    def test_parse_group_type(
        self, raw: int, cat: GroupCategory, scope: GroupScope
    ) -> None:
        category, parsed_scope = _parse_group_type(raw)
        assert category == cat
        assert parsed_scope == scope


class TestIdEncoding:
    @pytest.mark.unit
    def test_round_trip_korean_dn(self) -> None:
        dn = "CN=user0001,OU=개발팀,DC=TEST,DC=LOCAL"
        encoded = encode_id(dn)
        assert "," not in encoded and "=" not in encoded
        assert decode_id(encoded) == dn

    @pytest.mark.unit
    def test_encoded_ids_differ_for_different_dns(self) -> None:
        assert encode_id("CN=a,DC=x") != encode_id("CN=b,DC=x")

    @pytest.mark.unit
    def test_decode_invalid_raises(self) -> None:
        # decode_id raises ValueError (re-raised from base64/utf-8 failure)
        with pytest.raises(ValueError):
            decode_id("@@@not-base64@@@")
