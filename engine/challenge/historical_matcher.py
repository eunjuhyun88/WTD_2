"""Find historical occurrences similar to a PatternInput.

Architecture (from architecture-v2-draft.md §3.1b–3.1c):

  PatternInput (1–5 snaps)
      │
      ▼
  extract_snap_vectors()   ← feature_calc on cached klines
      │
      ▼
  build_pattern_vector()   ← features + deltas + timing → extended vector
      │
      ▼
  PatternRefiner.search()  ← 4 strategies compete
      │
      ▼
  StrategyResult[]         ← win_rate, match_count, expectancy per strategy

Key design decisions:
  1. Past-only: all feature extraction uses only bars up to the snap timestamp.
  2. Label outcomes automatically: bar+24h P(win) = price > entry + 1% net ATR.
  3. Multiple strategies compete — the "best" is chosen by expectancy × count.
  4. Graceful degradation: if perp cache is missing, pattern still works
     using the 24 OHLCV-only features.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd

from challenge.types import PatternInput, Snap, StrategyResult
from data_cache.loader import CacheMiss, load_klines, load_perp
from scanner.feature_calc import compute_features_table, MIN_HISTORY_BARS
from scoring.feature_matrix import features_df_to_matrix, FEATURE_NAMES, N_FEATURES

log = logging.getLogger("engine.matcher")

# How many bars forward to look for a "win" outcome.
OUTCOME_HORIZON_BARS = 24
# Minimum price move to count as win.
WIN_THRESHOLD_PCT = 0.01


def _extract_snap_vector(
    snap: Snap,
    features_db: dict[str, pd.DataFrame],
) -> Optional[np.ndarray]:
    """Return the 28-feature vector for a snap's reference bar.

    Returns None if the symbol/timestamp is not in the cache.
    """
    feats = features_db.get(snap.symbol)
    if feats is None:
        return None

    ts = snap.timestamp
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)

    # Find the closest bar at or before the snap timestamp.
    idx = feats.index.get_indexer([ts], method="pad")
    if idx[0] < 0:
        return None

    row = feats.iloc[idx[0]]
    return _row_to_vector(row)


def _row_to_vector(row: pd.Series) -> np.ndarray:
    """Convert a features_df row to a float64 array (same encoding as feature_matrix)."""
    from scoring.feature_matrix import (
        _EMA_ALIGNMENT, _HTF_STRUCTURE, _CVD_STATE, _REGIME,
    )
    from models.signal import EMAAlignment, HTFStructure, CVDState, Regime

    def _enum_val(col_val, mapping):
        if isinstance(col_val, str):
            # Try mapping via enum key
            for enum_cls in [EMAAlignment, HTFStructure, CVDState, Regime]:
                try:
                    return mapping[enum_cls(col_val)]
                except (ValueError, KeyError):
                    pass
        return mapping.get(col_val, 1)  # default to neutral

    return np.array(
        [
            float(row["ema20_slope"]),
            float(row["ema50_slope"]),
            float(_enum_val(row["ema_alignment"], _EMA_ALIGNMENT)),
            float(row["price_vs_ema50"]),
            float(row["rsi14"]),
            float(row["rsi14_slope"]),
            float(row["macd_hist"]),
            float(row["roc_10"]),
            float(row["atr_pct"]),
            float(row["atr_ratio_short_long"]),
            float(row["bb_width"]),
            float(row["bb_position"]),
            float(row["volume_24h"]),
            float(row["vol_ratio_3"]),
            float(row["obv_slope"]),
            float(_enum_val(row["htf_structure"], _HTF_STRUCTURE)),
            float(row["dist_from_20d_high"]),
            float(row["dist_from_20d_low"]),
            float(row["swing_pivot_distance"]),
            float(row["funding_rate"]),
            float(row["oi_change_1h"]),
            float(row["oi_change_24h"]),
            float(row["long_short_ratio"]),
            float(_enum_val(row["cvd_state"], _CVD_STATE)),
            float(row["taker_buy_ratio_1h"]),
            float(_enum_val(row["regime"], _REGIME)),
            float(row["hour_of_day"]),
            float(row["day_of_week"]),
        ],
        dtype=np.float64,
    )


def build_pattern_vector(snaps: list[Snap], features_db: dict[str, pd.DataFrame]) -> Optional[np.ndarray]:
    """Build the extended feature vector from multiple snaps.

    For n snaps: [vec1 | vec2 | ... | delta12 | delta23 | timing12 (hours) | ...]
    Single snap: just [vec1] (backward compatible with 28-feature standard).
    """
    vectors = []
    for snap in snaps:
        v = _extract_snap_vector(snap, features_db)
        if v is None:
            log.warning("Cannot extract vector for %s @ %s", snap.symbol, snap.timestamp)
            return None
        vectors.append(v)

    parts = list(vectors)  # each is N_FEATURES

    # Add inter-snap deltas (what changed between snaps).
    for i in range(1, len(vectors)):
        parts.append(vectors[i] - vectors[i - 1])

    # Add timing gaps (hours between snaps).
    for i in range(1, len(snaps)):
        dt = snaps[i].timestamp - snaps[i - 1].timestamp
        hours = dt.total_seconds() / 3600.0
        parts.append(np.array([hours], dtype=np.float64))

    return np.concatenate(parts)


def load_features_db(universe: list[str]) -> dict[str, pd.DataFrame]:
    """Load and compute features for all symbols in the universe.

    Returns a dict symbol → features DataFrame (post-warmup).
    Symbols with missing cache are silently skipped.
    """
    db: dict[str, pd.DataFrame] = {}
    for symbol in universe:
        try:
            klines = load_klines(symbol, offline=True)
            perp = load_perp(symbol, offline=True)
            feats = compute_features_table(klines, symbol, perp=perp)
            db[symbol] = feats
        except CacheMiss:
            log.debug("Cache miss for %s — skipping", symbol)
        except Exception as exc:
            log.warning("Failed to build features for %s: %s", symbol, exc)
    return db


def label_outcomes(
    features_df: pd.DataFrame,
    klines_df: pd.DataFrame,
    horizon_bars: int = OUTCOME_HORIZON_BARS,
    win_pct: float = WIN_THRESHOLD_PCT,
) -> pd.Series:
    """Compute binary win/loss label for each bar.

    Win = price at bar+horizon > entry_price * (1 + win_pct).
    Uses only future bars (look-ahead is intentional here: this is for
    *historical* labelling of past data, not real-time prediction).
    """
    close = klines_df["close"].astype(float)
    future_close = close.shift(-horizon_bars)

    # Reindex future_close onto features_df index
    future_close_aligned = future_close.reindex(features_df.index)
    entry_price = features_df["price"].astype(float)

    labels = (future_close_aligned > entry_price * (1 + win_pct)).astype(int)
    return labels
