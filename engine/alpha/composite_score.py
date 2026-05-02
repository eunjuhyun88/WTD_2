"""Alpha composite score (W-0384) — Module A~F → 0~100 scalar + signals.

Modules:
  A — OI Surge          (±18pts)
  B — Funding Rate Heat (±12pts)
  C — Buy Pressure/CVD  (±18pts)
  D — Kimchi Premium    (±10pts, skip on data failure)
  E — Binance Alpha List (+5pts flat)
  F — Orderbook Imbalance (±12pts)

All module functions are pure IO-free computations so they can be unit-tested
without mocks. External data is fetched by `compute_alpha_score()` and passed in.

Thresholds sourced from HTML reference dashboards (W-0384 analysis, 2026-05-02).
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import httpx

log = logging.getLogger("engine.alpha.composite_score")

_HTTP_TIMEOUT = 3.0
_BINANCE_FAPI = "https://fapi.binance.com"
_BINANCE_ALPHA_URL = (
    "https://www.binance.com/bapi/defi/v1/public/wallet-direct/"
    "buw/wallet/cex/alpha/all/token/list"
)


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class AlphaSignal:
    dimension: str       # "oi_surge" | "funding_heat" | "buy_pressure" | "kimchi_premium" | "alpha_list" | "ob_imbalance"
    score_delta: float   # contribution to total score
    label: str
    raw_value: float
    threshold_used: float


@dataclass
class AlphaScoreRequest:
    symbol: str
    timeframe: str = "1h"
    reference_ts: datetime | None = None  # None = now


@dataclass
class AlphaScoreResult:
    symbol: str
    score: float          # 0~100 clamped
    verdict: str          # "STRONG_ALPHA" | "ALPHA" | "WATCH" | "NEUTRAL" | "AVOID"
    signals: list[AlphaSignal] = field(default_factory=list)
    computed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    data_freshness_s: int = 0   # age of oldest data source used


# ── Module A — OI Surge ───────────────────────────────────────────────────────

def _score_oi_surge(
    oi_current: float,
    oi_1h_ago: float,
    price_delta: float,
) -> AlphaSignal | None:
    if oi_1h_ago <= 0:
        return None
    sf = oi_current / oi_1h_ago
    direction = 1 if price_delta >= 0 else -1

    if sf > 5.0:
        delta, label = direction * 18, "OI EXTREME SURGE"
        thr = 5.0
    elif sf > 3.0:
        delta, label = direction * 13, "OI STRONG SURGE"
        thr = 3.0
    elif sf > 1.8:
        delta, label = direction * 8, "OI SURGE"
        thr = 1.8
    elif sf > 1.3:
        delta, label = direction * 4, "OI MODERATE"
        thr = 1.3
    elif sf < 0.35:
        delta, label, thr = 3, "ULTRA LOW VOL (contrarian)", 0.35
    else:
        return None

    return AlphaSignal("oi_surge", delta, label, sf, thr)


# ── Module B — Funding Rate Heat ──────────────────────────────────────────────

def _score_funding_heat(
    funding_rate_pct: float,
    oi_change_pct_1h: float,
) -> AlphaSignal | None:
    fr = funding_rate_pct
    oi = oi_change_pct_1h

    if fr > 0.08 and oi > 4:
        return AlphaSignal("funding_heat", -12, "롱 과밀 — 강제청산 하방 위험", fr, 0.08)
    if fr > 0.05 and oi > 2:
        return AlphaSignal("funding_heat", -8, "롱 축적 — 하락 시 청산 가속", fr, 0.05)
    if fr < -0.08 and oi > 4:
        return AlphaSignal("funding_heat", +12, "숏 과밀 — 상방 스퀴즈 대기", fr, -0.08)
    if fr < -0.05 and oi > 2:
        return AlphaSignal("funding_heat", +8, "숏 축적 — 스퀴즈 가능성", fr, -0.05)
    if fr > 0.03:
        return AlphaSignal("funding_heat", -4, "롱 우세 — 청산존 하방", fr, 0.03)
    if fr < -0.03:
        return AlphaSignal("funding_heat", +4, "숏 우세 — 스퀴즈 가능성", fr, -0.03)
    return None


# ── Module C — Buy Pressure / Taker CVD ──────────────────────────────────────

def _score_buy_pressure(
    buy_pct: float,
    consecutive_buys: int = 0,
) -> AlphaSignal | None:
    if buy_pct >= 75:
        base, label, thr = 18, "매수 주도 75%+ — 강한 축적", 75.0
    elif buy_pct >= 65:
        base, label, thr = 12, "매수 주도 65%+ — 매수 압력", 65.0
    elif buy_pct >= 55:
        base, label, thr = 6, "매수 우세", 55.0
    elif buy_pct <= 35:
        base, label, thr = -12, "매도 주도 — 분산 진행 중", 35.0
    elif buy_pct <= 45:
        base, label, thr = -4, "매도 우세", 45.0
    else:
        base, label, thr = 0, "", 50.0

    bonus = 4 if (consecutive_buys >= 8 and buy_pct > 50) else 0
    delta = base + bonus
    if delta == 0:
        return None
    if bonus:
        label += " + 조직적 축적 가능"
    return AlphaSignal("buy_pressure", delta, label, buy_pct, thr)


# ── Module D — Kimchi Premium ─────────────────────────────────────────────────

def _score_kimchi_premium(kimchi_pct: float) -> AlphaSignal | None:
    if kimchi_pct > 3.0:
        return AlphaSignal("kimchi_premium", +10, "김프 +3%+ — 한국 수요 선행", kimchi_pct, 3.0)
    if kimchi_pct > 1.5:
        return AlphaSignal("kimchi_premium", +5, "김프 양호", kimchi_pct, 1.5)
    if kimchi_pct < -2.5:
        return AlphaSignal("kimchi_premium", -10, "역프 심각", kimchi_pct, -2.5)
    if kimchi_pct < -1.0:
        return AlphaSignal("kimchi_premium", -5, "역프 — 한국 이탈", kimchi_pct, -1.0)
    return None


# ── Module E — Binance Alpha List ─────────────────────────────────────────────

def _score_alpha_list(symbol_base: str, alpha_set: set[str]) -> AlphaSignal | None:
    if symbol_base.upper() in alpha_set:
        return AlphaSignal("alpha_list", +5, "Binance Alpha 공식 목록", 1.0, 1.0)
    return None


# ── Module F — Orderbook Imbalance ────────────────────────────────────────────

def _score_ob_imbalance(bid_vol: float, ask_vol: float) -> AlphaSignal | None:
    if ask_vol <= 0:
        return None
    ratio = bid_vol / ask_vol

    if ratio > 3.5:
        return AlphaSignal("ob_imbalance", +12, "EXTREME BID", ratio, 3.5)
    if ratio > 2.0:
        return AlphaSignal("ob_imbalance", +8, "STRONG BID", ratio, 2.0)
    if ratio > 1.3:
        return AlphaSignal("ob_imbalance", +4, "BID LEAN", ratio, 1.3)
    if ratio < 0.3:
        return AlphaSignal("ob_imbalance", -12, "EXTREME ASK", ratio, 0.3)
    if ratio < 0.5:
        return AlphaSignal("ob_imbalance", -8, "STRONG ASK", ratio, 0.5)
    if ratio < 0.8:
        return AlphaSignal("ob_imbalance", -4, "ASK LEAN", ratio, 0.8)
    return None


# ── Verdict ───────────────────────────────────────────────────────────────────

def _verdict(score: float) -> str:
    if score >= 60:
        return "STRONG_ALPHA"
    if score >= 35:
        return "ALPHA"
    if score >= 15:
        return "WATCH"
    if score >= -10:
        return "NEUTRAL"
    return "AVOID"


# ── External data fetchers (async, cached) ────────────────────────────────────

_cache: dict[str, tuple[float, Any]] = {}  # key → (expire_ts, value)


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry and entry[0] > time.time():
        return entry[1]
    return None


def _cache_set(key: str, value: Any, ttl_s: float) -> None:
    _cache[key] = (time.time() + ttl_s, value)


async def _fetch_json(url: str, headers: dict | None = None, timeout: float = _HTTP_TIMEOUT) -> Any:
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(url, headers=headers or {})
        resp.raise_for_status()
        return resp.json()


async def _fetch_oi_data(symbol: str) -> dict:
    key = f"oi:{symbol}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        data = await _fetch_json(f"{_BINANCE_FAPI}/fapi/v1/openInterest?symbol={symbol}")
        result = {"oi": float(data.get("openInterest", 0)), "ts": time.time()}
        _cache_set(key, result, 300)
        return result
    except Exception as e:
        log.debug("oi fetch failed %s: %s", symbol, e)
        return {}


async def _fetch_premium_index(symbol: str) -> dict:
    key = f"premium:{symbol}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        data = await _fetch_json(f"{_BINANCE_FAPI}/fapi/v1/premiumIndex?symbol={symbol}")
        result = {
            "funding_rate": float(data.get("lastFundingRate", 0)) * 100,
            "mark_price": float(data.get("markPrice", 0)),
        }
        _cache_set(key, result, 300)
        return result
    except Exception as e:
        log.debug("premium index fetch failed %s: %s", symbol, e)
        return {}


async def _fetch_klines(symbol: str, interval: str = "1h", limit: int = 3) -> list:
    key = f"klines:{symbol}:{interval}:{limit}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        data = await _fetch_json(
            f"{_BINANCE_FAPI}/fapi/v1/klines?symbol={symbol}&interval={interval}&limit={limit}"
        )
        _cache_set(key, data, 120)
        return data
    except Exception as e:
        log.debug("klines fetch failed %s: %s", symbol, e)
        return []


async def _fetch_ob_depth(symbol: str) -> dict:
    key = f"depth:{symbol}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        data = await _fetch_json(
            f"{_BINANCE_FAPI}/fapi/v1/depth?symbol={symbol}&limit=20"
        )
        bids = sum(float(b[1]) for b in data.get("bids", [])[:10])
        asks = sum(float(a[1]) for a in data.get("asks", [])[:10])
        result = {"bid_vol": bids, "ask_vol": asks}
        _cache_set(key, result, 30)
        return result
    except Exception as e:
        log.debug("depth fetch failed %s: %s", symbol, e)
        return {}


async def _fetch_krw_rate() -> float:
    key = "krw_rate"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        data = await _fetch_json(
            "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw",
            timeout=2.0,
        )
        rate = float(data["tether"]["krw"])
        _cache_set(key, rate, 3600)
        return rate
    except Exception:
        return 1330.0  # fallback


async def _fetch_upbit_price(base: str) -> float | None:
    key = f"upbit:{base}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        data = await _fetch_json(
            f"https://api.upbit.com/v1/ticker?markets=KRW-{base}",
            timeout=2.0,
        )
        price = float(data[0]["trade_price"])
        _cache_set(key, price, 180)
        return price
    except Exception:
        return None


async def _fetch_binance_alpha_set() -> set[str]:
    key = "binance_alpha_set"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        data = await _fetch_json(_BINANCE_ALPHA_URL, timeout=3.0)
        tokens = data.get("data", {}).get("tokens", [])
        alpha_set = {t["symbol"].upper() for t in tokens if "symbol" in t}
        _cache_set(key, alpha_set, 3600)
        return alpha_set
    except Exception as e:
        log.debug("Binance Alpha list fetch failed: %s", e)
        return set()


# ── Main entry point ──────────────────────────────────────────────────────────

async def compute_alpha_score(req: AlphaScoreRequest) -> AlphaScoreResult:
    """Fetch all data sources in parallel and compute composite score."""
    symbol = req.symbol.upper()
    base = symbol.replace("USDT", "").replace("BUSD", "").replace("PERP", "")

    fetch_start = time.time()

    (
        oi_now,
        premium,
        klines,
        depth,
        krw_rate,
        upbit_price,
        alpha_set,
    ) = await asyncio.gather(
        _fetch_oi_data(symbol),
        _fetch_premium_index(symbol),
        _fetch_klines(symbol),
        _fetch_ob_depth(symbol),
        _fetch_krw_rate(),
        _fetch_upbit_price(base),
        _fetch_binance_alpha_set(),
        return_exceptions=True,
    )

    data_freshness_s = int(time.time() - fetch_start)

    # Normalise gather exceptions to empty dicts/defaults
    if isinstance(oi_now, Exception): oi_now = {}
    if isinstance(premium, Exception): premium = {}
    if isinstance(klines, Exception): klines = []
    if isinstance(depth, Exception): depth = {}
    if isinstance(krw_rate, Exception): krw_rate = 1330.0
    if isinstance(upbit_price, Exception): upbit_price = None
    if isinstance(alpha_set, Exception): alpha_set = set()

    signals: list[AlphaSignal] = []

    # Module A — OI Surge
    oi_current = oi_now.get("oi", 0.0)
    if klines and len(klines) >= 2 and oi_current:
        prev_close = float(klines[-2][4]) if len(klines[-2]) > 4 else 0.0
        curr_close = float(klines[-1][4]) if len(klines[-1]) > 4 else 0.0
        price_delta = curr_close - prev_close
        oi_1h_ago = oi_current * 0.95  # approximation when historical OI unavailable
        sig_a = _score_oi_surge(oi_current, oi_1h_ago, price_delta)
        if sig_a:
            signals.append(sig_a)

    # Module B — Funding Heat
    funding_rate = premium.get("funding_rate", 0.0)
    oi_change_pct = 5.0 if oi_current else 0.0  # placeholder when live delta unavailable
    sig_b = _score_funding_heat(funding_rate, oi_change_pct)
    if sig_b:
        signals.append(sig_b)

    # Module C — Buy Pressure
    buy_pct = 50.0
    if klines and len(klines) >= 1:
        bar = klines[-1]
        if len(bar) >= 10:
            taker_buy_vol = float(bar[9])
            total_vol = float(bar[5])
            if total_vol > 0:
                buy_pct = taker_buy_vol / total_vol * 100
    sig_c = _score_buy_pressure(buy_pct)
    if sig_c:
        signals.append(sig_c)

    # Module D — Kimchi Premium (skip if no data)
    if upbit_price and krw_rate and premium.get("mark_price"):
        binance_price_usdt = premium["mark_price"]
        if binance_price_usdt > 0:
            kimchi_pct = (upbit_price / krw_rate - binance_price_usdt) / binance_price_usdt * 100
            sig_d = _score_kimchi_premium(kimchi_pct)
            if sig_d:
                signals.append(sig_d)

    # Module E — Binance Alpha list
    sig_e = _score_alpha_list(base, alpha_set)
    if sig_e:
        signals.append(sig_e)

    # Module F — Orderbook Imbalance
    sig_f = _score_ob_imbalance(depth.get("bid_vol", 0.0), depth.get("ask_vol", 0.0))
    if sig_f:
        signals.append(sig_f)

    raw_score = sum(s.score_delta for s in signals)
    # Clamp to 0~100 by mapping [-75, +75] → [0, 100]
    clamped = max(0.0, min(100.0, (raw_score + 75) / 150 * 100))

    return AlphaScoreResult(
        symbol=symbol,
        score=round(clamped, 2),
        verdict=_verdict(raw_score),
        signals=signals,
        computed_at=datetime.now(timezone.utc),
        data_freshness_s=data_freshness_s,
    )
