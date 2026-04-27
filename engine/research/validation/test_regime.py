"""Tests for V-05 regime-conditional return module (W-0223)."""
from __future__ import annotations

import time

import pytest

from engine.research.validation.regime import (
    RegimeConditionalReturn,
    RegimeGateResult,
    RegimeLabel,
    label_regime,
    measure_regime_conditional_return,
)


# ---------------------------------------------------------------------------
# label_regime
# ---------------------------------------------------------------------------


class TestLabelRegime:
    def test_bull_above_threshold(self) -> None:
        assert label_regime(10.1) == RegimeLabel.BULL

    def test_bull_well_above(self) -> None:
        assert label_regime(50.0) == RegimeLabel.BULL

    def test_bear_below_threshold(self) -> None:
        assert label_regime(-10.1) == RegimeLabel.BEAR

    def test_bear_well_below(self) -> None:
        assert label_regime(-40.0) == RegimeLabel.BEAR

    def test_range_zero(self) -> None:
        assert label_regime(0.0) == RegimeLabel.RANGE

    def test_range_positive_boundary(self) -> None:
        # Exactly +10.0 → NOT bull → RANGE
        assert label_regime(10.0) == RegimeLabel.RANGE

    def test_range_negative_boundary(self) -> None:
        # Exactly -10.0 → NOT bear → RANGE
        assert label_regime(-10.0) == RegimeLabel.RANGE

    def test_range_small_positive(self) -> None:
        assert label_regime(5.0) == RegimeLabel.RANGE

    def test_range_small_negative(self) -> None:
        assert label_regime(-5.0) == RegimeLabel.RANGE


# ---------------------------------------------------------------------------
# measure_regime_conditional_return
# ---------------------------------------------------------------------------


def _strong_returns(n: int = 20, mean: float = 0.05) -> list[float]:
    """Returns with high t-stat (t >> 2) for n samples."""
    import math
    # SE = std/sqrt(n); make std small relative to mean → high t
    return [mean + 0.001 * (i % 3 - 1) for i in range(n)]


def _weak_returns(n: int = 20) -> list[float]:
    """Returns near zero with high variance → low t-stat."""
    return [0.001 * (-1) ** i for i in range(n)]


class TestMeasureRegimeConditional:
    def test_g7_pass_one_of_three_active(self) -> None:
        """G7 should pass when active in 1/3 regimes."""
        result = measure_regime_conditional_return(
            {
                RegimeLabel.BULL: _strong_returns(),
                RegimeLabel.BEAR: _weak_returns(),
                RegimeLabel.RANGE: _weak_returns(),
            }
        )
        assert result.g7_pass is True
        assert RegimeLabel.BULL in result.active_regimes

    def test_g7_fail_all_active(self) -> None:
        """G7 fails if active in ALL regimes (regime-agnostic pattern)."""
        result = measure_regime_conditional_return(
            {
                RegimeLabel.BULL: _strong_returns(),
                RegimeLabel.BEAR: _strong_returns(),
                RegimeLabel.RANGE: _strong_returns(),
            }
        )
        assert result.g7_pass is False
        assert len(result.active_regimes) == 3

    def test_g7_fail_none_active(self) -> None:
        """G7 fails if active in NO regimes."""
        result = measure_regime_conditional_return(
            {
                RegimeLabel.BULL: _weak_returns(),
                RegimeLabel.BEAR: _weak_returns(),
                RegimeLabel.RANGE: _weak_returns(),
            }
        )
        assert result.g7_pass is False
        assert len(result.active_regimes) == 0

    def test_n_less_than_2_no_crash(self) -> None:
        """Single-observation regime should not raise."""
        result = measure_regime_conditional_return(
            {
                RegimeLabel.BULL: [0.05],
                RegimeLabel.BEAR: _weak_returns(),
                RegimeLabel.RANGE: _weak_returns(),
            }
        )
        assert result.per_regime[RegimeLabel.BULL].n == 1
        assert result.per_regime[RegimeLabel.BULL].passes is False

    def test_zero_observations_no_crash(self) -> None:
        """Empty observation list should not raise."""
        result = measure_regime_conditional_return(
            {
                RegimeLabel.BULL: [],
                RegimeLabel.BEAR: _strong_returns(),
                RegimeLabel.RANGE: _weak_returns(),
            }
        )
        assert result.per_regime[RegimeLabel.BULL].n == 0
        assert result.per_regime[RegimeLabel.BULL].t_stat == 0.0

    def test_zero_variance_no_crash(self) -> None:
        """All-identical returns → t_stat=0, no ZeroDivisionError."""
        result = measure_regime_conditional_return(
            {
                RegimeLabel.BULL: [0.05] * 10,
                RegimeLabel.BEAR: _weak_returns(),
                RegimeLabel.RANGE: _weak_returns(),
            }
        )
        assert result.per_regime[RegimeLabel.BULL].t_stat == 0.0
        assert result.per_regime[RegimeLabel.BULL].passes is False

    def test_per_regime_mean_return_correct(self) -> None:
        """mean_return should match statistics.mean of input."""
        import statistics as _st

        rets = [0.01, 0.02, 0.03, 0.04, 0.05]
        result = measure_regime_conditional_return(
            {RegimeLabel.BULL: rets}
        )
        assert abs(result.per_regime[RegimeLabel.BULL].mean_return - _st.mean(rets)) < 1e-9

    def test_inactive_regimes_populated(self) -> None:
        """Regimes with t_stat <= 0 should appear in inactive_regimes."""
        result = measure_regime_conditional_return(
            {
                RegimeLabel.BULL: _strong_returns(),
                RegimeLabel.BEAR: [-0.001] * 20,  # negative mean → negative t
                RegimeLabel.RANGE: _weak_returns(),
            }
        )
        assert RegimeLabel.BEAR in result.inactive_regimes

    def test_performance_under_one_second(self) -> None:
        """measure_regime_conditional_return should complete in < 1s for n=100."""
        large = list(range(100))
        t0 = time.perf_counter()
        measure_regime_conditional_return(
            {
                RegimeLabel.BULL: large,
                RegimeLabel.BEAR: large,
                RegimeLabel.RANGE: large,
            }
        )
        elapsed = time.perf_counter() - t0
        assert elapsed < 1.0, f"Took {elapsed:.3f}s, expected < 1s"

    def test_two_regime_g7_pass(self) -> None:
        """Works correctly with only 2 regimes."""
        result = measure_regime_conditional_return(
            {
                RegimeLabel.BULL: _strong_returns(),
                RegimeLabel.BEAR: _weak_returns(),
            }
        )
        assert result.g7_pass is True
        assert len(result.per_regime) == 2
