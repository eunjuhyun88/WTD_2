"""Tests for V-03 (W-0219) signal ablation module."""
from __future__ import annotations

from dataclasses import replace
from unittest.mock import patch

import pytest

from patterns.types import PatternObject, PhaseCondition
from research.validation.ablation import (
    AblationResult,
    _make_pattern_without_signal,
    _remove_signal,
    get_signal_list,
    run_ablation,
)
from research.validation.phase_eval import PhaseConditionalReturn


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _phase(
    phase_id: str = "P0",
    required: list[str] | None = None,
    soft: list[str] | None = None,
) -> PhaseCondition:
    return PhaseCondition(
        phase_id=phase_id,
        label=phase_id,
        required_blocks=required or [],
        optional_blocks=[],
        required_any_groups=[],
        soft_blocks=soft or [],
        disqualifier_blocks=[],
        score_weights={},
        phase_score_threshold=None,
        transition_window_bars=None,
        anchor_from_previous_phase=False,
        anchor_phase_id=None,
        min_bars=1,
        max_bars=48,
        timeframe="1h",
    )


def _pattern(phases: list[PhaseCondition] | None = None) -> PatternObject:
    phases = phases or [_phase("P0", required=["A", "B", "C"])]
    return PatternObject(
        slug="test-pattern",
        name="Test",
        description="",
        phases=phases,
        entry_phase=phases[0].phase_id,
        target_phase=phases[-1].phase_id,
    )


def _pcr(mean: float = 1.0, n: int = 10, samples: tuple[float, ...] | None = None) -> PhaseConditionalReturn:
    if samples is None:
        samples = tuple([mean] * n)
    return PhaseConditionalReturn(
        pattern_slug="test-pattern",
        phase_name="P0",
        horizon_hours=4,
        cost_bps=15.0,
        n_samples=len(samples),
        mean_return_pct=mean,
        median_return_pct=mean,
        std_return_pct=0.0,
        min_return_pct=min(samples) if samples else 0.0,
        max_return_pct=max(samples) if samples else 0.0,
        mean_peak_return_pct=None,
        realistic_mean_pct=None,
        samples=samples,
    )


# ---------------------------------------------------------------------------
# Unit tests: get_signal_list
# ---------------------------------------------------------------------------

def test_get_signal_list_required_only():
    phase = _phase(required=["A", "B"])
    assert get_signal_list(phase) == ["A", "B"]


def test_get_signal_list_soft_only():
    phase = _phase(soft=["X", "Y"])
    assert get_signal_list(phase) == ["X", "Y"]


def test_get_signal_list_dedup():
    phase = _phase(required=["A", "B"], soft=["B", "C"])
    result = get_signal_list(phase)
    assert result == ["A", "B", "C"]  # B deduped


def test_get_signal_list_empty():
    phase = _phase()
    assert get_signal_list(phase) == []


# ---------------------------------------------------------------------------
# Unit tests: _remove_signal
# ---------------------------------------------------------------------------

def test_remove_signal_from_required():
    phase = _phase(required=["A", "B", "C"])
    new = _remove_signal(phase, "B")
    assert new.required_blocks == ["A", "C"]
    assert phase.required_blocks == ["A", "B", "C"]  # immutable


def test_remove_signal_from_soft():
    phase = _phase(required=["A"], soft=["X", "Y"])
    new = _remove_signal(phase, "X")
    assert new.soft_blocks == ["Y"]


def test_remove_signal_not_present_is_noop():
    phase = _phase(required=["A", "B"])
    new = _remove_signal(phase, "Z")
    assert new.required_blocks == ["A", "B"]


# ---------------------------------------------------------------------------
# Unit tests: _make_pattern_without_signal
# ---------------------------------------------------------------------------

def test_make_pattern_without_signal():
    pattern = _pattern([_phase("P0", required=["A", "B"])])
    new = _make_pattern_without_signal(pattern, 0, "A")
    assert new.phases[0].required_blocks == ["B"]
    assert pattern.phases[0].required_blocks == ["A", "B"]  # original unchanged


def test_make_pattern_phase_idx_out_of_range():
    pattern = _pattern()
    with pytest.raises(ValueError, match="phase_idx"):
        run_ablation(pattern, None, phase_idx=99)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Unit tests: run_ablation (mocked measure_phase_conditional_return)
# ---------------------------------------------------------------------------

