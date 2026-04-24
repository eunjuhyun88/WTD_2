"""Unit tests for search.quality_ledger."""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from search.quality_ledger import (
    _DEFAULT_WEIGHTS,
    _MIN_SAMPLES_FOR_RECALIBRATION,
    _dominant_layer,
    append_judgement,
    compute_weights,
    layer_stats,
)


def _db(tmp: str) -> Path:
    return Path(tmp) / "quality_ledger.sqlite"


# ── dominant layer ────────────────────────────────────────────────────────────

def test_dominant_layer_a_wins():
    assert _dominant_layer(0.9, 0.1, 0.1) == "layer_a"


def test_dominant_layer_b_wins():
    # B=1.0 → contribution = 1.0 * 0.30 = 0.30
    # A=0.5 → contribution = 0.5 * 0.45 = 0.225
    assert _dominant_layer(0.5, 1.0, 0.0) == "layer_b"


def test_dominant_layer_c_wins():
    # C=1.0 → 0.25; A=0.4 → 0.18; B=0.5 → 0.15
    assert _dominant_layer(0.4, 0.5, 1.0) == "layer_c"


def test_dominant_layer_all_none():
    # All None → all zeros → first key wins (layer_a)
    assert _dominant_layer(None, None, None) == "layer_a"


# ── append_judgement + layer_stats ────────────────────────────────────────────

def test_append_judgement_returns_id():
    with tempfile.TemporaryDirectory() as tmp:
        jid = append_judgement("run1", "cand1", "good", db_path=_db(tmp))
    assert isinstance(jid, str) and len(jid) > 0


def test_layer_stats_empty():
    with tempfile.TemporaryDirectory() as tmp:
        stats = layer_stats(db_path=_db(tmp))
    assert stats["total_judgements"] == 0
    assert stats["layers"]["layer_a"]["accuracy"] is None


def test_layer_stats_counts():
    with tempfile.TemporaryDirectory() as tmp:
        db = _db(tmp)
        # 3 good for layer_a dominant
        for i in range(3):
            append_judgement(f"run{i}", f"c{i}", "good",
                             layer_a_score=0.9, layer_b_score=0.1, layer_c_score=0.1,
                             db_path=db)
        # 1 bad for layer_a dominant
        append_judgement("run_bad", "c_bad", "bad",
                         layer_a_score=0.9, layer_b_score=0.1, layer_c_score=0.1,
                         db_path=db)

        stats = layer_stats(db_path=db)

    assert stats["total_judgements"] == 4
    la = stats["layers"]["layer_a"]
    assert la["good"] == 3
    assert la["bad"] == 1
    assert la["total"] == 4
    assert la["accuracy"] == pytest.approx(0.75)


# ── compute_weights ───────────────────────────────────────────────────────────

def test_compute_weights_fallback_defaults_when_insufficient():
    with tempfile.TemporaryDirectory() as tmp:
        db = _db(tmp)
        # Add fewer than MIN_SAMPLES_FOR_RECALIBRATION
        for i in range(_MIN_SAMPLES_FOR_RECALIBRATION - 1):
            append_judgement(f"run{i}", f"c{i}", "good",
                             layer_a_score=0.9, db_path=db)
        weights = compute_weights(db_path=db)

    assert weights == _DEFAULT_WEIGHTS


def test_compute_weights_normalised_to_one():
    with tempfile.TemporaryDirectory() as tmp:
        db = _db(tmp)
        # Add enough judgements for recalibration
        for i in range(_MIN_SAMPLES_FOR_RECALIBRATION + 5):
            append_judgement(
                f"run{i}", f"c{i}",
                "good" if i % 3 != 0 else "bad",
                layer_a_score=0.8, layer_b_score=0.5, layer_c_score=0.3,
                db_path=db,
            )
        weights = compute_weights(db_path=db)

    total = sum(weights.values())
    assert abs(total - 1.0) < 0.001
    for v in weights.values():
        assert 0.0 <= v <= 1.0


def test_compute_weights_keys():
    with tempfile.TemporaryDirectory() as tmp:
        weights = compute_weights(db_path=_db(tmp))
    assert set(weights.keys()) == {"layer_a", "layer_b", "layer_c"}
