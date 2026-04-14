"""Pure-math indicator primitives — stateless, past-only.

Every function here operates on pandas Series/numpy arrays and uses only
past data (no look-ahead). These are the atomic building blocks from which
all SignalSnapshot features are derived.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def sma(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window=window, min_periods=window).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    result = 100.0 - (100.0 / (1.0 + rs))
    return result.fillna(50.0)


def macd_hist(close: pd.Series) -> pd.Series:
    ema12 = ema(close, 12)
    ema26 = ema(close, 26)
    macd = ema12 - ema26
    signal = ema(macd, 9)
    return macd - signal


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low).abs(), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False).mean()


def bollinger(close: pd.Series, window: int = 20, k: float = 2.0):
    mid = sma(close, window)
    std = close.rolling(window=window, min_periods=window).std(ddof=1)
    upper = mid + k * std
    lower = mid - k * std
    return lower, mid, upper


def obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    direction = np.sign(close.diff().fillna(0.0))
    return (direction * volume).cumsum()


def stoch_rsi(rsi_series: pd.Series, period: int = 14) -> pd.Series:
    rsi_min = rsi_series.rolling(period, min_periods=period).min()
    rsi_max = rsi_series.rolling(period, min_periods=period).max()
    rsi_range = rsi_max - rsi_min
    raw = (rsi_series - rsi_min) / rsi_range.replace(0, np.nan)
    return (raw * 100.0).fillna(50.0).clip(0.0, 100.0)


def williams_r(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    hh = high.rolling(period, min_periods=period).max()
    ll = low.rolling(period, min_periods=period).min()
    denom = (hh - ll).replace(0, np.nan)
    raw = (hh - close) / denom * -100.0
    return raw.fillna(-50.0).clip(-100.0, 0.0)


def cci(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 20) -> pd.Series:
    typical = (high + low + close) / 3.0
    sma_tp = typical.rolling(period, min_periods=period).mean()
    mean_dev = typical.rolling(period, min_periods=period).apply(
        lambda x: np.mean(np.abs(x - x.mean())), raw=True
    )
    denom = (0.015 * mean_dev).replace(0, np.nan)
    return ((typical - sma_tp) / denom).fillna(0.0)


def vwap_ratio(close: pd.Series, volume: pd.Series, period: int = 24) -> pd.Series:
    pv = close * volume
    rolling_pv = pv.rolling(period, min_periods=1).sum()
    rolling_vol = volume.rolling(period, min_periods=1).sum()
    vwap = (rolling_pv / rolling_vol.replace(0, np.nan)).fillna(close)
    return ((close - vwap) / vwap.replace(0, np.nan)).fillna(0.0)


def stoch(
    high: pd.Series, low: pd.Series, close: pd.Series,
    k_period: int = 14, d_period: int = 3,
) -> tuple[pd.Series, pd.Series]:
    hh = high.rolling(k_period, min_periods=k_period).max()
    ll = low.rolling(k_period, min_periods=k_period).min()
    denom = (hh - ll).replace(0, np.nan)
    stoch_k = ((close - ll) / denom * 100.0).fillna(50.0).clip(0.0, 100.0)
    stoch_d = stoch_k.rolling(d_period, min_periods=d_period).mean().fillna(50.0)
    return stoch_k, stoch_d


def mfi(
    high: pd.Series, low: pd.Series, close: pd.Series,
    volume: pd.Series, period: int = 14,
) -> pd.Series:
    typical = (high + low + close) / 3.0
    raw_mf = typical * volume
    delta_tp = typical.diff()
    pos_mf = raw_mf.where(delta_tp > 0, 0.0).fillna(0.0)
    neg_mf = raw_mf.where(delta_tp < 0, 0.0).fillna(0.0)
    pos_sum = pos_mf.rolling(period, min_periods=period).sum()
    neg_sum = neg_mf.rolling(period, min_periods=period).sum()
    mfr = (pos_sum / neg_sum.replace(0, np.nan)).fillna(1.0)
    return (100.0 - 100.0 / (1.0 + mfr)).clip(0.0, 100.0)


def cmf(
    high: pd.Series, low: pd.Series, close: pd.Series,
    volume: pd.Series, period: int = 20,
) -> pd.Series:
    hl_range = (high - low).replace(0, np.nan)
    clv = ((close - low) - (high - close)) / hl_range
    mfv = clv * volume
    vol_sum = volume.rolling(period, min_periods=period).sum().replace(0, np.nan)
    return (mfv.rolling(period, min_periods=period).sum() / vol_sum).fillna(0.0).clip(-1.0, 1.0)


def adx_dmi(
    high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14,
) -> tuple[pd.Series, pd.Series, pd.Series]:
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


def aroon(
    high: pd.Series, low: pd.Series, period: int = 25,
) -> tuple[pd.Series, pd.Series]:
    aroon_up = high.rolling(period + 1, min_periods=period + 1).apply(
        lambda x: float(period - np.argmax(x[::-1])) / period * 100.0, raw=True
    ).fillna(50.0)
    aroon_down = low.rolling(period + 1, min_periods=period + 1).apply(
        lambda x: float(period - np.argmin(x[::-1])) / period * 100.0, raw=True
    ).fillna(50.0)
    return aroon_up, aroon_down


def keltner_bands(
    high: pd.Series, low: pd.Series, close: pd.Series,
    ema_period: int = 20, atr_period: int = 10, mult: float = 2.0,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    mid = ema(close, ema_period)
    atr_val = atr(high, low, close, atr_period)
    upper = mid + mult * atr_val
    lower = mid - mult * atr_val
    half_width = (upper - mid).replace(0, np.nan)
    position = ((close - mid) / half_width).fillna(0.0).clip(-3.0, 3.0)
    return position, upper, lower


def donchian_position(
    high: pd.Series, low: pd.Series, close: pd.Series, period: int = 20,
) -> pd.Series:
    dc_high = high.rolling(period, min_periods=period).max()
    dc_low = low.rolling(period, min_periods=period).min()
    dc_range = (dc_high - dc_low).replace(0, np.nan)
    return ((close - dc_low) / dc_range).fillna(0.5).clip(0.0, 1.0)


def pvt(close: pd.Series, volume: pd.Series) -> pd.Series:
    return (close.pct_change().fillna(0.0) * volume).cumsum()


def ichimoku(
    high: pd.Series, low: pd.Series, close: pd.Series,
    tenkan: int = 9, kijun: int = 26, senkou_b: int = 52,
) -> tuple[pd.Series, pd.Series, pd.Series]:
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


def supertrend(
    high: pd.Series, low: pd.Series, close: pd.Series,
    period: int = 7, mult: float = 3.0,
) -> tuple[pd.Series, pd.Series]:
    atr_s = atr(high, low, close, period)
    hl_mid = (high + low) / 2.0
    basic_upper = (hl_mid + mult * atr_s).to_numpy(dtype=np.float64)
    basic_lower = (hl_mid - mult * atr_s).to_numpy(dtype=np.float64)
    close_arr = close.to_numpy(dtype=np.float64)
    n = len(close)

    final_upper = basic_upper.copy()
    final_lower = basic_lower.copy()
    st = np.empty(n, dtype=np.float64)
    direction = np.ones(n, dtype=np.float64)
    st[0] = final_lower[0]

    for i in range(1, n):
        if basic_upper[i] < final_upper[i - 1] or close_arr[i - 1] > final_upper[i - 1]:
            final_upper[i] = basic_upper[i]
        else:
            final_upper[i] = final_upper[i - 1]
        if basic_lower[i] > final_lower[i - 1] or close_arr[i - 1] < final_lower[i - 1]:
            final_lower[i] = basic_lower[i]
        else:
            final_lower[i] = final_lower[i - 1]
        if st[i - 1] == final_upper[i - 1]:
            if close_arr[i] > final_upper[i]:
                direction[i] = 1.0
                st[i] = final_lower[i]
            else:
                direction[i] = -1.0
                st[i] = final_upper[i]
        else:
            if close_arr[i] < final_lower[i]:
                direction[i] = -1.0
                st[i] = final_upper[i]
            else:
                direction[i] = 1.0
                st[i] = final_lower[i]

    st_s = pd.Series(st, index=close.index)
    dist = ((close - st_s) / close.replace(0, np.nan)).fillna(0.0)
    return pd.Series(direction, index=close.index), dist


def vol_zscore(volume: pd.Series, period: int = 20) -> pd.Series:
    mean = volume.rolling(period, min_periods=period).mean()
    std = volume.rolling(period, min_periods=period).std(ddof=1)
    return ((volume - mean) / std.replace(0, np.nan)).fillna(0.0).clip(-4.0, 4.0)


def price_accel(close: pd.Series, period: int = 5) -> pd.Series:
    roc = close.pct_change(period).fillna(0.0)
    return roc.diff().fillna(0.0)


def hist_vol(close: pd.Series, period: int, bars_per_year: int = 24 * 365) -> pd.Series:
    log_ret = np.log(close / close.shift(1)).fillna(0.0)
    return (log_ret.rolling(period, min_periods=period).std(ddof=1) * np.sqrt(bars_per_year)).fillna(0.0)


def parkinson_vol(
    high: pd.Series, low: pd.Series, period: int = 24,
    bars_per_year: int = 24 * 365,
) -> pd.Series:
    log_hl = np.log((high / low.replace(0, np.nan)).replace(0, np.nan)).fillna(0.0)
    factor = 1.0 / (4.0 * np.log(2))
    var = (log_hl ** 2).rolling(period, min_periods=period).mean() * factor
    return (np.sqrt(var * bars_per_year)).fillna(0.0)


def lr_slope_norm(close: pd.Series, period: int = 20) -> pd.Series:
    def _slope(arr: np.ndarray) -> float:
        x = np.arange(len(arr), dtype=float)
        return float(np.polyfit(x, arr, 1)[0])

    raw_slope = close.rolling(period, min_periods=period).apply(_slope, raw=True)
    return (raw_slope / close.replace(0, np.nan)).fillna(0.0)


def efficiency_ratio(close: pd.Series, period: int = 20) -> pd.Series:
    direction = (close - close.shift(period)).abs()
    path = close.diff().abs().rolling(period, min_periods=period).sum()
    return (direction / path.replace(0, np.nan)).fillna(0.5).clip(0.0, 1.0)


def trend_consistency(close: pd.Series, period: int = 20) -> pd.Series:
    log_ret = np.log(close / close.shift(1)).fillna(0.0)
    net = log_ret.rolling(period, min_periods=period).sum().abs()
    gross = log_ret.abs().rolling(period, min_periods=period).sum()
    return (net / gross.replace(0, np.nan)).fillna(0.5).clip(0.0, 1.0)


def consecutive_bars_vec(close: pd.Series, cap: int = 7) -> pd.Series:
    direction = np.sign(close.diff().fillna(0.0))
    group = (direction != direction.shift(1)).astype(int).cumsum()
    cum = direction.groupby(group).cumsum()
    return cum.clip(-float(cap), float(cap))


def candle_patterns(
    open_: pd.Series, high: pd.Series, low: pd.Series, close: pd.Series,
) -> tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    prev_open = open_.shift(1)
    prev_close = close.shift(1)
    candle_range = (high - low).replace(0, np.nan)
    body = (close - open_).abs()

    prev_bearish = prev_close < prev_open
    curr_bullish = close > open_
    bull_eng = (prev_bearish & curr_bullish & (open_ <= prev_close) & (close >= prev_open)).astype(float)

    prev_bullish = prev_close > prev_open
    curr_bearish = close < open_
    bear_eng = (prev_bullish & curr_bearish & (open_ >= prev_close) & (close <= prev_open)).astype(float)

    doji = ((body / candle_range).fillna(1.0) < 0.10).astype(float)

    body_top = pd.concat([close, open_], axis=1).max(axis=1)
    body_bot = pd.concat([close, open_], axis=1).min(axis=1)
    upper_wick = high - body_top
    lower_wick = body_bot - low
    body_safe = body.replace(0, np.nan)

    is_hammer = (
        (lower_wick >= 2.0 * body_safe) &
        (upper_wick <= 0.5 * body_safe) &
        ((body_top - low) / candle_range.fillna(1.0) >= 0.6)
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
