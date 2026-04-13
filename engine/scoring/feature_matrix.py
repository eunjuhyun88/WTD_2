"""Encode the features DataFrame into a float64 numpy matrix for LightGBM.

Categorical columns (stored as strings in features_df) are label-encoded
to ordinal integers ordered by expected signal strength. All numeric columns
are passed through after NaN fill with 0.

The encoding is deterministic and stateless — no fit step required —
so the same mapping applies at train and inference time.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
import pandas as pd

from scanner.feature_calc import FEATURE_COLUMNS

if TYPE_CHECKING:
    from models.signal import SignalSnapshot

# Ordinal encoding for string-typed categorical features.
# Direction: higher integer = more bullish (for long-bias intuition).
_CAT_MAPS: dict[str, dict[str, int]] = {
    "ema_alignment": {"bearish": 0, "neutral": 1, "bullish": 2},
    "htf_structure": {"downtrend": 0, "range": 1, "uptrend": 2},
    "cvd_state":     {"selling": 0, "neutral": 1, "buying": 2},
    "regime":        {"risk_off": 0, "chop": 1, "risk_on": 2},
}

_CATEGORICAL_COLS: frozenset[str] = frozenset(_CAT_MAPS)

# Canonical feature order exposed to the model.
# Excludes the metadata columns (price, symbol) appended by feature_calc.
FEATURE_NAMES: tuple[str, ...] = FEATURE_COLUMNS

# Convenience constant — number of model input features.
N_FEATURES: int = len(FEATURE_NAMES)


def encode_features_df(df: pd.DataFrame) -> np.ndarray:
    """Encode a features DataFrame to a float64 matrix.

    Args:
        df: output of compute_features_table() or any slice thereof.
            Must contain all FEATURE_NAMES columns; extra columns are ignored.

    Returns:
        float64 ndarray of shape (len(df), len(FEATURE_NAMES)).
        Unknown categorical values map to 0. Missing columns stay 0.
    """
    n = len(df)
    k = len(FEATURE_NAMES)
    out = np.zeros((n, k), dtype=np.float64)

    for j, col in enumerate(FEATURE_NAMES):
        if col not in df.columns:
            continue  # column missing → stays 0.0
        series = df[col]
        if col in _CATEGORICAL_COLS:
            mapping = _CAT_MAPS[col]
            out[:, j] = series.map(mapping).fillna(0).to_numpy(dtype=np.float64)
        else:
            out[:, j] = pd.to_numeric(series, errors="coerce").fillna(0).to_numpy(dtype=np.float64)

    return out


# ---------------------------------------------------------------------------
# Aliases and snapshot helpers
# ---------------------------------------------------------------------------

# Backward-compatible alias used by train.py and historical_matcher.py.
features_df_to_matrix = encode_features_df


def snapshot_to_vector(snap: "SignalSnapshot") -> np.ndarray:
    """Convert a SignalSnapshot to a 1-D float64 feature vector.

    Fields that exist in SignalSnapshot but not in FEATURE_NAMES are ignored.
    Feature columns present in FEATURE_NAMES but absent from the snapshot
    (e.g. registry macro/on-chain columns not yet populated) default to 0.0.

    Args:
        snap: a fully-populated SignalSnapshot instance.

    Returns:
        float64 ndarray of shape (N_FEATURES,).
    """
    row = pd.DataFrame([snap.model_dump()])
    return encode_features_df(row)[0]
