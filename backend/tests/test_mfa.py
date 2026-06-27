"""SPDX-License-Identifier: Apache-2.0

Tests for MFA (TOTP) functionality.
"""

from __future__ import annotations

import pyotp
import pytest


class TestMfaService:
    @pytest.mark.unit
    def test_generate_secret(self):
        from src.core.mfa import generate_secret

        secret = generate_secret()
        assert len(secret) >= 16
        # Should be valid base32
        pyotp.TOTP(secret)

    @pytest.mark.unit
    def test_provisioning_uri(self):
        from src.core.mfa import generate_secret, get_provisioning_uri

        secret = generate_secret()
        uri = get_provisioning_uri(secret, "testuser")
        assert uri.startswith("otpauth://totp/")
        assert "testuser" in uri

    @pytest.mark.unit
    def test_enroll_and_verify(self, tmp_path, monkeypatch):
        from src.core import config as config_mod
        from src.core import mfa as mfa_mod

        monkeypatch.setattr(
            config_mod.settings, "audit_log_path", str(tmp_path / "audit.log")
        )
        monkeypatch.setattr(config_mod.settings, "mfa_enabled", True)
        mfa_mod._store_path.cache_clear() if hasattr(
            mfa_mod._store_path, "cache_clear"
        ) else None

        secret = mfa_mod.generate_secret()
        totp = pyotp.TOTP(secret)
        code = totp.now()

        result = mfa_mod.enroll("testuser", secret, code)
        assert result is True
        assert mfa_mod.is_enrolled("testuser")

        # Verify with correct code
        code2 = totp.now()
        assert mfa_mod.verify_code("testuser", code2) is True

        # Verify with wrong code
        assert mfa_mod.verify_code("testuser", "000000") is False

    @pytest.mark.unit
    def test_enroll_wrong_code(self, tmp_path, monkeypatch):
        from src.core import config as config_mod
        from src.core import mfa as mfa_mod

        monkeypatch.setattr(
            config_mod.settings, "audit_log_path", str(tmp_path / "audit.log")
        )
        monkeypatch.setattr(config_mod.settings, "mfa_enabled", True)

        secret = mfa_mod.generate_secret()
        result = mfa_mod.enroll("testuser", secret, "000000")
        assert result is False
        assert not mfa_mod.is_enrolled("testuser")

    @pytest.mark.unit
    def test_unenroll(self, tmp_path, monkeypatch):
        from src.core import config as config_mod
        from src.core import mfa as mfa_mod

        monkeypatch.setattr(
            config_mod.settings, "audit_log_path", str(tmp_path / "audit.log")
        )
        monkeypatch.setattr(config_mod.settings, "mfa_enabled", True)

        secret = mfa_mod.generate_secret()
        code = pyotp.TOTP(secret).now()
        mfa_mod.enroll("testuser", secret, code)

        assert mfa_mod.unenroll("testuser") is True
        assert not mfa_mod.is_enrolled("testuser")

    @pytest.mark.unit
    def test_should_require_mfa_disabled(self):
        from src.core import config as config_mod
        from src.core import mfa as mfa_mod

        config_mod.settings.mfa_enabled = False
        assert mfa_mod.should_require_mfa("anyone") is False

    @pytest.mark.unit
    def test_should_require_mfa_globally_required(self):
        from src.core import config as config_mod
        from src.core import mfa as mfa_mod

        config_mod.settings.mfa_enabled = True
        config_mod.settings.mfa_required = True
        assert mfa_mod.should_require_mfa("anyone") is True
