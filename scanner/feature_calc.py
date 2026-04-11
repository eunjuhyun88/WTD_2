"""Deterministic feature calculators for SignalSnapshot.

CRITICAL CONTRACT: every function in this module is PAST-ONLY. Given a
klines DataFrame `k` indexed 0..t (most recent bar at row t), each feature
must be computable using only rows 0..t. No look-ahead, no use of future
bars. This is the first line of defence against look-ahead bias in
autoresearch-discovered patterns.

The top-level `compute_snapshot(klines, symbol, perp=None)` takes a klines
DataFrame whose LAST row is the bar we are producing a snapshot for, and
returns a fully-formed `SignalSnapshot`.

Input DataFrame schema (required columns):
    open, high, low, close, volume, taker_buy_base_volume
Index: pandas DatetimeIndex in UTC.

Optional `perp` dict may carry historical perp series keyed by timestamp
for `funding_rate`, `oi`, `long_short_ratio`. Missing keys fall back to
documented defaults, which is acceptable for the klines-first initial
swarm iteration.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd

from models.signal import (
    CVDState,
    EMAAlignment,
    HTFStructure,
    Regime,
    SignalSnapshot,
)

# Minimum history required before a snapshot is meaningful. The slowest
# indicator we use is EMA200 (needs at least ~200 bars to stabilise) and
# the 20d-high window (480 hourly bars). Below this, several features
# would be NaN or wildly biased by warmup.
MIN_HISTORY_BARS = 500


# =========================================================================
# Primitive indicators (all past-only)
# =========================================================================


def _ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def _sma(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window=window, min_periods=window).mean()


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi.fillna(50.0)


def _macd_hist(close: pd.Series) -> pd.Series:
    ema12 = _ema(close, 12)
    ema26 = _ema(close, 26)
    macd = ema12 - ema26
    signal = _ema(macd, 9)
    return macd - signal


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low).abs(), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False).mean()


def _bollinger(close: pd.Series, window: int = 20, k: float = 2.0):
    mid = _sma(close, window)
    std = close.rolling(window=window, min_periods=window).std(ddof=0)
    upper = mid + k * std
    lower = mid - k * std
    return lower, mid, upper


def _obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    direction = np.sign(close.diff().fillna(0.0))
    return (direction * volume).cumsum()


# =========================================================================
# Per-feature helpers
# =========================================================================


def _slope_pct(series: pd.Series, k: int) -> float:
    """Fractional change of `series` over k bars, using only past values."""
    if len(series) <= k:
        return 0.0
    now = series.iloc[-1]
    past = series.iloc[-1 - k]
    if past == 0 or np.isnan(past) or np.isnan(now):
        return 0.0
    return float((now - past) / abs(past))


def _slope_abs(series: pd.Series, k: int) -> float:
    """Absolute difference of `series` over k bars."""
    if len(series) <= k:
        return 0.0
    now = series.iloc[-1]
    past = series.iloc[-1 - k]
    if np.isnan(past) or np.isnan(now):
        return 0.0
    return float(now - past)


def _ema_alignment(ema20: float, ema50: float, ema200: float) -> EMAAlignment:
    if ema20 > ema50 > ema200:
        return EMAAlignment.BULLISH
    if ema20 < ema50 < ema200:
        return EMAAlignment.BEARISH
    return EMAAlignment.NEUTRAL


def _htf_structure(close: pd.Series, window: int = 120) -> HTFStructure:
    """Rough higher-timeframe structure from a linear fit of log-close."""
    if len(close) < window:
        return HTFStructure.RANGE
    tail = np.log(close.iloc[-window:].to_numpy())
    x = np.arange(window, dtype=float)
    slope = np.polyfit(x, tail, 1)[0]
    # Normalised slope threshold — ~0.1% per bar over the window.
    thresh = 0.001
    if slope > thresh:
        return HTFStructure.UPTREND
    if slope < -thresh:
        return HTFStructure.DOWNTREND
    return HTFStructure.RANGE


def _cvd_state(taker_buy_ratio: float) -> CVDState:
    if taker_buy_ratio >= 0.55:
        return CVDState.BUYING
    if taker_buy_ratio <= 0.45:
        return CVDState.SELLING
    return CVDState.NEUTRAL


def _regime(close: pd.Series, atr_pct: float) -> Regime:
    """Coarse regime classifier:
      - risk_on: uptrend + moderate vol
      - risk_off: downtrend
      - chop: sideways OR extreme vol
    """
    if len(close) < 50:
        return Regime.CHOP
    trend = _slope_pct(close, 50)
    if atr_pct > 0.05:  # >5% ATR/price on 1h bar = extreme vol
        return Regime.CHOP
    if trend > 0.03:
        return Regime.RISK_ON
    if trend < -0.03:
        return Regime.RISK_OFF
    return Regime.CHOP


def _swing_pivot_distance(high: pd.Series, low: pd.Series, lookback: int = 20) -> float:
    """Bars since most recent swing pivot in the last `lookback` bars.
    Positive → since a swing high; negative → since a swing low; 0 if none.
    """
    if len(high) < lookback + 2:
        return 0.0
    window_h = high.iloc[-lookback:].to_numpy()
    window_l = low.iloc[-lookback:].to_numpy()
    argmax = int(np.argmax(window_h))
    argmin = int(np.argmin(window_l))
    bars_since_high = lookback - 1 - argmax
    bars_since_low = lookback - 1 - argmin
    if bars_since_high < bars_since_low:
        return float(bars_since_high)
    return float(-bars_since_low)


# =========================================================================
# Top-level: compute_snapshot
# =========================================================================


def compute_snapshot(
    klines: pd.DataFrame,
    symbol: str,
    perp: Optional[dict] = None,
) -> SignalSnapshot:
    """Compute a SignalSnapshot for the LAST row of `klines`.

    `klines` must be a DataFrame with columns
    [open, high, low, close, volume, taker_buy_base_volume] and a
    DatetimeIndex in UTC. Only rows 0..-1 are consulted (no look-ahead).

    `perp` is an optional dict that may contain any of:
        - funding_rate: float
        - oi_now: float (current OI, quote)
        - oi_1h_ago: float
        - oi_24h_ago: float
        - long_short_ratio: float

    Missing perp data falls back to neutral defaults.
    """
    if len(klines) < MIN_HISTORY_BARS:
        raise ValueError(
            f"compute_snapshot needs ≥{MIN_HISTORY_BARS} bars of history, "
            f"got {len(klines)}"
        )

    close = klines["close"].astype(float)
    high = klines["high"].astype(float)
    low = klines["low"].astype(float)
    volume = klines["volume"].astype(float)
    taker_buy = klines["taker_buy_base_volume"].astype(float)

    price = float(close.iloc[-1])
    ts = klines.index[-1]
    if isinstance(ts, pd.Timestamp):
        ts_dt = ts.to_pydatetime()
    else:
        ts_dt = ts  # type: ignore[assignment]
    if ts_dt.tzinfo is None:
        ts_dt = ts_dt.replace(tzinfo=timezone.utc)

    # --- Trend ---
    ema20_series = _ema(close, 20)
    ema50_series = _ema(close, 50)
    ema200_series = _ema(close, 200)
    ema20 = float(ema20_series.iloc[-1])
    ema50 = float(ema50_series.iloc[-1])
    ema200 = float(ema200_series.iloc[-1])
    ema20_slope = _slope_pct(ema20_series, 5)
    ema50_slope = _slope_pct(ema50_series, 10)
    ema_alignment = _ema_alignment(ema20, ema50, ema200)
    price_vs_ema50 = (price - ema50) / ema50 if ema50 else 0.0

    # --- Momentum ---
    rsi_series = _rsi(close, 14)
    rsi14 = float(rsi_series.iloc[-1])
    rsi14_slope = _slope_abs(rsi_series, 5)
    macd_h_series = _macd_hist(close)
    macd_hist = float(macd_h_series.iloc[-1])
    roc_10 = _slope_pct(close, 10)

    # --- Volatility ---
    atr14 = _atr(high, low, close, 14)
    atr50 = _atr(high, low, close, 50)
    atr_val = float(atr14.iloc[-1])
    atr_pct = atr_val / price if price else 0.0
    atr50_val = float(atr50.iloc[-1])
    atr_ratio_short_long = atr_val / atr50_val if atr50_val else 1.0
    bb_lower, bb_mid, bb_upper = _bollinger(close, window=20, k=2.0)
    bb_lower_v = float(bb_lower.iloc[-1])
    bb_mid_v = float(bb_mid.iloc[-1])
    bb_upper_v = float(bb_upper.iloc[-1])
    bb_width = (bb_upper_v - bb_lower_v) / bb_mid_v if bb_mid_v else 0.0
    bb_range = bb_upper_v - bb_lower_v
    bb_position = (price - bb_lower_v) / bb_range if bb_range else 0.5

    # --- Volume ---
    # Rolling 24h volume on 1h bars = sum of last 24 bars.
    if len(volume) >= 24:
        volume_24h = float(volume.iloc[-24:].sum())
    else:
        volume_24h = float(volume.sum())
    if len(volume) >= 4:
        mean_prev3 = float(volume.iloc[-4:-1].mean())
        vol_ratio_3 = float(volume.iloc[-1]) / mean_prev3 if mean_prev3 > 0 else 1.0
    else:
        vol_ratio_3 = 1.0
    obv_series = _obv(close, volume)
    obv_slope = _slope_pct(obv_series, 20) if len(obv_series) > 20 else 0.0

    # --- Structure / MTF ---
    htf_structure = _htf_structure(close, window=120)
    high_20d_window = 20 * 24  # 480 hourly bars = ~20 trading days
    if len(high) >= high_20d_window:
        high_20d = float(high.iloc[-high_20d_window:].max())
        low_20d = float(low.iloc[-high_20d_window:].min())
    else:
        high_20d = float(high.max())
        low_20d = float(low.min())
    dist_from_20d_high = (price - high_20d) / high_20d if high_20d else 0.0
    dist_from_20d_low = (price - low_20d) / low_20d if low_20d else 0.0
    swing_pivot_distance = _swing_pivot_distance(high, low, lookback=20)

    # --- Microstructure (perp — defaults when missing) ---
    perp = perp or {}
    funding_rate = float(perp.get("funding_rate", 0.0))
    oi_now = perp.get("oi_now")
    oi_1h = perp.get("oi_1h_ago")
    oi_24h = perp.get("oi_24h_ago")
    if oi_now is not None and oi_1h:
        oi_change_1h = float((oi_now - oi_1h) / oi_1h)
    else:
        oi_change_1h = 0.0
    if oi_now is not None and oi_24h:
        oi_change_24h = float((oi_now - oi_24h) / oi_24h)
    else:
        oi_change_24h = 0.0
    long_short_ratio = float(perp.get("long_short_ratio", 1.0))

    # --- Order flow ---
    # taker_buy_ratio_1h: sum(taker_buy_base) / sum(volume) over last 1 bar
    # (on 1h klines a "1h ratio" is just the current bar's ratio).
    last_vol = float(volume.iloc[-1])
    if last_vol > 0:
        taker_buy_ratio_1h = float(taker_buy.iloc[-1]) / last_vol
    else:
        taker_buy_ratio_1h = 0.5
    taker_buy_ratio_1h = max(0.0, min(1.0, taker_buy_ratio_1h))
    cvd_state = _cvd_state(taker_buy_ratio_1h)

    # --- Meta ---
    regime = _regime(close, atr_pct)
    hour_of_day = int(ts_dt.astimezone(timezone.utc).hour)
    day_of_week = int(ts_dt.astimezone(timezone.utc).weekday())

    return SignalSnapshot(
        symbol=symbol,
        timestamp=ts_dt.astimezone(timezone.utc),
        price=price,
        # Trend
        ema20_slope=ema20_slope,
        ema50_slope=ema50_slope,
        ema_alignment=ema_alignment,
        price_vs_ema50=price_vs_ema50,
        # Momentum
        rsi14=rsi14,
        rsi14_slope=rsi14_slope,
        macd_hist=macd_hist,
        roc_10=roc_10,
        # Volatility
        atr_pct=atr_pct,
        atr_ratio_short_long=atr_ratio_short_long,
        bb_width=bb_width,
        bb_position=bb_position,
        # Volume
        volume_24h=volume_24h,
        vol_ratio_3=vol_ratio_3,
        obv_slope=obv_slope,
        # Structure
        htf_structure=htf_structure,
        dist_from_20d_high=dist_from_20d_high,
        dist_from_20d_low=dist_from_20d_low,
        swing_pivot_distance=swing_pivot_distance,
        # Microstructure
        funding_rate=funding_rate,
        oi_change_1h=oi_change_1h,
        oi_change_24h=oi_change_24h,
        long_short_ratio=long_short_ratio,
        # Order flow
        cvd_state=cvd_state,
        taker_buy_ratio_1h=taker_buy_ratio_1h,
        # Meta
        regime=regime,
        hour_of_day=hour_of_day,
        day_of_week=day_of_week,
    )
