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
from numpy.lib.stride_tricks import sliding_window_view

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


# =========================================================================
# Vectorized feature table — same values as compute_snapshot, all bars at once
# =========================================================================
#
# compute_snapshot is O(N) per call because every indicator recomputes the
# whole window. Calling it for every bar in a long history is O(N²) — fine
# for one symbol × 1 year, prohibitive for 30 symbols × 8 years.
#
# compute_features_table runs each indicator once on the full series using
# pandas/numpy vectorized ops, then returns one row per bar. Output values
# match compute_snapshot exactly (verified by tests/test_features.py).
#
# Used by pattern-scanner-challenge/scan.py to keep the swarm loop fast.


def _slope_pct_vec(series: pd.Series, k: int) -> pd.Series:
    """Vectorized fractional change over k bars. Matches _slope_pct semantics:
    returns 0.0 where past is NaN/zero (instead of NaN)."""
    past = series.shift(k)
    denom = past.abs()
    out = (series - past) / denom
    return out.where(denom > 0, 0.0).fillna(0.0)


def _slope_abs_vec(series: pd.Series, k: int) -> pd.Series:
    """Vectorized absolute difference over k bars (fillna with 0)."""
    return (series - series.shift(k)).fillna(0.0)


def _rolling_linear_slope(arr: np.ndarray, window: int) -> np.ndarray:
    """Slope of linear least-squares fit over each rolling `window` of `arr`.

    Closed form: slope = sum((x-xbar)(y-ybar)) / sum((x-xbar)^2)
    where x = 0..window-1 (so xbar and sum((x-xbar)^2) are constants).

    Returns an array the same length as `arr`. The first `window-1` entries
    are NaN (insufficient history). Implemented with sliding_window_view so
    no Python-level loop runs over the bars.
    """
    n = len(arr)
    out = np.full(n, np.nan, dtype=np.float64)
    if n < window:
        return out
    x = np.arange(window, dtype=np.float64)
    xc = x - x.mean()
    denom = float((xc ** 2).sum())  # constant for all windows
    windows = sliding_window_view(arr.astype(np.float64), window_shape=window)
    yc = windows - windows.mean(axis=1, keepdims=True)
    slopes = (yc * xc).sum(axis=1) / denom
    out[window - 1:] = slopes
    return out


def _rolling_swing_pivot_distance(
    high: np.ndarray, low: np.ndarray, lookback: int
) -> np.ndarray:
    """Vectorized version of _swing_pivot_distance over the full series.

    For each bar t, looks at [t-lookback+1 .. t] and returns:
        +bars_since_high  if a swing high is more recent than a swing low
        -bars_since_low   otherwise (ties → low)
    Where bars_since_X = (lookback - 1) - argmax/argmin in the window.
    """
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


# Core TA + perp columns — fixed, order matters for downstream models.
_CORE_FEATURE_COLUMNS: tuple[str, ...] = (
    "ema20_slope",
    "ema50_slope",
    "ema_alignment",
    "price_vs_ema50",
    "rsi14",
    "rsi14_slope",
    "macd_hist",
    "roc_10",
    "atr_pct",
    "atr_ratio_short_long",
    "bb_width",
    "bb_position",
    "volume_24h",
    "vol_ratio_3",
    "obv_slope",
    "htf_structure",
    "dist_from_20d_high",
    "dist_from_20d_low",
    "swing_pivot_distance",
    "funding_rate",
    "oi_change_1h",
    "oi_change_24h",
    "long_short_ratio",
    "cvd_state",
    "taker_buy_ratio_1h",
    "regime",
    "hour_of_day",
    "day_of_week",
)

# Registry-driven columns — auto-expands when new sources are added to
# data_cache/registry.py. No edits needed here.
from data_cache.registry import all_macro_columns, all_onchain_columns  # noqa: E402

_REGISTRY_COLUMNS: tuple[str, ...] = tuple(
    all_macro_columns() + all_onchain_columns()
)

