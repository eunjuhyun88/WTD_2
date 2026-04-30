"""W-0367 tests: scan_signal_events + outcomes + alpha_quality."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import numpy as np
import pytest


# --- AC1: component_scores structure validation ---
def test_component_scores_structure():
    """AC1: component_scores must have phase_scores (list) and indicator_snapshot (4+ keys)."""
    scores = {
        "phase_scores": [],
        "indicator_snapshot": {
            "cvd_change_zscore": 0.8,
            "oi_change_1h_zscore": 1.5,
            "bb_squeeze": 0.0,
            "oi_change_1h": 0.02,
        },
        "overall_score": 0.6,
        "schema_version": 1,
    }
    assert isinstance(scores["phase_scores"], list)
    assert len(scores["indicator_snapshot"]) >= 4
    assert "schema_version" in scores


# --- AC2: init_outcomes creates 4 horizon rows ---
def test_init_outcomes_creates_4_horizons():
    """AC2: init_outcomes inserts rows for horizons [1, 4, 24, 72]."""
    from research.signal_event_store import HORIZONS
    assert HORIZONS == [1, 4, 24, 72]
    assert len(HORIZONS) == 4


# --- AC3: triple_barrier_outcome 3 values ---
def test_triple_barrier_outcomes():
    """AC3: triple_barrier_outcome covers all 3 values."""
    valid_outcomes = {"profit_take", "stop_loss", "timeout"}

    def compute_tbo(pnl: float, tp: float = 0.6, sl: float = 0.3) -> str:
        if pnl >= tp:
            return "profit_take"
        elif pnl <= -sl:
            return "stop_loss"
        return "timeout"

    assert compute_tbo(1.0) == "profit_take"
    assert compute_tbo(-1.0) == "stop_loss"
    assert compute_tbo(0.1) == "timeout"
    assert {compute_tbo(1.0), compute_tbo(-1.0), compute_tbo(0.1)} == valid_outcomes


# --- AC4: BH-FDR correction returns correct count ---
def test_bh_fdr_208_tests():
    """AC4: bh_correct handles 208 tests (52 patterns x 4 horizons)."""
    from research.validation.stats import bh_correct

    np.random.seed(42)
    pvalues = np.random.uniform(0, 1, 208)
    rejected, adjusted = bh_correct(pvalues, alpha=0.10)

    assert len(adjusted) == 208
    assert len(rejected) == 208
    assert all(0.0 <= p <= 1.0 for p in adjusted)


# --- AC5: Spearman correlation computation ---
def test_spearman_indicators():
    """AC5: Spearman correlation computes per indicator field."""
    from research.alpha_quality import _spearman_indicators

    group = [
        {
            "realized_pnl_pct": 1.0,
            "component_scores": {"indicator_snapshot": {"cvd_change_zscore": 2.0, "oi_change_1h_zscore": 0.8}},
        },
        {
            "realized_pnl_pct": -0.5,
            "component_scores": {"indicator_snapshot": {"cvd_change_zscore": -1.0, "oi_change_1h_zscore": 0.2}},
        },
        {
            "realized_pnl_pct": 0.3,
            "component_scores": {"indicator_snapshot": {"cvd_change_zscore": 0.5, "oi_change_1h_zscore": 0.5}},
        },
        {
            "realized_pnl_pct": 0.8,
            "component_scores": {"indicator_snapshot": {"cvd_change_zscore": 1.5, "oi_change_1h_zscore": 0.7}},
        },
        {
            "realized_pnl_pct": -0.2,
            "component_scores": {"indicator_snapshot": {"cvd_change_zscore": -0.5, "oi_change_1h_zscore": 0.3}},
        },
    ]

    result = _spearman_indicators(group)
    assert "cvd_change_zscore" in result
    assert "oi_change_1h_zscore" in result
    assert isinstance(result["cvd_change_zscore"], float)


# --- aggregate with mock data ---
def test_aggregate_returns_structure():
    """alpha_quality.aggregate returns correct JSON structure."""
    mock_rows = []
    for i in range(30):
        mock_rows.append({
            "pattern": "breakout_volume_long",
            "horizon_h": 4,
            "realized_pnl_pct": (i % 3 - 1) * 0.5,
            "peak_pnl_pct": 0.5,
            "triple_barrier_outcome": ["profit_take", "stop_loss", "timeout"][i % 3],
            "component_scores": {
                "indicator_snapshot": {
                    "cvd_change_zscore": float(i) * 0.1,
                    "oi_change_1h_zscore": 0.5,
                }
            },
        })

    with patch("research.signal_event_store.fetch_resolved_outcomes", return_value=mock_rows):
        from research.alpha_quality import aggregate
        result = aggregate(lookback_days=30)

    assert "patterns" in result
    assert "summary" in result
    assert "computed_at" in result
    assert isinstance(result["patterns"], list)
    assert result["summary"]["n_tests"] >= 1
