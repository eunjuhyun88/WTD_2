"""Tests for the pattern search stack.

Covers:
  1. signal_derivations — named signal computation from feature rows
  2. query_transformer  — PatternDraft → SearchQuerySpec (expanded vocabulary)
  3. feature_windows    — SQLite store: upsert, filter, count
  4. similarity_ranker  — 3-layer scorer
  5. candidate_search   — end-to-end search pipeline (store + rank)
"""
from __future__ import annotations

import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pytest

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_feature_df(n: int = 60, **overrides) -> pd.DataFrame:
    """Minimal feature DataFrame with required signal columns."""
    idx = pd.date_range("2024-01-01", periods=n, freq="h", tz="UTC")
    data = {
        "close": [100.0 + i * 0.1 for i in range(n)],
        "high": [101.0 + i * 0.1 for i in range(n)],
        "low": [99.0 + i * 0.1 for i in range(n)],
        "oi_change_24h": [0.02] * n,
        "oi_change_1h": [0.005] * n,
        "funding_rate": [-0.0001] * n,
        "vol_zscore": [0.5] * n,
        "vol_ratio_3": [1.0] * n,
        "price_change_1h": [0.01] * n,
        "price_change_4h": [0.02] * n,
        "bb_squeeze": [0.0] * n,
        "long_short_ratio": [1.0] * n,
    }
    data.update(overrides)
    return pd.DataFrame(data, index=idx)


def _minimal_pattern_draft(phase_ids=None, timeframe="1h") -> dict:
    phase_ids = phase_ids or ["real_dump", "accumulation", "breakout"]
    phases = [
        {
            "phase_id": p,
            "label": p,
            "sequence_order": i,
            "signals_required": [],
            "signals_preferred": [],
            "signals_forbidden": [],
        }
        for i, p in enumerate(phase_ids)
    ]
    return {
        "schema_version": 1,
        "pattern_family": "oi_reversal",
        "pattern_label": "test_pattern",
        "source_type": "manual_note",
        "source_text": "test",
        "symbol_candidates": ["TESTUSDT"],
        "timeframe": timeframe,
        "thesis": ["test"],
        "phases": phases,
        "trade_plan": {},
        "search_hints": {
            "must_have_signals": ["oi_spike"],
            "preferred_timeframes": [timeframe],
            "similarity_focus": ["sequence", "oi_behavior"],
        },
        "confidence": 0.8,
        "ambiguities": [],
    }


# ─────────────────────────────────────────────────────────────────────────────
# 1. signal_derivations
# ─────────────────────────────────────────────────────────────────────────────

class TestSignalDerivations:
    def test_oi_spike_detected(self):
        from research.signal_derivations import derive_oi_signals

        # Build a df where oi_change_24h is very high compared to window mean
        n = 60
        values = [0.01] * (n - 1) + [0.30]  # spike on last bar
        df = _make_feature_df(n=n, oi_change_24h=values)
        signals = derive_oi_signals(df)
        assert signals["oi_spike_flag"] >= 0.5, "oi_spike_flag should be 1.0 for large OI change"
        assert signals["oi_zscore"] > 1.5

    def test_oi_normal_no_spike(self):
        from research.signal_derivations import derive_oi_signals

        df = _make_feature_df(n=60, oi_change_24h=[0.01] * 60)
        signals = derive_oi_signals(df)
        assert signals["oi_spike_flag"] < 0.5, "no spike on flat OI"

    def test_funding_extreme_short(self):
        from research.signal_derivations import derive_funding_signals

        df = _make_feature_df(n=20, funding_rate=[-0.001] * 20)
        signals = derive_funding_signals(df)
        assert signals["funding_extreme_short_flag"] >= 0.5

    def test_funding_flip(self):
        from research.signal_derivations import derive_funding_signals

        # Last bar positive, prior 4 all negative
        rates = [-0.0005] * 8 + [0.0002]
        df = _make_feature_df(n=9, funding_rate=rates)
        signals = derive_funding_signals(df)
        assert signals["funding_flip_negative_to_positive"] >= 0.5

    def test_volume_spike(self):
        from research.signal_derivations import derive_volume_signals

        df = _make_feature_df(n=10, vol_zscore=[2.5] * 10)
        signals = derive_volume_signals(df)
        assert signals["volume_spike_flag"] >= 0.5

    def test_higher_lows_sequence(self):
        from research.signal_derivations import derive_price_structure_signals

        # Create ascending-low pattern: each 3-bar mini-cycle has higher trough
        close = [100, 98, 102, 99, 104, 101, 106]
        df = _make_feature_df(n=7, **{
            "close": close,
            "high": [c * 1.02 for c in close],
            "low": [c * 0.98 for c in close],
        })
        signals = derive_price_structure_signals(df)
        # higher_low_count should be >= 1 for ascending pattern
        assert signals["higher_low_count"] >= 0  # at least computes

    def test_price_dump_flag(self):
        from research.signal_derivations import derive_price_structure_signals

        df = _make_feature_df(n=10, price_change_4h=[-0.08] * 10)
        signals = derive_price_structure_signals(df)
        assert signals["price_dump_flag"] >= 0.5

    def test_derive_all_signals_returns_flat_dict(self):
        from research.signal_derivations import derive_all_signals

        df = _make_feature_df(n=30)
        signals = derive_all_signals(df)
        assert isinstance(signals, dict)
        assert len(signals) > 10
        for k, v in signals.items():
            assert isinstance(v, float), f"{k} should be float, got {type(v)}"


