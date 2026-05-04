"""Unit tests for _decrypt_api_key in binance_tools.py.

Verifies dual-format (3-part legacy / 4-part per-user-salt) decryption.
Does not require live network or Supabase.
"""
from __future__ import annotations

import os

import pytest


def _make_legacy_ciphertext(plaintext: str, master_key: str) -> str:
    """Produce a 3-part legacy ciphertext (hardcoded salt='cogochi-salt')."""
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
    import secrets

    kdf = Scrypt(salt=b"cogochi-salt", length=32, n=16384, r=8, p=1, backend=default_backend())
    derived_key = kdf.derive(master_key.encode())

    iv = secrets.token_bytes(16)
    aesgcm = AESGCM(derived_key)
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode(), None)
    # AESGCM appends 16-byte tag at end
    enc = ct_with_tag[:-16]
    auth_tag = ct_with_tag[-16:]
    return f"{iv.hex()}:{auth_tag.hex()}:{enc.hex()}"


def _make_new_ciphertext(plaintext: str, master_key: str) -> str:
    """Produce a 4-part per-user-salt ciphertext."""
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
    import secrets

    salt = secrets.token_bytes(16)
    kdf = Scrypt(salt=salt, length=32, n=16384, r=8, p=1, backend=default_backend())
    derived_key = kdf.derive(master_key.encode())

    iv = secrets.token_bytes(16)
    aesgcm = AESGCM(derived_key)
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode(), None)
    enc = ct_with_tag[:-16]
    auth_tag = ct_with_tag[-16:]
    return f"{salt.hex()}:{iv.hex()}:{auth_tag.hex()}:{enc.hex()}"


MASTER_KEY = "test-encryption-key-32-bytes-ok!"


@pytest.fixture(autouse=True)
def set_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EXCHANGE_ENCRYPTION_KEY", MASTER_KEY)


def test_decrypt_4part_new_format() -> None:
    from engine.agents.tools.binance_tools import _decrypt_api_key

    ct = _make_new_ciphertext("my-binance-api-key", MASTER_KEY)
    assert ct.count(":") == 3, "4-part should have 3 colons"
    assert _decrypt_api_key(ct) == "my-binance-api-key"


def test_decrypt_3part_legacy_format() -> None:
    from engine.agents.tools.binance_tools import _decrypt_api_key

    ct = _make_legacy_ciphertext("old-api-secret", MASTER_KEY)
    assert ct.count(":") == 2, "3-part should have 2 colons"
    assert _decrypt_api_key(ct) == "old-api-secret"


def test_two_encryptions_differ() -> None:
    ct_a = _make_new_ciphertext("same-key", MASTER_KEY)
    ct_b = _make_new_ciphertext("same-key", MASTER_KEY)
    assert ct_a != ct_b, "per-user salt must produce unique ciphertexts"


def test_invalid_format_raises() -> None:
    from engine.agents.tools.binance_tools import _decrypt_api_key

    with pytest.raises(ValueError, match="Invalid ciphertext format"):
        _decrypt_api_key("only:two:parts:extra:junk")

    with pytest.raises(ValueError, match="Invalid ciphertext format"):
        _decrypt_api_key("notEnoughParts")


def test_missing_env_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    from engine.agents.tools.binance_tools import _decrypt_api_key

    monkeypatch.delenv("EXCHANGE_ENCRYPTION_KEY", raising=False)
    ct = _make_new_ciphertext("x", MASTER_KEY)
    with pytest.raises(ValueError, match="EXCHANGE_ENCRYPTION_KEY is not set"):
        _decrypt_api_key(ct)
