"""Per-feature scalar helpers and vectorized slope utilities."""
from __future__ import annotations

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from models.signal import (
    CVDState,
    EMAAlignment,
    HTFStructure,
    Regime,
)


def slope_pct(series: pd.Series, k: int) -> float:
    if len(series) <= k:
        return 0.0
    now = series.iloc[-1]
    past = series.iloc[-1 - k]
    if past == 0 or np.isnan(past) or np.isnan(now):
        return 0.0
    return float((now - past) / abs(past))


def slope_abs(series: pd.Series, k: int) -> float:
    if len(series) <= k:
        return 0.0
    now = series.iloc[-1]
    past = series.iloc[-1 - k]
    if np.isnan(past) or np.isnan(now):
        return 0.0
    return float(now - past)


def slope_pct_vec(series: pd.Series, k: int) -> pd.Series:
    past = series.shift(k)
    denom = past.abs()
    out = (series - past) / denom
    return out.where(denom > 0, 0.0).fillna(0.0)


def slope_abs_vec(series: pd.Series, k: int) -> pd.Series:
    return (series - series.shift(k)).fillna(0.0)


def rolling_linear_slope(arr: np.ndarray, window: int) -> np.ndarray:
    n = len(arr)
    out = np.full(n, np.nan, dtype=np.float64)
    if n < window:
        return out
    x = np.arange(window, dtype=np.float64)
    xc = x - x.mean()
    denom = float((xc ** 2).sum())
    windows = sliding_window_view(arr.astype(np.float64), window_shape=window)
    yc = windows - windows.mean(axis=1, keepdims=True)
    slopes = (yc * xc).sum(axis=1) / denom
    out[window - 1:] = slopes
    return out


def rolling_swing_pivot_distance(
    high: np.ndarray, low: np.ndarray, lookback: int
) -> np.ndarray:
    n = len(high)
    out = np.zeros(n, dtype=np.float64)
    if n < lookback:
        return out
    h_windows = sliding_window_view(high.astype(np.float64), window_shape=lookback)
    l_windows = sliding_window_view(low.astype(np.float64), window_shape=lookback)
    bars_since_high = (lookback - 1) - h_windows.argmax(axis=1)
    bars_since_low = (lookback - 1) - l_windows.argmin(axis=1)
    result = np.where(
        bars_since_high < bars_since_low,
        bars_since_high.astype(np.float64),
        -bars_since_low.astype(np.float64),
    )
    out[lookback - 1:] = result
    return out


def ema_alignment(ema20: float, ema50: float, ema200: float) -> EMAAlignment:
    if ema20 > ema50 > ema200:
        return EMAAlignment.BULLISH
    if ema20 < ema50 < ema200:
        return EMAAlignment.BEARISH
    return EMAAlignment.NEUTRAL


def htf_structure(close: pd.Series, window: int = 120) -> HTFStructure:
    if len(close) < window:
        return HTFStructure.RANGE
    tail = np.log(close.iloc[-window:].to_numpy())
    x = np.arange(window, dtype=float)
    s = np.polyfit(x, tail, 1)[0]
    thresh = 0.001
    if s > thresh:
        return HTFStructure.UPTREND
    if s < -thresh:
        return HTFStructure.DOWNTREND
    return HTFStructure.RANGE


def cvd_state(taker_buy_ratio: float) -> CVDState:
    if taker_buy_ratio >= 0.55:
        return CVDState.BUYING
    if taker_buy_ratio <= 0.45:
        return CVDState.SELLING
    return CVDState.NEUTRAL


def regime(close: pd.Series, atr_pct: float) -> Regime:
    if len(close) < 50:
        return Regime.CHOP
    trend = slope_pct(close, 50)
    if atr_pct > 0.05:
        return Regime.CHOP
    if trend > 0.03:
        return Regime.RISK_ON
    if trend < -0.03:
        return Regime.RISK_OFF
    return Regime.CHOP


def swing_pivot_distance(high: pd.Series, low: pd.Series, lookback: int = 20) -> float:
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
