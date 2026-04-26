"""Shared signal primitives for the search-plane (W-0145).

Extracted so both `similar` (3-layer) and `runtime` (corpus-only seed/scan)
can use identical signal weights and FeatureWindowStore enrichment logic.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# FeatureWindowStore SQLite — engine/research/pattern_search/feature_windows.sqlite
FW_DB_PATH: Path = (
    Path(__file__).resolve().parent.parent
    / "research" / "pattern_search" / "feature_windows.sqlite"
)

# Signal importance weights for weighted L1 distance.
# OI and funding are leading indicators in crypto — weight them higher.
# Price structure and volume are confirmatory — moderate weight.
SIGNAL_WEIGHTS: dict[str, float] = {
    # OI
    "oi_zscore": 2.0, "oi_spike_flag": 2.0, "oi_unwind_flag": 1.8,
    "oi_reexpansion_flag": 1.8, "oi_change_24h": 1.5, "oi_change_1h": 1.5,
    "oi_small_uptick_flag": 1.2, "oi_hold_flag": 1.0,
    # Funding
    "funding_rate": 2.0, "funding_extreme_short_flag": 2.0,
    "funding_extreme_long_flag": 2.0, "funding_flip_flag": 1.8,
    "funding_flip_negative_to_positive": 1.8, "funding_flip_positive_to_negative": 1.8,
    "funding_positive_flag": 1.2,
    # Volume
    "vol_zscore": 1.5, "volume_spike_flag": 1.5, "vol_ratio_3": 1.2,
    "volume_dryup_flag": 1.2, "low_volume_flag": 1.0,
    # Price structure
    "higher_lows_sequence_flag": 1.5, "breakout_strength": 1.5,
    "fresh_low_break_flag": 1.5, "price_dump_flag": 1.3, "price_spike_flag": 1.3,
    "range_high_break": 1.3, "price_change_1h": 1.2, "price_change_4h": 1.2,
    "higher_low_count": 1.2, "higher_high_count": 1.2, "compression_ratio": 1.1,
    "range_width_pct": 1.0, "short_to_long_switch_flag": 1.8,
    "long_short_ratio": 1.5, "short_build_up_flag": 1.5, "long_build_up_flag": 1.5,
    # Compact corpus signals (also explicitly weighted)
    "close_return_pct": 1.5, "realized_volatility_pct": 1.2, "volume_ratio": 1.2,
}

_DEFAULT_WEIGHT = 1.0
_TOLERANCE_MS = 8 * 3_600_000  # ±8h — covers up to 2× 4h bars


def _ts_iso_to_ms(ts: str) -> int | None:
    """Parse ISO timestamp string → epoch milliseconds. Returns None on failure."""
    try:
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except (ValueError, TypeError):
        return None


def fetch_feature_signals_batch(
    windows: list[Any],
    fw_db_path: Path | None = None,
) -> dict[str, dict[str, float]]:
    """Batch-fetch FeatureWindowStore signals for a list of corpus windows.

    For each window, finds the nearest feature bar within ±8h of start_ts.
    Returns {window_id: signals_dict}. Silently returns {} on any error so
    callers degrade gracefully to the legacy 6-field corpus signature.
    """
    path = fw_db_path if fw_db_path is not None else FW_DB_PATH
    if not windows or not path.exists():
        return {}

    # Group by (symbol, timeframe) for efficient range queries
    groups: dict[tuple[str, str], list[tuple[str, int]]] = {}
    for w in windows:
        ts_ms = _ts_iso_to_ms(w.start_ts)
        if ts_ms is None:
            continue
        key = (w.symbol.upper(), w.timeframe)
        groups.setdefault(key, []).append((w.window_id, ts_ms))

    if not groups:
        return {}

    result: dict[str, dict[str, float]] = {}
    try:
        from research.feature_windows import SIGNAL_COLUMNS  # type: ignore[import]
        cols_sql = "bar_ts_ms, " + ", ".join(SIGNAL_COLUMNS)
        conn = sqlite3.connect(str(path), timeout=5.0)
        conn.row_factory = sqlite3.Row

        for (symbol, timeframe), wid_ts_list in groups.items():
            all_ts = [ts for _, ts in wid_ts_list]
            min_ms = min(all_ts) - _TOLERANCE_MS
            max_ms = max(all_ts) + _TOLERANCE_MS

            rows = conn.execute(
                f"SELECT {cols_sql} FROM feature_windows "
                "WHERE symbol=? AND timeframe=? AND bar_ts_ms BETWEEN ? AND ? "
                "ORDER BY bar_ts_ms",
                [symbol, timeframe, min_ms, max_ms],
            ).fetchall()

            if not rows:
                continue

            fw_map: dict[int, dict[str, float]] = {
                row["bar_ts_ms"]: {col: float(row[col]) for col in SIGNAL_COLUMNS}
                for row in rows
            }
            fw_times = sorted(fw_map.keys())

            for window_id, ts_ms in wid_ts_list:
                nearest = min(fw_times, key=lambda t: abs(t - ts_ms))
                if abs(nearest - ts_ms) <= _TOLERANCE_MS:
                    result[window_id] = fw_map[nearest]

        conn.close()
    except Exception:
        pass  # degrade gracefully

    return result


def weighted_l1_score(
    candidate_sig: dict[str, Any],
    reference_sig: dict[str, float],
) -> float:
    """Weighted L1 distance score between candidate and reference signal vectors.

    Higher-importance signals (OI, funding, positioning) contribute more than
    lower-importance ones (price structure, misc flags).
    Returns score in [0, 1] where 1 = perfect match, 0.5 = no overlap.
    """
    keys = [
        k for k, v in reference_sig.items()
        if isinstance(v, (int, float)) and isinstance(candidate_sig.get(k), (int, float))
    ]
    if not keys:
        return 0.5  # neutral — no signal overlap to score
    total_weight = sum(SIGNAL_WEIGHTS.get(k, _DEFAULT_WEIGHT) for k in keys)
    weighted_dist = sum(
        SIGNAL_WEIGHTS.get(k, _DEFAULT_WEIGHT) * abs(float(candidate_sig[k]) - float(reference_sig[k]))
        for k in keys
    )
    avg_dist = weighted_dist / total_weight if total_weight > 0 else 0.0
    return 1.0 / (1.0 + avg_dist)
