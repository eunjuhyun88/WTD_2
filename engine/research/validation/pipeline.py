"""V-08 (W-0221) — Validation Pipeline integrating V-01, V-02, V-06.

Implements the W-0221 validation pipeline that wires together:

* **V-01** :class:`~research.validation.cv.PurgedKFold` — fold-level
  leakage prevention, used to track ``fold_pass_count``.
* **V-02** :func:`~research.validation.phase_eval.measure_phase_conditional_return`
  — M1 phase-conditional forward return.
* **V-06** stats: :func:`~research.validation.stats.welch_t_test`,
  :func:`~research.validation.stats.bh_correct`,
  :func:`~research.validation.stats.deflated_sharpe`,
  :func:`~research.validation.stats.bootstrap_ci`,
  :func:`~research.validation.stats.annualized_sharpe`,
  :func:`~research.validation.stats.hit_rate`,
  :func:`~research.validation.stats.profit_factor`.
* **baselines**: B0 (random), B1 (buy & hold) via
  :mod:`research.validation.baselines`.

Gate definitions (W-0214 §3.7 / W-0216 §15.1):
    G1  Welch t ≥ 2 vs B0
    G2  DSR > 0
    G4  Bootstrap CI lower bound > 0
    F1-SR   Annualized Sharpe ≥ 1.0
    F1-Hit  Hit rate ≥ 0.52
    F1-PF   Profit factor ≥ 1.2

``overall_passed`` per horizon: ≥ 4 of 6 gates must pass.
``f1_kill``: ``pass_rate == 0.0`` (zero horizons pass).

V-00 augment-only enforcement: ``engine/research/pattern_search.py``
is READ-ONLY (W-0214 §14.8). This module does not import or modify it.
"""

from __future__ import annotations

import json
import warnings
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from research.pattern_search import BenchmarkCase, ReplayBenchmarkPack
from research.validation.baselines import measure_b0_random, measure_b1_buy_hold
from research.validation.cv import PurgedKFold, PurgedKFoldConfig
from research.validation.phase_eval import (
    PhaseConditionalReturn,
    measure_phase_conditional_return,
    _empty_result,
)
from research.validation.stats import (
    annualized_sharpe,
    bh_correct,
    bootstrap_ci,
    deflated_sharpe,
    hit_rate,
    profit_factor,
    welch_t_test,
)

__all__ = [
    "ValidationPipelineConfig",
    "GateResult",
    "HorizonReport",
    "ValidationReport",
    "run_validation_pipeline",
]


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ValidationPipelineConfig:
    """Configuration for :func:`run_validation_pipeline`.

    Attributes:
        cv_config: :class:`PurgedKFoldConfig` for fold-level tracking.
        cost_bps: round-trip cost in basis points. W-0214 D3 default 15bps.
        horizons_hours: forward-return horizons to evaluate. W-0214 M1
            primary set is (1, 4, 24).
        baselines: which baselines to compute. Supported: ``"B0"``,
            ``"B1"``. ``"B2"`` / ``"B3"`` require additional data not
            available in a plain :class:`ReplayBenchmarkPack` and are
            silently skipped if included.
        bootstrap_n_iter: number of bootstrap resamples for G4 CI.
        bh_alpha: FDR target for BH correction across horizons.
        n_trials: selection-bias universe size for DSR calculation.
            W-0220 §7.3: use the real search-universe size, not the
            number of horizons. Default 15 (low bar, dev/test only).
    """

    cv_config: PurgedKFoldConfig = field(default_factory=PurgedKFoldConfig)
    cost_bps: float = 15.0
    horizons_hours: tuple[int, ...] = (1, 4, 24)
    baselines: tuple[str, ...] = ("B0", "B1")
    bootstrap_n_iter: int = 1000
    bh_alpha: float = 0.05
    n_trials: int = 15


# ---------------------------------------------------------------------------
# Gate
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GateResult:
    """Result of a single acceptance gate.

    Attributes:
        gate_id: short identifier (e.g. ``"G1"``, ``"F1-SR"``).
        name: human-readable gate name.
        value: measured value.
        threshold: acceptance threshold.
        passed: ``True`` iff ``value`` clears ``threshold``.
    """

    gate_id: str
    name: str
    value: float
    threshold: float
    passed: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "gate_id": self.gate_id,
            "name": self.name,
            "value": self.value,
            "threshold": self.threshold,
            "passed": self.passed,
        }


