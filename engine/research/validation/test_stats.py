"""V-06 (W-0220) — Statistics engine unit tests.

Covers W-0220 §5 Exit Criteria and W-0225 §6.3 corrections:

* Each public function: basic positive case + edge cases.
* W-0225 N-1 — :func:`profit_factor` cap (no ``float('inf')`` ever).
* W-0225 N-2 — :func:`deflated_sharpe` requires explicit ``n_trials``
  and rejects degenerate ``n_trials < 2``.
* Performance budget per W-0220 §5: < 50 ms / 1000 samples / metric.

Total: 26 test cases (PRD §5 requires ≥ 20).
"""

from __future__ import annotations

import json
import time

import numpy as np
import pytest

from research.validation.stats import (
    TTestResult,
    annualized_sharpe,
    bh_correct,
    bootstrap_ci,
    deflated_sharpe,
    hit_rate,
    profit_factor,
    welch_t_test,
)


# ---------------------------------------------------------------------------
# Welch's t-test
# ---------------------------------------------------------------------------


def test_welch_t_test_basic_difference() -> None:
    """Two clearly separated normals → significant t, low p."""
    rng = np.random.default_rng(0)
    a = rng.normal(loc=1.0, scale=1.0, size=200)
    b = rng.normal(loc=0.0, scale=1.0, size=200)
    result = welch_t_test(a, b, alternative="greater")
    assert isinstance(result, TTestResult)
    assert result.t_statistic > 5.0
    assert result.p_value < 1e-6
    assert result.n_samples == (200, 200)
    assert result.mean_diff > 0.5


def test_welch_t_test_equal_means() -> None:
    """Two samples from same distribution → not significant."""
    rng = np.random.default_rng(1)
    a = rng.normal(0, 1, size=200)
    b = rng.normal(0, 1, size=200)
    result = welch_t_test(a, b)
    assert result.p_value > 0.01  # almost certainly not significant


def test_welch_t_test_below_threshold() -> None:
    """n < 3 in either arm → graceful fallback (t=0, p=1)."""
    result = welch_t_test([1.0, 2.0], [0.5, 0.6, 0.7])
    assert result.t_statistic == 0.0
    assert result.p_value == 1.0
    assert result.n_samples == (2, 3)


def test_welch_t_test_nan_drops() -> None:
    """NaN values are dropped silently before the test runs."""
    a = [1.0, 2.0, 3.0, float("nan"), 4.0, 5.0]
    b = [0.0, 0.5, float("nan"), 1.0, 0.5]
    result = welch_t_test(a, b)
    assert result.n_samples == (5, 4)


def test_welch_t_test_one_sided_greater() -> None:
    """alternative='greater' returns smaller p when a > b."""
    rng = np.random.default_rng(2)
    a = rng.normal(0.5, 1, size=100)
    b = rng.normal(0, 1, size=100)
    two_sided = welch_t_test(a, b, alternative="two-sided")
    one_sided = welch_t_test(a, b, alternative="greater")
    # One-sided greater p ~= two-sided / 2 when t > 0.
    assert one_sided.p_value <= two_sided.p_value + 1e-9


# ---------------------------------------------------------------------------
# BH correction
# ---------------------------------------------------------------------------


def test_bh_correct_textbook_example() -> None:
    """BH textbook example.

    Raw p = [0.005, 0.01, 0.02, 0.04, 0.5]. m=5, alpha=0.05.
    Adjusted (BH-monotone): [0.025, 0.025, 0.0333, 0.05, 0.5].
    All four lowest survive.
    """
    p = [0.005, 0.01, 0.02, 0.04, 0.5]
    rejected, corrected = bh_correct(p)
    np.testing.assert_allclose(
        corrected,
        [0.025, 0.025, 0.0333333, 0.05, 0.5],
        atol=1e-6,
    )
    np.testing.assert_array_equal(
        rejected, [True, True, True, True, False]
    )


def test_bh_correct_preserves_input_order() -> None:
    """Input not pre-sorted; output index aligns to input."""
    p = [0.5, 0.005, 0.04, 0.01, 0.02]
    rejected, corrected = bh_correct(p)
    # Same multiset of corrected values, in input order.
    assert rejected[0] is np.False_ or rejected[0] == False  # noqa: E712
    assert rejected[1] == True  # noqa: E712 (lowest raw)
    assert corrected[1] == pytest.approx(0.025, abs=1e-6)


def test_bh_correct_empty_input() -> None:
    """Empty list → empty arrays, no crash."""
    rejected, corrected = bh_correct([])
    assert len(rejected) == 0
    assert len(corrected) == 0


