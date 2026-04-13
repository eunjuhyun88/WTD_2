"""L15 — ATR Volatility State + Auto Stop-Loss (crypto-calibrated).

References:
    [1] Wilder, J.W. (1978). New Concepts in Technical Trading Systems.
        Trend Research.  (original ATR definition)
    [2] Parkinson, M. (1980). The extreme value method for estimating the
        variance of the rate of return. Journal of Business 53(1), 61–65.
        σ²_park = [1/(4 ln 2)] × mean[ln(H/L)]²
    [3] Garman, M.B. & Klass, M.J. (1980). On the estimation of security
        price volatilities from historical data. Journal of Business 53(1).
    [4] Brockman, P. & Chung, D.Y. (2001). Informed and uninformed trading
        in an electronic, order-driven environment. Financial Review 36.

Improvements over prior implementation:
    1. Adaptive percentile-rank tiers instead of hard-coded ATR% thresholds.
       Old: <1% = ULTRA_LOW, 1–2.5% = LOW, etc.
       Problem: For BTC, ATR 0.8% is normal ranging behaviour, not a squeeze.
       Fix: Use the rolling distribution within the loaded DataFrame itself
            (typically 500+ bars). Percentile of current ATR% vs trailing N bars.

    2. Parkinson estimator as secondary confirmation.
       Parkinson uses high/low range → less sensitive to overnight gaps.
       When Park σ and ATR-% both indicate low volatility → stronger coil signal.

    3. ATR-stop levels use Chandelier Exit (LeBeau) methodology:
       stop_long  = highest_high_N − k × ATR  (not close − k × ATR)
       This gives more accurate levels than the prior simple close-based stops.

Score ∈ [−10, +8]:
    Percentile < 10  (bottom decile)  : +6 to +8 (genuine vol compression)
    Percentile 10–25                  : +3
    Percentile 25–75 (normal range)   : 0
    Percentile 75–90                  : −3
    Percentile ≥ 90  (extreme)        : −6 to −10
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from market_engine.types import LayerResult

_ATR_PERIOD    = 14
_PARK_WINDOW   = 20     # Parkinson estimator window
_PCT_LOOKBACK  = 100    # bars for percentile rank computation
_CHANDELIER_N  = 22     # bars for chandelier high / low


def _wilder_atr(df: pd.DataFrame, period: int) -> pd.Series:
    """Wilder's ATR (exponential smoothing, α = 1/period)."""
    prev_c = df["close"].shift(1)
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_c).abs(),
        (df["low"]  - prev_c).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False).mean()


def _parkinson_sigma_pct(df: pd.DataFrame, window: int) -> float:
    """Parkinson (1980) historical volatility estimate over `window` bars.

    σ_park = sqrt( [1 / (4 ln 2)] × (1/N) × Σ [ln(H/L)]² )

    Returns as a percentage of close price (annualised to match ATR%).
    Using the raw per-bar figure (not annualised) for tier comparison.
    """
    h = df["high"].astype(float).values[-window:]
    l = df["low"].astype(float).values[-window:]
    c = df["close"].astype(float).values[-window:]

    # Guard against zero lows
    mask = l > 0
    if mask.sum() < 3:
        return float("nan")

    log_hl2 = np.log(h[mask] / l[mask]) ** 2
    factor  = 1.0 / (4.0 * np.log(2.0))
    sigma   = np.sqrt(factor * log_hl2.mean())        # fraction per bar
    # Express as % of mid-price (compare apples-to-apples with ATR%)
    mid     = (h[-1] + l[-1]) / 2.0
    return float(sigma * mid / c[-1] * 100)


