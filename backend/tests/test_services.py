"""SPDX-License-Identifier: Apache-2.0

MockDirectory service-layer tests (T0): users, groups, OUs, computers, GPOs,
domain policy, health — full CRUD + error paths.
"""

from __future__ import annotations

import pytest
from src.models.common import encode_id
from src.models.domain import AccountStatus, GpoStatus
from src.models.groups import GroupCreate
from src.models.ou import OuCreate
from src.models.users import UserCreate
from src.services.directory import (
    EntryExistsError,
    EntryNotFoundError,
)
from src.services.mock import MockDirectory


@pytest.fixture()
def dir_(settings) -> MockDirectory:  # type: ignore[no-untyped-def]
    return MockDirectory(settings)


# ---------------------------------------------------------------------------
# USERS
# ---------------------------------------------------------------------------
class TestUsers:
    @pytest.mark.unit
    def test_list_users_default_page(self, dir_: MockDirectory) -> None:
        items, total = dir_.list_users(page=1, limit=5)
        assert len(items) == 5
        assert total >= 40

    @pytest.mark.unit
    def test_search_by_username(self, dir_: MockDirectory) -> None:
        items, _ = dir_.list_users(q="user0001")
        assert items and items[0].username == "user0001"

    @pytest.mark.unit
    def test_filter_by_status(self, dir_: MockDirectory) -> None:
        items, _ = dir_.list_users(status="locked")
        assert all(u.status == AccountStatus.LOCKED for u in items)

    @pytest.mark.unit
    def test_get_user_detail(self, dir_: MockDirectory) -> None:
        items, _ = dir_.list_users(limit=1)
        detail = dir_.get_user(items[0].id)
        assert detail.username == items[0].username
        assert detail.dn and detail.object_sid

    @pytest.mark.unit
    def test_create_user(self, dir_: MockDirectory) -> None:
        created = dir_.create_user(
            UserCreate(username="newperson", password="P@ssw0rd!")
        )
        assert created.username == "newperson"
        assert created.status == AccountStatus.ACTIVE
        # fetchable afterwards
        assert dir_.get_user(created.id).username == "newperson"

    @pytest.mark.unit
    def test_create_duplicate_user_raises(self, dir_: MockDirectory) -> None:
        dir_.create_user(UserCreate(username="dup", password="x"))
        with pytest.raises(EntryExistsError):
            dir_.create_user(UserCreate(username="dup", password="x"))

    @pytest.mark.unit
    def test_update_user_fields(self, dir_: MockDirectory) -> None:
        created = dir_.create_user(UserCreate(username="updateme", password="x"))
        updated = dir_.update_user(
            created.id, display_name="Updated", phone="010-9999-0000"
        )
        assert updated.display_name == "Updated"
        assert updated.phone == "010-9999-0000"

    @pytest.mark.unit
    def test_set_user_status(self, dir_: MockDirectory) -> None:
        created = dir_.create_user(UserCreate(username="toggle", password="x"))
        disabled = dir_.set_user_status(created.id, "inactive")
        assert disabled.status == AccountStatus.INACTIVE

    @pytest.mark.unit
    def test_reset_password(self, dir_: MockDirectory) -> None:
        created = dir_.create_user(UserCreate(username="pwuser", password="x"))
        dir_.reset_password(created.id, "NewP@ss1")  # no error raised
        assert dir_.get_user(created.id).username == "pwuser"

    @pytest.mark.unit
    def test_delete_user(self, dir_: MockDirectory) -> None:
        created = dir_.create_user(UserCreate(username="deleteme", password="x"))
        dir_.delete_user(created.id)
        with pytest.raises(EntryNotFoundError):
            dir_.get_user(created.id)

    @pytest.mark.unit
    def test_get_missing_user_raises(self, dir_: MockDirectory) -> None:
        with pytest.raises(EntryNotFoundError):
            dir_.get_user(encode_id("CN=ghost,DC=TEST,DC=LOCAL"))

    @pytest.mark.unit
    def test_user_login_history(self, dir_: MockDirectory) -> None:
        items, _ = dir_.list_users(limit=1)
        history = dir_.user_login_history(items[0].id)
        assert len(history) == 5


# ---------------------------------------------------------------------------
# GROUPS
# ---------------------------------------------------------------------------
class TestGroups:
    @pytest.mark.unit
    def test_list_groups(self, dir_: MockDirectory) -> None:
        items, total = dir_.list_groups()
        assert total >= 7
        assert all(g.category for g in items)

    @pytest.mark.unit
    def test_create_group(self, dir_: MockDirectory) -> None:
        g = dir_.create_group(GroupCreate(name="testers"))
        assert g.name == "testers"
        assert dir_.get_group(g.id).name == "testers"

    @pytest.mark.unit
    def test_add_and_remove_member(self, dir_: MockDirectory) -> None:
        users, _ = dir_.list_users(limit=1)
        g = dir_.create_group(GroupCreate(name="mgroup"))
        added = dir_.add_group_members(
            g.id, [users[0].dn if hasattr(users[0], "dn") else encode_id(users[0].id)]
        )  # type: ignore[attr-defined]
        assert added.member_count >= 1
        member_dn = added.members[0].dn
        removed = dir_.remove_group_member(g.id, member_dn)
        assert all(m.dn != member_dn for m in removed.members)

    @pytest.mark.unit
    def test_delete_group(self, dir_: MockDirectory) -> None:
        g = dir_.create_group(GroupCreate(name="byebye"))
        dir_.delete_group(g.id)
        with pytest.raises(EntryNotFoundError):
            dir_.get_group(g.id)


