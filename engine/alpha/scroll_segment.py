"""Scroll segment analyser (W-0384).

(symbol, from_ts, to_ts) → indicator snapshot + anomaly flags + alpha score.

Uses data_cache.loader.load_klines (existing SQLite cache) — no new HTTP calls for OHLCV.
Anomaly detection: Z-score against 20-bar rolling window (|z|≥2.5 high, ≥1.8 medium, ≥1.3 low).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("engine.alpha.scroll_segment")


@dataclass
class AnomalyFlag:
    ts: datetime
    dimension: str      # "volume_spike" | "oi_jump" | "funding_extreme" | "candle_pattern"
    severity: str       # "high" | "medium" | "low"
    description: str
    z_score: float


@dataclass
class ScrollSegmentRequest:
    symbol: str
    from_ts: datetime
    to_ts: datetime
    timeframe: str = "1h"


@dataclass
class ScrollSegmentResult:
    symbol: str
    from_ts: datetime
    to_ts: datetime
    timeframe: str
    n_bars: int
    indicator_snapshot: dict[str, float]
    anomaly_flags: list[AnomalyFlag] = field(default_factory=list)
    alpha_score: Any | None = None   # AlphaScoreResult, set by caller to avoid circular dep


def _z_anomalies(
    series: "pd.Series",
    label: str,
    window: int = 20,
    *,
    high_z: float = 2.5,
    med_z: float = 1.8,
    low_z: float = 1.3,
) -> list[tuple[int, float]]:
    """Return (index_position, z_score) for bars that exceed thresholds."""
    import pandas as pd
    roll_mean = series.rolling(window, min_periods=max(3, window // 4)).mean()
    roll_std = series.rolling(window, min_periods=max(3, window // 4)).std()
    z = (series - roll_mean) / roll_std.replace(0, float("nan"))
    results = []
    for i, (_, zv) in enumerate(z.items()):
        if zv != zv:  # NaN
            continue
        az = abs(zv)
        if az >= low_z:
            results.append((i, float(zv)))
    return results


def _severity(az: float) -> str:
    if az >= 2.5:
        return "high"
    if az >= 1.8:
        return "medium"
    return "low"


def _detect_candle_patterns(klines: "pd.DataFrame") -> list[tuple[datetime, str]]:
    """Detect hammer / shooting_star / engulfing from OHLC ratios."""
    patterns: list[tuple[datetime, str]] = []
    for i in range(len(klines)):
        row = klines.iloc[i]
        o, h, l, c = float(row["open"]), float(row["high"]), float(row["low"]), float(row["close"])
        body = abs(c - o)
        upper_wick = h - max(c, o)
        lower_wick = min(c, o) - l
        full_range = h - l or 1e-9
        ts = klines.index[i]
        if isinstance(ts, int):
            ts = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        if lower_wick > body * 2 and upper_wick < body * 0.5:
            patterns.append((ts, "hammer"))
        elif upper_wick > body * 2 and lower_wick < body * 0.5:
            patterns.append((ts, "shooting_star"))
        elif i > 0:
            prev = klines.iloc[i - 1]
            po, pc = float(prev["open"]), float(prev["close"])
            if pc < po and c > po and o < pc:
                patterns.append((ts, "bullish_engulfing"))
            elif pc > po and c < po and o > pc:
                patterns.append((ts, "bearish_engulfing"))
    return patterns


def analyze_scroll_segment(req: ScrollSegmentRequest) -> ScrollSegmentResult:
    """Synchronous segment analysis using cached OHLCV. I/O only via load_klines (cache-first)."""
    import numpy as np
    import pandas as pd
    from data_cache.loader import load_klines

    symbol = req.symbol.upper()
    from_ts = req.from_ts
    to_ts = req.to_ts
    if from_ts.tzinfo is None:
        from_ts = from_ts.replace(tzinfo=timezone.utc)
    if to_ts.tzinfo is None:
        to_ts = to_ts.replace(tzinfo=timezone.utc)

    try:
        klines = load_klines(symbol, req.timeframe, offline=True)
    except Exception as exc:
        log.warning("scroll_segment: load_klines failed for %s: %s", symbol, exc)
        return ScrollSegmentResult(
            symbol=symbol,
            from_ts=from_ts,
            to_ts=to_ts,
            timeframe=req.timeframe,
            n_bars=0,
            indicator_snapshot={},
        )

    if klines is None or klines.empty:
        return ScrollSegmentResult(
            symbol=symbol,
            from_ts=from_ts,
            to_ts=to_ts,
            timeframe=req.timeframe,
            n_bars=0,
            indicator_snapshot={},
        )

    # Align index timezone
    idx = klines.index
    if hasattr(idx, "tz") and idx.tz is None:
        idx = idx.tz_localize("UTC")
        klines = klines.copy()
        klines.index = idx

    window = klines.loc[(klines.index >= from_ts) & (klines.index <= to_ts)]
    if window.empty:
        return ScrollSegmentResult(
            symbol=symbol,
            from_ts=from_ts,
            to_ts=to_ts,
            timeframe=req.timeframe,
            n_bars=0,
            indicator_snapshot={},
        )

    # Need 20-bar context before the window for rolling stats
    context_start = from_ts
    context_all = klines.loc[klines.index <= to_ts].tail(len(window) + 20)

    # ── Indicator snapshot ────────────────────────────────────────────────────
    vol_series = context_all["volume"] if "volume" in context_all else pd.Series(dtype=float)
    vol_ma20 = vol_series.rolling(20, min_periods=3).mean()
    window_vol = vol_series.loc[window.index]
    window_vol_ma = vol_ma20.loc[window.index]
    avg_volume_ratio = float((window_vol / window_vol_ma.replace(0, float("nan"))).mean()) if not window_vol.empty else 1.0

    close = window["close"].astype(float)
    open_ = window["open"].astype(float)
    high = window["high"].astype(float)
    low = window["low"].astype(float)

    body_sizes = (close - open_).abs()
    full_ranges = (high - low).replace(0, 1e-9)
    upper_wicks = (high - close.combine(open_, max)).abs()
    lower_wicks = (close.combine(open_, min) - low).abs()

    max_wick_pct = float(upper_wicks.combine(lower_wicks, max).max() / full_ranges.mean()) if len(full_ranges) else 0.0
    body_ratio = float((body_sizes / full_ranges).mean()) if len(full_ranges) else 0.5

    # RSI (14-period on close, from context)
    def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
        delta = series.diff()
        gain = delta.clip(lower=0).rolling(period, min_periods=1).mean()
        loss = (-delta.clip(upper=0)).rolling(period, min_periods=1).mean()
        rs = gain / loss.replace(0, 1e-9)
        return 100 - 100 / (1 + rs)

    rsi = _rsi(context_all["close"].astype(float))
    rsi_window = rsi.loc[window.index]
    rsi_at_open = float(rsi_window.iloc[0]) if len(rsi_window) else 50.0
    rsi_at_close = float(rsi_window.iloc[-1]) if len(rsi_window) else 50.0

    # Bollinger Bands (20-period)
    bb_close = context_all["close"].astype(float)
    bb_ma = bb_close.rolling(20, min_periods=3).mean()
    bb_std = bb_close.rolling(20, min_periods=3).std()
    bb_upper = bb_ma + 2 * bb_std
    last_close = float(close.iloc[-1]) if len(close) else 0.0
    last_bb_upper = float(bb_upper.loc[window.index].iloc[-1]) if len(bb_upper.loc[window.index]) else 1.0
    price_vs_bb_upper_pct = (last_close - last_bb_upper) / (last_bb_upper or 1.0) * 100

    # ATR (14-period)
    tr = pd.concat([
        high - low,
        (high - context_all["close"].astype(float).shift(1)).abs(),
        (low - context_all["close"].astype(float).shift(1)).abs(),
    ], axis=1).max(axis=1)
    atr = tr.rolling(14, min_periods=3).mean()
    atr_base = float(atr.loc[window.index].mean()) or 1.0
    window_tr = tr.loc[window.index].mean()
    atr_normalized = float(window_tr / atr_base) if atr_base else 1.0

    # Price change over window
    price_change_pct = float((close.iloc[-1] - close.iloc[0]) / close.iloc[0] * 100) if len(close) > 1 else 0.0

    snapshot: dict[str, float] = {
        "avg_volume_ratio": round(avg_volume_ratio, 4),
        "max_wick_pct": round(max_wick_pct, 4),
        "body_ratio": round(body_ratio, 4),
        "rsi_at_open": round(rsi_at_open, 2),
        "rsi_at_close": round(rsi_at_close, 2),
        "price_vs_bb_upper_pct": round(price_vs_bb_upper_pct, 4),
        "atr_normalized": round(atr_normalized, 4),
        "price_change_pct": round(price_change_pct, 4),
        # OI/funding are not in OHLCV cache — set to 0, filled by composite_score
        "oi_change_pct": 0.0,
        "avg_funding_rate": 0.0,
        "funding_extreme_flag": 0.0,
        "avg_buy_pct": 50.0,  # neutral default
    }

    # ── Anomaly detection ─────────────────────────────────────────────────────
    anomalies: list[AnomalyFlag] = []

    # Volume anomalies
    if not vol_series.empty:
        for pos, zv in _z_anomalies(context_all["volume"].astype(float), "volume"):
            bar_idx = context_all.index[pos]
            if bar_idx not in window.index:
                continue
            ts = bar_idx if isinstance(bar_idx, datetime) else datetime.fromtimestamp(
                int(bar_idx) / 1000 if int(bar_idx) > 1e10 else int(bar_idx), tz=timezone.utc
            )
            sev = _severity(abs(zv))
            direction = "상승" if zv > 0 else "감소"
            anomalies.append(AnomalyFlag(
                ts=ts,
                dimension="volume_spike",
                severity=sev,
                description=f"거래량 {direction} 이상: z={zv:.2f}",
                z_score=zv,
            ))

    # Price change anomalies
    pc_series = context_all["close"].astype(float).pct_change() * 100
    for pos, zv in _z_anomalies(pc_series.dropna(), "price_change"):
        bar_idx = pc_series.dropna().index[pos]
        if bar_idx not in window.index:
            continue
        ts = bar_idx if isinstance(bar_idx, datetime) else datetime.fromtimestamp(
            int(bar_idx) / 1000 if int(bar_idx) > 1e10 else int(bar_idx), tz=timezone.utc
        )
        anomalies.append(AnomalyFlag(
            ts=ts,
            dimension="price_spike" if zv > 0 else "price_dump",
            severity=_severity(abs(zv)),
            description=f"가격 {'급등' if zv > 0 else '급락'}: z={zv:.2f}",
            z_score=zv,
        ))

    # Candle pattern anomalies
    for ts, pattern_name in _detect_candle_patterns(window):
        anomalies.append(AnomalyFlag(
            ts=ts,
            dimension="candle_pattern",
            severity="medium",
            description=f"캔들 패턴 감지: {pattern_name}",
            z_score=0.0,
        ))

    return ScrollSegmentResult(
        symbol=symbol,
        from_ts=from_ts,
        to_ts=to_ts,
        timeframe=req.timeframe,
        n_bars=len(window),
        indicator_snapshot=snapshot,
        anomaly_flags=anomalies,
    )