def l15_atr(df: pd.DataFrame, period: int = _ATR_PERIOD) -> LayerResult:
    """Adaptive ATR volatility tier + Chandelier stop-loss levels."""
    r = LayerResult()
    needed = max(period + 2, _PCT_LOOKBACK, _CHANDELIER_N)
    if len(df) < needed:
        r.sig("ATR 데이터 부족", "neut")
        return r

    atr_s   = _wilder_atr(df, period)
    close   = df["close"].astype(float)
    atr_pct = atr_s / close * 100   # ATR as % of price

    cur_atr     = float(atr_s.iloc[-1])
    cur_close   = float(close.iloc[-1])
    cur_atr_pct = float(atr_pct.iloc[-1])

    # ── Adaptive percentile tier ───────────────────────────────────────
    # Use trailing _PCT_LOOKBACK bars so the tier is asset-agnostic and
    # adapts to the current market regime (e.g. ATR 1% = ULTRA_LOW for
    # BTC in a ranging market may be NORMAL for an altcoin).
    lookback_pcts = atr_pct.dropna().values[-_PCT_LOOKBACK:]
    if len(lookback_pcts) < 10:
        pct_rank = 50.0    # default to normal if too little history
    else:
        pct_rank = float(
            np.sum(lookback_pcts < cur_atr_pct) / len(lookback_pcts) * 100
        )

    # ── Parkinson confirmation ──────────────────────────────────────────
    park_sigma_pct = _parkinson_sigma_pct(df, _PARK_WINDOW)
    park_low = (
        not np.isnan(park_sigma_pct) and park_sigma_pct < cur_atr_pct * 0.7
    )  # Parkinson < 70% of ATR% → range is tight even intra-bar

    # ── Tier classification and scoring ───────────────────────────────
    if pct_rank < 10:
        tier  = "ULTRA_LOW"
        score = 8 if park_low else 6
        tag   = f"+{score} (Parkinson 확인)" if park_low else f"+{score}"
        r.sig(f"ATR {cur_atr_pct:.2f}% P{pct_rank:.0f} — ULTRA LOW 코일 {tag}", "bull")
    elif pct_rank < 25:
        tier  = "LOW"
        score = 3
        r.sig(f"ATR {cur_atr_pct:.2f}% P{pct_rank:.0f} — LOW 변동성 (+3)", "neut")
    elif pct_rank < 75:
        tier  = "NORMAL"
        score = 0
        r.sig(f"ATR {cur_atr_pct:.2f}% P{pct_rank:.0f} — NORMAL", "neut")
    elif pct_rank < 90:
        tier  = "HIGH"
        score = -3
        r.sig(f"ATR {cur_atr_pct:.2f}% P{pct_rank:.0f} — HIGH 변동성 (-3)", "warn")
    else:
        tier  = "EXTREME"
        score = -8 if pct_rank >= 98 else -5
        r.sig(f"ATR {cur_atr_pct:.2f}% P{pct_rank:.0f} — EXTREME 과열 ({score})", "warn")

    # ── Chandelier Exit stop levels (LeBeau) ───────────────────────────
    # stop_long  = max(high, N bars) − 2 × ATR
    # stop_short = min(low,  N bars) + 2 × ATR
    high_n = float(df["high"].astype(float).rolling(_CHANDELIER_N).max().iloc[-1])
    low_n  = float(df["low"].astype(float).rolling(_CHANDELIER_N).min().iloc[-1])

    stop_long   = round(high_n  - 2.0 * cur_atr, 6)
    stop_short  = round(low_n   + 2.0 * cur_atr, 6)
    tp1_long    = round(cur_close + 2.0 * cur_atr, 6)
    tp2_long    = round(cur_close + 3.5 * cur_atr, 6)
    tp1_short   = round(cur_close - 2.0 * cur_atr, 6)

    r.score = max(-10, min(8, round(score)))
    r.meta.update({
        "atr":             round(cur_atr, 6),
        "atr_pct":         round(cur_atr_pct, 3),
        "pct_rank":        round(pct_rank, 1),
        "tier":            tier,
        "park_sigma_pct":  round(park_sigma_pct, 3) if not np.isnan(park_sigma_pct) else None,
        "park_confirmed":  park_low,
        "stop_long":       stop_long,
        "stop_short":      stop_short,
        "tp1_long":        tp1_long,
        "tp2_long":        tp2_long,
        "tp1_short":       tp1_short,
    })
    return r
