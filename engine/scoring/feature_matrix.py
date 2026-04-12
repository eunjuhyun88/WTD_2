"""SignalSnapshot → numpy feature matrix for LightGBM.

Design:
  - Categorical enum fields (ema_alignment, htf_structure, cvd_state, regime)
    are label-encoded to integers deterministically.
  - Column order is fixed (FEATURE_NAMES) so the model is stable across
    Python sessions.
  - No look-ahead: all inputs come from past-only SignalSnapshot fields.
"""
from __future__ import annotations

from models.signal import (
    CVDState,
    EMAAlignment,
    HTFStructure,
    Regime,
    SignalSnapshot,
)

import numpy as np
import pandas as pd

# --- Label encodings (stable across sessions) ---

_EMA_ALIGNMENT = {EMAAlignment.BULLISH: 2, EMAAlignment.NEUTRAL: 1, EMAAlignment.BEARISH: 0}
_HTF_STRUCTURE = {HTFStructure.UPTREND: 2, HTFStructure.RANGE: 1, HTFStructure.DOWNTREND: 0}
_CVD_STATE     = {CVDState.BUYING: 2, CVDState.NEUTRAL: 1, CVDState.SELLING: 0}
_REGIME        = {Regime.RISK_ON: 2, Regime.CHOP: 1, Regime.RISK_OFF: 0}

# Canonical column order — matches SignalSnapshot field order.
FEATURE_NAMES: tuple[str, ...] = (
    "ema20_slope",
    "ema50_slope",
    "ema_alignment",
    "price_vs_ema50",
    "rsi14",
    "rsi14_slope",
    "macd_hist",
    "roc_10",
    "atr_pct",
    "atr_ratio_short_long",
    "bb_width",
    "bb_position",
    "volume_24h",
    "vol_ratio_3",
    "obv_slope",
    "htf_structure",
    "dist_from_20d_high",
    "dist_from_20d_low",
    "swing_pivot_distance",
    "funding_rate",
    "oi_change_1h",
    "oi_change_24h",
    "long_short_ratio",
    "cvd_state",
    "taker_buy_ratio_1h",
    "regime",
    "hour_of_day",
    "day_of_week",
)

N_FEATURES = len(FEATURE_NAMES)


def snapshot_to_vector(snap: SignalSnapshot) -> np.ndarray:
    """Convert one SignalSnapshot → 1-D float64 array of length N_FEATURES."""
    return np.array(
        [
            snap.ema20_slope,
            snap.ema50_slope,
            _EMA_ALIGNMENT[snap.ema_alignment],
            snap.price_vs_ema50,
            snap.rsi14,
            snap.rsi14_slope,
            snap.macd_hist,
            snap.roc_10,
            snap.atr_pct,
            snap.atr_ratio_short_long,
            snap.bb_width,
            snap.bb_position,
            snap.volume_24h,
            snap.vol_ratio_3,
            snap.obv_slope,
            _HTF_STRUCTURE[snap.htf_structure],
            snap.dist_from_20d_high,
            snap.dist_from_20d_low,
            snap.swing_pivot_distance,
            snap.funding_rate,
            snap.oi_change_1h,
            snap.oi_change_24h,
            snap.long_short_ratio,
            _CVD_STATE[snap.cvd_state],
            snap.taker_buy_ratio_1h,
            _REGIME[snap.regime],
            float(snap.hour_of_day),
            float(snap.day_of_week),
        ],
        dtype=np.float64,
    )


def features_df_to_matrix(df: pd.DataFrame) -> np.ndarray:
    """Convert a features DataFrame (from compute_features_table) → 2-D matrix.

    Categorical columns are encoded in-place. The DataFrame must contain all
    columns in FEATURE_NAMES. Used for batch scoring and training data prep.
    """
    df = df.copy()
    df["ema_alignment"]  = df["ema_alignment"].map(_EMA_ALIGNMENT).astype(float)
    df["htf_structure"]  = df["htf_structure"].map(_HTF_STRUCTURE).astype(float)
    df["cvd_state"]      = df["cvd_state"].map(_CVD_STATE).astype(float)
    df["regime"]         = df["regime"].map(_REGIME).astype(float)

    return df[list(FEATURE_NAMES)].to_numpy(dtype=np.float64)