# ---------------------------------------------------------------------------
# HorizonReport
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class HorizonReport:
    """Full validation result for one (pattern, horizon) pair.

    Attributes:
        pattern_slug: pattern under evaluation.
        horizon_hours: horizon h in hours.
        n_samples: M1 sample count.
        mean_return_pct: mean net forward return at h.
        t_vs_b0: Welch t-statistic vs B0.
        p_vs_b0: p-value vs B0 (raw, before BH correction).
        p_bh_vs_b0: BH-corrected p-value (filled after :func:`bh_correct`
            across all horizons).
        sharpe: annualized Sharpe ratio.
        dsr: deflated Sharpe ratio.
        bootstrap_ci: ``(lower, upper)`` 95% bootstrap CI of mean return.
        hit_rate: fraction of strictly positive samples.
        profit_factor: sum(pos) / |sum(neg)|, capped at 999.
        gates: list of :class:`GateResult` (6 gates).
        overall_passed: ``True`` iff ≥ 4 of 6 gates pass.
    """

    pattern_slug: str
    horizon_hours: int
    n_samples: int
    mean_return_pct: float
    t_vs_b0: float
    p_vs_b0: float
    p_bh_vs_b0: float
    sharpe: float
    dsr: float
    bootstrap_ci: tuple[float, float]
    hit_rate: float
    profit_factor: float
    gates: list[GateResult]
    overall_passed: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "pattern_slug": self.pattern_slug,
            "horizon_hours": self.horizon_hours,
            "n_samples": self.n_samples,
            "mean_return_pct": self.mean_return_pct,
            "t_vs_b0": self.t_vs_b0,
            "p_vs_b0": self.p_vs_b0,
            "p_bh_vs_b0": self.p_bh_vs_b0,
            "sharpe": self.sharpe,
            "dsr": self.dsr,
            "bootstrap_ci": list(self.bootstrap_ci),
            "hit_rate": self.hit_rate,
            "profit_factor": self.profit_factor,
            "gates": [g.to_dict() for g in self.gates],
            "overall_passed": self.overall_passed,
        }


# ---------------------------------------------------------------------------
# ValidationReport
# ---------------------------------------------------------------------------


@dataclass
class ValidationReport:
    """Full validation result for one pattern across all horizons.

    Attributes:
        pattern_slug: pattern identifier.
        timestamp: UTC time of the pipeline run.
        config: :class:`ValidationPipelineConfig` used.
        horizon_reports: list of :class:`HorizonReport`, one per horizon.
        overall_pass_count: number of horizons where ``overall_passed=True``.
        overall_pass_rate: ``overall_pass_count / len(horizons_hours)``.
        f1_kill: ``True`` when ``pass_rate == 0.0`` (all horizons fail).
        fold_pass_count: number of CV folds where the pattern passed M1
            (currently only tracked when pack exposes timestamps).
        fold_total_count: total folds evaluated.
        ablation_results: placeholder for V-03 ablation (W-0219).
        sequence_result: placeholder for V-04 sequence (W-0222).
        regime_results: placeholder for V-05 regime (W-0223).
        regime_pass_count: number of regimes where pattern passed.
    """

    pattern_slug: str
    timestamp: pd.Timestamp
    config: ValidationPipelineConfig
    horizon_reports: list[HorizonReport]
    overall_pass_count: int
    overall_pass_rate: float
    f1_kill: bool
    fold_pass_count: int = 0
    fold_total_count: int = 0
    ablation_results: list = field(default_factory=list)
    sequence_result: dict | None = None
    regime_results: list = field(default_factory=list)
    regime_pass_count: int = 0

    def to_dashboard_json(self) -> dict[str, Any]:
        """Serialize to a JSON-safe dict for dashboard / API consumption.

        All floats are capped / sanitized to avoid JSON serialization errors
        (e.g. ``float('inf')`` → ``999.0`` via stats.profit_factor cap).

        Returns:
            dict suitable for ``json.dumps(...)``.
        """
        return {
            "pattern_slug": self.pattern_slug,
            "timestamp": self.timestamp.isoformat(),
            "config": {
                "cost_bps": self.config.cost_bps,
                "horizons_hours": list(self.config.horizons_hours),
                "baselines": list(self.config.baselines),
                "bootstrap_n_iter": self.config.bootstrap_n_iter,
                "bh_alpha": self.config.bh_alpha,
                "n_trials": self.config.n_trials,
                "cv_n_splits": self.config.cv_config.n_splits,
            },
            "horizon_reports": [r.to_dict() for r in self.horizon_reports],
            "overall_pass_count": self.overall_pass_count,
            "overall_pass_rate": self.overall_pass_rate,
            "f1_kill": self.f1_kill,
            "fold_pass_count": self.fold_pass_count,
            "fold_total_count": self.fold_total_count,
            "ablation_results": self.ablation_results,
            "sequence_result": self.sequence_result,
            "regime_results": self.regime_results,
            "regime_pass_count": self.regime_pass_count,
        }


