"""Pure pandas/numpy TA indicator implementations.

No TA-Lib, no pandas_ta. All functions return pd.Series or dicts of pd.Series.
NaN is returned for warm-up bars (before the indicator has enough data).
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Trend / Moving Averages
# ---------------------------------------------------------------------------

def sma(close: pd.Series, length: int = 20) -> pd.Series:
    """Simple Moving Average."""
    return close.rolling(window=length, min_periods=length).mean()


def ema(close: pd.Series, length: int = 20) -> pd.Series:
    """Exponential Moving Average (span-based)."""
    return close.ewm(span=length, adjust=False).mean()


def wma(close: pd.Series, length: int = 20) -> pd.Series:
    """Weighted Moving Average — linearly weighted."""
    weights = np.arange(1, length + 1, dtype=float)

    def _wma(x: np.ndarray) -> float:
        if len(x) < length:
            return float("nan")
        return float(np.dot(x[-length:], weights) / weights.sum())

    return close.rolling(window=length, min_periods=length).apply(_wma, raw=True)


def dema(close: pd.Series, length: int = 20) -> pd.Series:
    """Double EMA: 2*EMA(n) - EMA(EMA(n))."""
    e = ema(close, length)
    ee = ema(e, length)
    return 2 * e - ee


def tema(close: pd.Series, length: int = 20) -> pd.Series:
    """Triple EMA: 3*EMA - 3*EMA(EMA) + EMA(EMA(EMA))."""
    e1 = ema(close, length)
    e2 = ema(e1, length)
    e3 = ema(e2, length)
    return 3 * e1 - 3 * e2 + e3


def hma(close: pd.Series, length: int = 20) -> pd.Series:
    """Hull MA = WMA(2*WMA(n/2) - WMA(n), sqrt(n))."""
    half = max(int(length / 2), 1)
    sqrt_n = max(int(math.sqrt(length)), 1)
    diff = 2 * wma(close, half) - wma(close, length)
    return wma(diff, sqrt_n)


def kama(close: pd.Series, length: int = 10) -> pd.Series:
    """Kaufman Adaptive Moving Average."""
    fast_sc = 2.0 / (2 + 1)
    slow_sc = 2.0 / (30 + 1)

    prices = close.to_numpy(dtype=float)
    n = len(prices)
    result = np.full(n, float("nan"))

    # Find first valid index
    start = length - 1
    if start >= n:
        return pd.Series(result, index=close.index)

    result[start] = prices[start]
    for i in range(start + 1, n):
        direction = abs(prices[i] - prices[i - length])
        volatility = sum(abs(prices[j] - prices[j - 1]) for j in range(i - length + 1, i + 1))
        er = direction / volatility if volatility != 0 else 0.0
        sc = (er * (fast_sc - slow_sc) + slow_sc) ** 2
        result[i] = result[i - 1] + sc * (prices[i] - result[i - 1])

    return pd.Series(result, index=close.index)


def trima(close: pd.Series, length: int = 20) -> pd.Series:
    """Triangular MA = SMA of SMA."""
    half = length // 2 + 1
    return sma(sma(close, half), half)


def zlema(close: pd.Series, length: int = 20) -> pd.Series:
    """Zero-Lag EMA."""
    lag = (length - 1) // 2
    adjusted = close + (close - close.shift(lag))
    return ema(adjusted, length)


def alma(close: pd.Series, length: int = 20, offset: float = 0.85, sigma: float = 6.0) -> pd.Series:
    """Arnaud Legoux Moving Average."""
    m = offset * (length - 1)
    s = length / sigma
    weights = np.array([math.exp(-((k - m) ** 2) / (2 * s * s)) for k in range(length)])
    w_sum = weights.sum()
    if w_sum == 0:
        return pd.Series(np.full(len(close), float("nan")), index=close.index)
    weights = weights / w_sum

    def _alma(x: np.ndarray) -> float:
        if len(x) < length:
            return float("nan")
        return float(np.dot(x[-length:], weights))

    return close.rolling(window=length, min_periods=length).apply(_alma, raw=True)


def vwma(close: pd.Series, volume: pd.Series, length: int = 20) -> pd.Series:
    """Volume-Weighted Moving Average."""
    pv = close * volume
    return pv.rolling(window=length, min_periods=length).sum() / volume.rolling(window=length, min_periods=length).sum()


# ---------------------------------------------------------------------------
# Momentum
# ---------------------------------------------------------------------------

def rsi(close: pd.Series, length: int = 14) -> pd.Series:
    """Wilder RSI using ewm with adjust=False."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(alpha=1.0 / length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / length, adjust=False).mean()
    rs = avg_gain / avg_loss
    rsi_val = 100 - (100 / (1 + rs))
    # Mask warm-up bars (first `length` bars)
    rsi_val.iloc[:length] = float("nan")
    return rsi_val


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> dict[str, pd.Series]:
    """MACD: macd line, signal line, histogram."""
    macd_line = ema(close, fast) - ema(close, slow)
    signal_line = ema(macd_line, signal)
    hist = macd_line - signal_line
    return {"macd": macd_line, "signal": signal_line, "hist": hist}


