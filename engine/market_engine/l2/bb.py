"""L14 — TTM Squeeze (Bollinger Band inside Keltner Channel).

References:
    [1] Carter, J.F. (2006). Mastering the Trade, 2nd ed.
        McGraw-Hill Education.  Chapter 11: "The Squeeze."
    [2] Keltner, C.W. (1960). How to Make Money in Commodities.
        The Keltner Statistical Service.  (original KC definition)

Theory:
    Squeeze ON   = BB(20, 2σ) entirely inside KC(20, 1.5 × ATR₁₄)
                   Volatility compressed → explosive move imminent.
    Momentum osc = LinReg fitted value of (close − midpoint) over window,
                   where midpoint = 0.5 × (HH₂₀ + LL₂₀)  [Carter exact].
    Squeeze FIRE = BB breaks out of KC (first bar after squeeze_on → False).

Score ∈ [−20, +20]:
    ULTRA Squeeze (tightness > 0.75 or ≥ 10 bars) : +20
    Normal Squeeze (on)                             : +15
    Early Squeeze (< 5 bars)                        : +8
    Momentum confirmation inside squeeze            : ±3
    Squeeze FIRE with momentum                      : ±18

Replaces the old dual-function approach (l14_bb + s16_bb) that:
  • double-counted the same volatility signal
  • used no Keltner context (could not distinguish squeeze vs normal BW)
  • had no directional output whatsoever

NOTE: `s16_bb` remains as a pipeline shim that returns score=0 to prevent
double-counting in the total. The meta dict is shared so the alpha engine
still reads squeeze_on, sq_bars, tightness, momentum from `s16`.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from market_engine.types import LayerResult

_BB_PERIOD = 20
_BB_MULT   = 2.0
_KC_MULT   = 1.5    # Carter's original Keltner ATR multiplier


def _true_range(df: pd.DataFrame) -> pd.Series:
    prev_c = df["close"].shift(1)
    return pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_c).abs(),
        (df["low"]  - prev_c).abs(),
    ], axis=1).max(axis=1)


def _keltner(
    df: pd.DataFrame, period: int, mult: float
) -> tuple[pd.Series, pd.Series]:
    mid = df["close"].astype(float).rolling(period).mean()
    atr = _true_range(df).rolling(period).mean()
    return mid + mult * atr, mid - mult * atr


def _momentum_osc(df: pd.DataFrame, period: int) -> pd.Series:
    """Carter TTM momentum oscillator (exact specification).

    val[i] = close[i] − 0.5 × (HH_period + LL_period)[i]
    Then apply a linear regression over those values across the window,
    returning the fitted value at the last point.  This gives a smoother
    oscillator than a raw difference.
    """
    hh    = df["high"].astype(float).rolling(period).max()
    ll    = df["low"].astype(float).rolling(period).min()
    delta = df["close"].astype(float) - 0.5 * (hh + ll)

    def _linreg_last(arr: np.ndarray) -> float:
        n = len(arr)
        if n < 2:
            return float(arr[-1])
        x  = np.arange(n, dtype=float)
        xm = x.mean()
        ym = arr.mean()
        slope = ((x - xm) * (arr - ym)).sum() / (((x - xm) ** 2).sum() + 1e-10)
        return float(ym + slope * (x[-1] - xm))

    return delta.rolling(period).apply(_linreg_last, raw=True)


def l14_bb(df: pd.DataFrame, period: int = _BB_PERIOD) -> LayerResult:
    """TTM Squeeze: BB-inside-KC detector + Carter momentum oscillator."""
    r = LayerResult()
    needed = period * 3
    if len(df) < needed:
        r.sig("TTM Squeeze 데이터 부족", "neut")
        return r

    close = df["close"].astype(float)

    # ── Bollinger Bands ────────────────────────────────────────────────
    mid   = close.rolling(period).mean()
    std   = close.rolling(period).std(ddof=1)
    bb_u  = mid + _BB_MULT * std
    bb_l  = mid - _BB_MULT * std
    bb_w  = (bb_u - bb_l) / mid * 100          # % bandwidth

    # ── Keltner Channel ────────────────────────────────────────────────
    kc_u, kc_l = _keltner(df, period, _KC_MULT)
    kc_w       = (kc_u - kc_l) / mid * 100

    # ── Squeeze state ──────────────────────────────────────────────────
    squeeze_on  = (bb_u < kc_u) & (bb_l > kc_l)
    sq_now      = bool(squeeze_on.iloc[-1])
    sq_prev     = bool(squeeze_on.iloc[-2]) if len(squeeze_on) > 1 else sq_now
    sq_released = sq_prev and not sq_now       # fired this bar

    # Count consecutive bars in squeeze (most-recent last)
    sq_bars = 0
    for val in reversed(squeeze_on.values):
        if val:
            sq_bars += 1
        else:
            break

    cur_bw    = float(bb_w.iloc[-1])
    cur_kw    = float(kc_w.iloc[-1])
    # tightness: 0 = BB at KC boundary, 1 = BB fully collapsed to mid
    tightness = max(0.0, 1.0 - cur_bw / (cur_kw + 1e-9))

    # ── Momentum oscillator ───────────────────────────────────────────
    mom        = _momentum_osc(df, period)
    mom_now    = float(mom.iloc[-1])
    mom_prev   = float(mom.iloc[-2]) if len(mom) > 1 else mom_now
    mom_rising = mom_now > mom_prev

    # ── Scoring ───────────────────────────────────────────────────────
    score = 0

    if sq_now:
        if tightness > 0.75 or sq_bars >= 10:
            score = 20
            r.sig(
                f"TTM ULTRA Squeeze {sq_bars}봉 | 압축도 {tightness:.2f} (+20)",
                "bull",
            )
        elif sq_bars >= 5 or tightness > 0.45:
            score = 15
            r.sig(f"TTM Squeeze ON {sq_bars}봉 (+15)", "bull")
        else:
            score = 8
            r.sig(f"TTM Squeeze 진입 {sq_bars}봉 (+8)", "bull")

        # Momentum direction bias while inside squeeze
        if mom_rising and mom_now > 0:
            score += 3
            r.sig("Squeeze 모멘텀 상승 — 상방 편향 (+3)", "bull")
        elif not mom_rising and mom_now < 0:
            score -= 3
            r.sig("Squeeze 모멘텀 하락 — 하방 편향 (-3)", "bear")

    elif sq_released:
        # First bar after BB breaks out of KC → fire signal
        if mom_now > 0 and mom_rising:
            score = 18
            r.sig("TTM Squeeze FIRE ▲ — 상방 돌파 모멘텀 (+18)", "bull")
        elif mom_now < 0 and not mom_rising:
            score = -18
            r.sig("TTM Squeeze FIRE ▼ — 하방 돌파 모멘텀 (-18)", "bear")
        else:
            score = 5
            r.sig("TTM Squeeze 해제 — 방향 미확정 (+5)", "warn")

    else:
        r.sig(f"TTM Squeeze OFF — BB {cur_bw:.2f}% > KC {cur_kw:.2f}%", "neut")

    r.score = max(-20, min(20, round(score)))
    r.meta.update({
        "squeeze_on":    sq_now,
        "sq_released":   sq_released,
        "sq_bars":       sq_bars,
        "tightness":     round(tightness, 3),
        "bb_width_pct":  round(cur_bw, 3),
        "kc_width_pct":  round(cur_kw, 3),
        "momentum":      round(mom_now, 4),
        "mom_rising":    mom_rising,
    })
    return r


def s16_bb(df: pd.DataFrame, threshold_pct: float = 3.5) -> LayerResult:
    """Pipeline shim: delegates to l14_bb (TTM Squeeze).

    score = 0 to prevent double-counting in pipeline total
    (l14_bb already contributes the score via layers["bb14"]).
    The meta dict is fully populated so alpha-engine S16 slot still works.
    """
    lr = l14_bb(df)
    out = LayerResult()
    out.score = 0       # suppress duplicate contribution to total_score
    out.sigs  = []      # suppress duplicate terminal signal lines
    out.meta  = lr.meta
    return out
