"""L0 — Global Context Fetcher.

Fetches market-wide context that applies to every symbol:
  - Fear & Greed index        (alternative.me)
  - BTC on-chain metrics      (blockchain.info)
  - Mempool state + fees      (mempool.space)
  - USD/KRW rate              (CoinGecko)
  - Upbit KRW price map       (Upbit)
  - Bithumb KRW price map     (Bithumb)

Returns a fully-populated GlobalCtx. All fetches run in parallel;
individual failures are silently ignored (returns None fields) so
one API outage doesn't block the whole engine.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from cache.http_client import get_client
from market_engine.types import GlobalCtx

log = logging.getLogger("engine.l0")

_TIMEOUT     = httpx.Timeout(8.0)
_MAX_RETRIES = 2       # up to 2 retries after first attempt
_BACKOFF_S   = 0.4     # base backoff multiplied by attempt index


async def _safe_get(client: httpx.AsyncClient, url: str) -> Any | None:
    """GET with exponential backoff on transient errors and 429."""
    for attempt in range(_MAX_RETRIES + 1):
        try:
            r = await client.get(url, timeout=_TIMEOUT)
            if r.status_code == 429:
                wait = _BACKOFF_S * (2 ** attempt)
                log.debug("L0 rate-limited %s, waiting %.1fs", url, wait)
                await asyncio.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_BACKOFF_S * (attempt + 1))
            else:
                log.debug("L0 failed after %d tries %s: %s", attempt + 1, url, e)
                return None
        except Exception as e:
            log.debug("L0 fetch failed %s: %s", url, e)
            return None
    return None


async def fetch_global_ctx() -> GlobalCtx:
    """Fetch all global context in parallel. Takes ~2-4 s."""
    ctx = GlobalCtx()

    c = get_client()
    (fg_data, cg_data, bc_data, mp_data, mp_fees,
     upbit_data, bithumb_data) = await asyncio.gather(
        _safe_get(c, "https://api.alternative.me/fng/?limit=1"),
        _safe_get(c, "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw"),
        _safe_get(c, "https://blockchain.info/stats?format=json"),
        _safe_get(c, "https://mempool.space/api/mempool"),
        _safe_get(c, "https://mempool.space/api/v1/fees/recommended"),
        _safe_get(c, "https://api.upbit.com/v1/ticker?markets=" + _upbit_market_string()),
        _safe_get(c, "https://api.bithumb.com/public/ticker/ALL_KRW"),
    )

    # ── Fear & Greed ─────────────────────────────────────────────────────
    if fg_data:
        try:
            ctx.fear_greed = int(fg_data["data"][0]["value"])
        except Exception:
            pass

    # ── USD/KRW via USDT/KRW on CoinGecko ───────────────────────────────
    if cg_data:
        try:
            ctx.usd_krw = float(cg_data["tether"]["krw"])
        except Exception:
            pass

    # ── BTC On-chain ─────────────────────────────────────────────────────
    if bc_data:
        try:
            n_tx = int(bc_data.get("n_tx", 0))
            total_btc = float(bc_data.get("total_btc_sent", 0)) / 1e8
            avg_tx_val = (total_btc / n_tx) if n_tx > 0 else 0.0
            ctx.btc_onchain = {
                "n_tx": n_tx,
                "total_btc_sent": total_btc,
                "avg_tx_val": avg_tx_val,
                # Whale proxy: avg tx > 1.5 BTC
                "whale_sig": "HIGH" if avg_tx_val > 1.5 else ("MED" if avg_tx_val > 0.5 else "LOW"),
                # Exchange flow proxy: avg tx > 2 BTC suggests large moves
                "exchange_flow": "WHALE_MOVE" if avg_tx_val > 2.0 else "NORMAL",
            }
        except Exception:
            pass

    # ── Mempool ───────────────────────────────────────────────────────────
    if mp_data:
        try:
            ctx.mempool = {
                "pending_tx": int(mp_data.get("count", 0)),
                "mempool_mb": round(int(mp_data.get("vsize", 0)) / 1e6, 2),
                "total_fee": int(mp_data.get("total_fee", 0)),
            }
        except Exception:
            pass

    if mp_fees:
        ctx.mempool_fees = {
            "fastest_fee": mp_fees.get("fastestFee"),
            "half_hour_fee": mp_fees.get("halfHourFee"),
            "hour_fee": mp_fees.get("hourFee"),
        }

    # ── Upbit KRW price map ───────────────────────────────────────────────
    if upbit_data and isinstance(upbit_data, list):
        for t in upbit_data:
            try:
                market: str = t["market"]           # "KRW-BTC"
                base = market.replace("KRW-", "")
                ctx.upbit_map[base] = float(t["trade_price"])
            except Exception:
                pass

    # ── Bithumb KRW price map ─────────────────────────────────────────────
    if (bithumb_data
            and isinstance(bithumb_data, dict)
            and bithumb_data.get("data")):
        for sym, d in bithumb_data["data"].items():
            if sym == "date":
                continue
            try:
                ctx.bithumb_map[sym] = float(d["closing_price"])
            except Exception:
                pass

    return ctx


# ── Upbit market string builder ────────────────────────────────────────────
_TOP_UPBIT = [
    "BTC","ETH","SOL","XRP","BNB","ADA","AVAX","DOT","NEAR","APT",
    "SUI","SEI","TIA","ATOM","INJ","ARB","OP","MATIC","LINK","FET",
    "AGIX","WLD","ARKM","DOGE","SHIB","PEPE","FLOKI","BONK","WIF",
    "ONDO","HNT","FIL","AXS","SAND","MANA","GALA","LDO","AAVE","UNI",
    "GMX","DYDX","JUP","CRV","SNX","MKR","COMP","GRT","BAND","API3",
]

def _upbit_market_string() -> str:
    return ",".join(f"KRW-{s}" for s in _TOP_UPBIT)
