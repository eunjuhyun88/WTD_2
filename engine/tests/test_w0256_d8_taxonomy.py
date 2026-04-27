"""W-0256 Priority A3: D8 phase taxonomy registry tests.

Verifies the augment-only addition of ``BenchmarkCase.phase_taxonomy_id``
backed by ``patterns.phase_taxonomies.TAXONOMY_REGISTRY``.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from patterns.phase_taxonomies import (
    DEFAULT_TAXONOMY_ID,
    TAXONOMY_REGISTRY,
    get_taxonomy,
    is_path_consistent,
    is_valid_phase,
)
from research.pattern_search import BenchmarkCase


def test_registry_contains_oi_reversal_5_and_wyckoff_4():
    assert "oi_reversal_5" in TAXONOMY_REGISTRY
    assert "wyckoff_4" in TAXONOMY_REGISTRY
    assert TAXONOMY_REGISTRY["oi_reversal_5"] == [
        "FAKE_DUMP",
        "ARCH_ZONE",
        "REAL_DUMP",
        "ACCUMULATION",
        "BREAKOUT",
    ]
    assert TAXONOMY_REGISTRY["wyckoff_4"] == [
        "accumulation",
        "markup",
        "distribution",
        "markdown",
    ]


def test_default_taxonomy_id_is_oi_reversal_5():
    assert DEFAULT_TAXONOMY_ID == "oi_reversal_5"


def test_get_taxonomy_returns_a_copy():
    seq = get_taxonomy("oi_reversal_5")
    seq.append("MUTATION")
    assert "MUTATION" not in TAXONOMY_REGISTRY["oi_reversal_5"]


def test_get_taxonomy_unknown_id_raises_key_error():
    with pytest.raises(KeyError):
        get_taxonomy("not_a_taxonomy")


def test_is_valid_phase_for_each_taxonomy():
    assert is_valid_phase("oi_reversal_5", "FAKE_DUMP")
    assert is_valid_phase("wyckoff_4", "markup")
    assert not is_valid_phase("oi_reversal_5", "markup")
    assert not is_valid_phase("wyckoff_4", "FAKE_DUMP")


def test_is_path_consistent_accepts_valid_path():
    assert is_path_consistent(
        "oi_reversal_5", ["FAKE_DUMP", "ARCH_ZONE", "BREAKOUT"]
    )
    assert is_path_consistent("wyckoff_4", ["accumulation", "markup"])


def test_is_path_consistent_rejects_cross_taxonomy_path():
    assert not is_path_consistent(
        "oi_reversal_5", ["FAKE_DUMP", "markup"]
    )


def test_is_path_consistent_unknown_taxonomy_returns_false():
    assert not is_path_consistent("not_a_taxonomy", [])


def test_is_path_consistent_empty_path_is_vacuously_true():
    assert is_path_consistent("oi_reversal_5", [])


def test_benchmark_case_default_taxonomy_id_is_oi_reversal_5():
    case = BenchmarkCase(
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        expected_phase_path=["FAKE_DUMP", "ARCH_ZONE"],
    )
    assert case.phase_taxonomy_id == "oi_reversal_5"


def test_benchmark_case_explicit_taxonomy_id_persists():
    case = BenchmarkCase(
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        expected_phase_path=["accumulation", "markup"],
        phase_taxonomy_id="wyckoff_4",
    )
    assert case.phase_taxonomy_id == "wyckoff_4"


def test_benchmark_case_round_trip_with_taxonomy_id():
    case = BenchmarkCase(
        symbol="BTCUSDT",
        timeframe="4h",
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 5, tzinfo=timezone.utc),
        expected_phase_path=["accumulation", "markup", "distribution"],
        phase_taxonomy_id="wyckoff_4",
    )
    payload = case.to_dict()
    assert payload["phase_taxonomy_id"] == "wyckoff_4"
    rebuilt = BenchmarkCase.from_dict(payload)
    assert rebuilt.phase_taxonomy_id == "wyckoff_4"
    assert rebuilt.expected_phase_path == ["accumulation", "markup", "distribution"]


def test_benchmark_case_legacy_payload_without_taxonomy_id():
    """JSON written before W-0256 must load with default taxonomy."""
    legacy_payload = {
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "start_at": "2026-01-01T00:00:00+00:00",
        "end_at": "2026-01-02T00:00:00+00:00",
        "expected_phase_path": ["FAKE_DUMP", "BREAKOUT"],
        "role": "reference",
        "case_id": "legacy-case-1",
    }
    case = BenchmarkCase.from_dict(legacy_payload)
    assert case.phase_taxonomy_id == "oi_reversal_5"
