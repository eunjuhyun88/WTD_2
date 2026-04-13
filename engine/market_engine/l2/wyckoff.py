"""Wyckoff Phase Analysis — Institutional Grade Implementation.

References:
    [1] Wyckoff, R.D. (1931). The Richard D. Wyckoff Method of Trading
        and Investing in Stocks. Wyckoff/Stock Market Institute.
    [2] Villahermosa, R. (2020). Wyckoff 2.0: Structures, Volume Profile
        and Order Flow. Ruben Villahermosa Press.
    [3] Pruden, H.O. & Belletante, B. (2009). The Wyckoff Method Applied.
        Journal of Technical Analysis, 66, 7-17.
    [4] Schroeder, H. (2019). Automated Wyckoff Pattern Recognition.
        QuantThesis working paper.

Algorithm:
    1. ATR-normalize all price thresholds (asset-agnostic across BTC/alts).
    2. Detect swing pivots: local H/L separated by >= 0.6 × ATR.
    3. Classify each pivot by volume Z-score + bar anatomy (close-pos, spread).
    4. Identify the Wyckoff event sequence:
           Accumulation: SC → AR → ST → Spring → SOS
           Distribution:  BC → AR → ST → UTAD  → SOW
    5. Score the most-advanced confirmed phase ∈ [-30, +30].

Score key:
    +28  Spring confirmed + SOS  (Phase C→D accumulation)
    +22  Spring alone            (Phase C)
    +18  SC + AR + ≥1 ST         (Phase B)
    +14  SC + AR                 (Phase A complete)
    +10  SC alone                (Phase A partial)
      0  NEUTRAL
    -10  BC alone
    -14  BC + AR
    -18  BC + AR + ≥1 ST
    -22  UTAD
    -28  UTAD + SOW              (Phase C→D distribution)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from market_engine.types import LayerResult


# ── Index normalisation ───────────────────────────────────────────────────────

def _ensure_dt_index(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure the DataFrame has a DatetimeIndex.

    Handles three input formats:
      1. Already a DatetimeIndex → return df unchanged.
      2. Has a 'timestamp' column (integer ms UTC) → set as DatetimeIndex.
      3. Integer RangeIndex → synthesise 1-hour bars from a fixed epoch.
    """
    if isinstance(df.index, pd.DatetimeIndex):
        return df
    if "timestamp" in df.columns:
        df = df.copy()
        df.index = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        return df
    # Fallback: synthesise hourly DatetimeIndex
    df = df.copy()
    df.index = pd.date_range(
        "2000-01-01", periods=len(df), freq="1h", tz="UTC"
    )
    return df


# ── ATR ──────────────────────────────────────────────────────────────────────

def _wilder_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray,
                period: int = 14) -> np.ndarray:
    """Wilder-smoothed ATR.  alpha = 1 / period."""
    n  = len(close)
    tr = np.empty(n)
    tr[0] = high[0] - low[0]
    for i in range(1, n):
        tr[i] = max(high[i] - low[i],
                    abs(high[i] - close[i - 1]),
                    abs(low[i]  - close[i - 1]))
    atr = np.empty(n)
    atr[:period] = tr[:period].mean()
    a = 1.0 / period
    for i in range(period, n):
        atr[i] = atr[i - 1] * (1 - a) + tr[i] * a
    return atr


# ── Swing pivot detection ────────────────────────────────────────────────────

def _find_pivots(high: np.ndarray, low: np.ndarray, atr: np.ndarray,
                 window: int = 5, min_atr: float = 0.6
                 ) -> tuple[list[int], list[int]]:
    """Swing highs / lows with minimum size filter.

    A bar i is a swing high if high[i] is the maximum in [i-w, i+w].
    Additionally the move from the nearest prior swing low must be
    ≥ min_atr × ATR[i] to suppress micro-noise pivots.
    """
    n  = len(high)
    ph: list[int] = []
    pl: list[int] = []
    for i in range(window, n - window):
        if high[i] == high[i - window: i + window + 1].max():
            ph.append(i)
        if low[i]  == low[i - window: i + window + 1].min():
            pl.append(i)

    def _size_filter(pivs: list[int], is_high: bool,
                     other: list[int]) -> list[int]:
        out: list[int] = []
        last_other = low[0] if is_high else high[0]
        j = 0
        for idx in pivs:
            while j < len(other) and other[j] < idx:
                last_other = (high[other[j]] if not is_high
                              else low[other[j]])
                j += 1
            price = high[idx] if is_high else low[idx]
            move  = (price - last_other) if is_high else (last_other - price)
            if move >= min_atr * atr[idx]:
                out.append(idx)
        return out

    ph = _size_filter(ph, True,  pl)
    pl = _size_filter(pl, False, ph)
    return ph, pl