# Public API: full feature column list used by Context, blocks, and models.
FEATURE_COLUMNS: tuple[str, ...] = _CORE_FEATURE_COLUMNS + _REGISTRY_COLUMNS


def compute_features_table(
    klines: pd.DataFrame,
    symbol: str,
    perp: Optional[pd.DataFrame] = None,
    macro: Optional[pd.DataFrame] = None,
    onchain: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    """Vectorized counterpart to compute_snapshot — one row per bar.

    For each bar t in `klines`, the returned row's feature values are equal
    to what compute_snapshot would produce if called on klines.iloc[:t+1].
    Verified by tests/test_features.py.

    Microstructure features (funding_rate, oi_change_*, long_short_ratio):
    if `perp` is None, `load_perp(symbol, offline=False)` is tried (graceful
    — a miss returns None and is treated as "no perp data"). If still None,
    neutral defaults are used (funding=0, oi_change=0, long_short_ratio=1).
    When perp data exists, it is reindexed onto klines.index with
    forward-fill (so a single funding event sticks for its interval) and
    remaining NaN are filled with the same neutral defaults.

    Macro features (fear_greed, btc_dominance, dxy_slope_5d, vix_close,
    spx_slope_5d): loaded from `macro` DataFrame if provided. Neutral
    defaults used when missing (fear_greed=50, btc_dominance=50, slopes=0,
    vix_close=20). Macro data is daily — forward-filled onto hourly index.

    On-chain features (active_addr_norm): loaded from `onchain` DataFrame
    if provided. Neutral default=0.5 when missing.

    The first MIN_HISTORY_BARS rows are dropped (warmup): EMA200 and the
    20d-high/low window need at least ~500 hourly bars to stabilise.
    """
    if len(klines) < MIN_HISTORY_BARS:
        raise ValueError(
            f"compute_features_table needs ≥{MIN_HISTORY_BARS} bars of history, "
            f"got {len(klines)}"
        )

    close = klines["close"].astype(float)
    high = klines["high"].astype(float)
    low = klines["low"].astype(float)
    volume = klines["volume"].astype(float)
    taker_buy = klines["taker_buy_base_volume"].astype(float)
    index = klines.index

    # --- Trend ---
    ema20 = _ema(close, 20)
    ema50 = _ema(close, 50)
    ema200 = _ema(close, 200)
    ema20_slope = _slope_pct_vec(ema20, 5)
    ema50_slope = _slope_pct_vec(ema50, 10)
    bullish = (ema20 > ema50) & (ema50 > ema200)
    bearish = (ema20 < ema50) & (ema50 < ema200)
    ema_alignment = np.where(
        bullish, EMAAlignment.BULLISH.value,
        np.where(bearish, EMAAlignment.BEARISH.value, EMAAlignment.NEUTRAL.value),
    )
    price_vs_ema50 = (close - ema50) / ema50.replace(0, np.nan)
    price_vs_ema50 = price_vs_ema50.fillna(0.0)

    # --- Momentum ---
    rsi14 = _rsi(close, 14)
    rsi14_slope = _slope_abs_vec(rsi14, 5)
    macd_hist = _macd_hist(close).fillna(0.0)
    roc_10 = _slope_pct_vec(close, 10)

    # --- Volatility ---
    atr14 = _atr(high, low, close, 14)
    atr50 = _atr(high, low, close, 50)
    atr_pct = (atr14 / close.replace(0, np.nan)).fillna(0.0)
    atr_ratio_short_long = (atr14 / atr50.replace(0, np.nan)).fillna(1.0)
    bb_lower, bb_mid, bb_upper = _bollinger(close, window=20, k=2.0)
    bb_width = ((bb_upper - bb_lower) / bb_mid.replace(0, np.nan)).fillna(0.0)
    bb_range = bb_upper - bb_lower
    bb_position = ((close - bb_lower) / bb_range.replace(0, np.nan)).fillna(0.5)

    # --- Volume ---
    # 24h rolling volume on 1h bars. Match compute_snapshot which uses
    # sum of last 24 (or all if <24) — this matches rolling().sum() with
    # min_periods=1 after the warmup drop.
    volume_24h = volume.rolling(24, min_periods=1).sum()
    # vol_ratio_3 = vol[t] / mean(vol[t-1..t-3]) — past 3 bars excluding t
    mean_prev3 = volume.shift(1).rolling(3, min_periods=3).mean()
    vol_ratio_3 = (volume / mean_prev3.replace(0, np.nan)).fillna(1.0)
    obv_series = _obv(close, volume)
    obv_slope = _slope_pct_vec(obv_series, 20)

    # --- Structure ---
    log_close_arr = np.log(close.to_numpy())
    htf_slope = _rolling_linear_slope(log_close_arr, window=120)
    htf_thresh = 0.001
    htf_structure = np.where(
        htf_slope > htf_thresh, HTFStructure.UPTREND.value,
        np.where(htf_slope < -htf_thresh, HTFStructure.DOWNTREND.value, HTFStructure.RANGE.value),
    )

    high_20d_window = 20 * 24  # 480 hourly bars
    high_20d = high.rolling(high_20d_window, min_periods=1).max()
    low_20d = low.rolling(high_20d_window, min_periods=1).min()
    dist_from_20d_high = ((close - high_20d) / high_20d.replace(0, np.nan)).fillna(0.0)
    dist_from_20d_low = ((close - low_20d) / low_20d.replace(0, np.nan)).fillna(0.0)
    swing_pivot_distance = _rolling_swing_pivot_distance(
        high.to_numpy(), low.to_numpy(), lookback=20
    )

    # --- Microstructure (perp) ---
    # Try to load perp data lazily if not provided. A miss or a fetch
    # failure returns None from load_perp and we fall through to the
    # neutral defaults path — same behaviour as the original stub.
    if perp is None:
        try:
            from data_cache import load_perp as _load_perp
            perp = _load_perp(symbol, offline=False)
        except Exception:
            perp = None

    if perp is not None and len(perp) > 0:
        perp_aligned = perp.reindex(index, method="ffill")
        funding_rate = (
            perp_aligned["funding_rate"].fillna(0.0).to_numpy(dtype=np.float64)
        )
        oi_change_1h = (
            perp_aligned["oi_change_1h"].fillna(0.0).to_numpy(dtype=np.float64)
        )
        oi_change_24h = (
            perp_aligned["oi_change_24h"].fillna(0.0).to_numpy(dtype=np.float64)
        )
        long_short_ratio = (
            perp_aligned["long_short_ratio"].fillna(1.0).to_numpy(dtype=np.float64)
        )
    else:
        funding_rate = np.zeros(len(index), dtype=np.float64)
        oi_change_1h = np.zeros(len(index), dtype=np.float64)
        oi_change_24h = np.zeros(len(index), dtype=np.float64)
        long_short_ratio = np.ones(len(index), dtype=np.float64)

    # --- Order flow ---
    last_vol_safe = volume.replace(0, np.nan)
    taker_buy_ratio_1h = (taker_buy / last_vol_safe).clip(0.0, 1.0).fillna(0.5)
    cvd_state = np.where(
        taker_buy_ratio_1h >= 0.55, CVDState.BUYING.value,
        np.where(taker_buy_ratio_1h <= 0.45, CVDState.SELLING.value, CVDState.NEUTRAL.value),
    )

    # --- Macro + On-chain (registry-driven, daily → ffill onto hourly) ---
    # Uses data_cache.registry defaults for any missing column.
    from data_cache.registry import (  # noqa: PLC0415
        MACRO_SOURCES, ONCHAIN_SOURCES,
        macro_defaults, onchain_defaults,
    )

    def _align_bundle(
        bundle: pd.DataFrame | None,
        sources: list,
        defaults: dict,
    ) -> dict[str, np.ndarray]:
        """Forward-fill a daily bundle onto hourly index, fill NaN with defaults."""
        n = len(index)
        if bundle is not None and len(bundle) > 0:
            bundle_idx = bundle.index
            if bundle_idx.tz is None:
                bundle_idx = bundle_idx.tz_localize("UTC")
            aligned = bundle.set_index(bundle_idx).reindex(index, method="ffill")
        else:
            aligned = pd.DataFrame(index=index)

        result: dict[str, np.ndarray] = {}
        for src in sources:
            for col in src.columns:
                default = defaults.get(col, 0.0)
                if col in aligned.columns:
                    result[col] = aligned[col].fillna(default).to_numpy(dtype=np.float64)
                else:
                    result[col] = np.full(n, default, dtype=np.float64)
        return result

    macro_arrays = _align_bundle(macro, MACRO_SOURCES, macro_defaults())
    onchain_arrays = _align_bundle(onchain, ONCHAIN_SOURCES, onchain_defaults())

    # --- Meta — regime ---
    close_slope_50 = _slope_pct_vec(close, 50)
    risk_on = (atr_pct <= 0.05) & (close_slope_50 > 0.03)
    risk_off = (atr_pct <= 0.05) & (close_slope_50 < -0.03)
    regime = np.where(
        risk_on, Regime.RISK_ON.value,
        np.where(risk_off, Regime.RISK_OFF.value, Regime.CHOP.value),
    )

    # --- Meta — time (always UTC) ---
    if isinstance(index, pd.DatetimeIndex):
        idx_utc = index.tz_convert("UTC") if index.tz is not None else index.tz_localize("UTC")
    else:
        idx_utc = pd.DatetimeIndex(index, tz="UTC")
    hour_of_day = idx_utc.hour.astype(np.int64)
    day_of_week = idx_utc.dayofweek.astype(np.int64)

    df = pd.DataFrame(
        {
            "ema20_slope": ema20_slope.to_numpy(),
            "ema50_slope": ema50_slope.to_numpy(),
            "ema_alignment": ema_alignment,
            "price_vs_ema50": price_vs_ema50.to_numpy(),
            "rsi14": rsi14.to_numpy(),
            "rsi14_slope": rsi14_slope.to_numpy(),
            "macd_hist": macd_hist.to_numpy(),
            "roc_10": roc_10.to_numpy(),
            "atr_pct": atr_pct.to_numpy(),
            "atr_ratio_short_long": atr_ratio_short_long.to_numpy(),
            "bb_width": bb_width.to_numpy(),
            "bb_position": bb_position.to_numpy(),
            "volume_24h": volume_24h.to_numpy(),
            "vol_ratio_3": vol_ratio_3.to_numpy(),
            "obv_slope": obv_slope.to_numpy(),
            "htf_structure": htf_structure,
            "dist_from_20d_high": dist_from_20d_high.to_numpy(),
            "dist_from_20d_low": dist_from_20d_low.to_numpy(),
            "swing_pivot_distance": swing_pivot_distance,
            "funding_rate": funding_rate,
            "oi_change_1h": oi_change_1h,
            "oi_change_24h": oi_change_24h,
            "long_short_ratio": long_short_ratio,
            "cvd_state": cvd_state,
            "taker_buy_ratio_1h": taker_buy_ratio_1h.to_numpy(),
            "regime": regime,
            "hour_of_day": hour_of_day,
            "day_of_week": day_of_week,
            # Registry-driven macro + on-chain (auto-expands with new sources)
            **macro_arrays,
            **onchain_arrays,
            "price": close.to_numpy(),
            "symbol": symbol,
        },
        index=index,
    )
    # Drop the warmup region — features there are biased by short EMA windows.
    df = df.iloc[MIN_HISTORY_BARS:].copy()
    return df
