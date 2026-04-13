"""L11 — Cumulative Volume Delta (Rolling Window).

References:
    [1] Steidlmayer, J.P. (1989). Markets and Market Logic.
        Chicago Board of Trade.  (Market Profile + delta concept)
    [2] Bright, T. (2012). Order Flow Trading for Fun and Profit.
        Jigsaw Trading.  (practical CVD interpretation)
    [3] Dalton, J., Dalton, E. & Jones, T. (1990). Mind Over Markets.
        Probus Publishing.

Improvements over prior implementation:
    - Rolling 24-bar CVD (not cumulative from 2017 — meaningless at scale)
    - Volume delta = taker_buy_vol - taker_sell_vol (not approximation)
    - Divergence measured vs rolling peak within window (not all-time high)
    - Trend via linear regression slope on normalized delta series (not 10-bar avg)
    - All thresholds expressed in Z-score / percentage terms (asset-agnostic)

Score ∈ [-20, +20]:
    Divergence (new price high, CVD not confirming) : -12
    Absorption  (price flat, large net delta)        : ±10
    Trend       (rising / falling rolling CVD)       : ±5
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from market_engine.types import LayerResult

# Rolling window for CVD accumulation (bars).  24 × 1H = 24h; adjust as needed.
_CVD_WINDOW: int = 24
# Minimum bars needed before we trust the signal
_MIN_BARS:   int = 50


def _rolling_cvd(df: pd.DataFrame, window: int) -> pd.Series:
    """Rolling-window CVD.

    CVD[i] = sum of (buy_vol - sell_vol) over bars [i-window, i].

    buy_vol  = taker_buy_base_volume × close   (USD-denominated delta)
    sell_vol = (volume - taker_buy_base_volume) × close

    If taker_buy_base_volume is missing / all-zero we raise a warning
    instead of silently using a 50/50 fallback which destroys the signal.
    """
    close = df["close"].astype(float)
    vol   = df["volume"].astype(float)

    # Prefer taker_buy_base_volume; fallback only if truly unavailable
    if ("taker_buy_base_volume" in df.columns
            and df["taker_buy_base_volume"].abs().sum() > 0):
        tbv = df["taker_buy_base_volume"].astype(float).clip(lower=0)
    else:
        # Mark as unavailable so caller knows to discard this signal
        return pd.Series(np.nan, index=df.index, name="cvd")

    # USD-denominated delta per bar
    buy_usd  = tbv * close
    sell_usd = (vol - tbv).clip(lower=0) * close
    delta    = buy_usd - sell_usd

    return delta.rolling(window, min_periods=max(1, window // 2)).sum()


def _linreg_slope(series: np.ndarray) -> float:
    """Least-squares slope of a short series, normalised by its std-dev.

    Returns a standardised slope: positive = rising, negative = falling.
    |value| > 1 is a strong trend.
    """
    n = len(series)
    if n < 3:
        return 0.0
    x  = np.arange(n, dtype=float)
    xm = x.mean()
    ym = series.mean()
    num   = ((x - xm) * (series - ym)).sum()
    denom = ((x - xm) ** 2).sum()
    slope = num / (denom + 1e-10)
    std   = series.std(ddof=0) or 1.0
    return float(slope / std)           # normalised: asset-agnostic


def l11_cvd(df: pd.DataFrame) -> LayerResult:
    """Rolling CVD analysis.  Score ∈ [-20, +20]."""
    lr = LayerResult()

    if len(df) < _MIN_BARS:
        lr.sig("CVD: 데이터 부족", "warn")
        return lr

    cvd = _rolling_cvd(df, _CVD_WINDOW)

    if cvd.isna().all():
        lr.sig("CVD: taker_buy 데이터 없음 — 신호 불가", "warn")
        lr.meta["data_available"] = False
        return lr

    lr.meta["data_available"] = True
    score = 0

    # ── 1. Divergence: new price high, CVD not confirming ────────────
    # Use a rolling 50-bar window for the "peak", not all-time high
    close       = df["close"].astype(float)
    roll_window = 50
    price_peak  = close.rolling(roll_window, min_periods=20).max()
    cvd_peak    = cvd.rolling(roll_window, min_periods=20).max()
    cvd_min     = cvd.rolling(roll_window, min_periods=20).min()

    cur_price = float(close.iloc[-1])
    cur_cvd   = float(cvd.iloc[-1])
    p_peak    = float(price_peak.iloc[-1])
    c_peak    = float(cvd_peak.iloc[-1])
    c_min     = float(cvd_min.iloc[-1])

    # Bearish divergence: price at / near 50-bar high but CVD below its peak
    at_price_high = cur_price >= p_peak * 0.995
    cvd_range     = c_peak - c_min
    cvd_lag_pct   = ((c_peak - cur_cvd) / cvd_range) if cvd_range > 0 else 0.0

    divergence = False
    if at_price_high and cvd_lag_pct > 0.40:   # CVD at most 60% of its window peak
        divergence = True
        score -= 12
        lr.sig(f"CVD 약세 다이버전스 — 신고가 불확인 (CVD lag {cvd_lag_pct:.0%})", "bear")

    # Bullish divergence: price at / near 50-bar low but CVD above its trough
    price_trough = close.rolling(roll_window, min_periods=20).min()
    p_trough     = float(price_trough.iloc[-1])
    at_price_low = cur_price <= p_trough * 1.005
    cvd_rise_pct = ((cur_cvd - c_min) / cvd_range) if cvd_range > 0 else 0.0

    if at_price_low and cvd_rise_pct > 0.40 and not divergence:
        score += 10
        lr.sig(f"CVD 강세 다이버전스 — 신저가 불확인 (CVD lift {cvd_rise_pct:.0%})", "bull")

    # ── 2. Absorption: price range < 3% but |CVD| large ─────────────
    # Price is going nowhere but buyers/sellers are absorbing supply/demand
    recent_n = min(24, len(df))
    recent_c = close.iloc[-recent_n:]
    pr        = (recent_c.max() - recent_c.min()) / recent_c.mean() * 100

    recent_delta = (df["taker_buy_base_volume"].astype(float) * close
                    - (df["volume"] - df["taker_buy_base_volume"]).clip(lower=0) * close
                    ).iloc[-recent_n:] if "taker_buy_base_volume" in df.columns else pd.Series([0.0])
    net_delta = float(recent_delta.sum())
    vol_usd   = float((df["volume"].astype(float) * close).iloc[-recent_n:].sum())
    net_ratio = abs(net_delta) / (vol_usd + 1e-10)

    absorption = False
    if pr < 3.0 and net_ratio > 0.15:
        absorption = True
        if net_delta > 0:
            score += 10
            lr.sig(f"CVD 매수 흡수 — 레인지 {pr:.1f}% + 순매수 {net_ratio:.0%}", "bull")
        else:
            score -= 8
            lr.sig(f"CVD 매도 흡수 — 레인지 {pr:.1f}% + 순매도 {net_ratio:.0%}", "bear")

    # ── 3. Trend: linear regression slope on normalised rolling CVD ──
    cvd_vals = cvd.dropna().values[-_CVD_WINDOW:]
    if len(cvd_vals) >= 5:
        # Normalise by the window's own standard deviation to be asset-agnostic
        slope = _linreg_slope(cvd_vals)
        if slope > 0.5 and not absorption and not divergence:
            score += 5
            lr.sig("CVD 상승 추세 (LinReg slope > 0.5σ)", "bull")
        elif slope < -0.5 and not absorption and not divergence:
            score -= 5
            lr.sig("CVD 하락 추세 (LinReg slope < -0.5σ)", "bear")
        elif abs(slope) <= 0.5:
            lr.sig("CVD 횡보 — 추세 없음", "neut")

    lr.score = float(max(-20, min(20, score)))
    lr.meta.update({
        "divergence":   divergence,
        "absorption":   absorption,
        "cvd_24h":      round(cur_cvd, 2),
        "last_cvd":     round(cur_cvd, 2),   # backward-compat alias
        "cvd_peak_50":  round(c_peak,  2),
        "cvd_lag_pct":  round(cvd_lag_pct, 3),
        "price_range_pct_24h": round(pr, 2),
    })
    return lr