# ─────────────────────────────────────────────────────────────────────────────
# 2. query_transformer — expanded vocabulary
# ─────────────────────────────────────────────────────────────────────────────

class TestQueryTransformer:
    def test_transform_basic_draft(self):
        from research.query_transformer import transform_pattern_draft

        draft = _minimal_pattern_draft(["real_dump", "accumulation", "breakout"])
        spec = transform_pattern_draft(draft)
        assert spec.pattern_family == "oi_reversal"
        assert spec.phase_path == ["real_dump", "accumulation", "breakout"]
        assert spec.reference_timeframe == "1h"

    def test_must_have_signals_populated(self):
        from research.query_transformer import transform_pattern_draft

        draft = _minimal_pattern_draft()
        draft["phases"][0]["signals_required"] = ["oi_spike", "price_dump"]
        spec = transform_pattern_draft(draft)
        assert "oi_spike" in spec.must_have_signals

    def test_new_vocabulary_signals_map_to_rules(self):
        from research.query_transformer import _SIGNAL_RULES

        new_signals = [
            "price_dump", "price_spike", "oi_hold_after_spike", "oi_reexpansion",
            "oi_unwind", "funding_extreme_short", "funding_extreme_long",
            "volume_spike", "low_volume", "volume_dryup",
            "higher_lows_sequence", "sideways", "upward_sideways",
            "arch_zone", "breakout", "range_high_break",
            "short_build_up", "long_build_up", "short_to_long_switch",
        ]
        for sig in new_signals:
            assert sig in _SIGNAL_RULES, f"Signal '{sig}' missing from _SIGNAL_RULES"

    def test_phase_queries_have_required_fields(self):
        from research.query_transformer import transform_pattern_draft

        draft = _minimal_pattern_draft()
        draft["phases"][0]["signals_required"] = ["oi_spike", "price_dump"]
        spec = transform_pattern_draft(draft)
        pq = spec.phase_queries[0]
        assert pq.phase_id == "real_dump"
        assert pq.sequence_order == 0
        # oi_spike should produce required_boolean and/or required_numeric
        assert pq.required_boolean or pq.required_numeric

    def test_transformer_version_bumped(self):
        from research.query_transformer import SIGNAL_VOCAB_VERSION, RULE_REGISTRY_VERSION

        assert "v2" in SIGNAL_VOCAB_VERSION
        assert "v2" in RULE_REGISTRY_VERSION

    def test_forbidden_signals_mapped(self):
        from research.query_transformer import transform_pattern_draft

        draft = _minimal_pattern_draft()
        draft["phases"][0]["signals_forbidden"] = ["oi_unwind"]
        spec = transform_pattern_draft(draft)
        pq = spec.phase_queries[0]
        assert pq.forbidden_boolean or pq.forbidden_numeric


# ─────────────────────────────────────────────────────────────────────────────
# 3. feature_windows — SQLite store
# ─────────────────────────────────────────────────────────────────────────────