def test_bh_correct_all_significant() -> None:
    """All raw p tiny → all rejected."""
    p = [0.001, 0.002, 0.003]
    rejected, _ = bh_correct(p)
    assert rejected.all()


def test_bh_correct_none_significant() -> None:
    """All raw p large → none rejected."""
    p = [0.5, 0.6, 0.7]
    rejected, corrected = bh_correct(p)
    assert not rejected.any()
    assert (corrected <= 1.0 + 1e-9).all()


# ---------------------------------------------------------------------------
# Annualized Sharpe
# ---------------------------------------------------------------------------


def test_annualized_sharpe_basic_positive() -> None:
    """Positive mean, unit std → positive Sharpe with sqrt scaling."""
    rng = np.random.default_rng(3)
    returns = rng.normal(0.001, 0.01, size=500)
    sr = annualized_sharpe(returns, horizon_hours=1)
    assert sr > 0.0
    # mean/std ~= 0.1, scaled by sqrt(6048) ~= 77.7.
    assert sr < 200.0  # sanity upper bound


def test_annualized_sharpe_empty_or_constant() -> None:
    """n<2 or std≈0 → 0.0 (silent guard)."""
    assert annualized_sharpe([]) == 0.0
    assert annualized_sharpe([1.0]) == 0.0
    assert annualized_sharpe([0.5, 0.5, 0.5]) == 0.0


def test_annualized_sharpe_4h_bar() -> None:
    """4h bar → smaller annualization factor (1512 vs 6048)."""
    rng = np.random.default_rng(4)
    returns = rng.normal(0.001, 0.01, size=500)
    sr_1h = annualized_sharpe(returns, horizon_hours=1)
    sr_4h = annualized_sharpe(
        returns, horizon_hours=4, periods_per_year=252 * 6
    )
    # 4h: sqrt(1512/4) = sqrt(378). 1h: sqrt(6048). Ratio = sqrt(16) = 4.
    assert sr_1h > sr_4h


# ---------------------------------------------------------------------------
# Deflated Sharpe (W-0225 N-2)
# ---------------------------------------------------------------------------


def test_deflated_sharpe_positive_signal() -> None:
    """Strong signal → positive DSR even after large n_trials deflation."""
    rng = np.random.default_rng(5)
    returns = rng.normal(0.005, 0.01, size=500)
    dsr = deflated_sharpe(returns, n_trials=500)
    assert dsr > 0.0


def test_deflated_sharpe_n_trials_required() -> None:
    """W-0225 N-2: n_trials is keyword-only with no default."""
    rng = np.random.default_rng(6)
    returns = rng.normal(0.001, 0.01, size=100)
    # Calling without n_trials must raise TypeError (no default).
    with pytest.raises(TypeError):
        deflated_sharpe(returns)  # type: ignore[call-arg]


def test_deflated_sharpe_rejects_n_trials_lt_2() -> None:
    """W-0225 N-2: n_trials < 2 is a hard error (DSR undefined)."""
    rng = np.random.default_rng(7)
    returns = rng.normal(0.001, 0.01, size=100)
    with pytest.raises(ValueError, match="n_trials must be"):
        deflated_sharpe(returns, n_trials=1)
    with pytest.raises(ValueError, match="n_trials must be"):
        deflated_sharpe(returns, n_trials=0)


def test_deflated_sharpe_n_trials_monotone() -> None:
    """Larger search universe (n_trials) → smaller DSR (more deflation)."""
    rng = np.random.default_rng(8)
    returns = rng.normal(0.003, 0.01, size=500)
    dsr_small = deflated_sharpe(returns, n_trials=15)
    dsr_large = deflated_sharpe(returns, n_trials=1500)
    assert dsr_small > dsr_large


def test_deflated_sharpe_too_small_sample() -> None:
    """n < 10 → 0.0 (insufficient sample for skew/kurt)."""
    assert deflated_sharpe([0.1, 0.2, 0.3], n_trials=15) == 0.0
    assert deflated_sharpe(list(range(9)), n_trials=15) == 0.0


# ---------------------------------------------------------------------------
# Bootstrap CI
# ---------------------------------------------------------------------------


def test_bootstrap_ci_mean_brackets_truth() -> None:
    """For known mean=1, n=500, 95% CI should contain 1.0."""
    rng = np.random.default_rng(9)
    samples = rng.normal(loc=1.0, scale=1.0, size=500)
    lo, hi, point = bootstrap_ci(samples, seed=42)
    assert lo < 1.0 < hi
    assert point == pytest.approx(samples.mean(), abs=1e-9)


