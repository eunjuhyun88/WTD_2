"""Tests for W-0280 — run_full_validation() production runner."""
from __future__ import annotations

import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import research.validation.runner as _runner_mod
from research.validation.runner import run_full_validation


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


def _make_pack_dict(pack_id: str = "test-pack-id", slug: str = "tradoor") -> dict:
    return {
        "benchmark_pack_id": pack_id,
        "pattern_slug": slug,
        "candidate_timeframes": ["15m", "1h"],
        "cases": [
            {
                "symbol": "BTCUSDT",
                "timeframe": "15m",
                "start_at": _utcnow().isoformat(),
                "end_at": _utcnow().isoformat(),
                "expected_phase_path": ["ACCUMULATION", "BREAKOUT"],
                "role": "reference",
                "notes": [],
                "case_id": "case-001",
                "phase_taxonomy_id": "oi_reversal_5",
            }
        ],
        "created_at": _utcnow().isoformat(),
    }


def _make_artifact_dict(pack_id: str = "test-pack-id", decision: str = "promote_candidate") -> dict:
    return {
        "benchmark_pack_id": pack_id,
        "promotion_report": {"decision": decision},
    }


# ---------------------------------------------------------------------------
# AC3: import check
# ---------------------------------------------------------------------------

class TestImports:
    def test_run_full_validation_importable(self) -> None:
        from research.validation import run_full_validation as _fn
        assert callable(_fn)

    def test_evaluate_gate_v2_importable(self) -> None:
        from research.validation import evaluate_gate_v2, Gate
        assert callable(evaluate_gate_v2)
        assert Gate is not None

    def test_label_regime_importable(self) -> None:
        from research.validation import label_regime, RegimeLabel
        assert callable(label_regime)
        assert RegimeLabel is not None


# ---------------------------------------------------------------------------
# AC4: run_full_validation returns GateV2Result (mocked stores)
# ---------------------------------------------------------------------------

class TestRunFullValidation:
    def test_returns_none_when_artifact_missing(self) -> None:
        with patch("research.pattern_search.PatternSearchArtifactStore") as mock_store_cls:
            mock_store_cls.return_value.load.return_value = None
            result = run_full_validation("nonexistent-run-id")
        assert result is None

    def test_returns_none_when_pack_id_missing(self) -> None:
        artifact = {"benchmark_pack_id": None, "promotion_report": {}}
        with patch("research.pattern_search.PatternSearchArtifactStore") as mock_art:
            mock_art.return_value.load.return_value = artifact
            result = run_full_validation("run-id-no-pack")
        assert result is None

    def test_returns_none_when_pack_not_found(self) -> None:
        artifact = _make_artifact_dict()
        with (
            patch("research.pattern_search.PatternSearchArtifactStore") as mock_art,
            patch("research.pattern_search.BenchmarkPackStore") as mock_pack_store,
        ):
            mock_art.return_value.load.return_value = artifact
            mock_pack_store.return_value.load.return_value = None
            result = run_full_validation("run-id")
        assert result is None

    def test_returns_gate_v2_result_on_success(self) -> None:
        """AC4: synthetic artifact + pack → GateV2Result returned."""
        from research.pattern_search import BenchmarkPackStore, ReplayBenchmarkPack

        artifact = _make_artifact_dict()
        pack_dict = _make_pack_dict()

        with tempfile.TemporaryDirectory() as tmpdir:
            # Write a real pack file so BenchmarkPackStore.load() works
            pack_path = Path(tmpdir) / f"{pack_dict['benchmark_pack_id']}.json"
            pack_path.write_text(json.dumps(pack_dict))

            real_pack = ReplayBenchmarkPack.from_dict(pack_dict)

            with (
                patch("research.pattern_search.PatternSearchArtifactStore") as mock_art,
                patch("research.pattern_search.BenchmarkPackStore") as mock_pack_store,
            ):
                mock_art.return_value.load.return_value = artifact
                mock_pack_store.return_value.load.return_value = real_pack

                result = run_full_validation("run-001")

        # GateV2Result should be returned (even if overall_pass=False with no data)
        assert result is not None
        assert hasattr(result, "overall_pass")
        assert hasattr(result, "all_new_pass")
        assert isinstance(result.to_dict(), dict)

    def test_existing_pass_false_when_reject(self) -> None:
        """existing_pass=False when promotion_report.decision != promote_candidate."""
        from research.pattern_search import ReplayBenchmarkPack

        artifact = _make_artifact_dict(decision="reject")
        pack_dict = _make_pack_dict()
        real_pack = ReplayBenchmarkPack.from_dict(pack_dict)

        with (
            patch("research.pattern_search.PatternSearchArtifactStore") as mock_art,
            patch("research.pattern_search.BenchmarkPackStore") as mock_pack_store,
        ):
            mock_art.return_value.load.return_value = artifact
            mock_pack_store.return_value.load.return_value = real_pack
            result = run_full_validation("run-002")

        assert result is not None
        # With existing_pass=False and no sample data → overall_pass=False
        assert result.overall_pass is False


# ---------------------------------------------------------------------------
# W-0288: _fetch_btc_returns TTL cache + exception handling
# ---------------------------------------------------------------------------

class TestFetchBtcReturns:
    """Tests for the module-level TTL cache in _fetch_btc_returns."""

    def setup_method(self) -> None:
        """Reset the module-level cache before each test."""
        _runner_mod._BTC_RETURNS_CACHE = None

    def test_fetch_btc_returns_cache_hit(self) -> None:
        """Second call hits the TTL cache — load_klines called only once."""
        import pandas as pd

        fake_df = pd.DataFrame(
            {"close": [100.0, 101.0, 102.0] * 15},
            index=pd.date_range("2025-01-01", periods=45, freq="D", tz="UTC"),
        )

        with patch("data_cache.loader.load_klines", return_value=fake_df) as mock_load:
            first = _runner_mod._fetch_btc_returns()
            second = _runner_mod._fetch_btc_returns()

        # load_klines should have been called exactly once (second call hits cache)
        assert mock_load.call_count == 1
        # Both calls return the same Series
        assert first is not None
        assert second is not None
        assert first.equals(second)

    def test_fetch_btc_returns_exception_returns_none(self) -> None:
        """Any exception from load_klines causes _fetch_btc_returns to return None."""
        with patch("data_cache.loader.load_klines", side_effect=RuntimeError("network error")):
            result = _runner_mod._fetch_btc_returns()

        assert result is None
        # Cache must remain empty after failure
        assert _runner_mod._BTC_RETURNS_CACHE is None