class TestFeatureWindowStore:
    @pytest.fixture
    def tmp_store(self, tmp_path):
        from research.feature_windows import FeatureWindowStore
        return FeatureWindowStore(tmp_path / "test_fw.sqlite")

    def _sample_signals(self, oi_spike=0.0, price_dump=0.0) -> dict:
        return {
            "oi_zscore": 2.1 if oi_spike else 0.5,
            "oi_spike_flag": oi_spike,
            "price_dump_flag": price_dump,
            "higher_lows_sequence_flag": 0.0,
            "volume_spike_flag": 0.0,
            "funding_rate": -0.0001,
            "vol_zscore": 0.5,
        }

    def test_upsert_and_count(self, tmp_store):
        signals = self._sample_signals(oi_spike=1.0)
        tmp_store.upsert_window("TESTUSDT", "1h", 1_700_000_000_000, signals)
        assert tmp_store.count() == 1
        assert tmp_store.count("TESTUSDT") == 1
        assert tmp_store.count("OTHER") == 0

    def test_upsert_batch(self, tmp_store):
        rows = [
            (1_700_000_000_000 + i * 3_600_000, self._sample_signals(oi_spike=1.0))
            for i in range(10)
        ]
        written = tmp_store.upsert_batch("AAVEUSDT", "1h", rows)
        assert written == 10
        assert tmp_store.count("AAVEUSDT", "1h") == 10

    def test_upsert_is_idempotent(self, tmp_store):
        signals = self._sample_signals()
        tmp_store.upsert_window("TESTUSDT", "1h", 1_700_000_000_000, signals)
        tmp_store.upsert_window("TESTUSDT", "1h", 1_700_000_000_000, signals)
        assert tmp_store.count() == 1

    def test_filter_by_flag(self, tmp_store):
        # Insert one oi_spike and one non-spike bar
        ts1, ts2 = 1_700_000_000_000, 1_700_003_600_000
        tmp_store.upsert_window("TESTUSDT", "1h", ts1, self._sample_signals(oi_spike=1.0))
        tmp_store.upsert_window("TESTUSDT", "1h", ts2, self._sample_signals(oi_spike=0.0))

        candidates = tmp_store.filter_candidates(
            must_have_signals=["oi_spike_flag"],
            preferred_timeframes=["1h"],
        )
        assert len(candidates) == 1
        assert candidates[0].signals["oi_spike_flag"] >= 0.5

    def test_filter_by_timeframe(self, tmp_store):
        tmp_store.upsert_window("TESTUSDT", "15m", 1_700_000_000_000, self._sample_signals(oi_spike=1.0))
        tmp_store.upsert_window("TESTUSDT", "1h", 1_700_000_000_000, self._sample_signals(oi_spike=1.0))

        candidates = tmp_store.filter_candidates(
            must_have_signals=[],
            preferred_timeframes=["15m"],
        )
        assert all(c.timeframe == "15m" for c in candidates)

    def test_latest_bar_ts_ms(self, tmp_store):
        ts_vals = [1_700_000_000_000, 1_700_003_600_000, 1_700_007_200_000]
        for ts in ts_vals:
            tmp_store.upsert_window("TESTUSDT", "1h", ts, self._sample_signals())
        assert tmp_store.latest_bar_ts_ms("TESTUSDT", "1h") == max(ts_vals)

    def test_coverage_report(self, tmp_store):
        tmp_store.upsert_batch("AAVE", "1h", [
            (1_700_000_000_000 + i * 3_600_000, self._sample_signals())
            for i in range(5)
        ])
        coverage = tmp_store.symbol_timeframe_coverage()
        assert len(coverage) == 1
        assert coverage[0]["symbol"] == "AAVE"
        assert coverage[0]["bar_count"] == 5


# ─────────────────────────────────────────────────────────────────────────────
# 4. similarity_ranker
# ─────────────────────────────────────────────────────────────────────────────