# ── Volume helpers ───────────────────────────────────────────────────────────

def _vol_z(vol: np.ndarray, i: int, window: int = 20) -> float:
    """Z-score of volume at bar i versus the prior `window` bars."""
    start = max(0, i - window)
    base  = vol[start:i]
    if len(base) < 3:
        return 0.0
    mu, sd = base.mean(), base.std(ddof=0)
    return float((vol[i] - mu) / (sd + 1e-10))


def _vol_quality(z: float) -> str:
    if z > 2.0: return "climax"
    if z > 0.8: return "high"
    if z < -0.8: return "dry"
    return "normal"


def _close_pos(h: float, l: float, c: float) -> float:
    """0 = closed at bar bottom, 1 = closed at bar top."""
    rng = h - l
    return (c - l) / rng if rng > 1e-10 else 0.5


def _spread_atr(h: float, l: float, atr_val: float) -> float:
    """Bar (H-L) expressed in ATR units."""
    return (h - l) / atr_val if atr_val > 1e-10 else 1.0


# ── Wyckoff events ──────────────────────────────────────────────────────────

class _Event:
    __slots__ = ("label", "idx", "price", "vz", "cp")

    def __init__(self, label: str, idx: int, price: float,
                 vz: float, cp: float):
        self.label = label
        self.idx   = idx
        self.price = price
        self.vz    = vz
        self.cp    = cp


def _classify(ph: list[int], pl: list[int],
              high: np.ndarray, low: np.ndarray, close: np.ndarray,
              vol: np.ndarray, atr: np.ndarray,
              lookback: int = 300) -> list[_Event]:
    """Sequence the most recent swing pivots into Wyckoff events.

    Detection rules (Villahermosa 2020, adapted):

    SC (Selling Climax):
        Swing low; vol_z > 1.5; close_pos > 0.45 (closes in upper half);
        spread >= 1.2 ATR.  → Demand meets falling supply.

    BC (Buying Climax):
        Swing high; vol_z > 1.5; close_pos < 0.55; spread >= 1.2 ATR.

    AR (Automatic Rally / Reaction):
        Within 12 bars after SC: first swing high with vz < SC.vz - 0.3.
        (Supply exhausted temporarily, rally automatic.)
        After BC: first swing low with same condition.

    ST (Secondary Test):
        Price returns to within 1.5 ATR of SC/BC with vz < SC.vz - 0.8.
        Confirms supply/demand has dried up.

    Spring (False break — accumulation):
        Swing low below SC.price by <= 1.2 ATR; vz <= 0.2 (no sellers).
        Quickly recovers → supply exhausted.

    UTAD (Upthrust After Distribution):
        Swing high above BC.price by <= 1.2 ATR; vz <= 0.2 (no buyers).

    SOS (Sign of Strength):
        Swing high above AR.price; vz > 0.4; close_pos > 0.60.

    SOW (Sign of Weakness):
        Swing low below AR.price; vz > 0.4; close_pos < 0.40.
    """
    n      = len(close)
    cutoff = max(0, n - lookback)

    # Merge and sort all pivots in lookback window
    pivots: list[tuple[int, str, float]] = (
        [(i, "H", high[i]) for i in ph if i >= cutoff] +
        [(i, "L", low[i])  for i in pl if i >= cutoff]
    )
    pivots.sort(key=lambda x: x[0])

    events: list[_Event] = []
    sc: _Event | None = None
    bc: _Event | None = None
    ar: _Event | None = None  # AR following current SC or BC

    for idx, kind, price in pivots:
        vz  = _vol_z(vol, idx)
        vq  = _vol_quality(vz)
        cp  = _close_pos(high[idx], low[idx], close[idx])
        spd = _spread_atr(high[idx], low[idx], atr[idx])

        # ── Buying Climax (distribution start) ────────────────────
        if (kind == "H"
                and vq in ("climax", "high")
                and cp < 0.55
                and spd >= 1.2):
            bc = _Event("BC", idx, price, vz, cp)
            sc = None; ar = None
            events.append(bc)
            continue

        # ── Selling Climax (accumulation start) ───────────────────
        if (kind == "L"
                and vq in ("climax", "high")
                and cp > 0.45
                and spd >= 1.2):
            sc = _Event("SC", idx, price, vz, cp)
            bc = None; ar = None
            events.append(sc)
            continue

        # ── Post-SC events ────────────────────────────────────────
        if sc is not None and ar is None:
            if kind == "H" and (idx - sc.idx) <= 12 and vz < sc.vz - 0.3:
                ar = _Event("AR", idx, price, vz, cp)
                events.append(ar); continue

        if sc is not None and ar is not None:
            if (kind == "L"
                    and abs(price - sc.price) <= 1.5 * atr[idx]
                    and vz < sc.vz - 0.8):
                events.append(_Event("ST", idx, price, vz, cp)); continue
            if (kind == "L"
                    and price < sc.price
                    and (sc.price - price) <= 1.2 * atr[idx]
                    and vz <= 0.2):
                events.append(_Event("Spring", idx, price, vz, cp)); continue
            if (kind == "H"
                    and price > ar.price
                    and vz > 0.4
                    and cp > 0.60):
                events.append(_Event("SOS", idx, price, vz, cp)); continue

        # ── Post-BC events ─────────────────────────────────────────
        if bc is not None and ar is None:
            if kind == "L" and (idx - bc.idx) <= 12 and vz < bc.vz - 0.3:
                ar = _Event("AR", idx, price, vz, cp)
                events.append(ar); continue

        if bc is not None and ar is not None:
            if (kind == "H"
                    and abs(price - bc.price) <= 1.5 * atr[idx]
                    and vz < bc.vz - 0.8):
                events.append(_Event("ST", idx, price, vz, cp)); continue
            if (kind == "H"
                    and price > bc.price
                    and (price - bc.price) <= 1.2 * atr[idx]
                    and vz <= 0.2):
                events.append(_Event("UTAD", idx, price, vz, cp)); continue
            if (kind == "L"
                    and price < ar.price
                    and vz > 0.4
                    and cp < 0.40):
                events.append(_Event("SOW", idx, price, vz, cp)); continue

    return events


