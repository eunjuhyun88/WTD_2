"""Signal Derivations — feature table columns → named signal flags/scores.

This module bridges compute_features_table() output (raw numeric columns)
and the signal vocabulary used by the QueryTransformer / SearchQuerySpec.

Design rules:
- Every function is PAST-ONLY: only uses data up to bar t.
- Outputs a flat dict of {signal_name: value} where value is float or bool.
- No LLM, no provider calls. Pure vectorized math over a DataFrame window.
- All thresholds are DEFAULT_* constants. Ledger verdicts calibrate them later.

Signal groups:
  A. OI signals          (oi_spike, oi_hold, oi_reexpansion, oi_unwind, oi_small_uptick)
  B. Funding signals     (funding_extreme_short, funding_extreme_long, funding_flip_*)
  C. Volume signals      (volume_spike, volume_dryup, low_volume)
  D. Price structure     (price_dump, price_spike, fresh_low_break, higher_lows_sequence,
                          higher_highs_sequence, sideways, upward_sideways, breakout,
                          range_high_break, arch_zone, compression)
  E. Flow / positioning  (short_build_up, long_build_up, short_to_long_switch)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# Default thresholds (calibrated by ledger verdicts in production)
# ─────────────────────────────────────────────────────────────────────────────

# A. OI
DEFAULT_OI_SPIKE_ZSCORE = 1.5          # oi_change z-score above this → oi_spike
DEFAULT_OI_SMALL_UPTICK_MAX = 0.03     # oi_change_pct ≤ this AND > 0 → small uptick
DEFAULT_OI_UNWIND_THRESHOLD = -0.04   # oi_change_pct below this → oi_unwind
DEFAULT_OI_REEXPANSION_ZSCORE = 1.0   # oi z-score during breakout phase

# B. Funding
DEFAULT_FUNDING_EXTREME_SHORT = -0.0003    # funding_rate below this → extreme_short
DEFAULT_FUNDING_EXTREME_LONG = 0.0003     # funding_rate above this → extreme_long
DEFAULT_FUNDING_FLIP_WINDOW = 4           # bars to detect sign flip

# C. Volume
DEFAULT_VOLUME_SPIKE_ZSCORE = 2.0         # vol_zscore above this → spike
DEFAULT_VOLUME_LOW_ZSCORE = 0.5           # vol_zscore below this → low_volume
DEFAULT_VOLUME_DRYUP_ZSCORE = -0.5        # vol_zscore below this → dryup

# D. Price structure
DEFAULT_PRICE_DUMP_PCT = -0.04            # price_change below this → dump
DEFAULT_PRICE_SPIKE_PCT = 0.04            # price_change above this → spike
DEFAULT_FRESH_LOW_BREAK_PCT = -0.02       # price_change below → fresh_low_break
DEFAULT_HIGHER_LOW_MIN_COUNT = 2          # consecutive higher lows needed
DEFAULT_SIDEWAYS_RANGE_PCT = 0.06         # max range/mid_price ratio for sideways
DEFAULT_BREAKOUT_STRENGTH = 0.01          # min price move above range high
DEFAULT_ARCH_ZONE_BB_SQUEEZE = 0.5        # bb_squeeze flag
DEFAULT_ARCH_ZONE_VOL_RATIO = 0.7         # vol_ratio_3 below this → compression

# E. Positioning
DEFAULT_LONG_SHORT_EXTREME_LOW = 0.9      # long_short_ratio below → short_dominance
DEFAULT_LONG_SHORT_EXTREME_HIGH = 1.15    # long_short_ratio above → long_dominance


# ─────────────────────────────────────────────────────────────────────────────
# A. OI signals
# ─────────────────────────────────────────────────────────────────────────────

def _oi_zscore_series(df: pd.DataFrame, window: int = 48) -> pd.Series:
    """Rolling z-score of oi_change_24h over `window` bars."""
    col = df.get("oi_change_24h", pd.Series(0.0, index=df.index))
    mean = col.rolling(window, min_periods=max(4, window // 4)).mean()
    std = col.rolling(window, min_periods=max(4, window // 4)).std().replace(0, np.nan)
    return ((col - mean) / std).fillna(0.0)


def derive_oi_signals(df: pd.DataFrame, row_idx: int = -1) -> dict[str, float]:
    """Derive OI signal flags for a single bar.

    row_idx=-1 means the last bar (current).
    Returns flat dict with float/bool values.
    """
    if df.empty:
        return {}

    oi_change_24h = float(df["oi_change_24h"].iloc[row_idx]) if "oi_change_24h" in df else 0.0
    oi_change_1h = float(df["oi_change_1h"].iloc[row_idx]) if "oi_change_1h" in df else 0.0

    # z-score
    zs = _oi_zscore_series(df)
    oi_zscore = float(zs.iloc[row_idx])

    # Spike: z-score crosses threshold
    oi_spike_flag = oi_zscore >= DEFAULT_OI_SPIKE_ZSCORE

    # Small uptick: oi_change_pct is small and positive
    oi_small_uptick_flag = 0.0 < oi_change_24h <= DEFAULT_OI_SMALL_UPTICK_MAX

    # Unwind: OI is falling meaningfully
    oi_unwind_flag = oi_change_24h <= DEFAULT_OI_UNWIND_THRESHOLD

    # Hold after spike: prior bar had spike, current oi change is near-flat
    oi_hold_flag = False
    if row_idx == -1 and len(df) >= 2:
        prior_zscore = float(zs.iloc[-2])
        oi_hold_flag = (prior_zscore >= DEFAULT_OI_SPIKE_ZSCORE) and (
            abs(oi_change_24h) < DEFAULT_OI_SMALL_UPTICK_MAX * 2
        )

    # Reexpansion: moderate oi increase in a recovery context
    oi_reexpansion_flag = oi_zscore >= DEFAULT_OI_REEXPANSION_ZSCORE and not oi_spike_flag

    return {
        "oi_zscore": oi_zscore,
        "oi_change_24h": oi_change_24h,
        "oi_change_1h": oi_change_1h,
        "oi_spike_flag": float(oi_spike_flag),
        "oi_small_uptick_flag": float(oi_small_uptick_flag),
        "oi_unwind_flag": float(oi_unwind_flag),
        "oi_hold_flag": float(oi_hold_flag),
        "oi_reexpansion_flag": float(oi_reexpansion_flag),
    }


# ─────────────────────────────────────────────────────────────────────────────
# B. Funding signals
# ─────────────────────────────────────────────────────────────────────────────

def derive_funding_signals(df: pd.DataFrame, row_idx: int = -1) -> dict[str, float]:
    if df.empty or "funding_rate" not in df:
        return {}

    rate = float(df["funding_rate"].iloc[row_idx])
    funding_extreme_short_flag = rate <= DEFAULT_FUNDING_EXTREME_SHORT
    funding_extreme_long_flag = rate >= DEFAULT_FUNDING_EXTREME_LONG
    funding_positive_flag = rate > 0.0

    # Flip detection: look back DEFAULT_FUNDING_FLIP_WINDOW bars
    funding_flip_neg_to_pos = False
    funding_flip_pos_to_neg = False
    flip_window = DEFAULT_FUNDING_FLIP_WINDOW
    if len(df) >= flip_window + 1:
        prior_rates = df["funding_rate"].iloc[-(flip_window + 1):-1]
        prior_was_negative = (prior_rates < 0).all()
        prior_was_positive = (prior_rates > 0).all()
        funding_flip_neg_to_pos = prior_was_negative and rate > 0
        funding_flip_pos_to_neg = prior_was_positive and rate < 0

    return {
        "funding_rate": rate,
        "funding_extreme_short_flag": float(funding_extreme_short_flag),
        "funding_extreme_long_flag": float(funding_extreme_long_flag),
        "funding_positive_flag": float(funding_positive_flag),
        "funding_flip_flag": float(funding_flip_neg_to_pos),
        "funding_flip_negative_to_positive": float(funding_flip_neg_to_pos),
        "funding_flip_positive_to_negative": float(funding_flip_pos_to_neg),
    }


# ─────────────────────────────────────────────────────────────────────────────
# C. Volume signals
# ─────────────────────────────────────────────────────────────────────────────

def derive_volume_signals(df: pd.DataFrame, row_idx: int = -1) -> dict[str, float]:
    if df.empty:
        return {}

    vol_zscore = float(df["vol_zscore"].iloc[row_idx]) if "vol_zscore" in df else 0.0
    vol_ratio_3 = float(df["vol_ratio_3"].iloc[row_idx]) if "vol_ratio_3" in df else 1.0

    volume_spike_flag = vol_zscore >= DEFAULT_VOLUME_SPIKE_ZSCORE
    low_volume_flag = vol_zscore <= DEFAULT_VOLUME_LOW_ZSCORE
    volume_dryup_flag = vol_zscore <= DEFAULT_VOLUME_DRYUP_ZSCORE

    return {
        "vol_zscore": vol_zscore,
        "vol_ratio_3": vol_ratio_3,
        "volume_spike_flag": float(volume_spike_flag),
        "low_volume_flag": float(low_volume_flag),
        "volume_dryup_flag": float(volume_dryup_flag),
    }


# ─────────────────────────────────────────────────────────────────────────────
# D. Price structure signals
# ─────────────────────────────────────────────────────────────────────────────

def _higher_low_count(close: pd.Series, window: int = 8) -> int:
    """Count of consecutive higher lows in the last `window` bars."""
    if len(close) < 3:
        return 0
    tail = close.iloc[-window:].values
    lows = []
    # identify local lows (lower than neighbors)
    for i in range(1, len(tail) - 1):
        if tail[i] < tail[i - 1] and tail[i] < tail[i + 1]:
            lows.append(tail[i])
    if len(lows) < 2:
        return 0
    count = 0
    for i in range(1, len(lows)):
        if lows[i] > lows[i - 1]:
            count += 1
        else:
            break
    return count


def _higher_high_count(close: pd.Series, window: int = 8) -> int:
    """Count of consecutive higher highs in the last `window` bars."""
    if len(close) < 3:
        return 0
    tail = close.iloc[-window:].values
    highs = []
    for i in range(1, len(tail) - 1):
        if tail[i] > tail[i - 1] and tail[i] > tail[i + 1]:
            highs.append(tail[i])
    if len(highs) < 2:
        return 0
    count = 0
    for i in range(1, len(highs)):
        if highs[i] > highs[i - 1]:
            count += 1
        else:
            break
    return count


def _range_metrics(df: pd.DataFrame, window: int = 12) -> dict[str, float]:
    """Compute range width, mid-price, and breakout relative to recent range."""
    if "close" not in df or len(df) < window:
        return {"range_width_pct": 0.0, "breakout_strength": 0.0, "range_high_break": 0.0}

    tail = df.tail(window + 1)  # +1 so last bar can be compared to prior window
    prior = tail.iloc[:-1]
    last_close = float(df["close"].iloc[-1])

    prior_high = float(prior["high"].max()) if "high" in prior else float(prior["close"].max())
    prior_low = float(prior["low"].min()) if "low" in prior else float(prior["close"].min())
    mid = (prior_high + prior_low) / 2.0

    range_width_pct = (prior_high - prior_low) / mid if mid > 0 else 0.0
    breakout_strength = (last_close - prior_high) / prior_high if prior_high > 0 else 0.0
    range_high_break = float(breakout_strength >= DEFAULT_BREAKOUT_STRENGTH)

    return {
        "range_width_pct": range_width_pct,
        "breakout_strength": breakout_strength,
        "range_high_break": range_high_break,
        "prior_range_high": prior_high,
        "prior_range_low": prior_low,
    }


def derive_price_structure_signals(df: pd.DataFrame, row_idx: int = -1) -> dict[str, float]:
    if df.empty:
        return {}

    price_change_1h = float(df["price_change_1h"].iloc[row_idx]) if "price_change_1h" in df else 0.0
    price_change_4h = float(df["price_change_4h"].iloc[row_idx]) if "price_change_4h" in df else 0.0

    price_dump_flag = price_change_4h <= DEFAULT_PRICE_DUMP_PCT
    price_spike_flag = price_change_4h >= DEFAULT_PRICE_SPIKE_PCT
    fresh_low_break_flag = price_change_1h <= DEFAULT_FRESH_LOW_BREAK_PCT

    # Higher lows / higher highs: computed over close series
    close = df["close"] if "close" in df else None
    higher_low_count = 0
    higher_high_count = 0
    if close is not None and row_idx == -1:
        higher_low_count = _higher_low_count(close, window=8)
        higher_high_count = _higher_high_count(close, window=8)

    higher_lows_sequence_flag = higher_low_count >= DEFAULT_HIGHER_LOW_MIN_COUNT

    # Sideways: range width below threshold
    range_m = _range_metrics(df, window=12) if "close" in df else {}
    range_width_pct = range_m.get("range_width_pct", 0.0)
    sideways_flag = range_width_pct <= DEFAULT_SIDEWAYS_RANGE_PCT
    upward_sideways_flag = sideways_flag and higher_lows_sequence_flag

    # Arch / compression zone: BB squeeze + low volume
    bb_squeeze = float(df["bb_squeeze"].iloc[row_idx]) if "bb_squeeze" in df else 0.0
    vol_ratio_3 = float(df["vol_ratio_3"].iloc[row_idx]) if "vol_ratio_3" in df else 1.0
    arch_zone_flag = bool(bb_squeeze) or (vol_ratio_3 <= DEFAULT_ARCH_ZONE_VOL_RATIO)
    compression_ratio = 1.0 - min(range_width_pct / 0.15, 1.0)  # 0=wide, 1=tight

    return {
        "price_change_1h": price_change_1h,
        "price_change_4h": price_change_4h,
        "price_dump_flag": float(price_dump_flag),
        "price_spike_flag": float(price_spike_flag),
        "fresh_low_break_flag": float(fresh_low_break_flag),
        "higher_low_count": float(higher_low_count),
        "higher_high_count": float(higher_high_count),
        "higher_lows_sequence_flag": float(higher_lows_sequence_flag),
        "sideways_flag": float(sideways_flag),
        "upward_sideways_flag": float(upward_sideways_flag),
        "arch_zone_flag": float(arch_zone_flag),
        "compression_ratio": compression_ratio,
        **{k: v for k, v in range_m.items()},
    }


# ─────────────────────────────────────────────────────────────────────────────
# E. Flow / positioning signals
# ─────────────────────────────────────────────────────────────────────────────

def derive_positioning_signals(df: pd.DataFrame, row_idx: int = -1) -> dict[str, float]:
    if df.empty:
        return {}

    ls_ratio = float(df["long_short_ratio"].iloc[row_idx]) if "long_short_ratio" in df else 1.0
    short_build_up_flag = ls_ratio <= DEFAULT_LONG_SHORT_EXTREME_LOW
    long_build_up_flag = ls_ratio >= DEFAULT_LONG_SHORT_EXTREME_HIGH

    # Short-to-long switch: prior bars had short dominance, current has long
    short_to_long_switch_flag = False
    if len(df) >= 4 and row_idx == -1:
        prior_ls = df["long_short_ratio"].iloc[-4:-1]
        prior_short = (prior_ls <= DEFAULT_LONG_SHORT_EXTREME_LOW).all()
        short_to_long_switch_flag = prior_short and long_build_up_flag

    return {
        "long_short_ratio": ls_ratio,
        "short_build_up_flag": float(short_build_up_flag),
        "long_build_up_flag": float(long_build_up_flag),
        "short_to_long_switch_flag": float(short_to_long_switch_flag),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Public API: derive all signals for a single bar
# ─────────────────────────────────────────────────────────────────────────────

def derive_all_signals(
    df: pd.DataFrame,
    row_idx: int = -1,
) -> dict[str, float]:
    """Derive all named signals from a feature DataFrame for one bar.

    `df` must contain the columns produced by compute_features_table().
    `row_idx` selects the target bar (default -1 = last / current bar).

    Returns a flat dict mapping signal_name → float (booleans as 0.0/1.0).
    """
    if df.empty:
        return {}

    signals: dict[str, float] = {}
    signals.update(derive_oi_signals(df, row_idx))
    signals.update(derive_funding_signals(df, row_idx))
    signals.update(derive_volume_signals(df, row_idx))
    signals.update(derive_price_structure_signals(df, row_idx))
    signals.update(derive_positioning_signals(df, row_idx))
    return signals


def derive_signals_table(df: pd.DataFrame) -> pd.DataFrame:
    """Vectorized signal derivation for all bars in df.

    Returns a DataFrame aligned with df.index where each row contains
    the named signal values for that bar. Used by the feature window builder
    to populate the indexed store.

    Note: higher_low_count and higher_high_count are computed per-row with
    a rolling window (slower but correct). For bulk ingestion, this is called
    once per symbol/timeframe chunk.
    """
    if df.empty:
        return pd.DataFrame()

    n = len(df)
    records = []
    for i in range(n):
        # Slice up to and including bar i (PAST-ONLY)
        window_df = df.iloc[: i + 1]
        rec = derive_all_signals(window_df, row_idx=-1)
        records.append(rec)

    result = pd.DataFrame(records, index=df.index)
    return result


__all__ = [
    "derive_all_signals",
    "derive_signals_table",
    "derive_oi_signals",
    "derive_funding_signals",
    "derive_volume_signals",
    "derive_price_structure_signals",
    "derive_positioning_signals",
]