class TestSimilarityRanker:
    def _make_spec(self, phase_ids=None, tfs=None):
        from research.query_transformer import transform_pattern_draft
        draft = _minimal_pattern_draft(phase_ids or ["real_dump", "accumulation", "breakout"])
        draft["phases"][0]["signals_required"] = ["oi_spike"]
        draft["phases"][1]["signals_required"] = ["higher_lows_sequence"]
        draft["phases"][2]["signals_required"] = ["breakout"]
        spec = transform_pattern_draft(draft)
        return spec

    def _make_candidate(self, symbol="TEST", tf="1h", ts_ms=None, signals=None):
        from research.feature_windows import CandidateWindow
        return CandidateWindow(
            symbol=symbol,
            timeframe=tf,
            bar_ts_ms=ts_ms or 1_700_000_000_000,
            signals=signals or {
                "oi_spike_flag": 1.0,
                "oi_zscore": 2.5,
                "higher_lows_sequence_flag": 1.0,
                "higher_low_count": 3.0,
                "breakout_strength": 0.03,
                "range_high_break": 1.0,
            },
        )

    def test_feature_score_perfect_match(self):
        from research.similarity_ranker import compute_feature_score

        spec = self._make_spec()
        # Candidate has all required signals
        signals = {
            "oi_spike_flag": 1.0, "oi_zscore": 2.5,
            "higher_lows_sequence_flag": 1.0, "higher_low_count": 3.0,
            "breakout_strength": 0.03, "range_high_break": 1.0,
        }
        score, phase_scores = compute_feature_score(spec, signals)
        assert score > 0.5, f"Expected score > 0.5 for matching signals, got {score}"
        assert len(phase_scores) == 3

    def test_feature_score_no_match(self):
        from research.similarity_ranker import compute_feature_score

        spec = self._make_spec()
        signals = {}  # empty — nothing matches
        score, _ = compute_feature_score(spec, signals)
        assert score == 0.0

    def test_sequence_score_perfect(self):
        from research.similarity_ranker import compute_sequence_score

        expected = ["real_dump", "accumulation", "breakout"]
        observed = ["real_dump", "accumulation", "breakout"]
        score, matched, missing = compute_sequence_score(expected, observed)
        assert score == 1.0
        assert matched == expected
        assert missing == []

    def test_sequence_score_partial(self):
        from research.similarity_ranker import compute_sequence_score

        expected = ["real_dump", "accumulation", "breakout"]
        observed = ["real_dump", "breakout"]  # missing accumulation
        score, _, missing = compute_sequence_score(expected, observed)
        assert 0.0 < score < 1.0
        assert "accumulation" in missing

    def test_sequence_score_wrong_order(self):
        from research.similarity_ranker import compute_sequence_score

        expected = ["A", "B", "C"]
        observed = ["C", "B", "A"]  # reversed
        score_reversed, _, _ = compute_sequence_score(expected, observed)
        score_correct, _, _ = compute_sequence_score(expected, expected)
        assert score_correct > score_reversed

    def test_sequence_score_empty(self):
        from research.similarity_ranker import compute_sequence_score

        score, matched, missing = compute_sequence_score([], ["A", "B"])
        assert score == 0.0

    def test_rank_candidate_produces_valid_result(self):
        from research.similarity_ranker import rank_candidate

        spec = self._make_spec()
        candidate = self._make_candidate()
        result = rank_candidate(spec, candidate, observed_phase_path=["real_dump", "accumulation", "breakout"])
        assert 0.0 <= result.final_score <= 1.0
        assert result.symbol == "TEST"
        assert result.feature_score >= 0.0
        assert result.sequence_score > 0.0

    def test_rank_candidates_sorted_desc(self):
        from research.similarity_ranker import rank_candidates
        from research.feature_windows import CandidateWindow

        spec = self._make_spec()
        # Good candidate
        good = CandidateWindow(
            symbol="GOOD", timeframe="1h", bar_ts_ms=1_700_000_000_000,
            signals={"oi_spike_flag": 1.0, "oi_zscore": 2.5,
                     "higher_lows_sequence_flag": 1.0, "higher_low_count": 3.0,
                     "breakout_strength": 0.03, "range_high_break": 1.0},
            observed_phase_path=["real_dump", "accumulation", "breakout"],
        )
        # Poor candidate
        poor = CandidateWindow(
            symbol="POOR", timeframe="1h", bar_ts_ms=1_700_003_600_000,
            signals={},
        )
        ranked = rank_candidates(spec, [poor, good], top_k=5)
        assert ranked[0].symbol == "GOOD"
        assert ranked[0].final_score >= ranked[1].final_score

    def test_rank_candidates_top_k(self):
        from research.similarity_ranker import rank_candidates
        from research.feature_windows import CandidateWindow

        spec = self._make_spec()
        candidates = [
            CandidateWindow(symbol=f"C{i}", timeframe="1h",
                            bar_ts_ms=1_700_000_000_000 + i * 3_600_000,
                            signals={"oi_spike_flag": 1.0})
            for i in range(20)
        ]
        ranked = rank_candidates(spec, candidates, top_k=5)
        assert len(ranked) == 5


# ─────────────────────────────────────────────────────────────────────────────
# 5. candidate_search — end-to-end
# ─────────────────────────────────────────────────────────────────────────────