MOCK_PATH = "research.validation.ablation.measure_phase_conditional_return"


def test_run_ablation_critical_signal():
    pattern = _pattern([_phase("P0", required=["A", "B"])])

    # A: removing it drops return by 0.5% → critical
    # B: removing it drops return by 0.05% → marginal
    baseline = _pcr(mean=2.0, n=20, samples=tuple([2.0] * 20))
    ablated_a = _pcr(mean=1.5, n=20, samples=tuple([1.5] * 20))  # drop=0.5 critical
    ablated_b = _pcr(mean=1.95, n=20, samples=tuple([1.95] * 20))  # drop=0.05 marginal

    call_count = [0]

    def mock_measure(*, pattern, pack, horizon_hours, cost_bps, bars_per_hour):
        idx = call_count[0]
        call_count[0] += 1
        return [baseline, ablated_a, ablated_b][idx]

    with patch(MOCK_PATH, side_effect=mock_measure):
        results = run_ablation(pattern, None, phase_idx=0, horizon_hours=4)  # type: ignore[arg-type]

    assert len(results) == 2
    a_res = next(r for r in results if r.signal_id == "A")
    b_res = next(r for r in results if r.signal_id == "B")

    assert a_res.is_critical is True
    assert a_res.is_marginal is False
    assert abs(a_res.drop_pct - 0.5) < 1e-9

    assert b_res.is_critical is False
    assert b_res.is_marginal is True
    assert abs(b_res.drop_pct - 0.05) < 1e-9


def test_run_ablation_empty_phase_returns_empty():
    pattern = _pattern([_phase("P0", required=[], soft=[])])
    with patch(MOCK_PATH, return_value=_pcr()):
        results = run_ablation(pattern, None, phase_idx=0)  # type: ignore[arg-type]
    assert results == []


def test_run_ablation_all_marginal():
    pattern = _pattern([_phase("P0", required=["X", "Y"])])
    baseline = _pcr(mean=1.0, n=10)
    ablated = _pcr(mean=0.99, n=10)  # drop=0.01 < 0.1 → marginal

    side = [baseline, ablated, ablated]

    with patch(MOCK_PATH, side_effect=side):
        results = run_ablation(pattern, None, phase_idx=0)  # type: ignore[arg-type]

    assert all(r.is_marginal for r in results)
    assert not any(r.is_critical for r in results)


def test_run_ablation_skip_on_low_n_ratio():
    """Ablated result with very few samples should be skipped."""
    pattern = _pattern([_phase("P0", required=["A"])])
    baseline = _pcr(mean=1.0, n=100, samples=tuple([1.0] * 100))
    ablated = _pcr(mean=0.0, n=10, samples=tuple([0.0] * 10))  # ratio=0.1 < 0.5

    with patch(MOCK_PATH, side_effect=[baseline, ablated]):
        results = run_ablation(pattern, None, phase_idx=0, skip_ratio_threshold=0.5)  # type: ignore[arg-type]

    assert results == []  # skipped


def test_run_ablation_welch_t_populated():
    """t_statistic and p_value should be populated when n >= 3."""
    import numpy as np
    pattern = _pattern([_phase("P0", required=["A"])])

    rng = np.random.default_rng(42)
    b_samples = tuple(rng.normal(1.0, 0.5, 30).tolist())
    a_samples = tuple(rng.normal(0.5, 0.5, 30).tolist())

    baseline = _pcr(mean=float(np.mean(b_samples)), n=30, samples=b_samples)
    ablated = _pcr(mean=float(np.mean(a_samples)), n=30, samples=a_samples)

    with patch(MOCK_PATH, side_effect=[baseline, ablated]):
        results = run_ablation(pattern, None, phase_idx=0)  # type: ignore[arg-type]

    assert len(results) == 1
    r = results[0]
    assert r.t_statistic is not None
    assert r.p_value is not None
    assert r.p_value >= 0.0


def test_ablation_result_is_frozen():
    r = AblationResult(
        signal_id="A", pattern_slug="p", phase_name="P0",
        horizon_hours=4, baseline_mean_pct=1.0, ablated_mean_pct=0.5,
        drop_pct=0.5, n_baseline=10, n_ablated=10,
        is_critical=True, is_marginal=False,
        t_statistic=2.5, p_value=0.01,
    )
    with pytest.raises((AttributeError, TypeError)):
        r.drop_pct = 0.0  # type: ignore[misc]
