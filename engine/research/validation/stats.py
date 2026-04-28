"""V-06 (W-0220) — Statistics engine for W-0214 G1~G4 acceptance gates.

Implements the seven public statistical functions enumerated in W-0220 §5
Exit Criteria:

* :func:`welch_t_test`       (G1, Welch 1947)
* :func:`bh_correct`         (G1, Benjamini & Hochberg 1995)
* :func:`deflated_sharpe`    (G2, Bailey & López de Prado 2014)
* :func:`bootstrap_ci`       (G4, Efron 1979)
* :func:`annualized_sharpe`  (Sharpe 1966 / W-0216 §15.1 F1 강화)
* :func:`hit_rate`           (W-0216 §15.1 F1 강화)
* :func:`profit_factor`      (W-0216 §15.1 F1 강화)

This module is **self-contained** and depends only on numpy + scipy. The
PRD originally referenced ``statsmodels.stats.multitest.multipletests``
for BH correction, but ``statsmodels`` is not in ``engine/pyproject.toml``
and pulling it in for one short algorithm is wasteful. BH is implemented
inline (Benjamini & Hochberg 1995, Step-up procedure) -- the algorithm is
~10 lines of numpy and is verified against the published worked example.

W-0225 §6.3 corrections applied (override PRD literal):

* **N-1 (profit_factor inf cap)** — PRD §6 returned ``float('inf')`` when
  all samples were positive, which breaks JSON serialization
  (``json.dumps(float('inf'))`` → ``ValueError``). Cap at ``999.0`` so
  downstream F1 measurement reports stay JSON-safe.
* **N-2 (DSR n_trials guidance)** — PRD §6 example used
  ``n_trials = len(horizons_hours)`` (=3) which is way under the actual
  selection-bias search universe (typically 1800-4500). ``n_trials`` is
  now a **required** keyword-only argument with no default, and the
  docstring instructs callers to inject the real search-universe size.
  This makes "accidentally tiny n_trials" impossible at the type level.

V-00 augment-only: ``engine/research/pattern_search.py`` is **read-only**
(W-0214 §14.8). This module imports nothing from it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np
from scipy import stats as scipy_stats

__all__ = [
    "TTestResult",
    "welch_t_test",
    "bh_correct",
    "deflated_sharpe",
    "bootstrap_ci",
    "annualized_sharpe",
    "hit_rate",
    "profit_factor",
    "mann_whitney_u",
]


# ---------------------------------------------------------------------------
# G1 — Welch's t-test (Welch 1947)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TTestResult:
    """Result of a Welch's t-test (PRD §6.1).

    Attributes:
        t_statistic: Welch t-statistic.
        p_value: two-sided / one-sided p-value (depends on ``alternative``).
        df: Welch-Satterthwaite degrees of freedom.
        n_samples: ``(n_a, n_b)`` after NaN drop.
        mean_diff: ``mean(a) - mean(b)``.
    """

    t_statistic: float
    p_value: float
    df: float
    n_samples: tuple[int, int]
    mean_diff: float


def welch_t_test(
    samples_a: Sequence[float],
    samples_b: Sequence[float],
    *,
    equal_var: bool = False,
    alternative: str = "two-sided",
) -> TTestResult:
    """Welch's t-test for unequal-variance two-sample comparison.

    Used for: M1 phase-conditional return vs B0 random baseline (G1).

    Reference:
        Welch, B. L. (1947). "The generalization of 'Student's' problem
        when several different population variances are involved."
        Biometrika 34 (1-2): 28-35.

    Args:
        samples_a: first sample (e.g. phase-conditional returns).
        samples_b: second sample (e.g. random baseline).
        equal_var: ``False`` → Welch (default). ``True`` → Student's t.
        alternative: ``"two-sided"`` / ``"less"`` / ``"greater"``.
            For F1 measurement use ``"greater"`` (W-0220 §10 Q1).

    Returns:
        :class:`TTestResult`. When ``min(n_a, n_b) < 3`` the test is
        skipped (returns ``t=0, p=1``) -- caller should treat this as a
        non-significant result rather than an error.
    """
    arr_a = np.asarray(samples_a, dtype=float)
    arr_b = np.asarray(samples_b, dtype=float)
    arr_a = arr_a[~np.isnan(arr_a)]
    arr_b = arr_b[~np.isnan(arr_b)]
    n_a, n_b = len(arr_a), len(arr_b)
    if n_a < 3 or n_b < 3:
        mean_diff = (
            float(arr_a.mean() - arr_b.mean()) if (n_a and n_b) else 0.0
        )
        return TTestResult(
            t_statistic=0.0,
            p_value=1.0,
            df=0.0,
            n_samples=(n_a, n_b),
            mean_diff=mean_diff,
        )
    result = scipy_stats.ttest_ind(
        arr_a, arr_b, equal_var=equal_var, alternative=alternative
    )
    df_value = float(getattr(result, "df", n_a + n_b - 2))
    return TTestResult(
        t_statistic=float(result.statistic),
        p_value=float(result.pvalue),
        df=df_value,
        n_samples=(n_a, n_b),
        mean_diff=float(arr_a.mean() - arr_b.mean()),
    )


# ---------------------------------------------------------------------------
# G1 — Benjamini-Hochberg multiple comparison correction (BH 1995)
# ---------------------------------------------------------------------------


def bh_correct(
    p_values: Sequence[float],
    *,
    alpha: float = 0.05,
) -> tuple[np.ndarray, np.ndarray]:
    """Benjamini-Hochberg (1995) FDR-controlling step-up procedure.

    Used for: 5 P0 patterns × 3 horizons = 15 tests → BH corrected.

    Reference:
        Benjamini, Y. & Hochberg, Y. (1995). "Controlling the False
        Discovery Rate: A Practical and Powerful Approach to Multiple
        Testing." JRSS Series B 57 (1): 289-300.

    Algorithm (textbook step-up):
        1. Sort p-values ascending: p_(1) ≤ p_(2) ≤ ... ≤ p_(m).
        2. Find largest k such that p_(k) ≤ (k/m) × α.
        3. Reject H_0 for tests 1..k.
        4. Adjusted p_(i) = min over j≥i of (m/j) × p_(j), capped at 1.

    Args:
        p_values: array of raw p-values (one per test).
        alpha: family-wise FDR target. Default 0.05.

    Returns:
        ``(rejected, corrected_p)`` -- two parallel ``np.ndarray`` of the
        same length as ``p_values``, in the **original input order**.
        ``rejected[i]`` is ``True`` iff test ``i`` survives BH at
        ``alpha``. ``corrected_p[i]`` is the BH-adjusted p-value.
    """
    p_arr = np.asarray(p_values, dtype=float)
    m = len(p_arr)
    if m == 0:
        return np.array([], dtype=bool), np.array([], dtype=float)

    order = np.argsort(p_arr)              # ascending
    sorted_p = p_arr[order]
    ranks = np.arange(1, m + 1)            # 1..m

    # Adjusted p-value: monotone enforcement (textbook BH-adjusted).
    adjusted_sorted = sorted_p * m / ranks
    # Enforce monotone non-decreasing from the right tail.
    adjusted_sorted = np.minimum.accumulate(adjusted_sorted[::-1])[::-1]
    adjusted_sorted = np.minimum(adjusted_sorted, 1.0)

    # Restore original order.
    corrected_p = np.empty_like(adjusted_sorted)
    corrected_p[order] = adjusted_sorted

    # Reject test i iff its corrected p ≤ alpha.
    rejected = corrected_p <= alpha
    return rejected, corrected_p


# ---------------------------------------------------------------------------
# G2 — Deflated Sharpe Ratio (Bailey & López de Prado 2014)
# ---------------------------------------------------------------------------


def annualized_sharpe(
    returns_pct: Sequence[float],
    *,
    horizon_hours: int = 1,
    periods_per_year: float = 252 * 24,
) -> float:
    """Annualized Sharpe ratio (Sharpe 1966).

    ``SR = mean / std × sqrt(periods_per_year / horizon_hours)``.

    Used for: G2 input + W-0216 §15.1 F1 강화 (SR ≥ 1.0).

    Reference:
        Sharpe, W. F. (1966). "Mutual Fund Performance." Journal of
        Business 39 (1): 119-138.

    Args:
        returns_pct: per-period returns (decimals or percent — annualization
            is scale-invariant for the ratio).
        horizon_hours: bar size in hours. Default 1h.
        periods_per_year: trading periods per year. Default ``252 × 24``
            for 1h crypto bars. (4h bar → 252 × 6 = 1512.)

    Returns:
        Annualized Sharpe. Returns ``0.0`` when ``n < 2`` or ``std < 1e-9``
        (silent guard so this is composable with empty pattern slices).
    """
    arr = np.asarray(returns_pct, dtype=float)
    arr = arr[~np.isnan(arr)]
    if len(arr) < 2 or arr.std() < 1e-9:
        return 0.0
    return float(
        arr.mean() / arr.std() * np.sqrt(periods_per_year / horizon_hours)
    )


def deflated_sharpe(
    returns_pct: Sequence[float],
    *,
    n_trials: int,
    skew: float | None = None,
    kurt: float | None = None,
    periods_per_year: float = 252 * 24,
) -> float:
    """Deflated Sharpe Ratio (Bailey & López de Prado 2014).

    Adjusts the observed Sharpe for **selection bias** introduced by
    searching across ``n_trials`` candidates. ``DSR > 0`` means the
    pattern's Sharpe beats the expected maximum Sharpe under the null
    when ``n_trials`` random strategies are evaluated.

    Reference:
        Bailey, D. H. & López de Prado, M. (2014). "The Deflated Sharpe
        Ratio: Correcting for Selection Bias, Backtest Overfitting, and
        Non-Normality." J. Portfolio Management 40 (5): 94-107.

    Formula (eq. 10 in the paper):
        DSR = (SR - SR_threshold) / sigma_SR
        where:
            SR_threshold = sigma_SR × ((1-γ) Φ⁻¹(1 - 1/N) +
                                       γ Φ⁻¹(1 - 1/(N e)))
            sigma_SR² = (1 - skew·SR + (kurt-1)/4·SR²) / (n-1)
                       (Mertens 2002)
            γ = Euler-Mascheroni constant ≈ 0.5772156649
            N = n_trials

    NOTE — W-0225 §6.3 N-2 (n_trials guidance):
        ``n_trials`` MUST reflect the actual selection-bias search
        universe, **not** ``len(horizons)``. Per W-0220 §7.3 Table:

        ============================  ==========================
        Use case                       Recommended ``n_trials``
        ============================  ==========================
        F1 measurement (P0 verify)    ~500 (53 patterns × 3 horizons × ~3 phases)
        Single-pattern G2 gate        n_variants × n_horizons
        Wave 2 dev iteration          15 (low bar, dev only)
        Production F1 (conservative)  1000
        ============================  ==========================

        Default of ``len(horizons) = 3`` is severely under-corrected and
        produces false-positive selection bias claims. Caller MUST inject
        an explicit ``n_trials`` reflecting the real search universe. To
        prevent accidents, ``n_trials`` is keyword-only with **no default**
        — passing it is a hard requirement at the call site.

    Args:
        returns_pct: per-period returns.
        n_trials: REQUIRED. Number of strategy candidates evaluated to
            select this one (selection-bias multiplier). Must be ≥ 2.
        skew: optional pre-computed sample skewness. ``None`` → compute.
        kurt: optional pre-computed sample kurtosis (non-Fisher, Pearson).
            ``None`` → compute.
        periods_per_year: passed through to :func:`annualized_sharpe`.

    Returns:
        DSR (float). Returns ``0.0`` if ``n < 10`` (insufficient sample
        for skew/kurt estimation per Mertens 2002).

    Raises:
        ValueError: if ``n_trials < 2`` (DSR is undefined for a single
            trial).
    """
    if n_trials < 2:
        raise ValueError(
            f"n_trials must be ≥ 2 for DSR (got {n_trials}). "
            "See W-0220 §7.3 for guidance on selection-bias search "
            "universe sizing."
        )
    arr = np.asarray(returns_pct, dtype=float)
    arr = arr[~np.isnan(arr)]
    n = len(arr)
    if n < 10:
        return 0.0

    sr = annualized_sharpe(
        arr, horizon_hours=1, periods_per_year=periods_per_year
    )
    skew_val = (
        float(scipy_stats.skew(arr)) if skew is None else float(skew)
    )
    kurt_val = (
        float(scipy_stats.kurtosis(arr, fisher=False))
        if kurt is None
        else float(kurt)
    )

    # Mertens (2002) SR variance under non-normal returns.
    var_sr = (1.0 - skew_val * sr + (kurt_val - 1) / 4.0 * sr ** 2) / (
        n - 1
    )
    sigma_sr = float(np.sqrt(max(var_sr, 1e-12)))

    # Bailey & López de Prado (2014) eq. 10 selection-bias threshold.
    emc = 0.5772156649  # Euler-Mascheroni
    sr_threshold = sigma_sr * (
        (1 - emc) * scipy_stats.norm.ppf(1 - 1.0 / n_trials)
        + emc * scipy_stats.norm.ppf(1 - 1.0 / (n_trials * np.e))
    )
    return float((sr - sr_threshold) / sigma_sr)


# ---------------------------------------------------------------------------
# G4 — Bootstrap confidence interval (Efron 1979)
# ---------------------------------------------------------------------------


def bootstrap_ci(
    samples: Sequence[float],
    *,
    n_iter: int = 1000,
    ci: float = 0.95,
    statistic: str = "mean",
    seed: int = 42,
) -> tuple[float, float, float]:
    """Bootstrap percentile confidence interval (Efron 1979).

    Used for: G4 acceptance gate (CI excludes 0 → significant).

    Reference:
        Efron, B. (1979). "Bootstrap Methods: Another Look at the
        Jackknife." Annals of Statistics 7 (1): 1-26.

    Args:
        samples: iid sample (per-period returns).
        n_iter: number of bootstrap resamples. 1000 is Efron's minimum;
            10000 is more accurate but ~10× slower.
        ci: two-sided coverage. Default 0.95 → percentile [2.5, 97.5].
        statistic: ``"mean"`` or ``"median"``.
        seed: ``np.random.default_rng`` seed for reproducibility.
            Default ``42``.

    Returns:
        ``(lower, upper, point_estimate)``. Returns ``(0, 0, 0)`` if
        ``n < 10`` (sample too small for stable bootstrap).

    Raises:
        ValueError: if ``statistic`` is not ``"mean"`` / ``"median"``.
    """
    if statistic not in ("mean", "median"):
        raise ValueError(
            f"Unknown statistic: {statistic!r}. "
            "Supported: 'mean', 'median'."
        )
    arr = np.asarray(samples, dtype=float)
    arr = arr[~np.isnan(arr)]
    n = len(arr)
    if n < 10:
        return 0.0, 0.0, 0.0

    rng = np.random.default_rng(seed)
    # Vectorized resampling: shape (n_iter, n).
    indices = rng.integers(0, n, size=(n_iter, n))
    resamples = arr[indices]
    if statistic == "mean":
        boot_stats = resamples.mean(axis=1)
        point = float(arr.mean())
    else:
        boot_stats = np.median(resamples, axis=1)
        point = float(np.median(arr))

    alpha_lo = (1 - ci) / 2 * 100
    alpha_hi = (1 + ci) / 2 * 100
    lower = float(np.percentile(boot_stats, alpha_lo))
    upper = float(np.percentile(boot_stats, alpha_hi))
    return lower, upper, point


# ---------------------------------------------------------------------------
# W-0216 §15.1 F1 강화 helpers
# ---------------------------------------------------------------------------


def hit_rate(samples: Sequence[float]) -> float:
    """Fraction of strictly positive samples (W-0216 §15.1).

    Random baseline is 0.50 (assuming symmetric returns); F1 강화 demands
    ≥ 0.52.

    Args:
        samples: per-period returns.

    Returns:
        ``mean(samples > 0)`` after NaN drop. ``0.0`` for empty input.
    """
    arr = np.asarray(samples, dtype=float)
    arr = arr[~np.isnan(arr)]
    if len(arr) == 0:
        return 0.0
    return float((arr > 0).mean())


def mann_whitney_u(
    returns_a: np.ndarray,
    returns_b: np.ndarray,
) -> tuple[float, float]:
    """Mann-Whitney U test (W-0290 Phase 1 addition).

    Non-parametric alternative to Welch's t-test. Useful when return
    distributions are non-normal (common in crypto).

    Args:
        returns_a: first sample array.
        returns_b: second sample array.

    Returns:
        ``(U-statistic, p-value)`` two-sided test.
    """
    result = scipy_stats.mannwhitneyu(returns_a, returns_b, alternative="two-sided")
    return float(result.statistic), float(result.pvalue)


def profit_factor(
    samples: Sequence[float],
    *,
    cap: float = 999.0,
) -> float:
    """Profit factor: ``sum(positive) / |sum(negative)|`` (W-0216 §15.1).

    F1 강화 demands ≥ 1.2.

    W-0225 §6.3 N-1 fix (override PRD literal):
        The original PRD returned ``float('inf')`` when there were no
        negative samples, which raises ``ValueError`` in
        ``json.dumps(...)`` and crashes downstream F1 reports. This
        implementation **caps the result at ``cap`` (default 999.0)**,
        which is large enough to never be confused with a borderline
        ratio (1.0~5.0 typical) and is JSON-safe.

    Args:
        samples: per-period returns.
        cap: ceiling applied both to the all-positive degenerate case
            and to ordinary ``pos / |neg|`` ratios that exceed ``cap``.

    Returns:
        * ``0.0`` if all samples are zero / empty / all-negative-with-no-positive.
        * ``cap`` if all samples are positive (no negatives to divide by).
        * ``min(sum_pos / |sum_neg|, cap)`` otherwise.
    """
    arr = np.asarray(samples, dtype=float)
    arr = arr[~np.isnan(arr)]
    if len(arr) == 0:
        return 0.0
    pos = float(arr[arr > 0].sum())
    neg = float(arr[arr < 0].sum())
    if abs(neg) < 1e-9:
        # No negatives: degenerate case.
        # N-1 fix: cap instead of float('inf') so JSON serialization works.
        return cap if pos > 0 else 0.0
    return float(min(pos / abs(neg), cap))