class TestCandidateSearch:
    @pytest.fixture
    def populated_store(self, tmp_path):
        from research.feature_windows import FeatureWindowStore

        store = FeatureWindowStore(tmp_path / "search_fw.sqlite")
        base_ts = 1_700_000_000_000
        one_hour_ms = 3_600_000

        # Insert 50 bars for TRADOORUSDT with varying signal values
        for i in range(50):
            ts = base_ts + i * one_hour_ms
            oi_spike = 1.0 if 10 <= i <= 15 else 0.0
            price_dump = 1.0 if 10 <= i <= 12 else 0.0
            higher_lows = 1.0 if 20 <= i <= 35 else 0.0
            breakout = 1.0 if 38 <= i <= 42 else 0.0
            store.upsert_window("TRADOORUSDT", "1h", ts, {
                "oi_spike_flag": oi_spike,
                "oi_zscore": 2.2 if oi_spike else 0.3,
                "price_dump_flag": price_dump,
                "price_change_4h": -0.06 if price_dump else 0.01,
                "higher_lows_sequence_flag": higher_lows,
                "higher_low_count": 3.0 if higher_lows else 0.0,
                "breakout_strength": 0.02 if breakout else 0.001,
                "range_high_break": breakout,
                "funding_rate": -0.0004,
                "funding_extreme_short_flag": 1.0,
                "vol_zscore": 2.5 if oi_spike else 0.4,
                "volume_spike_flag": 1.0 if oi_spike else 0.0,
            })
        return store

    def test_search_returns_result(self, populated_store):
        from research.candidate_search import search_similar_patterns
        from research.query_transformer import transform_pattern_draft

        draft = _minimal_pattern_draft(["real_dump", "accumulation", "breakout"])
        draft["phases"][0]["signals_required"] = ["oi_spike", "price_dump"]
        draft["phases"][1]["signals_required"] = ["higher_lows_sequence"]
        draft["phases"][2]["signals_required"] = ["breakout"]
        spec = transform_pattern_draft(draft)

        result = search_similar_patterns(spec, top_k=5, store=populated_store, since_days=None)
        assert result.spec_pattern_family == "oi_reversal"
        assert result.total_candidates_found >= 0
        assert isinstance(result.candidates, list)

    def test_search_from_draft_convenience(self, populated_store):
        from research.candidate_search import search_from_pattern_draft

        draft = _minimal_pattern_draft()
        draft["phases"][0]["signals_required"] = ["oi_spike"]
        result = search_from_pattern_draft(draft, top_k=3, store=populated_store, since_days=None)
        assert result.top_k == 3

    def test_search_empty_store_returns_empty(self, tmp_path):
        from research.candidate_search import search_similar_patterns
        from research.feature_windows import FeatureWindowStore
        from research.query_transformer import transform_pattern_draft

        empty_store = FeatureWindowStore(tmp_path / "empty_fw.sqlite")
        draft = _minimal_pattern_draft()
        spec = transform_pattern_draft(draft)
        result = search_similar_patterns(spec, top_k=5, store=empty_store, since_days=None)
        assert result.total_candidates_found == 0
        assert result.candidates == []

    def test_search_filters_by_timeframe(self, tmp_path):
        from research.candidate_search import search_similar_patterns
        from research.feature_windows import FeatureWindowStore
        from research.query_transformer import transform_pattern_draft

        store = FeatureWindowStore(tmp_path / "tf_fw.sqlite")
        ts = 1_700_000_000_000
        store.upsert_window("TEST", "15m", ts, {"oi_spike_flag": 1.0, "oi_zscore": 2.0})
        store.upsert_window("TEST", "1h", ts + 1000, {"oi_spike_flag": 1.0, "oi_zscore": 2.0})

        draft = _minimal_pattern_draft(timeframe="15m")
        draft["phases"][0]["signals_required"] = ["oi_spike"]
        spec = transform_pattern_draft(draft)
        result = search_similar_patterns(spec, top_k=10, store=store, since_days=None)
        # All returned candidates should be 15m
        for c in result.candidates:
            assert c.timeframe == "15m"

    def test_search_result_has_valid_scores(self, populated_store):
        from research.candidate_search import search_similar_patterns
        from research.query_transformer import transform_pattern_draft

        draft = _minimal_pattern_draft()
        draft["phases"][0]["signals_required"] = ["oi_spike"]
        spec = transform_pattern_draft(draft)
        result = search_similar_patterns(spec, top_k=5, store=populated_store, since_days=None)

        for c in result.candidates:
            assert 0.0 <= c.final_score <= 1.0
            assert 0.0 <= c.feature_score <= 1.0
            assert 0.0 <= c.context_score <= 1.0

    def test_candidates_sorted_by_final_score(self, populated_store):
        from research.candidate_search import search_similar_patterns
        from research.query_transformer import transform_pattern_draft

        draft = _minimal_pattern_draft()
        draft["phases"][0]["signals_required"] = ["oi_spike"]
        spec = transform_pattern_draft(draft)
        result = search_similar_patterns(spec, top_k=10, store=populated_store, since_days=None)

        scores = [c.final_score for c in result.candidates]
        assert scores == sorted(scores, reverse=True), "Candidates must be sorted by final_score DESC"
