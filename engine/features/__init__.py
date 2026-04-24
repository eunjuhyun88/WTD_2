"""Feature Store — domain-organized feature computation for SignalSnapshot.

Public API (all backward-compatible with scanner.feature_calc):
    compute_snapshot(klines, symbol, perp=None, tf_minutes=60) -> SignalSnapshot
    compute_features_table(klines, symbol, ...) -> pd.DataFrame
    compute_feature_window(...) -> dict[str, Any]
    materialize_window_bundle(...) -> MaterializedWindowBundle
    FEATURE_COLUMNS: tuple[str, ...]
    MIN_HISTORY_BARS: int
"""
from features.compute import compute_features_table, compute_snapshot
from features.columns import FEATURE_COLUMNS, MIN_HISTORY_BARS
from features.materialization import (
    MaterializedWindowBundle,
    build_pattern_event,
    build_search_corpus_signature,
    compute_feature_window,
    infer_phase_guess,
    materialize_window_bundle,
)
from features.materialization_store import FeatureMaterializationStore

__all__ = [
    "compute_snapshot",
    "compute_features_table",
    "compute_feature_window",
    "materialize_window_bundle",
    "build_pattern_event",
    "build_search_corpus_signature",
    "infer_phase_guess",
    "MaterializedWindowBundle",
    "FeatureMaterializationStore",
    "FEATURE_COLUMNS",
    "MIN_HISTORY_BARS",
]