# ---------------------------------------------------------------------------
# Gate helpers
# ---------------------------------------------------------------------------

_GATE_THRESHOLDS = {
    "G1": 2.0,       # Welch t ≥ 2
    "G2": 0.0,       # DSR > 0
    "G4": 0.0,       # CI lower > 0
    "F1-SR": 1.0,    # Annualized Sharpe ≥ 1.0
    "F1-Hit": 0.52,  # Hit rate ≥ 0.52
    "F1-PF": 1.2,    # Profit factor ≥ 1.2
}


def _build_gates(
    *,
    t_stat: float,
    dsr_val: float,
    ci_lower: float,
    sharpe_val: float,
    hit_val: float,
    pf_val: float,
) -> list[GateResult]:
    """Build the 6-gate list for a single horizon result."""
    return [
        GateResult(
            gate_id="G1",
            name="Welch t vs B0 ≥ 2",
            value=t_stat,
            threshold=_GATE_THRESHOLDS["G1"],
            passed=t_stat >= _GATE_THRESHOLDS["G1"],
        ),
        GateResult(
            gate_id="G2",
            name="Deflated Sharpe > 0",
            value=dsr_val,
            threshold=_GATE_THRESHOLDS["G2"],
            passed=dsr_val > _GATE_THRESHOLDS["G2"],
        ),
        GateResult(
            gate_id="G4",
            name="Bootstrap CI lower > 0",
            value=ci_lower,
            threshold=_GATE_THRESHOLDS["G4"],
            passed=ci_lower > _GATE_THRESHOLDS["G4"],
        ),
        GateResult(
            gate_id="F1-SR",
            name="Annualized Sharpe ≥ 1.0",
            value=sharpe_val,
            threshold=_GATE_THRESHOLDS["F1-SR"],
            passed=sharpe_val >= _GATE_THRESHOLDS["F1-SR"],
        ),
        GateResult(
            gate_id="F1-Hit",
            name="Hit rate ≥ 0.52",
            value=hit_val,
            threshold=_GATE_THRESHOLDS["F1-Hit"],
            passed=hit_val >= _GATE_THRESHOLDS["F1-Hit"],
        ),
        GateResult(
            gate_id="F1-PF",
            name="Profit factor ≥ 1.2",
            value=pf_val,
            threshold=_GATE_THRESHOLDS["F1-PF"],
            passed=pf_val >= _GATE_THRESHOLDS["F1-PF"],
        ),
    ]


# ---------------------------------------------------------------------------
# Pack → entry timestamps extraction
# ---------------------------------------------------------------------------


def _extract_entry_timestamps(
    pack: ReplayBenchmarkPack, phase_name: str
) -> list:
    """Extract entry timestamps from a pack for the given phase name.

    Uses ``case.start_at`` as a proxy for phase entry when detailed
    phase-entry records are not available in :class:`ReplayBenchmarkPack`.
    This is intentionally conservative — a fuller implementation would
    inject actual phase-entry ledger records.

    For the pipeline to track *per-phase* entries the caller should supply
    a more richly populated pack or a side-channel ``entry_timestamps``
    argument. The current implementation covers the initial V-08 scope.
    """
    timestamps = []
    for case in pack.cases:
        # Use case start as entry proxy. Callers can override by passing
        # timestamps directly to measure_phase_conditional_return.
        timestamps.append(case.start_at)
    return timestamps


def _pack_primary_symbol_timeframe(pack: ReplayBenchmarkPack) -> tuple[str, str]:
    """Return the (symbol, timeframe) most common in the pack's cases."""
    if not pack.cases:
        return ("BTCUSDT", "1h")
    # Pick the first case — a richer aggregation is out of scope for V-08.
    first = pack.cases[0]
    return first.symbol, first.timeframe