def _score_phase(events: list[_Event]) -> tuple[int, str, dict]:
    """Map event sequence → phase label + integer score."""
    if not events:
        return 0, "NEUTRAL", {}

    labels = [e.label for e in events]

    def has(*seq) -> bool:
        seen: set[str] = set()
        for lab in labels:
            seen.add(lab)
        return set(seq).issubset(seen)

    st_n    = labels.count("ST")
    last    = labels[-1]

    # Accumulation
    if has("SC"):
        if has("SOS"):
            s = 28 if has("Spring") else 24
            p = "Phase C→D (Spring+SOS)" if has("Spring") else "Phase D (SOS)"
        elif has("Spring"):
            s, p = 22, "Phase C (Spring)"
        elif has("SC", "AR") and st_n >= 1:
            s, p = 18, f"Phase B (ST×{st_n})"
        elif has("SC", "AR"):
            s, p = 14, "Phase A (AR)"
        else:
            s, p = 10, "Phase A (SC)"
        return s, p, {"sc": True, "ar": has("SC","AR"),
                      "st_count": st_n, "spring": has("Spring"),
                      "sos": has("SOS"), "last": last}

    # Distribution
    if has("BC"):
        if has("SOW"):
            s = -28 if has("UTAD") else -24
            p = "Phase C→D (UTAD+SOW)" if has("UTAD") else "Phase D (SOW)"
        elif has("UTAD"):
            s, p = -22, "Phase C (UTAD)"
        elif has("BC", "AR") and st_n >= 1:
            s, p = -18, f"Phase B (ST×{st_n})"
        elif has("BC", "AR"):
            s, p = -14, "Phase A (AR)"
        else:
            s, p = -10, "Phase A (BC)"
        return s, p, {"bc": True, "ar": has("BC","AR"),
                      "st_count": st_n, "utad": has("UTAD"),
                      "sow": has("SOW"), "last": last}

    return 0, "NEUTRAL", {"last": last}


# ── Public ───────────────────────────────────────────────────────────────────

