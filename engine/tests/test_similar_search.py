"""Unit tests for search.similar — 3-layer pattern similarity engine."""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from search.similar import (
    _candidate_id,
    _layer_a,
    _layer_b,
    _layer_c,
    _blend,
    _extract_reference_sig,
    _lcs,
    run_similar_search,
    get_similar_search,
)


# ── Layer A ───────────────────────────────────────────────────────────────────

def test_layer_a_identical_sig():
    sig = {"close_return_pct": 5.0, "realized_volatility_pct": 2.0}
    assert _layer_a(sig, sig) == pytest.approx(1.0)


def test_layer_a_no_overlap_returns_neutral():
    assert _layer_a({"trend": "up"}, {"close_return_pct": 5.0}) == pytest.approx(0.5)


def test_layer_a_distant_values():
    score = _layer_a({"close_return_pct": 0.0}, {"close_return_pct": 100.0})
    assert score < 0.1


def test_extract_reference_sig_full():
    draft = {
        "search_hints": {
            "target_return_pct": 8.0,
            "volatility_range": {"min": 1.0, "max": 3.0},
            "volume_breakout_threshold": 2.5,
        }
    }
    ref = _extract_reference_sig(draft)
    assert ref["close_return_pct"] == pytest.approx(8.0)
    assert ref["realized_volatility_pct"] == pytest.approx(2.0)
    assert ref["volume_ratio"] == pytest.approx(2.5)


def test_extract_reference_sig_empty_draft():
    assert _extract_reference_sig({}) == {}


def test_extract_reference_sig_scalar_vol():
    draft = {"search_hints": {"volatility_range": 1.5}}
    ref = _extract_reference_sig(draft)
    assert ref["realized_volatility_pct"] == pytest.approx(1.5)


# ── Layer B ───────────────────────────────────────────────────────────────────

def test_lcs_identical():
    assert _lcs(["A", "B", "C"], ["A", "B", "C"]) == 3


def test_lcs_empty():
    assert _lcs([], ["A"]) == 0


def test_lcs_no_overlap():
    assert _lcs(["A", "B"], ["C", "D"]) == 0


def test_lcs_partial():
    assert _lcs(["A", "B", "C"], ["B", "C", "D"]) == 2


def test_layer_b_identical():
    path = ["DUMP", "ACCUMULATION", "PUMP"]
    assert _layer_b(path, path) == pytest.approx(1.0)


def test_layer_b_empty_query():
    assert _layer_b([], ["DUMP"]) == pytest.approx(0.0)


def test_layer_b_partial_match():
    q = ["DUMP", "ACCUMULATION", "PUMP"]
    c = ["DUMP", "PUMP"]
    score = _layer_b(q, c)
    # LCS = 2 (DUMP + PUMP), max_len = 3  →  2/3
    assert score == pytest.approx(2 / 3)


# ── Layer C ───────────────────────────────────────────────────────────────────

def test_layer_c_no_snapshot():
    assert _layer_c(None) is None


def test_layer_c_empty_snapshot():
    assert _layer_c({}) is None


# ── blending ─────────────────────────────────────────────────────────────────

def test_blend_all_three():
    score = _blend(0.8, 0.6, 0.4)
    expected = 0.45 * 0.8 + 0.30 * 0.6 + 0.25 * 0.4
    assert score == pytest.approx(expected)


def test_blend_a_b_only():
    score = _blend(0.8, 0.6, None)
    assert score == pytest.approx(0.60 * 0.8 + 0.40 * 0.6)


def test_blend_a_c_only():
    score = _blend(0.8, None, 0.5)
    assert score == pytest.approx(0.70 * 0.8 + 0.30 * 0.5)


def test_blend_a_only():
    assert _blend(0.7, None, None) == pytest.approx(0.7)


# ── run_similar_search (end-to-end with empty corpus) ─────────────────────────

def test_run_similar_search_empty_corpus():
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "similar_runs.sqlite"
        result = run_similar_search(
            {
                "pattern_draft": {
                    "pattern_family": "test_pattern",
                    "search_hints": {"target_return_pct": 5.0},
                },
                "observed_phase_paths": ["DUMP", "ACCUMULATION"],
                "timeframe": "4h",
                "top_k": 5,
            },
            db_path=db,
        )
    assert result["status"] == "degraded"
    assert result["candidates"] == []
    assert "run_id" in result
    assert result["active_layers"] == {"layer_a": True, "layer_b": True, "layer_c": False}
    assert result["stage_counts"] == {
        "corpus_windows": 0,
        "ranked_candidates": 0,
        "returned_candidates": 0,
    }
    assert result["degraded_reason"] == "search_corpus_empty"


def test_run_and_retrieve():
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "similar_runs.sqlite"
        result = run_similar_search(
            {"pattern_draft": {}, "timeframe": "4h", "top_k": 3},
            db_path=db,
        )
        run_id = result["run_id"]
        retrieved = get_similar_search(run_id, db_path=db)
    assert retrieved is not None
    assert retrieved["run_id"] == run_id
    assert retrieved["active_layers"] == result["active_layers"]
    assert retrieved["stage_counts"] == result["stage_counts"]
    assert retrieved["degraded_reason"] == result["degraded_reason"]


def test_get_similar_search_not_found():
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "similar_runs.sqlite"
        assert get_similar_search("nonexistent", db_path=db) is None


# ── candidate_id stability ────────────────────────────────────────────────────

def test_candidate_id_stable():
    draft = {"pattern_family": "test"}
    id1 = _candidate_id("window_abc", draft)
    id2 = _candidate_id("window_abc", draft)
    assert id1 == id2


def test_candidate_id_differs_by_window():
    draft = {"pattern_family": "test"}
    assert _candidate_id("win_1", draft) != _candidate_id("win_2", draft)