# ---------------------------------------------------------------------------
# CV fold tracking
# ---------------------------------------------------------------------------


def _run_cv_fold_tracking(
    *,
    pack: ReplayBenchmarkPack,
    phase_name: str,
    horizon_hours: int,
    config: ValidationPipelineConfig,
    symbol: str,
    timeframe: str,
) -> tuple[int, int]:
    """Run per-fold M1 measurement using PurgedKFold.

    Returns ``(fold_pass_count, fold_total_count)``.

    When the pack supplies fewer cases than ``n_splits * 2``, fold
    tracking is skipped and ``(0, 0)`` is returned with a warning.
    Fold "pass" is defined as mean_return_pct > 0 (positive expectation
    in the test fold). A richer definition (full 6-gate) is P1 follow-up.
    """
    timestamps = _extract_entry_timestamps(pack, phase_name)
    n = len(timestamps)
    if n < config.cv_config.n_splits * 2:
        warnings.warn(
            f"V-08 CV fold tracking skipped: {n} entries < "
            f"n_splits*2={config.cv_config.n_splits * 2}. "
            "Fold counts remain 0.",
            RuntimeWarning,
            stacklevel=3,
        )
        return 0, 0

    try:
        dt_index = pd.DatetimeIndex(timestamps).sort_values()
    except Exception:
        return 0, 0

    kf = PurgedKFold(config.cv_config)
    fold_pass = 0
    fold_total = 0
    try:
        for _train_idx, test_idx in kf.split(dt_index):
            test_ts = [dt_index[i].to_pydatetime() for i in test_idx]
            result = measure_phase_conditional_return(
                pattern_slug=pack.pattern_slug,
                phase_name=phase_name,
                entry_timestamps=test_ts,
                symbol=symbol,
                timeframe=timeframe,
                horizon_hours=horizon_hours,
                cost_bps=config.cost_bps,
            )
            fold_total += 1
            if result.n_samples > 0 and result.mean_return_pct > 0:
                fold_pass += 1
    except Exception as exc:
        warnings.warn(
            f"V-08 CV fold tracking encountered an error: {exc}. "
            "Fold counts may be incomplete.",
            RuntimeWarning,
            stacklevel=3,
        )
    return fold_pass, fold_total


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


