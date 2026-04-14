"""Feature Store — domain-organized feature computation for SignalSnapshot.

Public API (all backward-compatible with scanner.feature_calc):
    compute_snapshot(klines, symbol, perp=None, tf_minutes=60) -> SignalSnapshot
    compute_features_table(klines, symbol, ...) -> pd.DataFrame
    FEATURE_COLUMNS: tuple[str, ...]
    MIN_HISTORY_BARS: int
"""
from features.compute import compute_features_table, compute_snapshot
from features.columns import FEATURE_COLUMNS, MIN_HISTORY_BARS

__all__ = [
    "compute_snapshot",
    "compute_features_table",
    "FEATURE_COLUMNS",
    "MIN_HISTORY_BARS",
]