# ---------------------------------------------------------------------------
# OUs
# ---------------------------------------------------------------------------
class TestOUs:
    @pytest.mark.unit
    def test_ou_tree_has_roots(self, dir_: MockDirectory) -> None:
        tree = dir_.ou_tree()
        assert len(tree) >= 6

    @pytest.mark.unit
    def test_create_ou(self, dir_: MockDirectory) -> None:
        node = dir_.create_ou(OuCreate(name="새팀"))
        assert node.name == "새팀"
        assert dir_.get_ou(node.id).name == "새팀"

    @pytest.mark.unit
    def test_create_duplicate_ou_raises(self, dir_: MockDirectory) -> None:
        dir_.create_ou(OuCreate(name="중복팀"))
        with pytest.raises(EntryExistsError):
            dir_.create_ou(OuCreate(name="중복팀"))

    @pytest.mark.unit
    def test_update_ou(self, dir_: MockDirectory) -> None:
        node = dir_.create_ou(OuCreate(name="업데이트팀"))
        updated = dir_.update_ou(node.id, description="새 설명")
        assert updated.description == "새 설명"

    @pytest.mark.unit
    def test_delete_ou(self, dir_: MockDirectory) -> None:
        node = dir_.create_ou(OuCreate(name="삭제팀"))
        dir_.delete_ou(node.id)
        with pytest.raises(EntryNotFoundError):
            dir_.get_ou(node.id)


# ---------------------------------------------------------------------------
# COMPUTERS
# ---------------------------------------------------------------------------
class TestComputers:
    @pytest.mark.unit
    def test_list_computers(self, dir_: MockDirectory) -> None:
        items, total = dir_.list_computers()
        assert total >= 24
        assert items[0].hostname

    @pytest.mark.unit
    def test_os_distribution(self, dir_: MockDirectory) -> None:
        dist = dir_.computer_os_distribution()
        assert any(d.os == "Windows 11" for d in dist)

    @pytest.mark.unit
    def test_join_trend(self, dir_: MockDirectory) -> None:
        trend = dir_.computer_join_trend()
        assert len(trend) == 7

    @pytest.mark.unit
    def test_set_computer_status(self, dir_: MockDirectory) -> None:
        items, _ = dir_.list_computers(limit=1)
        updated = dir_.set_computer_status(items[0].id, "inactive")
        assert updated.status.value == "inactive"


# ---------------------------------------------------------------------------
# GPOs
# ---------------------------------------------------------------------------
class TestGPOs:
    @pytest.mark.unit
    def test_list_gpos(self, dir_: MockDirectory) -> None:
        _items, total = dir_.list_gpos()
        assert total >= 4

    @pytest.mark.unit
    def test_create_and_link_gpo(self, dir_: MockDirectory) -> None:
        g = dir_.create_gpo("New Policy", None)
        assert g.display_name == "New Policy"
        linked = dir_.link_gpo(g.id, "OU=개발팀,DC=TEST,DC=LOCAL", enforced=True)
        assert any(link.mode.value == "enforced" for link in linked.linked_ous)

    @pytest.mark.unit
    def test_set_gpo_status(self, dir_: MockDirectory) -> None:
        items, _ = dir_.list_gpos(limit=1)
        updated = dir_.set_gpo_status(items[0].id, "disabled")
        assert updated.status == GpoStatus.DISABLED

    @pytest.mark.unit
    def test_delete_gpo(self, dir_: MockDirectory) -> None:
        g = dir_.create_gpo("Temp", None)
        dir_.delete_gpo(g.id)
        with pytest.raises(EntryNotFoundError):
            dir_.get_gpo(g.id)


# ---------------------------------------------------------------------------
# DOMAIN + HEALTH + STATS
# ---------------------------------------------------------------------------
class TestDomainAndHealth:
    @pytest.mark.unit
    def test_domain_info(self, dir_: MockDirectory) -> None:
        info = dir_.domain_info()
        assert info.fqdn == "TEST.LOCAL"

    @pytest.mark.unit
    def test_password_policy_roundtrip(self, dir_: MockDirectory) -> None:
        before = dir_.password_policy()
        dir_.set_password_policy(min_length=14)
        assert dir_.password_policy().min_length == 14
        assert before.history == dir_.password_policy().history

    @pytest.mark.unit
    def test_lockout_policy_roundtrip(self, dir_: MockDirectory) -> None:
        dir_.set_lockout_policy(threshold=10)
        assert dir_.lockout_policy().threshold == 10

    @pytest.mark.unit
    def test_services_all_healthy(self, dir_: MockDirectory) -> None:
        services = dir_.services_status()
        assert len(services) == 5
        assert all(s.healthy for s in services)

    @pytest.mark.unit
    def test_system_resources(self, dir_: MockDirectory) -> None:
        res = dir_.system_resources()
        assert 0 <= res.cpu_percent <= 100

    @pytest.mark.unit
    def test_login_trend(self, dir_: MockDirectory) -> None:
        trend = dir_.login_trend()  # type: ignore[attr-defined]
        assert len(trend) == 7

    @pytest.mark.unit
    def test_ou_distribution(self, dir_: MockDirectory) -> None:
        dist = dir_.ou_distribution()  # type: ignore[attr-defined]
        assert any(d.ou == "개발팀" for d in dist)

    @pytest.mark.unit
    def test_recent_alerts(self, dir_: MockDirectory) -> None:
        alerts = dir_.recent_alerts()  # type: ignore[attr-defined]
        assert len(alerts) == 5