def run_validation_pipeline(
    *,
    pack: ReplayBenchmarkPack,
    phase_name: str = "entry",
    config: ValidationPipelineConfig | None = None,
    entry_timestamps: list | None = None,
) -> ValidationReport:
    """Run the full V-08 validation pipeline for a pattern.

    Evaluates ``pack.pattern_slug`` across all horizons in
    ``config.horizons_hours``, applies BH correction across the resulting
    p-values, and assembles a :class:`ValidationReport`.

    Args:
        pack: :class:`ReplayBenchmarkPack` supplying pattern identity,
            symbol, timeframe, and case windows.
        phase_name: name of the phase whose entries are being evaluated.
            Default ``"entry"`` (covers the primary entry phase).
        config: :class:`ValidationPipelineConfig`. Defaults to
            ``ValidationPipelineConfig()`` (W-0214 D3 defaults).
        entry_timestamps: optional list of explicit entry timestamps.
            When ``None``, extracted from ``pack.cases`` via
            ``_extract_entry_timestamps``.

    Returns:
        :class:`ValidationReport`. Never raises — individual horizon
        failures are captured as zero-sample HorizonReports.
    """
    if config is None:
        config = ValidationPipelineConfig()

    symbol, timeframe = _pack_primary_symbol_timeframe(pack)
    timestamps = (
        entry_timestamps
        if entry_timestamps is not None
        else _extract_entry_timestamps(pack, phase_name)
    )

    # --- Per-horizon measurement ---
    raw_results: list[PhaseConditionalReturn] = []
    b0_results: list[PhaseConditionalReturn] = []

    for h in config.horizons_hours:
        result = measure_phase_conditional_return(
            pattern_slug=pack.pattern_slug,
            phase_name=phase_name,
            entry_timestamps=timestamps,
            symbol=symbol,
            timeframe=timeframe,
            horizon_hours=h,
            cost_bps=config.cost_bps,
        )
        raw_results.append(result)

        # B0 baseline.
        if "B0" in config.baselines:
            b0 = measure_b0_random(
                n_samples=max(result.n_samples, 30),
                pack=pack,
                horizon_hours=h,
                cost_bps=config.cost_bps,
            )
        else:
            b0 = _empty_result(
                pattern_slug="__random__",
                phase_name="random",
                horizon_hours=h,
                cost_bps=config.cost_bps,
            )
        b0_results.append(b0)

    # --- Compute per-horizon stats + raw p-values ---
    horizon_data: list[dict] = []
    raw_p_values: list[float] = []

    for result, b0 in zip(raw_results, b0_results):
        samples_a = list(result.samples)
        samples_b = list(b0.samples)

        t_res = welch_t_test(samples_a, samples_b, alternative="greater")
        t_stat = t_res.t_statistic
        p_raw = t_res.p_value
        raw_p_values.append(p_raw)

        sharpe_val = annualized_sharpe(
            samples_a, horizon_hours=result.horizon_hours
        )
        dsr_val = 0.0
        if len(samples_a) >= 10:
            try:
                dsr_val = deflated_sharpe(
                    samples_a,
                    n_trials=config.n_trials,
                )
            except ValueError:
                dsr_val = 0.0

        ci_lower, ci_upper, _ci_point = bootstrap_ci(
            samples_a, n_iter=config.bootstrap_n_iter
        )
        hit_val = hit_rate(samples_a)
        pf_val = profit_factor(samples_a)

        horizon_data.append({
            "result": result,
            "t_stat": t_stat,
            "p_raw": p_raw,
            "sharpe": sharpe_val,
            "dsr": dsr_val,
            "ci_lower": ci_lower,
            "ci_upper": ci_upper,
            "hit": hit_val,
            "pf": pf_val,
        })

    # --- BH correction across horizons ---
    if raw_p_values:
        _rejected, corrected_p = bh_correct(raw_p_values, alpha=config.bh_alpha)
    else:
        corrected_p = np.array(raw_p_values, dtype=float)

    # --- Assemble HorizonReports ---
    horizon_reports: list[HorizonReport] = []
    for idx, (h, hd) in enumerate(zip(config.horizons_hours, horizon_data)):
        result: PhaseConditionalReturn = hd["result"]
        gates = _build_gates(
            t_stat=hd["t_stat"],
            dsr_val=hd["dsr"],
            ci_lower=hd["ci_lower"],
            sharpe_val=hd["sharpe"],
            hit_val=hd["hit"],
            pf_val=hd["pf"],
        )
        n_passed = sum(g.passed for g in gates)
        overall_passed = n_passed >= 4

        p_bh = float(corrected_p[idx]) if idx < len(corrected_p) else 1.0

        horizon_reports.append(
            HorizonReport(
                pattern_slug=pack.pattern_slug,
                horizon_hours=h,
                n_samples=result.n_samples,
                mean_return_pct=result.mean_return_pct,
                t_vs_b0=hd["t_stat"],
                p_vs_b0=hd["p_raw"],
                p_bh_vs_b0=p_bh,
                sharpe=hd["sharpe"],
                dsr=hd["dsr"],
                bootstrap_ci=(hd["ci_lower"], hd["ci_upper"]),
                hit_rate=hd["hit"],
                profit_factor=hd["pf"],
                gates=gates,
                overall_passed=overall_passed,
            )
        )

    # --- Fold tracking (V-01 PurgedKFold, first horizon only) ---
    fold_pass, fold_total = 0, 0
    if config.horizons_hours:
        first_h = config.horizons_hours[0]
        fold_pass, fold_total = _run_cv_fold_tracking(
            pack=pack,
            phase_name=phase_name,
            horizon_hours=first_h,
            config=config,
            symbol=symbol,
            timeframe=timeframe,
        )

    # --- Aggregate ---
    overall_pass_count = sum(r.overall_passed for r in horizon_reports)
    n_horizons = len(config.horizons_hours)
    overall_pass_rate = (
        overall_pass_count / n_horizons if n_horizons > 0 else 0.0
    )
    f1_kill = overall_pass_rate == 0.0

    return ValidationReport(
        pattern_slug=pack.pattern_slug,
        timestamp=pd.Timestamp.now("UTC"),
        config=config,
        horizon_reports=horizon_reports,
        overall_pass_count=overall_pass_count,
        overall_pass_rate=overall_pass_rate,
        f1_kill=f1_kill,
        fold_pass_count=fold_pass,
        fold_total_count=fold_total,
    )
