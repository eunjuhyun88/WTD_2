"""Migration: re-encrypt exchange_connections API keys with per-user random salt.

Reads every row whose api_key_encrypted / api_secret_encrypted is in the legacy
3-part format ({iv}:{tag}:{enc}), decrypts it, and re-encrypts using the new
4-part per-user-salt format ({salt}:{iv}:{tag}:{enc}).

Idempotent: rows already in 4-part format are skipped.
Rows that fail to decrypt are marked status='invalid' (NOT deleted) so the
user can re-register their API key.

Usage:
    EXCHANGE_ENCRYPTION_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
        python engine/scripts/migrate_scrypt_salt.py [--dry-run]

Verification after run:
    SELECT count(*) FROM exchange_connections
    WHERE array_length(string_to_array(api_key_encrypted, ':'), 1) = 3;
    -- expect 0
"""
from __future__ import annotations

import argparse
import logging
import os
import secrets
import sys
from typing import Any

log = logging.getLogger("migrate_scrypt_salt")
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")


def _require_env(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        sys.exit(f"ERROR: {name} environment variable is required")
    return val


def _make_scrypt_kdf(salt: bytes) -> bytes:
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

    master_key = _require_env("EXCHANGE_ENCRYPTION_KEY").encode()
    kdf = Scrypt(salt=salt, length=32, n=16384, r=8, p=1, backend=default_backend())
    return kdf.derive(master_key)


def _decrypt(ciphertext: str) -> str:
    """Decrypt 3-part or 4-part ciphertext."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    parts = ciphertext.split(":")
    if len(parts) == 4:
        salt = bytes.fromhex(parts[0])
        iv_hex, auth_tag_hex, enc_hex = parts[1], parts[2], parts[3]
    elif len(parts) == 3:
        salt = b"cogochi-salt"
        iv_hex, auth_tag_hex, enc_hex = parts[0], parts[1], parts[2]
    else:
        raise ValueError(f"Unexpected ciphertext parts: {len(parts)}")

    derived = _make_scrypt_kdf(salt)
    iv = bytes.fromhex(iv_hex)
    auth_tag = bytes.fromhex(auth_tag_hex)
    encrypted = bytes.fromhex(enc_hex)

    aesgcm = AESGCM(derived)
    return aesgcm.decrypt(iv, encrypted + auth_tag, None).decode()


def _encrypt(plaintext: str) -> str:
    """Encrypt with a fresh random salt → 4-part ciphertext."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    salt = secrets.token_bytes(16)
    derived = _make_scrypt_kdf(salt)
    iv = secrets.token_bytes(16)

    aesgcm = AESGCM(derived)
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode(), None)
    enc = ct_with_tag[:-16]
    auth_tag = ct_with_tag[-16:]
    return f"{salt.hex()}:{iv.hex()}:{auth_tag.hex()}:{enc.hex()}"


def _is_legacy(ciphertext: str) -> bool:
    return ciphertext.count(":") == 2


def main(dry_run: bool) -> None:
    from supabase import create_client

    sb = create_client(
        _require_env("SUPABASE_URL"),
        _require_env("SUPABASE_SERVICE_ROLE_KEY"),
    )

    result = sb.table("exchange_connections").select("id, api_key_encrypted, api_secret_encrypted, status").execute()
    rows: list[dict[str, Any]] = result.data or []

    legacy_rows = [r for r in rows if _is_legacy(r["api_key_encrypted"]) or _is_legacy(r["api_secret_encrypted"])]
    log.info("Total rows: %d | Legacy (3-part): %d", len(rows), len(legacy_rows))

    if not legacy_rows:
        log.info("Nothing to migrate.")
        return

    migrated = 0
    invalidated = 0

    for row in legacy_rows:
        row_id = row["id"]
        try:
            plain_key = _decrypt(row["api_key_encrypted"])
            plain_secret = _decrypt(row["api_secret_encrypted"])
            new_key_enc = _encrypt(plain_key)
            new_secret_enc = _encrypt(plain_secret)

            if dry_run:
                log.info("[DRY-RUN] would re-encrypt row %s", row_id)
            else:
                sb.table("exchange_connections").update({
                    "api_key_encrypted": new_key_enc,
                    "api_secret_encrypted": new_secret_enc,
                }).eq("id", row_id).execute()
                log.info("re-encrypted row %s", row_id)
            migrated += 1

        except Exception as exc:
            log.warning("row %s decrypt failed (%s) → marking invalid", row_id, exc)
            if not dry_run:
                sb.table("exchange_connections").update({"status": "invalid"}).eq("id", row_id).execute()
            invalidated += 1

    log.info(
        "%s | migrated=%d invalid=%d",
        "DRY-RUN summary" if dry_run else "Done",
        migrated,
        invalidated,
    )

    if not dry_run and invalidated:
        log.warning(
            "%d row(s) could not be decrypted and were marked status='invalid'. "
            "Affected users must re-register their Binance API key.",
            invalidated,
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing to DB")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
