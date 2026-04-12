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


def _stoch_rsi(rsi: pd.Series, period: int = 14) -> pd.Series:
    """Stochastic RSI: (rsi - min_rsi) / (max_rsi - min_rsi) scaled to 0..100.
    Returns 50.0 where the RSI range over the window is zero."""
    rsi_min = rsi.rolling(period, min_periods=period).min()
    rsi_max = rsi.rolling(period, min_periods=period).max()
    rsi_range = rsi_max - rsi_min
    raw = (rsi - rsi_min) / rsi_range.replace(0, np.nan)
    return (raw * 100.0).fillna(50.0).clip(0.0, 100.0)


def _williams_r(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Williams %R: -100 to 0. -100 = close at period low, 0 = at period high."""
    hh = high.rolling(period, min_periods=period).max()
    ll = low.rolling(period, min_periods=period).min()
    denom = (hh - ll).replace(0, np.nan)
    raw = (hh - close) / denom * -100.0
    return raw.fillna(-50.0).clip(-100.0, 0.0)


def _cci(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 20) -> pd.Series:
    """Commodity Channel Index. Unbounded; typical range ±200."""
    typical = (high + low + close) / 3.0
    sma_tp = typical.rolling(period, min_periods=period).mean()
    mean_dev = typical.rolling(period, min_periods=period).apply(
        lambda x: np.mean(np.abs(x - x.mean())), raw=True
    )
    denom = (0.015 * mean_dev).replace(0, np.nan)
    return ((typical - sma_tp) / denom).fillna(0.0)


def _vwap_ratio(close: pd.Series, volume: pd.Series, period: int = 24) -> pd.Series:
    """(close - vwap_period) / vwap_period where vwap = sum(close*vol)/sum(vol)."""
    pv = close * volume
    rolling_pv = pv.rolling(period, min_periods=1).sum()
    rolling_vol = volume.rolling(period, min_periods=1).sum()
    vwap = (rolling_pv / rolling_vol.replace(0, np.nan)).fillna(close)
    return ((close - vwap) / vwap.replace(0, np.nan)).fillna(0.0)


def _stoch(
    high: pd.Series, low: pd.Series, close: pd.Series,
    k_period: int = 14, d_period: int = 3,
) -> tuple[pd.Series, pd.Series]:
    """Stochastic %K (0..100) and %D (3-bar SMA of %K, 0..100)."""
    hh = high.rolling(k_period, min_periods=k_period).max()
    ll = low.rolling(k_period, min_periods=k_period).min()
    denom = (hh - ll).replace(0, np.nan)
    stoch_k = ((close - ll) / denom * 100.0).fillna(50.0).clip(0.0, 100.0)
    stoch_d = stoch_k.rolling(d_period, min_periods=d_period).mean().fillna(50.0)
    return stoch_k, stoch_d


def _mfi(
    high: pd.Series, low: pd.Series, close: pd.Series,
    volume: pd.Series, period: int = 14,
) -> pd.Series:
    """Money Flow Index, 0..100."""
    typical = (high + low + close) / 3.0
    raw_mf = typical * volume
    delta_tp = typical.diff()
    pos_mf = raw_mf.where(delta_tp > 0, 0.0).fillna(0.0)
    neg_mf = raw_mf.where(delta_tp < 0, 0.0).fillna(0.0)
    pos_sum = pos_mf.rolling(period, min_periods=period).sum()
    neg_sum = neg_mf.rolling(period, min_periods=period).sum()
    mfr = (pos_sum / neg_sum.replace(0, np.nan)).fillna(1.0)
    return (100.0 - 100.0 / (1.0 + mfr)).clip(0.0, 100.0)


def _cmf(
    high: pd.Series, low: pd.Series, close: pd.Series,
    volume: pd.Series, period: int = 20,
) -> pd.Series:
    """Chaikin Money Flow, -1..1."""
    hl_range = (high - low).replace(0, np.nan)
    clv = ((close - low) - (high - close)) / hl_range        # money flow multiplier
    mfv = clv * volume
    vol_sum = volume.rolling(period, min_periods=period).sum().replace(0, np.nan)
    return (mfv.rolling(period, min_periods=period).sum() / vol_sum).fillna(0.0).clip(-1.0, 1.0)


def _adx_dmi(
    high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """ADX, +DI, −DI via Wilder smoothing. Returns (adx, dmi_plus, dmi_minus), all 0..100."""
    tr = pd.concat(
        [(high - low).abs(), (high - close.shift(1)).abs(), (low - close.shift(1)).abs()],
        axis=1,
    ).max(axis=1)
    up_move = high.diff()
    down_move = -low.diff()
    pos_dm = up_move.where((up_move > down_move) & (up_move > 0), 0.0).fillna(0.0)
    neg_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0).fillna(0.0)
    alpha = 1.0 / period
    atr_w = tr.ewm(alpha=alpha, adjust=False).mean()
    pos_dm_w = pos_dm.ewm(alpha=alpha, adjust=False).mean()
    neg_dm_w = neg_dm.ewm(alpha=alpha, adjust=False).mean()
    dmi_plus = (pos_dm_w / atr_w.replace(0, np.nan) * 100.0).fillna(0.0).clip(0.0, 100.0)
    dmi_minus = (neg_dm_w / atr_w.replace(0, np.nan) * 100.0).fillna(0.0).clip(0.0, 100.0)
    dx_sum = (dmi_plus + dmi_minus).replace(0, np.nan)
    dx = ((dmi_plus - dmi_minus).abs() / dx_sum * 100.0).fillna(0.0)
    adx = dx.ewm(alpha=alpha, adjust=False).mean().clip(0.0, 100.0)
    return adx, dmi_plus, dmi_minus


def _aroon(
    high: pd.Series, low: pd.Series, period: int = 25,
) -> tuple[pd.Series, pd.Series]:
    """Aroon Up and Down, 0..100.
    aroon_up  = argmax_in_window / period * 100  (high Aroon Up → recent highest high → bullish)
    aroon_down = argmin_in_window / period * 100  (high Aroon Down → recent lowest low → bearish)
    """
    aroon_up = high.rolling(period + 1, min_periods=period + 1).apply(
        lambda x: float(np.argmax(x)) / period * 100.0, raw=True
    ).fillna(50.0)
    aroon_down = low.rolling(period + 1, min_periods=period + 1).apply(
        lambda x: float(np.argmin(x)) / period * 100.0, raw=True
    ).fillna(50.0)
    return aroon_up, aroon_down


def _keltner_bands(
    high: pd.Series, low: pd.Series, close: pd.Series,
    ema_period: int = 20, atr_period: int = 10, mult: float = 2.0,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Keltner Channel. Returns (position, upper, lower).
    position = (close − mid) / half_width  — clipped to ±3.
    """
    mid = _ema(close, ema_period)
    atr = _atr(high, low, close, atr_period)
    upper = mid + mult * atr
    lower = mid - mult * atr
    half_width = (upper - mid).replace(0, np.nan)
    position = ((close - mid) / half_width).fillna(0.0).clip(-3.0, 3.0)
    return position, upper, lower


def _donchian_position(
    high: pd.Series, low: pd.Series, close: pd.Series, period: int = 20,
) -> pd.Series:
    """Donchian Channel position: (close − dc_low) / (dc_high − dc_low), 0..1."""
    dc_high = high.rolling(period, min_periods=period).max()
    dc_low = low.rolling(period, min_periods=period).min()
    dc_range = (dc_high - dc_low).replace(0, np.nan)
    return ((close - dc_low) / dc_range).fillna(0.5).clip(0.0, 1.0)


def _pvt(close: pd.Series, volume: pd.Series) -> pd.Series:
    """Price Volume Trend — cumulative (pct_change * volume)."""
    return (close.pct_change().fillna(0.0) * volume).cumsum()


def _ichimoku(
    high: pd.Series, low: pd.Series, close: pd.Series,
    tenkan: int = 9, kijun: int = 26, senkou_b: int = 52,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Ichimoku distances, all normalised as (close − line) / close.
    Returns (tenkan_dist, kijun_dist, cloud_dist).
    """
    t_line = (high.rolling(tenkan, min_periods=tenkan).max()
              + low.rolling(tenkan, min_periods=tenkan).min()) / 2.0
    k_line = (high.rolling(kijun, min_periods=kijun).max()
              + low.rolling(kijun, min_periods=kijun).min()) / 2.0
    sb_line = (high.rolling(senkou_b, min_periods=senkou_b).max()
               + low.rolling(senkou_b, min_periods=senkou_b).min()) / 2.0
    cloud_mid = ((t_line + k_line) / 2.0 + sb_line) / 2.0
    c = close.replace(0, np.nan)
    return (
        ((close - t_line) / c).fillna(0.0),
        ((close - k_line) / c).fillna(0.0),
        ((close - cloud_mid) / c).fillna(0.0),
    )


def _supertrend(
    high: pd.Series, low: pd.Series, close: pd.Series,
    period: int = 7, mult: float = 3.0,
) -> tuple[pd.Series, pd.Series]:
    """Supertrend indicator.
    Returns (direction, dist):
        direction — +1.0 uptrend, −1.0 downtrend.
        dist      — (close − supertrend_line) / close.
    Uses a vectorised-friendly Python loop (O(N) per call).
    """
    atr = _atr(high, low, close, period)
    hl_mid = (high + low) / 2.0
    basic_upper = (hl_mid + mult * atr).to_numpy(dtype=np.float64)
    basic_lower = (hl_mid - mult * atr).to_numpy(dtype=np.float64)
    close_arr = close.to_numpy(dtype=np.float64)
    n = len(close)

    final_upper = basic_upper.copy()
    final_lower = basic_lower.copy()
    supertrend = np.empty(n, dtype=np.float64)
    direction = np.ones(n, dtype=np.float64)
    supertrend[0] = final_lower[0]

    for i in range(1, n):
        # Upper band only moves down (or resets when prev close broke above it)
        if basic_upper[i] < final_upper[i - 1] or close_arr[i - 1] > final_upper[i - 1]:
            final_upper[i] = basic_upper[i]
        else:
            final_upper[i] = final_upper[i - 1]
        # Lower band only moves up (or resets when prev close broke below it)
        if basic_lower[i] > final_lower[i - 1] or close_arr[i - 1] < final_lower[i - 1]:
            final_lower[i] = basic_lower[i]
        else:
            final_lower[i] = final_lower[i - 1]
        # Trend flip logic
        if supertrend[i - 1] == final_upper[i - 1]:        # was downtrend (showed upper band)
            if close_arr[i] > final_upper[i]:
                direction[i] = 1.0
                supertrend[i] = final_lower[i]
            else:
                direction[i] = -1.0
                supertrend[i] = final_upper[i]
        else:                                               # was uptrend (showed lower band)
            if close_arr[i] < final_lower[i]:
                direction[i] = -1.0
                supertrend[i] = final_upper[i]
            else:
                direction[i] = 1.0
                supertrend[i] = final_lower[i]

    st_s = pd.Series(supertrend, index=close.index)
    dist = ((close - st_s) / close.replace(0, np.nan)).fillna(0.0)
    return pd.Series(direction, index=close.index), dist


def _vol_zscore(volume: pd.Series, period: int = 20) -> pd.Series:
    """Volume Z-score: (vol − rolling_mean) / rolling_std, clipped ±4."""
    mean = volume.rolling(period, min_periods=period).mean()
    std = volume.rolling(period, min_periods=period).std(ddof=0)
    return ((volume - mean) / std.replace(0, np.nan)).fillna(0.0).clip(-4.0, 4.0)


def _price_accel(close: pd.Series, period: int = 5) -> pd.Series:
    """Price acceleration: 2nd derivative of price (diff of period-bar ROC)."""
    roc = close.pct_change(period).fillna(0.0)
    return roc.diff().fillna(0.0)


# ── Groups V-AB primitives ───────────────────────────────────────────────────


def _hist_vol(close: pd.Series, period: int) -> pd.Series:
    """Realized volatility: std of log-returns × sqrt(24×365), annualised for 1h bars."""
    log_ret = np.log(close / close.shift(1)).fillna(0.0)
    return (log_ret.rolling(period, min_periods=period).std(ddof=1) * np.sqrt(24 * 365)).fillna(0.0)


def _parkinson_vol(high: pd.Series, low: pd.Series, period: int = 24) -> pd.Series:
    """Parkinson's High-Low volatility estimator — more efficient than close-close.
    σ_P = sqrt(1/(4·N·ln 2) · Σ(ln(H/L))²) × sqrt(24·365) annualised.
    """
    log_hl = np.log((high / low.replace(0, np.nan)).replace(0, np.nan)).fillna(0.0)
    factor = 1.0 / (4.0 * np.log(2))
    var = (log_hl ** 2).rolling(period, min_periods=period).mean() * factor
    return (np.sqrt(var * 24 * 365)).fillna(0.0)


def _lr_slope_norm(close: pd.Series, period: int = 20) -> pd.Series:
    """OLS slope of `close` over a rolling `period`-bar window, normalised by price."""
    def _slope(arr: np.ndarray) -> float:
        x = np.arange(len(arr), dtype=float)
        return float(np.polyfit(x, arr, 1)[0])

    raw_slope = close.rolling(period, min_periods=period).apply(_slope, raw=True)
    return (raw_slope / close.replace(0, np.nan)).fillna(0.0)


def _efficiency_ratio(close: pd.Series, period: int = 20) -> pd.Series:
    """Kaufman's Efficiency Ratio: directional distance / path distance, 0..1."""
    direction = (close - close.shift(period)).abs()
    path = close.diff().abs().rolling(period, min_periods=period).sum()
    return (direction / path.replace(0, np.nan)).fillna(0.5).clip(0.0, 1.0)


def _trend_consistency(close: pd.Series, period: int = 20) -> pd.Series:
    """Trend consistency: |sum(signed returns)| / sum(|returns|) over period, 0..1."""
    log_ret = np.log(close / close.shift(1)).fillna(0.0)
    net = log_ret.rolling(period, min_periods=period).sum().abs()
    gross = log_ret.abs().rolling(period, min_periods=period).sum()
    return (net / gross.replace(0, np.nan)).fillna(0.5).clip(0.0, 1.0)


def _consecutive_bars_vec(close: pd.Series, cap: int = 7) -> pd.Series:
    """Signed count of consecutive same-direction closes, capped ±cap.
    Fully vectorised using cumsum + groupby on direction-change groups.
    """
    direction = np.sign(close.diff().fillna(0.0))
    # Identify groups of consecutive same-direction bars
    group = (direction != direction.shift(1)).astype(int).cumsum()
    cum = direction.groupby(group).cumsum()
    return cum.clip(-float(cap), float(cap))


def _candle_patterns(
    open_: pd.Series, high: pd.Series, low: pd.Series, close: pd.Series,
) -> tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    """Returns (engulfing_bull, engulfing_bear, doji, hammer).
    engulfing_bull/bear: 0 or 1.
    doji: 0 or 1 (body < 10 % of range).
    hammer: +1 = hammer, −1 = shooting star, 0 = neither.
    """
    prev_open = open_.shift(1)
    prev_close = close.shift(1)
    candle_range = (high - low).replace(0, np.nan)
    body = (close - open_).abs()
    prev_body = (prev_close - prev_open).abs()

    # Bullish engulfing: prev bar was bearish; current bar is bullish and fully engulfs prev body
    prev_bearish = prev_close < prev_open
    curr_bullish = close > open_
    bull_eng = (prev_bearish & curr_bullish & (open_ <= prev_close) & (close >= prev_open)).astype(float)

    # Bearish engulfing: prev bar was bullish; current bar is bearish and fully engulfs prev body
    prev_bullish = prev_close > prev_open
    curr_bearish = close < open_
    bear_eng = (prev_bullish & curr_bearish & (open_ >= prev_close) & (close <= prev_open)).astype(float)

    # Doji: body < 10 % of range
    doji = ((body / candle_range).fillna(1.0) < 0.10).astype(float)

    # Hammer / Shooting star
    body_top = pd.concat([close, open_], axis=1).max(axis=1)
    body_bot = pd.concat([close, open_], axis=1).min(axis=1)
    upper_wick = high - body_top
    lower_wick = body_bot - low
    body_safe = body.replace(0, np.nan)

    is_hammer = (
        (lower_wick >= 2.0 * body_safe) &  # long lower wick
        (upper_wick <= 0.5 * body_safe) &   # tiny upper wick
        ((body_top - low) / candle_range.fillna(1.0) >= 0.6)  # body in upper 40% of range
    )
    is_star = (
        (upper_wick >= 2.0 * body_safe) &
        (lower_wick <= 0.5 * body_safe) &
        ((high - body_bot) / candle_range.fillna(1.0) >= 0.6)
    )
    hammer = is_hammer.astype(float) - is_star.astype(float)

    return (
        bull_eng.fillna(0.0),
        bear_eng.fillna(0.0),
        doji.fillna(0.0),
        hammer.fillna(0.0),
    )


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
    open_ = klines["open"].astype(float)
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

    # --- H. Price changes (from klines only) ---
    def _pct_change_scalar(n: int) -> float:
        if len(close) <= n:
            return 0.0
        past = float(close.iloc[-1 - n])
        return float((price - past) / past) if past else 0.0

    price_change_1h = _pct_change_scalar(1)
    price_change_4h = _pct_change_scalar(4)
    price_change_24h = _pct_change_scalar(24)
    price_change_7d = _pct_change_scalar(168)

    # --- I. Additional momentum oscillators ---
    stoch_rsi_val = float(_stoch_rsi(rsi_series, 14).iloc[-1])
    williams_r_val = float(_williams_r(high, low, close, 14).iloc[-1])
    cci_val = float(_cci(high, low, close, 20).iloc[-1])

    # --- J. Price relative ---
    vwap_ratio_val = float(_vwap_ratio(close, volume, 24).iloc[-1])
    price_vs_ema200 = (price - ema200) / ema200 if ema200 else 0.0

    # --- K. Candle structure (last bar only) ---
    candle_high = float(high.iloc[-1])
    candle_low = float(low.iloc[-1])
    candle_open = float(open_.iloc[-1])
    candle_range = candle_high - candle_low
    if candle_range > 0:
        body_top = max(price, candle_open)
        body_bot = min(price, candle_open)
        upper_wick_pct = (candle_high - body_top) / candle_range
        lower_wick_pct = (body_bot - candle_low) / candle_range
    else:
        upper_wick_pct = 0.0
        lower_wick_pct = 0.0

    # --- L. Extended RSI + Stochastic ---
    rsi7_val = float(_rsi(close, 7).iloc[-1])
    rsi21_val = float(_rsi(close, 21).iloc[-1])
    stoch_k_series, stoch_d_series = _stoch(high, low, close, 14, 3)
    stoch_k_val = float(stoch_k_series.iloc[-1])
    stoch_d_val = float(stoch_d_series.iloc[-1])

    # --- M. Volume quality ---
    mfi_val = float(_mfi(high, low, close, volume, 14).iloc[-1])
    cmf_val = float(_cmf(high, low, close, volume, 20).iloc[-1])
    vol_zscore_val = float(_vol_zscore(volume, 20).iloc[-1])

    # --- N. Directional movement ---
    adx_s, dmi_plus_s, dmi_minus_s = _adx_dmi(high, low, close, 14)
    adx_val = float(adx_s.iloc[-1])
    dmi_plus_val = float(dmi_plus_s.iloc[-1])
    dmi_minus_val = float(dmi_minus_s.iloc[-1])

    # --- O. Aroon ---
    aroon_up_s, aroon_down_s = _aroon(high, low, 25)
    aroon_up_val = float(aroon_up_s.iloc[-1])
    aroon_down_val = float(aroon_down_s.iloc[-1])

    # --- P. Channel + squeeze ---
    kc_pos_s, kc_upper_s, kc_lower_s = _keltner_bands(high, low, close)
    kc_position_val = float(kc_pos_s.iloc[-1])
    kc_upper_v = float(kc_upper_s.iloc[-1])
    kc_lower_v = float(kc_lower_s.iloc[-1])
    donchian_pos_val = float(_donchian_position(high, low, close, 20).iloc[-1])
    bb_squeeze_val = 1.0 if (bb_upper_v < kc_upper_v and bb_lower_v > kc_lower_v) else 0.0
    pvt_s = _pvt(close, volume)
    pvt_slope_val = _slope_pct(pvt_s, 20)

    # --- Q. Ichimoku ---
    ichi_t, ichi_k, ichi_c = _ichimoku(high, low, close)
    ichimoku_tenkan_val = float(ichi_t.iloc[-1])
    ichimoku_kijun_val = float(ichi_k.iloc[-1])
    ichimoku_cloud_dist_val = float(ichi_c.iloc[-1])

    # --- R. Daily pivot distances (from previous completed day) ---
    daily_k = klines[["high", "low", "close"]].resample("1D").agg(
        {"high": "max", "low": "min", "close": "last"}
    )
    if len(daily_k) >= 2:
        prev_h = float(daily_k["high"].iloc[-2])
        prev_l = float(daily_k["low"].iloc[-2])
        prev_c = float(daily_k["close"].iloc[-2])
        piv = (prev_h + prev_l + prev_c) / 3.0
        r1 = 2.0 * piv - prev_l
        s1 = 2.0 * piv - prev_h
        pivot_r1_dist = (price - r1) / price if price else 0.0
        pivot_s1_dist = (price - s1) / price if price else 0.0
    else:
        pivot_r1_dist = 0.0
        pivot_s1_dist = 0.0

    # --- S. Supertrend ---
    st_dir, st_dist = _supertrend(high, low, close, period=7, mult=3.0)
    supertrend_signal_val = float(st_dir.iloc[-1])
    supertrend_dist_val = float(st_dist.iloc[-1])

    # --- T. Price acceleration ---
    price_accel_val = float(_price_accel(close, 5).iloc[-1])

    # --- V. EMA multi-period ---
    ema9_series = _ema(close, 9)
    ema100_series = _ema(close, 100)
    ema9_slope = _slope_pct(ema9_series, 5)
    ema100_slope = _slope_pct(ema100_series, 10)
    ema20_v = float(ema20_series.iloc[-1])   # already computed above
    ema100_v = float(ema100_series.iloc[-1])
    price_vs_ema20 = (price - ema20_v) / ema20_v if ema20_v else 0.0
    price_vs_ema100 = (price - ema100_v) / ema100_v if ema100_v else 0.0

    # --- W. Historical volatility ---
    hvol24 = float(_hist_vol(close, 24).iloc[-1])
    hvol7d = float(_hist_vol(close, 168).iloc[-1])
    vol_regime_val = (hvol24 / hvol7d) if hvol7d > 0 else 1.0
    vol_regime_val = max(0.1, min(5.0, vol_regime_val))
    parkinson_val = float(_parkinson_vol(high, low, 24).iloc[-1])

    # --- X. MACD extensions ---
    _ema12_v = float(_ema(close, 12).iloc[-1])
    _ema26_v = float(_ema(close, 26).iloc[-1])
    macd_line_norm = (_ema12_v - _ema26_v) / price if price else 0.0
    _mh_prev = float(macd_h_series.iloc[-4]) if len(macd_h_series) >= 4 else float(macd_h_series.iloc[0])
    macd_hist_slope_val = float(macd_h_series.iloc[-1]) - _mh_prev

    # --- Y. Volume profile ---
    volume_7d = float(volume.iloc[-168:].sum()) if len(volume) >= 168 else float(volume.sum())
    mean_vol_24 = float(volume.iloc[-25:-1].mean()) if len(volume) >= 25 else float(volume.mean())
    vol_ratio_24_val = float(volume.iloc[-1]) / mean_vol_24 if mean_vol_24 > 0 else 1.0
    taker_24h = float(taker_buy.iloc[-24:].sum()) if len(taker_buy) >= 24 else float(taker_buy.sum())
    vol_24h_sum = float(volume.iloc[-24:].sum()) if len(volume) >= 24 else float(volume.sum())
    taker_buy_ratio_24h_val = max(0.0, min(1.0, taker_24h / vol_24h_sum if vol_24h_sum > 0 else 0.5))
    vol_acceleration_val = max(0.1, min(10.0, vol_ratio_3 / vol_ratio_24_val if vol_ratio_24_val > 0 else 1.0))

    # --- Z. Price structure ---
    n_7d = 168
    high_7d = float(high.iloc[-n_7d:].max()) if len(high) >= n_7d else float(high.max())
    low_7d = float(low.iloc[-n_7d:].min()) if len(low) >= n_7d else float(low.min())
    range_7d = high_7d - low_7d
    range_7d_pos = (price - low_7d) / range_7d if range_7d > 0 else 0.5
    prev_close_val = float(close.iloc[-2]) if len(close) >= 2 else price
    gap_pct_val = (candle_open - prev_close_val) / prev_close_val if prev_close_val else 0.0
    up_bars = (close.iloc[-20:] > open_.iloc[-20:]) if len(close) >= 20 else (close > open_)
    close_above_open_ratio_val = float(up_bars.mean())
    consecutive_bars_val = float(_consecutive_bars_vec(close).iloc[-1])
    _body_abs = abs(price - candle_open)
    body_ratio_val = _body_abs / candle_range if candle_range > 0 else 0.5

    # --- AA. Candle patterns ---
    eng_bull_s, eng_bear_s, doji_s, hammer_s = _candle_patterns(open_, high, low, close)
    engulfing_bull_val = float(eng_bull_s.iloc[-1])
    engulfing_bear_val = float(eng_bear_s.iloc[-1])
    doji_val = float(doji_s.iloc[-1])
    hammer_val = float(hammer_s.iloc[-1])

    # --- AB. Trend quality ---
    lr_slope_20_val = float(_lr_slope_norm(close, 20).iloc[-1])
    efficiency_ratio_val = float(_efficiency_ratio(close, 20).iloc[-1])
    trend_consistency_val = float(_trend_consistency(close, 20).iloc[-1])

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
        # H. Price changes
        price_change_1h=price_change_1h,
        price_change_4h=price_change_4h,
        price_change_24h=price_change_24h,
        price_change_7d=price_change_7d,
        # I. Additional momentum oscillators
        stoch_rsi=stoch_rsi_val,
        williams_r=williams_r_val,
        cci=cci_val,
        # J. Price relative
        vwap_ratio=vwap_ratio_val,
        price_vs_ema200=price_vs_ema200,
        # K. Candle structure
        upper_wick_pct=upper_wick_pct,
        lower_wick_pct=lower_wick_pct,
        # L. Extended RSI + Stochastic
        rsi7=rsi7_val,
        rsi21=rsi21_val,
        stoch_k=stoch_k_val,
        stoch_d=stoch_d_val,
        # M. Volume quality
        mfi=mfi_val,
        cmf=cmf_val,
        vol_zscore=vol_zscore_val,
        # N. Directional movement
        adx=adx_val,
        dmi_plus=dmi_plus_val,
        dmi_minus=dmi_minus_val,
        # O. Aroon
        aroon_up=aroon_up_val,
        aroon_down=aroon_down_val,
        # P. Channel + squeeze
        kc_position=kc_position_val,
        donchian_position=donchian_pos_val,
        bb_squeeze=bb_squeeze_val,
        pvt_slope=pvt_slope_val,
        # Q. Ichimoku
        ichimoku_tenkan=ichimoku_tenkan_val,
        ichimoku_kijun=ichimoku_kijun_val,
        ichimoku_cloud_dist=ichimoku_cloud_dist_val,
        # R. Daily pivot distances
        pivot_r1_dist=pivot_r1_dist,
        pivot_s1_dist=pivot_s1_dist,
        # S. Supertrend
        supertrend_signal=supertrend_signal_val,
        supertrend_dist=supertrend_dist_val,
        # T. Price acceleration
        price_accel=price_accel_val,
        # V. EMA multi-period
        ema9_slope=ema9_slope,
        ema100_slope=ema100_slope,
        price_vs_ema20=price_vs_ema20,
        price_vs_ema100=price_vs_ema100,
        # W. Historical volatility
        hist_vol_24h=hvol24,
        hist_vol_7d=hvol7d,
        vol_regime=vol_regime_val,
        parkinson_vol=parkinson_val,
        # X. MACD extensions
        macd_line=macd_line_norm,
        macd_hist_slope=macd_hist_slope_val,
        # Y. Volume profile
        volume_7d=volume_7d,
        vol_ratio_24=vol_ratio_24_val,
        taker_buy_ratio_24h=taker_buy_ratio_24h_val,
        vol_acceleration=vol_acceleration_val,
        # Z. Price structure
        range_7d_position=range_7d_pos,
        gap_pct=gap_pct_val,
        close_above_open_ratio=close_above_open_ratio_val,
        consecutive_bars=consecutive_bars_val,
        body_ratio=body_ratio_val,
        # AA. Candle patterns
        engulfing_bull=engulfing_bull_val,
        engulfing_bear=engulfing_bear_val,
        doji=doji_val,
        hammer=hammer_val,
        # AB. Trend quality
        lr_slope_20=lr_slope_20_val,
        efficiency_ratio=efficiency_ratio_val,
        trend_consistency=trend_consistency_val,
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
    # H. Price changes
    "price_change_1h",
    "price_change_4h",
    "price_change_24h",
    "price_change_7d",
    # I. Additional momentum oscillators
    "stoch_rsi",
    "williams_r",
    "cci",
    # J. Price relative
    "vwap_ratio",
    "price_vs_ema200",
    # K. Candle structure
    "upper_wick_pct",
    "lower_wick_pct",
    # L. Extended RSI + Stochastic
    "rsi7",
    "rsi21",
    "stoch_k",
    "stoch_d",
    # M. Volume quality
    "mfi",
    "cmf",
    "vol_zscore",
    # N. Directional movement
    "adx",
    "dmi_plus",
    "dmi_minus",
    # O. Aroon
    "aroon_up",
    "aroon_down",
    # P. Channel + squeeze
    "kc_position",
    "donchian_position",
    "bb_squeeze",
    "pvt_slope",
    # Q. Ichimoku
    "ichimoku_tenkan",
    "ichimoku_kijun",
    "ichimoku_cloud_dist",
    # R. Daily pivot distances
    "pivot_r1_dist",
    "pivot_s1_dist",
    # S. Supertrend
    "supertrend_signal",
    "supertrend_dist",
    # T. Price acceleration
    "price_accel",
    # V. EMA multi-period
    "ema9_slope",
    "ema100_slope",
    "price_vs_ema20",
    "price_vs_ema100",
    # W. Historical volatility
    "hist_vol_24h",
    "hist_vol_7d",
    "vol_regime",
    "parkinson_vol",
    # X. MACD extensions
    "macd_line",
    "macd_hist_slope",
    # Y. Volume profile
    "volume_7d",
    "vol_ratio_24",
    "taker_buy_ratio_24h",
    "vol_acceleration",
    # Z. Price structure
    "range_7d_position",
    "gap_pct",
    "close_above_open_ratio",
    "consecutive_bars",
    "body_ratio",
    # AA. Candle patterns
    "engulfing_bull",
    "engulfing_bear",
    "doji",
    "hammer",
    # AB. Trend quality
    "lr_slope_20",
    "efficiency_ratio",
    "trend_consistency",
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
    open_ = klines["open"].astype(float)
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

    # --- H. Price changes (pure klines) ---
    price_change_1h = close.pct_change(1).fillna(0.0)
    price_change_4h = close.pct_change(4).fillna(0.0)
    price_change_24h = close.pct_change(24).fillna(0.0)
    price_change_7d = close.pct_change(168).fillna(0.0)

    # --- I. Additional momentum oscillators ---
    stoch_rsi_series = _stoch_rsi(rsi14, 14)
    williams_r_series = _williams_r(high, low, close, 14)
    cci_series = _cci(high, low, close, 20)

    # --- J. Price relative ---
    vwap_ratio_series = _vwap_ratio(close, volume, 24)
    price_vs_ema200 = ((close - ema200) / ema200.replace(0, np.nan)).fillna(0.0)

    # --- K. Candle structure ---
    candle_range = (high - low).replace(0, np.nan)
    body_top = pd.concat([close, open_], axis=1).max(axis=1)
    body_bot = pd.concat([close, open_], axis=1).min(axis=1)
    upper_wick_pct = ((high - body_top) / candle_range).fillna(0.0).clip(0.0, 1.0)
    lower_wick_pct = ((body_bot - low) / candle_range).fillna(0.0).clip(0.0, 1.0)

    # --- L. Extended RSI + Stochastic ---
    rsi7_s = _rsi(close, 7)
    rsi21_s = _rsi(close, 21)
    stoch_k_s, stoch_d_s = _stoch(high, low, close, 14, 3)

    # --- M. Volume quality ---
    mfi_s = _mfi(high, low, close, volume, 14)
    cmf_s = _cmf(high, low, close, volume, 20)
    vol_zscore_s = _vol_zscore(volume, 20)

    # --- N. Directional movement ---
    adx_col, dmi_plus_col, dmi_minus_col = _adx_dmi(high, low, close, 14)

    # --- O. Aroon ---
    aroon_up_col, aroon_down_col = _aroon(high, low, 25)

    # --- P. Channel + squeeze ---
    kc_pos_col, kc_upper_col, kc_lower_col = _keltner_bands(high, low, close)
    donchian_pos_col = _donchian_position(high, low, close, 20)
    # bb_upper / bb_lower already computed above (Bollinger)
    bb_squeeze_col = ((bb_upper < kc_upper_col) & (bb_lower > kc_lower_col)).astype(float)
    pvt_col = _pvt(close, volume)
    pvt_slope_col = _slope_pct_vec(pvt_col, 20)

    # --- Q. Ichimoku ---
    ichi_t_col, ichi_k_col, ichi_c_col = _ichimoku(high, low, close)

    # --- R. Daily pivot distances (previous day's H/L/C via resample) ---
    daily_agg = klines[["high", "low", "close"]].resample("1D").agg(
        {"high": "max", "low": "min", "close": "last"}
    )
    if len(daily_agg) >= 2:
        prev_h_d = daily_agg["high"].shift(1)
        prev_l_d = daily_agg["low"].shift(1)
        prev_c_d = daily_agg["close"].shift(1)
        piv_d = (prev_h_d + prev_l_d + prev_c_d) / 3.0
        r1_d = 2.0 * piv_d - prev_l_d
        s1_d = 2.0 * piv_d - prev_h_d
        r1_h = r1_d.reindex(index, method="ffill").bfill().fillna(close)
        s1_h = s1_d.reindex(index, method="ffill").bfill().fillna(close)
        pivot_r1_dist_col = ((close - r1_h) / close.replace(0, np.nan)).fillna(0.0)
        pivot_s1_dist_col = ((close - s1_h) / close.replace(0, np.nan)).fillna(0.0)
    else:
        pivot_r1_dist_col = pd.Series(0.0, index=index)
        pivot_s1_dist_col = pd.Series(0.0, index=index)

    # --- S. Supertrend ---
    st_dir_col, st_dist_col = _supertrend(high, low, close, period=7, mult=3.0)

    # --- T. Price acceleration ---
    price_accel_col = _price_accel(close, 5)

    # --- V. EMA multi-period ---
    ema9_s = _ema(close, 9)
    ema100_s = _ema(close, 100)
    ema9_slope_col = _slope_pct_vec(ema9_s, 5)
    ema100_slope_col = _slope_pct_vec(ema100_s, 10)
    price_vs_ema20_col = ((close - ema20) / ema20.replace(0, np.nan)).fillna(0.0)
    price_vs_ema100_col = ((close - ema100_s) / ema100_s.replace(0, np.nan)).fillna(0.0)

    # --- W. Historical volatility ---
    hvol24_col = _hist_vol(close, 24)
    hvol7d_col = _hist_vol(close, 168)
    vol_regime_col = (hvol24_col / hvol7d_col.replace(0, np.nan)).fillna(1.0).clip(0.1, 5.0)
    parkinson_col = _parkinson_vol(high, low, 24)

    # --- X. MACD extensions ---
    ema12_col = _ema(close, 12)
    ema26_col = _ema(close, 26)
    macd_line_col = ((ema12_col - ema26_col) / close.replace(0, np.nan)).fillna(0.0)
    macd_hist_slope_col = macd_hist.diff(3).fillna(0.0)

    # --- Y. Volume profile ---
    volume_7d_col = volume.rolling(168, min_periods=1).sum()
    mean_vol_24_col = volume.shift(1).rolling(24, min_periods=24).mean()
    vol_ratio_24_col = (volume / mean_vol_24_col.replace(0, np.nan)).fillna(1.0)
    taker_buy_24h_col = taker_buy.rolling(24, min_periods=1).sum()
    vol_24h_col = volume.rolling(24, min_periods=1).sum()
    taker_buy_ratio_24h_col = (taker_buy_24h_col / vol_24h_col.replace(0, np.nan)).clip(0.0, 1.0).fillna(0.5)
    # vol_ratio_3 already computed above
    vol_acceleration_col = (vol_ratio_3 / vol_ratio_24_col.replace(0, np.nan)).fillna(1.0).clip(0.1, 10.0)

    # --- Z. Price structure ---
    high_7d_col = high.rolling(168, min_periods=1).max()
    low_7d_col = low.rolling(168, min_periods=1).min()
    range_7d_col = (high_7d_col - low_7d_col).replace(0, np.nan)
    range_7d_pos_col = ((close - low_7d_col) / range_7d_col).fillna(0.5).clip(0.0, 1.0)
    gap_pct_col = ((open_ - close.shift(1)) / close.shift(1).replace(0, np.nan)).fillna(0.0)
    up_bars_col = (close > open_).astype(float)
    close_above_open_ratio_col = up_bars_col.rolling(20, min_periods=1).mean()
    consecutive_bars_col = _consecutive_bars_vec(close, cap=7)
    candle_range_z = (high - low).replace(0, np.nan)
    body_z = (close - open_).abs()
    body_ratio_col = (body_z / candle_range_z).fillna(0.5).clip(0.0, 1.0)

    # --- AA. Candle patterns ---
    eng_bull_col, eng_bear_col, doji_col, hammer_col = _candle_patterns(open_, high, low, close)

    # --- AB. Trend quality ---
    lr_slope_20_col = _lr_slope_norm(close, 20)
    efficiency_ratio_col = _efficiency_ratio(close, 20)
    trend_consistency_col = _trend_consistency(close, 20)

    # --- Macro + On-chain (registry-driven, daily → ffill onto hourly) ---
    # Uses data_cache.registry defaults for any missing column.
    from data_cache.registry import (  # noqa: PLC0415
        MACRO_SOURCES, ONCHAIN_SOURCES,
        macro_defaults, onchain_defaults,
    )

    # Level features that carry absolute-price information and must be
    # normalised to a rolling percentile rank before the model sees them.
    # Momentum/slope features (dxy_slope_5d, spx_slope_5d) are already
    # relative and do NOT need this treatment.
    # fear_greed is excluded (already normalised to fear_greed_norm).
    # active_addr is excluded (already normalised to active_addr_norm).
    _LEVEL_COLS: frozenset[str] = frozenset({
        "btc_dominance", "vix_close", "spx_close", "dxy_close", "tx_count",
    })
    _RANK_WINDOW = 252  # ~1 calendar year of daily bars

    def _rolling_pct_rank(series: pd.Series, window: int) -> pd.Series:
        """Rolling percentile rank (0-1) over the past `window` bars.

        Uses a past-only window (min_periods=window//2 to avoid NaN flood
        at series start). At each bar t, rank = fraction of past `window`
        values that are ≤ current value.
        """
        def _rank_last(arr: np.ndarray) -> float:
            return float(np.mean(arr[:-1] <= arr[-1]))

        return series.rolling(window, min_periods=window // 2).apply(
            _rank_last, raw=True
        )

    def _align_bundle(
        bundle: pd.DataFrame | None,
        sources: list,
        defaults: dict,
    ) -> dict[str, np.ndarray]:
        """Forward-fill a daily bundle onto hourly index, fill NaN with defaults.

        Level columns in _LEVEL_COLS are replaced with their rolling
        percentile rank on the daily series before alignment so the model
        receives scale-invariant 0–1 values instead of absolute levels.
        """
        n = len(index)
        if bundle is not None and len(bundle) > 0:
            bundle_idx = bundle.index
            if bundle_idx.tz is None:
                bundle_idx = bundle_idx.tz_localize("UTC")
            # Work on a copy so the original bundle is not mutated.
            bundle_work = bundle.copy()
            bundle_work.index = bundle_idx
            for col in _LEVEL_COLS:
                if col in bundle_work.columns:
                    bundle_work[col] = _rolling_pct_rank(bundle_work[col], _RANK_WINDOW)
            aligned = bundle_work.reindex(index, method="ffill")
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
            # H. Price changes
            "price_change_1h": price_change_1h.to_numpy(),
            "price_change_4h": price_change_4h.to_numpy(),
            "price_change_24h": price_change_24h.to_numpy(),
            "price_change_7d": price_change_7d.to_numpy(),
            # I. Additional momentum oscillators
            "stoch_rsi": stoch_rsi_series.to_numpy(),
            "williams_r": williams_r_series.to_numpy(),
            "cci": cci_series.to_numpy(),
            # J. Price relative
            "vwap_ratio": vwap_ratio_series.to_numpy(),
            "price_vs_ema200": price_vs_ema200.to_numpy(),
            # K. Candle structure
            "upper_wick_pct": upper_wick_pct.to_numpy(),
            "lower_wick_pct": lower_wick_pct.to_numpy(),
            # L. Extended RSI + Stochastic
            "rsi7": rsi7_s.to_numpy(),
            "rsi21": rsi21_s.to_numpy(),
            "stoch_k": stoch_k_s.to_numpy(),
            "stoch_d": stoch_d_s.to_numpy(),
            # M. Volume quality
            "mfi": mfi_s.to_numpy(),
            "cmf": cmf_s.to_numpy(),
            "vol_zscore": vol_zscore_s.to_numpy(),
            # N. Directional movement
            "adx": adx_col.to_numpy(),
            "dmi_plus": dmi_plus_col.to_numpy(),
            "dmi_minus": dmi_minus_col.to_numpy(),
            # O. Aroon
            "aroon_up": aroon_up_col.to_numpy(),
            "aroon_down": aroon_down_col.to_numpy(),
            # P. Channel + squeeze
            "kc_position": kc_pos_col.to_numpy(),
            "donchian_position": donchian_pos_col.to_numpy(),
            "bb_squeeze": bb_squeeze_col.to_numpy(),
            "pvt_slope": pvt_slope_col.to_numpy(),
            # Q. Ichimoku
            "ichimoku_tenkan": ichi_t_col.to_numpy(),
            "ichimoku_kijun": ichi_k_col.to_numpy(),
            "ichimoku_cloud_dist": ichi_c_col.to_numpy(),
            # R. Daily pivot distances
            "pivot_r1_dist": pivot_r1_dist_col.to_numpy(),
            "pivot_s1_dist": pivot_s1_dist_col.to_numpy(),
            # S. Supertrend
            "supertrend_signal": st_dir_col.to_numpy(),
            "supertrend_dist": st_dist_col.to_numpy(),
            # T. Price acceleration
            "price_accel": price_accel_col.to_numpy(),
            # V. EMA multi-period
            "ema9_slope": ema9_slope_col.to_numpy(),
            "ema100_slope": ema100_slope_col.to_numpy(),
            "price_vs_ema20": price_vs_ema20_col.to_numpy(),
            "price_vs_ema100": price_vs_ema100_col.to_numpy(),
            # W. Historical volatility
            "hist_vol_24h": hvol24_col.to_numpy(),
            "hist_vol_7d": hvol7d_col.to_numpy(),
            "vol_regime": vol_regime_col.to_numpy(),
            "parkinson_vol": parkinson_col.to_numpy(),
            # X. MACD extensions
            "macd_line": macd_line_col.to_numpy(),
            "macd_hist_slope": macd_hist_slope_col.to_numpy(),
            # Y. Volume profile
            "volume_7d": volume_7d_col.to_numpy(),
            "vol_ratio_24": vol_ratio_24_col.to_numpy(),
            "taker_buy_ratio_24h": taker_buy_ratio_24h_col.to_numpy(),
            "vol_acceleration": vol_acceleration_col.to_numpy(),
            # Z. Price structure
            "range_7d_position": range_7d_pos_col.to_numpy(),
            "gap_pct": gap_pct_col.to_numpy(),
            "close_above_open_ratio": close_above_open_ratio_col.to_numpy(),
            "consecutive_bars": consecutive_bars_col.to_numpy(),
            "body_ratio": body_ratio_col.to_numpy(),
            # AA. Candle patterns
            "engulfing_bull": eng_bull_col.to_numpy(),
            "engulfing_bear": eng_bear_col.to_numpy(),
            "doji": doji_col.to_numpy(),
            "hammer": hammer_col.to_numpy(),
            # AB. Trend quality
            "lr_slope_20": lr_slope_20_col.to_numpy(),
            "efficiency_ratio": efficiency_ratio_col.to_numpy(),
            "trend_consistency": trend_consistency_col.to_numpy(),
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
