"""Multi-timeframe EMA feature computation — W-0329.

Resamples 1H OHLCV klines to 4H and 1D, computes EMA20/50/200 on each
timeframe, then evaluates alignment (ema20 > ema50 > ema200).

Outputs:
    mtf_confluence_score: -3 to +3 (bull_count - bear_count)
    mtf_ema_bull_count:   0 to 3
    mtf_ema_bear_count:   0 to 3

Alpha Terminal L10 mapping:
    3 TFs bull = +18pts  →  score=3
    2 TFs bull = +10pts  →  score=2  (mtf_bullish_alignment threshold)
    3 TFs bear = -18pts  →  score=-3
    2 TFs bear = -10pts  →  score=-2 (mtf_bearish_alignment threshold)
"""
from __future__ import annotations

import pandas as pd


_RESAMPLE_MAP = {"4H": "4h", "1D": "1D"}
_EMA_PERIODS = [20, 50, 200]


def _ema_alignment(df: pd.DataFrame) -> tuple[bool, bool]:
    """Return (is_bullish, is_bearish) for a resampled OHLCV DataFrame."""
    if len(df) < 200:
        return False, False
    close = df["close"].astype(float)
    e20 = close.ewm(span=20, adjust=False).mean().iloc[-1]
    e50 = close.ewm(span=50, adjust=False).mean().iloc[-1]
    e200 = close.ewm(span=200, adjust=False).mean().iloc[-1]
    return (e20 > e50 > e200), (e20 < e50 < e200)


def compute_mtf_confluence(klines_1h: pd.DataFrame) -> pd.DataFrame:
    """Compute MTF confluence features from 1H klines.

    Returns a DataFrame with the same index as klines_1h, containing:
        mtf_confluence_score, mtf_ema_bull_count, mtf_ema_bear_count

    The score is constant across all bars (computed from the latest bar's
    multi-TF perspective), which is correct for a scanner that evaluates
    the current market state.
    """
    bull_count = 0
    bear_count = 0

    # 1H alignment (base TF)
    is_bull_1h, is_bear_1h = _ema_alignment(klines_1h)
    if is_bull_1h:
        bull_count += 1
    elif is_bear_1h:
        bear_count += 1

    # 4H alignment
    try:
        k4h = klines_1h.resample("4h").agg({
            "open": "first", "high": "max", "low": "min",
            "close": "last", "volume": "sum",
        }).dropna()
        is_bull_4h, is_bear_4h = _ema_alignment(k4h)
        if is_bull_4h:
            bull_count += 1
        elif is_bear_4h:
            bear_count += 1
    except Exception:
        pass

    # 1D alignment
    try:
        k1d = klines_1h.resample("1D").agg({
            "open": "first", "high": "max", "low": "min",
            "close": "last", "volume": "sum",
        }).dropna()
        is_bull_1d, is_bear_1d = _ema_alignment(k1d)
        if is_bull_1d:
            bull_count += 1
        elif is_bear_1d:
            bear_count += 1
    except Exception:
        pass

    score = bull_count - bear_count
    result = pd.DataFrame(
        {
            "mtf_confluence_score": score,
            "mtf_ema_bull_count": bull_count,
            "mtf_ema_bear_count": bear_count,
        },
        index=klines_1h.index,
    )
    return result