def stoch(high: pd.Series, low: pd.Series, close: pd.Series, k: int = 14, d: int = 3) -> dict[str, pd.Series]:
    """Stochastic Oscillator."""
    lowest_low = low.rolling(window=k, min_periods=k).min()
    highest_high = high.rolling(window=k, min_periods=k).max()
    k_line = 100 * (close - lowest_low) / (highest_high - lowest_low)
    d_line = k_line.rolling(window=d, min_periods=d).mean()
    return {"k": k_line, "d": d_line}


def cci(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 20) -> pd.Series:
    """Commodity Channel Index."""
    typical = (high + low + close) / 3
    rolling_mean = typical.rolling(window=length, min_periods=length).mean()
    rolling_mad = typical.rolling(window=length, min_periods=length).apply(
        lambda x: np.mean(np.abs(x - np.mean(x))), raw=True
    )
    return (typical - rolling_mean) / (0.015 * rolling_mad)


def roc(close: pd.Series, length: int = 12) -> pd.Series:
    """Rate of Change."""
    return 100 * (close - close.shift(length)) / close.shift(length)


def momentum(close: pd.Series, length: int = 10) -> pd.Series:
    """Momentum = close - close[n periods ago]."""
    return close - close.shift(length)


def williams_r(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    """Williams %R."""
    highest_high = high.rolling(window=length, min_periods=length).max()
    lowest_low = low.rolling(window=length, min_periods=length).min()
    return -100 * (highest_high - close) / (highest_high - lowest_low)


def cmo(close: pd.Series, length: int = 14) -> pd.Series:
    """Chande Momentum Oscillator."""
    delta = close.diff()
    up = delta.clip(lower=0).rolling(window=length, min_periods=length).sum()
    down = (-delta).clip(lower=0).rolling(window=length, min_periods=length).sum()
    return 100 * (up - down) / (up + down)


def ppo(close: pd.Series, fast: int = 12, slow: int = 26) -> pd.Series:
    """Percentage Price Oscillator."""
    fast_ema = ema(close, fast)
    slow_ema = ema(close, slow)
    return 100 * (fast_ema - slow_ema) / slow_ema


def trix(close: pd.Series, length: int = 18) -> pd.Series:
    """Triple-smoothed EMA rate of change."""
    e1 = ema(close, length)
    e2 = ema(e1, length)
    e3 = ema(e2, length)
    return 100 * e3.pct_change()


def dpo(close: pd.Series, length: int = 20) -> pd.Series:
    """Detrended Price Oscillator."""
    offset = length // 2 + 1
    shifted_sma = sma(close, length).shift(offset)
    return close - shifted_sma


def ultimate_osc(
    high: pd.Series, low: pd.Series, close: pd.Series, s: int = 7, m: int = 14, l: int = 28
) -> pd.Series:
    """Ultimate Oscillator."""
    prev_close = close.shift(1)
    true_low = pd.concat([low, prev_close], axis=1).min(axis=1)
    true_high = pd.concat([high, prev_close], axis=1).max(axis=1)
    bp = close - true_low
    tr = true_high - true_low

    avg_s = bp.rolling(s, min_periods=s).sum() / tr.rolling(s, min_periods=s).sum()
    avg_m = bp.rolling(m, min_periods=m).sum() / tr.rolling(m, min_periods=m).sum()
    avg_l = bp.rolling(l, min_periods=l).sum() / tr.rolling(l, min_periods=l).sum()
    return 100 * (4 * avg_s + 2 * avg_m + avg_l) / 7


# ---------------------------------------------------------------------------
# Volatility
# ---------------------------------------------------------------------------

def bb(close: pd.Series, length: int = 20, std: float = 2.0) -> dict[str, pd.Series]:
    """Bollinger Bands."""
    mid = sma(close, length)
    sd = close.rolling(window=length, min_periods=length).std()
    upper = mid + std * sd
    lower = mid - std * sd
    return {"upper": upper, "mid": mid, "lower": lower}


def atr(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    """Wilder ATR using ewm."""
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1.0 / length, adjust=False).mean()


def keltner(
    high: pd.Series, low: pd.Series, close: pd.Series, length: int = 20, mult: float = 1.5
) -> dict[str, pd.Series]:
    """Keltner Channels."""
    mid = ema(close, length)
    atr_val = atr(high, low, close, length)
    return {"upper": mid + mult * atr_val, "mid": mid, "lower": mid - mult * atr_val}


def donchian(high: pd.Series, low: pd.Series, length: int = 20) -> dict[str, pd.Series]:
    """Donchian Channels."""
    upper = high.rolling(window=length, min_periods=length).max()
    lower = low.rolling(window=length, min_periods=length).min()
    mid = (upper + lower) / 2
    return {"upper": upper, "mid": mid, "lower": lower}


def chop(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    """Choppiness Index."""
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr_sum = tr.rolling(window=length, min_periods=length).sum()
    high_max = high.rolling(window=length, min_periods=length).max()
    low_min = low.rolling(window=length, min_periods=length).min()
    return 100 * np.log10(atr_sum / (high_max - low_min)) / np.log10(length)


def mass_index(high: pd.Series, low: pd.Series, length: int = 25) -> pd.Series:
    """Mass Index."""
    hl = high - low
    ema1 = ema(hl, 9)
    ema2 = ema(ema1, 9)
    ratio = ema1 / ema2
    return ratio.rolling(window=length, min_periods=length).sum()


# ---------------------------------------------------------------------------
# Trend direction
# ---------------------------------------------------------------------------

def adx(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    """Average Directional Index (Wilder)."""
    prev_high = high.shift(1)
    prev_low = low.shift(1)
    prev_close = close.shift(1)

    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)

    plus_dm = (high - prev_high).clip(lower=0)
    minus_dm = (prev_low - low).clip(lower=0)
    # If both positive, keep the larger; zero the smaller
    mask = plus_dm > minus_dm
    minus_dm_adj = minus_dm.where(~mask, 0)
    plus_dm_adj = plus_dm.where(mask, 0)

    atr_s = tr.ewm(alpha=1.0 / length, adjust=False).mean()
    plus_di = 100 * plus_dm_adj.ewm(alpha=1.0 / length, adjust=False).mean() / atr_s
    minus_di = 100 * minus_dm_adj.ewm(alpha=1.0 / length, adjust=False).mean() / atr_s
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
    return dx.ewm(alpha=1.0 / length, adjust=False).mean()


def aroon(high: pd.Series, low: pd.Series, length: int = 14) -> dict[str, pd.Series]:
    """Aroon Up/Down."""
    aroon_up = high.rolling(window=length + 1, min_periods=length + 1).apply(
        lambda x: float(np.argmax(x)) / length * 100, raw=True
    )
    aroon_down = low.rolling(window=length + 1, min_periods=length + 1).apply(
        lambda x: float(np.argmin(x)) / length * 100, raw=True
    )
    return {"up": aroon_up, "down": aroon_down}


def psar(high: pd.Series, low: pd.Series, step: float = 0.02, max_step: float = 0.2) -> pd.Series:
    """Parabolic SAR."""
    n = len(high)
    sar = np.full(n, float("nan"))
    if n < 2:
        return pd.Series(sar, index=high.index)

    highs = high.to_numpy(dtype=float)
    lows = low.to_numpy(dtype=float)

    bull = True
    af = step
    ep = highs[0]
    sar[0] = lows[0]

    for i in range(1, n):
        prev_sar = sar[i - 1]
        if bull:
            sar[i] = prev_sar + af * (ep - prev_sar)
            sar[i] = min(sar[i], lows[i - 1], lows[max(0, i - 2)])
            if lows[i] < sar[i]:
                bull = False
                sar[i] = ep
                ep = lows[i]
                af = step
            else:
                if highs[i] > ep:
                    ep = highs[i]
                    af = min(af + step, max_step)
        else:
            sar[i] = prev_sar - af * (prev_sar - ep)
            sar[i] = max(sar[i], highs[i - 1], highs[max(0, i - 2)])
            if highs[i] > sar[i]:
                bull = True
                sar[i] = ep
                ep = highs[i]
                af = step
            else:
                if lows[i] < ep:
                    ep = lows[i]
                    af = min(af + step, max_step)

    return pd.Series(sar, index=high.index)


# ---------------------------------------------------------------------------
# Volume-based
# ---------------------------------------------------------------------------

def vwap(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series) -> pd.Series:
    """Cumulative VWAP (session-start not reset — fine for crypto 24/7)."""
    typical = (high + low + close) / 3
    cum_tp_vol = (typical * volume).cumsum()
    cum_vol = volume.cumsum()
    return cum_tp_vol / cum_vol


def obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    """On-Balance Volume."""
    direction = np.sign(close.diff())
    direction.iloc[0] = 0
    return (direction * volume).cumsum()


def mfi(
    high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series, length: int = 14
) -> pd.Series:
    """Money Flow Index."""
    typical = (high + low + close) / 3
    money_flow = typical * volume
    delta = typical.diff()
    pos_mf = money_flow.where(delta > 0, 0).rolling(window=length, min_periods=length).sum()
    neg_mf = money_flow.where(delta <= 0, 0).rolling(window=length, min_periods=length).sum()
    mfr = pos_mf / neg_mf
    return 100 - (100 / (1 + mfr))


def cmf(
    high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series, length: int = 20
) -> pd.Series:
    """Chaikin Money Flow."""
    clv = ((close - low) - (high - close)) / (high - low)
    clv = clv.fillna(0)
    cmf_val = (clv * volume).rolling(window=length, min_periods=length).sum() / volume.rolling(
        window=length, min_periods=length
    ).sum()
    return cmf_val


def elder_ray(
    high: pd.Series, low: pd.Series, close: pd.Series, length: int = 13
) -> dict[str, pd.Series]:
    """Elder-Ray Bull/Bear Power."""
    e = ema(close, length)
    bull = high - e
    bear = low - e
    return {"bull": bull, "bear": bear}


def balance_power(
    open_: pd.Series, high: pd.Series, low: pd.Series, close: pd.Series
) -> pd.Series:
    """Balance of Power = (close - open) / (high - low)."""
    denom = high - low
    return (close - open_) / denom.replace(0, float("nan"))


def ease_of_movement(
    high: pd.Series, low: pd.Series, volume: pd.Series, length: int = 14
) -> pd.Series:
    """Ease of Movement."""
    mid_point_move = ((high + low) / 2) - ((high.shift(1) + low.shift(1)) / 2)
    box_ratio = (volume / 1e6) / (high - low)
    eom = mid_point_move / box_ratio
    return eom.rolling(window=length, min_periods=length).mean()


def force_index(close: pd.Series, volume: pd.Series, length: int = 13) -> pd.Series:
    """Force Index."""
    fi = close.diff() * volume
    return fi.ewm(span=length, adjust=False).mean()


def nvi(close: pd.Series, volume: pd.Series) -> pd.Series:
    """Negative Volume Index — updates only when volume decreases."""
    pct_change = close.pct_change()
    vol_decrease = volume < volume.shift(1)
    nvi_arr = np.zeros(len(close))
    nvi_arr[0] = 1000.0
    for i in range(1, len(close)):
        if vol_decrease.iloc[i]:
            nvi_arr[i] = nvi_arr[i - 1] * (1 + pct_change.iloc[i])
        else:
            nvi_arr[i] = nvi_arr[i - 1]
    return pd.Series(nvi_arr, index=close.index)


def pvi(close: pd.Series, volume: pd.Series) -> pd.Series:
    """Positive Volume Index — updates only when volume increases."""
    pct_change = close.pct_change()
    vol_increase = volume > volume.shift(1)
    pvi_arr = np.zeros(len(close))
    pvi_arr[0] = 1000.0
    for i in range(1, len(close)):
        if vol_increase.iloc[i]:
            pvi_arr[i] = pvi_arr[i - 1] * (1 + pct_change.iloc[i])
        else:
            pvi_arr[i] = pvi_arr[i - 1]
    return pd.Series(pvi_arr, index=close.index)


def volume_sma(volume: pd.Series, length: int = 20) -> pd.Series:
    """Simple Moving Average of volume."""
    return sma(volume, length)


def volume_ema(volume: pd.Series, length: int = 20) -> pd.Series:
    """EMA of volume."""
    return ema(volume, length)


def volume_rsi(volume: pd.Series, length: int = 14) -> pd.Series:
    """RSI applied to volume."""
    return rsi(volume, length)


# ---------------------------------------------------------------------------
# Other
# ---------------------------------------------------------------------------

def pivot_points(high: pd.Series, low: pd.Series, close: pd.Series) -> dict[str, pd.Series]:
    """Classic pivot points (calculated per bar using prior bar's HLC)."""
    pivot = (high + low + close) / 3
    r1 = 2 * pivot - low
    s1 = 2 * pivot - high
    r2 = pivot + (high - low)
    s2 = pivot - (high - low)
    return {"pivot": pivot, "r1": r1, "s1": s1, "r2": r2, "s2": s2}


def elder_ray_bull(high: pd.Series, close: pd.Series, length: int = 13) -> pd.Series:
    """Elder-Ray Bull Power only."""
    return high - ema(close, length)


def aroon_up(high: pd.Series, length: int = 14) -> pd.Series:
    """Aroon Up only."""
    return high.rolling(window=length + 1, min_periods=length + 1).apply(
        lambda x: float(np.argmax(x)) / length * 100, raw=True
    )


def aroon_down(low: pd.Series, length: int = 14) -> pd.Series:
    """Aroon Down only."""
    return low.rolling(window=length + 1, min_periods=length + 1).apply(
        lambda x: float(np.argmin(x)) / length * 100, raw=True
    )


# ---------------------------------------------------------------------------
# Crypto / Derivatives
# ---------------------------------------------------------------------------

def funding_sma(funding_series: pd.Series, length: int = 8) -> pd.Series:
    """SMA of funding rate series."""
    return sma(funding_series, length)


def basis(spot: pd.Series, perp: pd.Series) -> pd.Series:
    """Basis = perp - spot."""
    return perp - spot