def test_bootstrap_ci_seed_reproducible() -> None:
    """Same seed → same CI bounds."""
    rng = np.random.default_rng(10)
    samples = rng.normal(0, 1, size=200)
    a = bootstrap_ci(samples, seed=42)
    b = bootstrap_ci(samples, seed=42)
    assert a == b


def test_bootstrap_ci_too_small() -> None:
    """n < 10 → degenerate (0, 0, 0)."""
    assert bootstrap_ci([1.0, 2.0, 3.0]) == (0.0, 0.0, 0.0)


def test_bootstrap_ci_median_statistic() -> None:
    """Median statistic returns a CI containing the sample median."""
    rng = np.random.default_rng(11)
    samples = rng.normal(0, 1, size=300)
    lo, hi, point = bootstrap_ci(samples, statistic="median")
    assert point == pytest.approx(float(np.median(samples)), abs=1e-9)
    assert lo <= point <= hi


def test_bootstrap_ci_invalid_statistic() -> None:
    """Unknown statistic raises ValueError."""
    with pytest.raises(ValueError, match="Unknown statistic"):
        bootstrap_ci([1.0] * 100, statistic="mode")


# ---------------------------------------------------------------------------
# Hit rate
# ---------------------------------------------------------------------------


def test_hit_rate_basic() -> None:
    assert hit_rate([1, 2, -1, -2, 0]) == pytest.approx(0.4)
    assert hit_rate([]) == 0.0
    assert hit_rate([0, 0, 0]) == 0.0
    assert hit_rate([0.1, 0.2, 0.3]) == 1.0


# ---------------------------------------------------------------------------
# Profit factor — W-0225 N-1 cap (CRITICAL)
# ---------------------------------------------------------------------------


def test_profit_factor_basic_ratio() -> None:
    """Mixed wins/losses: ratio is sum_pos / |sum_neg|."""
    samples = [1.0, 2.0, -1.0]
    # pos=3, neg=-1 → 3.0
    assert profit_factor(samples) == pytest.approx(3.0)


def test_profit_factor_all_positive_caps_at_999() -> None:
    """W-0225 N-1: all-positive returns 999.0, NEVER float('inf')."""
    samples = [0.1, 0.2, 0.3]
    pf = profit_factor(samples)
    assert pf == 999.0
    assert pf != float("inf")
    # JSON-serializable (the whole point of the N-1 fix).
    json.dumps(pf)  # raises if inf/NaN


def test_profit_factor_all_zero_or_empty_returns_zero() -> None:
    """No positives, no negatives → 0.0."""
    assert profit_factor([0.0, 0.0, 0.0]) == 0.0
    assert profit_factor([]) == 0.0


def test_profit_factor_all_negative_returns_zero() -> None:
    """All negatives, no positives, no negatives-to-divide-by? Actually
    we DO have negatives here, so pos/|neg| = 0/X = 0.0."""
    assert profit_factor([-1.0, -2.0, -3.0]) == 0.0


def test_profit_factor_respects_custom_cap() -> None:
    """Custom cap overrides the default 999.0."""
    pf = profit_factor([0.1, 0.2], cap=10.0)
    assert pf == 10.0
    assert pf != float("inf")


def test_profit_factor_caps_extreme_ratios() -> None:
    """Even with one tiny negative, runaway ratios are clamped."""
    # pos=10000, neg=-1 → ratio=10000, capped at 999.0
    pf = profit_factor([10000.0, -1.0])
    assert pf == 999.0


# ---------------------------------------------------------------------------
# Performance budget (W-0220 §5: < 50 ms per metric / 1000 samples)
# ---------------------------------------------------------------------------


def test_performance_budget_1000_samples() -> None:
    """Each public metric runs under 50ms on a 1000-sample input."""
    rng = np.random.default_rng(99)
    samples = rng.normal(0.001, 0.01, size=1000)
    other = rng.normal(0, 0.01, size=1000)

    timings: dict[str, float] = {}
    t0 = time.perf_counter()
    welch_t_test(samples, other)
    timings["welch"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    bh_correct([0.01, 0.02, 0.03, 0.04, 0.05] * 200)  # 1000 p-values
    timings["bh"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    annualized_sharpe(samples)
    timings["sharpe"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    deflated_sharpe(samples, n_trials=500)
    timings["dsr"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    bootstrap_ci(samples)
    timings["bootstrap"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    hit_rate(samples)
    timings["hit_rate"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    profit_factor(samples)
    timings["profit_factor"] = time.perf_counter() - t0

    # Budget: 50ms each. Generous — typical actual <5ms on M-series.
    for name, dt in timings.items():
        assert dt < 0.050, f"{name} took {dt * 1000:.1f}ms, budget 50ms"
