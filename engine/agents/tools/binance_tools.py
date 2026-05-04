"""Binance user data tools — balance + positions.

DB에서 암호화된 API 키를 조회해서 복호화한 뒤 Binance REST API를 호출합니다.
API key/secret은 절대 로그에 기록하지 않습니다.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any

log = logging.getLogger("engine.agents.tools.binance")

# Pattern for redacting API keys in output (should never appear, but defense-in-depth)
_API_KEY_PATTERN_LEN = 64


def _decrypt_api_key(ciphertext: str) -> str:
    """Decrypt AES-256-GCM ciphertext from binanceConnector.ts format.

    Format: "{iv_hex}:{authTag_hex}:{encrypted_hex}"
    Key derivation: scrypt(EXCHANGE_ENCRYPTION_KEY, 'cogochi-salt', 32)
    """
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

    raw_key = os.environ.get("EXCHANGE_ENCRYPTION_KEY", "").strip()
    if not raw_key:
        raise ValueError("EXCHANGE_ENCRYPTION_KEY is not set")

    # Derive 32-byte key using scrypt (matches JS: crypto.scryptSync(key, 'cogochi-salt', 32))
    kdf = Scrypt(salt=b"cogochi-salt", length=32, n=16384, r=8, p=1, backend=default_backend())
    derived_key = kdf.derive(raw_key.encode())

    parts = ciphertext.split(":")
    if len(parts) != 3:
        raise ValueError("Invalid ciphertext format")

    iv = bytes.fromhex(parts[0])
    auth_tag = bytes.fromhex(parts[1])
    encrypted = bytes.fromhex(parts[2])

    aesgcm = AESGCM(derived_key)
    # AESGCM expects ciphertext + tag concatenated
    plaintext = aesgcm.decrypt(iv, encrypted + auth_tag, None)
    return plaintext.decode()


async def _get_user_credentials(user_id: str) -> tuple[str, str] | None:
    """Fetch + decrypt user's Binance API key and secret from DB."""
    import asyncio

    def _fetch() -> list[dict[str, Any]]:
        from supabase import create_client

        sb = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
        result = (
            sb.table("exchange_connections")
            .select("api_key_encrypted, api_secret_encrypted")
            .eq("user_id", user_id)
            .eq("exchange", "binance")
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        return result.data

    rows = await asyncio.to_thread(_fetch)
    if not rows:
        return None

    row = rows[0]
    try:
        api_key = _decrypt_api_key(row["api_key_encrypted"])
        api_secret = _decrypt_api_key(row["api_secret_encrypted"])
        return api_key, api_secret
    except Exception as exc:
        log.warning("[binance_tools] decrypt failed: %s", exc)
        return None


def _binance_sign(params: dict[str, str], secret: str) -> str:
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return hmac.new(secret.encode(), query.encode(), hashlib.sha256).hexdigest()


def _redact(text: str) -> str:
    """Redact any 64-char alphanumeric sequences (potential API keys) from output."""
    import re

    return re.sub(r"[A-Za-z0-9]{64}", "****REDACTED****", text)


async def get_binance_balance(user_id: str | None) -> dict[str, Any]:
    """Fetch Binance spot account balances (non-zero only)."""
    if not user_id:
        return {"error": "인증이 필요합니다. 로그인 후 이용해주세요."}

    creds = await _get_user_credentials(user_id)
    if creds is None:
        return {
            "error": "Binance API Key가 등록되지 않았습니다. Settings → Exchange 탭에서 등록해주세요."
        }

    api_key, api_secret = creds

    try:
        ts = str(int(time.time() * 1000))
        params = {"timestamp": ts, "recvWindow": "5000"}
        sig = _binance_sign(params, api_secret)
        params["signature"] = sig

        import httpx

        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(
                "https://api.binance.com/api/v3/account",
                params=params,
                headers={"X-MBX-APIKEY": api_key},
            )

        if not res.is_success:
            body = _redact(res.text)
            return {"error": f"Binance API 오류 {res.status_code}: {body[:200]}"}

        data = res.json()
        balances = [
            {
                "asset": b["asset"],
                "free": float(b["free"]),
                "locked": float(b["locked"]),
            }
            for b in data.get("balances", [])
            if float(b["free"]) > 0 or float(b["locked"]) > 0
        ]
        total_usdt = sum(
            b["free"] + b["locked"]
            for b in balances
            if b["asset"] in ("USDT", "BUSD", "USDC")
        )
        return {
            "balances": balances,
            "total_stablecoin_usdt": round(total_usdt, 2),
            "count": len(balances),
        }

    except Exception as exc:
        log.warning("[binance_tools] balance error: %s", exc)
        return {"error": f"잔고 조회 실패: {exc}"}
    finally:
        # Ensure credentials are not referenced after use
        del api_key, api_secret, creds


async def get_binance_positions(user_id: str | None) -> dict[str, Any]:
    """Fetch Binance Futures open positions."""
    if not user_id:
        return {"error": "인증이 필요합니다. 로그인 후 이용해주세요."}

    creds = await _get_user_credentials(user_id)
    if creds is None:
        return {
            "error": "Binance API Key가 등록되지 않았습니다. Settings → Exchange 탭에서 등록해주세요."
        }

    api_key, api_secret = creds

    try:
        ts = str(int(time.time() * 1000))
        params = {"timestamp": ts, "recvWindow": "5000"}
        sig = _binance_sign(params, api_secret)
        params["signature"] = sig

        import httpx

        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(
                "https://fapi.binance.com/fapi/v2/positionRisk",
                params=params,
                headers={"X-MBX-APIKEY": api_key},
            )

        if not res.is_success:
            body = _redact(res.text)
            if res.status_code == 400:
                return {"positions": [], "note": "Futures 권한 없음 또는 Futures 계정 미개설"}
            return {"error": f"Binance Futures API 오류 {res.status_code}: {body[:200]}"}

        data = res.json()
        positions = [
            {
                "symbol": p["symbol"],
                "side": "LONG" if float(p["positionAmt"]) > 0 else "SHORT",
                "size": abs(float(p["positionAmt"])),
                "entry_price": float(p["entryPrice"]),
                "mark_price": float(p["markPrice"]),
                "unrealized_pnl": round(float(p["unRealizedProfit"]), 4),
                "leverage": int(p.get("leverage", 1)),
            }
            for p in data
            if abs(float(p.get("positionAmt", 0))) > 0
        ]
        return {"positions": positions, "count": len(positions)}

    except Exception as exc:
        log.warning("[binance_tools] positions error: %s", exc)
        return {"error": f"포지션 조회 실패: {exc}"}
    finally:
        del api_key, api_secret, creds