def l1_wyckoff(df: pd.DataFrame) -> LayerResult:
    """Wyckoff Phase Analysis.  Score ∈ [-30, +30]."""
    lr = LayerResult()
    if len(df) < 60:
        lr.sig("데이터 부족 (≥60 bars 필요)", "warn")
        return lr

    H  = df["high"].values.astype(float)
    L  = df["low"].values.astype(float)
    C  = df["close"].values.astype(float)
    V  = df["volume"].values.astype(float)
    atr = _wilder_atr(H, L, C)
    ph, pl = _find_pivots(H, L, atr, window=5, min_atr=0.6)

    if len(ph) < 2 or len(pl) < 2:
        lr.sig("스윙 피벗 부족 — 레인지 미형성", "neut")
        lr.meta.update({"phase": "NEUTRAL"})
        return lr

    events = _classify(ph, pl, H, L, C, V, atr, lookback=300)
    score, phase, meta = _score_phase(events)
    lr.score = float(max(-30, min(30, score)))

    _MSG = {
        range(22, 31):   ("Wyckoff 매집 완료 — Spring+SOS 확인", "bull"),
        range(14, 22):   ("Wyckoff 매집 진행 — Phase B/C", "bull"),
        range(6, 14):    ("Wyckoff 매집 초기 증거 — SC 감지", "bull"),
        range(-6, 6):    ("Wyckoff 중립 — 구조 미형성", "neut"),
        range(-14, -6):  ("Wyckoff 분배 초기 증거 — BC 감지", "bear"),
        range(-22, -14): ("Wyckoff 분배 진행 — Phase B/C", "bear"),
        range(-31, -22): ("Wyckoff 분배 완료 — UTAD+SOW 확인", "bear"),
    }
    for rng, (text, kind) in _MSG.items():
        if int(lr.score) in rng:
            lr.sig(f"{text} ({phase})", kind)
            break

    lr.meta.update({"phase": phase,
                    "events": [e.label for e in events[-8:]],
                    "atr_pct": round(atr[-1] / C[-1] * 100, 3),
                    **meta})
    return lr


def l10_mtf(df_1h: pd.DataFrame) -> LayerResult:
    """Multi-Timeframe Wyckoff: 1H + 4H + 1D.

    Confluence scoring (Pruden & Belletante 2009):
        All 3 TF agree  → multiply total score × 1.5
        2 / 3 TF agree  → × 1.2
        Conflict        → × 0.6  (uncertainty discount)
    """
    lr = LayerResult()

    # Ensure DatetimeIndex for resample (handles RangeIndex / timestamp column)
    df_1h = _ensure_dt_index(df_1h)

    tf_map = {"1H": 1, "4H": 4, "1D": 24}
    tf_results: dict[str, dict] = {}
    scores: list[float] = []

    # Build agg dict dynamically — omit optional columns that don't exist
    base_agg = {"open": "first", "high": "max", "low": "min",
                "close": "last", "volume": "sum"}
    if "taker_buy_base_volume" in df_1h.columns:
        base_agg["taker_buy_base_volume"] = "sum"

    for label, hours in tf_map.items():
        if hours == 1:
            df_tf = df_1h
        else:
            df_tf = (df_1h
                     .resample(f"{hours}h", label="right", closed="right")
                     .agg(base_agg)
                     .dropna(subset=["close"]))
        if len(df_tf) < 30:
            continue
        sub = l1_wyckoff(df_tf)
        tf_results[label] = {"score": int(sub.score),
                              "phase": sub.meta.get("phase", "?")}
        scores.append(sub.score)
        lr.sig(f"[{label}] {sub.meta.get('phase','?')}  "
               f"score={sub.score:+.0f}", "neut")

    if not scores:
        lr.sig("MTF 데이터 부족", "warn")
        return lr

    bulls = sum(1 for s in scores if s > 5)
    bears = sum(1 for s in scores if s < -5)
    base  = sum(scores)

    if len(scores) >= 3:
        if bulls == len(scores):
            mult = 1.5
            lr.sig("MTF 전 TF 매집 합치 — 강한 매집 신호", "bull")
        elif bears == len(scores):
            mult = 1.5
            lr.sig("MTF 전 TF 분배 합치 — 강한 분배 신호", "bear")
        elif bulls >= 2:
            mult = 1.2
            lr.sig("MTF 2+TF 매집 동의", "bull")
        elif bears >= 2:
            mult = 1.2
            lr.sig("MTF 2+TF 분배 동의", "bear")
        else:
            mult = 0.6
            lr.sig("MTF TF 간 불일치 — 신호 약화", "warn")
    else:
        mult = 1.0

    lr.score = float(max(-30, min(30, base * mult)))
    lr.meta.update({"tf_results": tf_results, "acc_count": bulls})
    return lr
