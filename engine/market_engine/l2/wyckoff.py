"""L1/L10 — Wyckoff Phase Analysis + Multi-Timeframe Confluence.

Ported from Alpha Terminal v3.0 (나혼자매매 Alpha Flow by 아카).

L1_wyckoff : single-timeframe Wyckoff scoring on a candle list
L10_mtf    : apply wyckoff on 1H / 4H / 1D independently, award confluence bonus
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from market_engine.types import LayerResult

# ── Scoring constants (from HTML source) ──────────────────────────────────
_BASE_ACC    =  12
_BASE_DIST   = -12
_SC_QUAL     = {(True, True): 10, (True, False): 6, (False, True): 4}  # (vol_spike, price_reversal)
_ST_MAX      = 8      # max points from secondary tests
_SPRING_QUAL = {(True, True): 9, (True, False): 7, (False, True): 6, (False, False): 3}
_SOS_PTS     = 6      # sign of strength breakout
_SOW_PTS     = -6     # sign of weakness breakdown
_VOL_DRY_PTS = 3      # volume dry-up during spring/UTAD


def _wyckoff_on_candles(df: pd.DataFrame) -> LayerResult:
    """Single-timeframe Wyckoff.  df columns: open high low close volume (recent last)."""
    r = LayerResult()
    n = len(df)
    if n < 30:
        r.sig("데이터 부족 (30봉 이상 필요)", "neut")
        return r

    closes  = df["close"].values
    highs   = df["high"].values
    lows    = df["low"].values
    vols    = df["volume"].values

    avg_vol = np.mean(vols)
    max_c   = np.max(closes)
    min_c   = np.min(closes)
    price_range = max_c - min_c
    if price_range == 0:
        return r

    last_c  = closes[-1]
    last_v  = vols[-1]

    # ── 1. Climax detection (SC / BC) ─────────────────────────────────────
    vol_spike      = last_v > avg_vol * 2.5
    price_reversal = abs(closes[-1] - closes[-2]) / price_range > 0.06 if n >= 2 else False

    # Selling Climax (SC): price near range low + vol spike
    near_low  = (last_c - min_c) / price_range < 0.25
    # Buying Climax (BC): price near range high + vol spike
    near_high = (max_c - last_c) / price_range < 0.25

    climax_qual   = _SC_QUAL.get((vol_spike, price_reversal), 2)
    is_sc = near_low  and vol_spike
    is_bc = near_high and vol_spike

    if is_sc:
        r.score += _BASE_ACC + climax_qual
        r.sig(f"SC 감지 — 매도 클라이맥스 (품질 +{climax_qual})", "bull")
    elif is_bc:
        r.score += _BASE_DIST - climax_qual
        r.sig(f"BC 감지 — 매수 클라이맥스 (품질 -{climax_qual})", "bear")

    # ── 2. Secondary Tests (ST) counting ──────────────────────────────────
    # Count bar reversals near range extremes with below-avg volume
    st_count = 0
    st_vol_q = 0
    for i in range(max(0, n-15), n-1):
        bar_low_pct  = (closes[i] - min_c) / price_range
        bar_high_pct = (max_c - closes[i]) / price_range
        is_reversal  = (closes[i] - closes[i-1]) * (closes[i+1] - closes[i]) < 0
        low_vol      = vols[i] < avg_vol * 0.8
        if is_reversal and (bar_low_pct < 0.2 or bar_high_pct < 0.2):
            st_count += 1
            if low_vol:
                st_vol_q += 1

    st_pts = min(_ST_MAX, st_count * 2 + st_vol_q * 2)
    if st_count > 0:
        r.score += st_pts if is_sc else -st_pts
        r.sig(f"ST {st_count}회 감지 (+{st_pts}pts)", "bull" if is_sc else "bear")

    # ── 3. Spring / UTAD ──────────────────────────────────────────────────
    # Spring: price briefly breaks below range low then recovers
    spring_break = lows[-1] < min_c * 0.995
    spring_recov = closes[-1] > min_c
    spring_vol_d = last_v < avg_vol * 0.9    # low vol = bullish spring

    # UTAD: price briefly breaks above range high then falls
    utad_break = highs[-1] > max_c * 1.005
    utad_recov = closes[-1] < max_c
    utad_vol_d = last_v < avg_vol * 0.9

    if spring_break and spring_recov:
        qual = _SPRING_QUAL.get((spring_vol_d, vol_spike), 3)
        r.score += qual
        if spring_vol_d:
            r.score += _VOL_DRY_PTS
            r.sig(f"Spring 감지 — 저거래량 이탈 후 복귀 (+{qual+_VOL_DRY_PTS})", "bull")
        else:
            r.sig(f"Spring 감지 (+{qual})", "bull")

    elif utad_break and utad_recov:
        qual = _SPRING_QUAL.get((utad_vol_d, vol_spike), 3)
        r.score -= qual
        r.sig(f"UTAD 감지 — 고점 이탈 후 복귀 (-{qual})", "bear")

    # ── 4. SOS / SOW (range breakout with volume confirmation) ────────────
    breakout_up   = closes[-1] > max_c * 1.01 and last_v > avg_vol * 1.5
    breakdown_dn  = closes[-1] < min_c * 0.99 and last_v > avg_vol * 1.5

    if breakout_up:
        r.score += _SOS_PTS
        r.sig("SOS — 거래량 수반 상방 돌파", "bull")
    elif breakdown_dn:
        r.score += _SOW_PTS
        r.sig("SOW — 거래량 수반 하방 이탈", "bear")

    # ── Phase label ───────────────────────────────────────────────────────
    pos_pct = (last_c - min_c) / price_range
    if r.score >= 15:
        phase = "C (Spring)"
    elif r.score >= 8:
        phase = "B (ST)"
    elif r.score >= 3:
        phase = "A (SC)"
    elif r.score <= -15:
        phase = "C (UTAD)"
    elif r.score <= -8:
        phase = "B (BC-ST)"
    else:
        phase = "D/E (추세)"

    r.meta["phase"]   = phase
    r.meta["sc"]      = is_sc
    r.meta["bc"]      = is_bc
    r.meta["st_count"]= st_count
    r.score           = max(-30, min(30, round(r.score)))
    return r


def _ensure_dt_index(df: pd.DataFrame) -> pd.DataFrame:
    """Guarantee a DatetimeIndex so resample() works regardless of input format.

    Handles three common cases:
      1. Already has DatetimeIndex        → no-op
      2. Has a 'timestamp' column (ms)    → set as index
      3. Integer RangeIndex               → synthesise 1H index ending now
    """
    if isinstance(df.index, pd.DatetimeIndex):
        return df
    if "timestamp" in df.columns:
        df = df.copy()
        df.index = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        return df
    # Fallback: treat each row as one 1-H candle ending at UTC now
    df = df.copy()
    df.index = pd.date_range(
        end=pd.Timestamp.utcnow().floor("1h"),
        periods=len(df),
        freq="1h",
        tz="UTC",
    )
    return df


def _resample_to_tf(df_1h: pd.DataFrame, tf_hours: int) -> pd.DataFrame:
    """Resample 1H OHLCV dataframe to a higher timeframe."""
    df_1h = _ensure_dt_index(df_1h)
    rule = f"{tf_hours}h"
    resampled = df_1h.resample(rule).agg({
        "open":   "first",
        "high":   "max",
        "low":    "min",
        "close":  "last",
        "volume": "sum",
    }).dropna()
    return resampled


def l1_wyckoff(df_1h: pd.DataFrame) -> LayerResult:
    """Run Wyckoff on 6 sliding window combinations, return best score.

    HTML strategy: try multiple (range, test) window sizes, keep the one
    that produces the highest absolute score (most informative).
    """
    best = LayerResult()
    windows = [
        (30, 10), (40, 15), (50, 20),
        (60, 20), (80, 30), (100, 30),
    ]
    for rng, _ in windows:
        if len(df_1h) < rng:
            continue
        candidate = _wyckoff_on_candles(df_1h.iloc[-rng:])
        if abs(candidate.score) > abs(best.score):
            best = candidate

    return best


def l10_mtf(df_1h: pd.DataFrame) -> LayerResult:
    """L10 — Multi-Timeframe Confluence.

    Apply Wyckoff on 1H, 4H, 1D independently.
    Bonus: all 3 agree ACC → +18 pts;  2 agree → +10 pts.
    """
    r = LayerResult()

    tf_map = {
        "1H":  df_1h,
        "4H":  _resample_to_tf(df_1h, 4)  if len(df_1h) >= 8  else None,
        "1D":  _resample_to_tf(df_1h, 24) if len(df_1h) >= 48 else None,
    }

    results: dict[str, LayerResult] = {}
    for label, df in tf_map.items():
        if df is not None and len(df) >= 30:
            results[label] = l1_wyckoff(df)

    acc_count  = sum(1 for res in results.values() if res.score > 5)
    dist_count = sum(1 for res in results.values() if res.score < -5)

    scores_sum = sum(res.score for res in results.values())
    r.score = round(scores_sum * 0.5)  # weighted blend

    if acc_count >= 3:
        r.score += 18
        r.sig("MTF 완전 일치 — 3개 타임프레임 ACC 동시 (+18)", "bull")
    elif acc_count == 2:
        r.score += 10
        r.sig(f"MTF 2개 ACC 일치 (+10)", "bull")
    elif dist_count >= 3:
        r.score -= 18
        r.sig("MTF 완전 일치 — 3개 타임프레임 DIST 동시 (-18)", "bear")
    elif dist_count == 2:
        r.score -= 10
        r.sig("MTF 2개 DIST 일치 (-10)", "bear")

    for label, res in results.items():
        r.sig(f"[{label}] {res.meta.get('phase','?')} score={res.score}", "neut")

    r.meta["tf_results"] = {k: {"score": v.score, "phase": v.meta.get("phase")}
                             for k, v in results.items()}
    r.meta["acc_count"]  = acc_count
    r.score = max(-30, min(30, r.score))
    return r
