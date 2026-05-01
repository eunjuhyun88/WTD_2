"""Real-time scanner: periodically score all symbols and emit signals.

Design (from cogochi-v7 spec):
    - Runs every 1h (aligned to candle close)
    - Scans 30 symbols in parallel (expandable to 1000)
    - For each symbol: fetch klines → compute features → score → ensemble
    - If ensemble direction != neutral → store signal + send alert
    - Rate-limited to 800 weight/min Binance API safety margin

Architecture:
    - Uses asyncio + httpx for parallel API calls (not APScheduler — simpler)
    - Scanner is a plain async function callable from:
      1. FastAPI background task (on startup)
      2. Cron endpoint (external scheduler hits POST /scanner/run)
      3. CLI (python -m scanner.realtime)

    APScheduler alternative was considered but adds a dependency for
    what is essentially "call this function every hour". A cron job
    or Vercel Cron calling POST /scanner/run is more deployment-friendly.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from cache.http_client import get_client
import numpy as np
import pandas as pd

from scanner.feature_calc import compute_features_table, MIN_HISTORY_BARS
from scoring.block_evaluator import evaluate_blocks
from scoring.ensemble import compute_ensemble, EnsembleResult, SignalDirection
from scoring.lightgbm_engine import get_engine as get_lgbm
from models.signal import SignalSnapshot
from research.blocked_candidate_store import insert_blocked_candidate

log = logging.getLogger("engine.scanner")

# Default universe — Binance USDT perpetuals, top 30 by volume
DEFAULT_SYMBOLS: list[str] = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT",
    "MATICUSDT", "UNIUSDT", "ATOMUSDT", "LTCUSDT", "ETCUSDT",
    "FILUSDT", "APTUSDT", "NEARUSDT", "ARBUSDT", "OPUSDT",
    "INJUSDT", "SUIUSDT", "TIAUSDT", "SEIUSDT", "JUPUSDT",
    "WUSDT", "STXUSDT", "IMXUSDT", "RUNEUSDT", "FETUSDT",
]

BINANCE_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines"
BINANCE_RATE_LIMIT_DELAY = 0.1  # 100ms between API calls (safety margin)
KLINES_LIMIT = 600  # slightly above MIN_HISTORY_BARS for warmup


@dataclass
class ScanSignal:
    """A signal emitted by the scanner."""
    symbol: str
    timestamp: datetime
    price: float
    direction: str           # "strong_long" | "long" | "short" | "strong_short"
    ensemble_score: float
    p_win: Optional[float]
    blocks_triggered: list[str]
    confidence: str
    reason: str
    regime: str

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "timestamp": self.timestamp.isoformat(),
            "price": self.price,
            "direction": self.direction,
            "ensemble_score": round(self.ensemble_score, 4),
            "p_win": round(self.p_win, 4) if self.p_win is not None else None,
            "blocks_triggered": self.blocks_triggered,
            "confidence": self.confidence,
            "reason": self.reason,
            "regime": self.regime,
        }


@dataclass
class ScanResult:
    """Result of a full scan cycle."""
    scanned_at: datetime
    n_symbols: int
    n_signals: int
    signals: list[ScanSignal]
    errors: list[str]
    duration_sec: float

    def to_dict(self) -> dict:
        return {
            "scanned_at": self.scanned_at.isoformat(),
            "n_symbols": self.n_symbols,
            "n_signals": self.n_signals,
            "signals": [s.to_dict() for s in self.signals],
            "errors": self.errors,
            "duration_sec": round(self.duration_sec, 2),
        }


async def _fetch_klines(
    client: httpx.AsyncClient,
    symbol: str,
    interval: str = "1h",
    limit: int = KLINES_LIMIT,
) -> Optional[pd.DataFrame]:
    """Fetch klines from Binance Futures API."""
    try:
        resp = await client.get(
            BINANCE_KLINES_URL,
            params={"symbol": symbol, "interval": interval, "limit": limit},
            timeout=10.0,
        )
        resp.raise_for_status()
        raw = resp.json()

        data = {
            "open": [float(k[1]) for k in raw],
            "high": [float(k[2]) for k in raw],
            "low": [float(k[3]) for k in raw],
            "close": [float(k[4]) for k in raw],
            "volume": [float(k[5]) for k in raw],
            "taker_buy_base_volume": [float(k[9]) for k in raw],
        }
        timestamps = pd.to_datetime([k[0] for k in raw], unit="ms", utc=True)
        return pd.DataFrame(data, index=timestamps)

    except Exception as exc:
        log.warning("Failed to fetch klines for %s: %s", symbol, exc)
        return None


def _score_symbol(
    symbol: str,
    klines_df: pd.DataFrame,
) -> Optional[ScanSignal]:
    """Run full scoring pipeline on one symbol's klines."""
    if len(klines_df) < MIN_HISTORY_BARS:
        return None

    try:
        features_df = compute_features_table(klines_df, symbol)
    except Exception as exc:
        log.debug("Feature calc failed for %s: %s", symbol, exc)
        return None

    last_row = features_df.iloc[-1]

    # Build snapshot for LightGBM
    snapshot = SignalSnapshot(
        symbol=symbol,
        timestamp=last_row.name.to_pydatetime().replace(tzinfo=timezone.utc),
        price=float(last_row["price"]),
        ema20_slope=float(last_row["ema20_slope"]),
        ema50_slope=float(last_row["ema50_slope"]),
        ema_alignment=last_row["ema_alignment"],
        price_vs_ema50=float(last_row["price_vs_ema50"]),
        rsi14=float(last_row["rsi14"]),
        rsi14_slope=float(last_row["rsi14_slope"]),
        macd_hist=float(last_row["macd_hist"]),
        roc_10=float(last_row["roc_10"]),
        atr_pct=float(last_row["atr_pct"]),
        atr_ratio_short_long=float(last_row["atr_ratio_short_long"]),
        bb_width=float(last_row["bb_width"]),
        bb_position=float(last_row["bb_position"]),
        volume_24h=float(last_row["volume_24h"]),
        vol_ratio_3=float(last_row["vol_ratio_3"]),
        obv_slope=float(last_row["obv_slope"]),
        htf_structure=last_row["htf_structure"],
        dist_from_20d_high=float(last_row["dist_from_20d_high"]),
        dist_from_20d_low=float(last_row["dist_from_20d_low"]),
        swing_pivot_distance=float(last_row["swing_pivot_distance"]),
        funding_rate=float(last_row["funding_rate"]),
        oi_change_1h=float(last_row["oi_change_1h"]),
        oi_change_24h=float(last_row["oi_change_24h"]),
        long_short_ratio=float(last_row["long_short_ratio"]),
        cvd_state=last_row["cvd_state"],
        taker_buy_ratio_1h=float(last_row["taker_buy_ratio_1h"]),
        regime=last_row["regime"],
        hour_of_day=int(last_row["hour_of_day"]),
        day_of_week=int(last_row["day_of_week"]),
    )

    # LightGBM P(win)
    lgbm = get_lgbm()
    p_win = lgbm.predict_one(snapshot)

    # Building blocks
    blocks = evaluate_blocks(snapshot, features_df, klines_df)

    # Ensemble
    regime_str = snapshot.regime.value if hasattr(snapshot.regime, "value") else str(snapshot.regime)
    ensemble = compute_ensemble(p_win, blocks, regime_str)

    # Only emit if not neutral; log every blocked signal for counterfactual analysis
    if ensemble.direction == SignalDirection.NEUTRAL:
        insert_blocked_candidate(
            symbol=symbol,
            timeframe="1h",
            direction="neutral",
            reason="below_min_conviction",
            score=ensemble.ensemble_score,
            p_win=p_win,
        )
        return None

    return ScanSignal(
        symbol=symbol,
        timestamp=snapshot.timestamp,
        price=snapshot.price,
        direction=ensemble.direction.value,
        ensemble_score=ensemble.ensemble_score,
        p_win=p_win,
        blocks_triggered=blocks,
        confidence=ensemble.confidence,
        reason=ensemble.reason,
        regime=regime_str,
    )


async def run_scan(
    symbols: Optional[list[str]] = None,
    concurrency: int = 5,
) -> ScanResult:
    """Run a full scan cycle across all symbols.

    Args:
        symbols:     list of symbols to scan (default: DEFAULT_SYMBOLS).
        concurrency: max concurrent API calls.

    Returns:
        ScanResult with all signals and errors.
    """
    symbols = symbols or DEFAULT_SYMBOLS
    start = time.monotonic()
    scanned_at = datetime.now(timezone.utc)

    signals: list[ScanSignal] = []
    errors: list[str] = []
    semaphore = asyncio.Semaphore(concurrency)

    async def scan_one(client: httpx.AsyncClient, sym: str) -> None:
        async with semaphore:
            await asyncio.sleep(BINANCE_RATE_LIMIT_DELAY)  # rate limit
            klines_df = await _fetch_klines(client, sym)
            if klines_df is None:
                errors.append(f"{sym}: fetch failed")
                return

            # Score in thread pool (CPU-bound numpy/lightgbm)
            loop = asyncio.get_event_loop()
            try:
                signal = await loop.run_in_executor(None, _score_symbol, sym, klines_df)
                if signal is not None:
                    signals.append(signal)
            except Exception as exc:
                errors.append(f"{sym}: {exc}")

    client = get_client()
    tasks = [scan_one(client, sym) for sym in symbols]
    await asyncio.gather(*tasks, return_exceptions=True)

    duration = time.monotonic() - start
    log.info(
        "Scan complete: %d symbols, %d signals, %.1fs",
        len(symbols), len(signals), duration,
    )

    return ScanResult(
        scanned_at=scanned_at,
        n_symbols=len(symbols),
        n_signals=len(signals),
        signals=signals,
        errors=errors,
        duration_sec=duration,
    )
