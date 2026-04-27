"""V-03 (W-0219) — Signal Ablation (M2).

Leave-one-out ablation: removes each building block from a PhaseCondition
and re-measures M1 forward return to identify critical vs marginal signals.

W-0214 §3.2 M2 + §3.7 G5:
  critical  → |drop| ≥ 0.3% at 4h horizon (Tishby IB positive contribution)
  marginal  → |drop| < 0.1%              (vocabulary trim candidate)

V-00 augment-only: pattern_search.py is read-only (W-0214 §14.8).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, replace

from patterns.types import PatternObject, PhaseCondition
from research.pattern_search import ReplayBenchmarkPack

from .phase_eval import PhaseConditionalReturn, measure_phase_conditional_return
from .stats import welch_t_test

__all__ = [
    "AblationResult",
    "run_ablation",
    "get_signal_list",
]

log = logging.getLogger(__name__)

_CRITICAL_THRESHOLD_PCT: float = 0.3
_MARGINAL_THRESHOLD_PCT: float = 0.1
_SKIP_RATIO_THRESHOLD: float = 0.5


@dataclass(frozen=True)
class AblationResult:
    """M2 result for a single signal leave-one-out experiment."""

    signal_id: str
    pattern_slug: str
    phase_name: str
    horizon_hours: int
    baseline_mean_pct: float       # M1 mean with all signals
    ablated_mean_pct: float        # M1 mean without this signal
    drop_pct: float                # baseline - ablated (positive = signal helped)
    n_baseline: int
    n_ablated: int
    is_critical: bool              # |drop| >= _CRITICAL_THRESHOLD_PCT
    is_marginal: bool              # |drop| <  _MARGINAL_THRESHOLD_PCT
    t_statistic: float | None      # Welch t (None if n < 3)
    p_value: float | None


def get_signal_list(phase: PhaseCondition) -> list[str]:
    """Return ablatable signal IDs for a phase.

    Includes required_blocks (gating) and soft_blocks (score-bonus),
    deduplicating in case a block appears in both.
    """
    seen: set[str] = set()
    result: list[str] = []
    for block_id in list(phase.required_blocks) + list(phase.soft_blocks):
        if block_id not in seen:
            seen.add(block_id)
            result.append(block_id)
    return result


def _remove_signal(phase: PhaseCondition, signal_id: str) -> PhaseCondition:
    """Return a new PhaseCondition with signal_id removed from required/soft."""
    return replace(
        phase,
        required_blocks=[b for b in phase.required_blocks if b != signal_id],
        soft_blocks=[b for b in phase.soft_blocks if b != signal_id],
    )


def _make_pattern_without_signal(
    pattern: PatternObject,
    phase_idx: int,
    signal_id: str,
) -> PatternObject:
    """Return a copy of pattern with signal_id removed from phases[phase_idx]."""
    new_phases = list(pattern.phases)
    new_phases[phase_idx] = _remove_signal(new_phases[phase_idx], signal_id)
    return replace(pattern, phases=new_phases)


def run_ablation(
    pattern: PatternObject,
    pack: ReplayBenchmarkPack,
    phase_idx: int = 0,
    *,
    horizon_hours: int = 4,
    cost_bps: float = 15.0,
    bars_per_hour: int = 1,
    critical_threshold_pct: float = _CRITICAL_THRESHOLD_PCT,
    marginal_threshold_pct: float = _MARGINAL_THRESHOLD_PCT,
    skip_ratio_threshold: float = _SKIP_RATIO_THRESHOLD,
) -> list[AblationResult]:
    """Leave-one-out signal ablation. W-0214 §3.2 M2.

    For each building block in phases[phase_idx].required_blocks +
    soft_blocks, removes it from the phase definition and re-measures
    M1 forward return via V-02 phase_eval.

    Args:
        pattern: PatternObject to ablate.
        pack: ReplayBenchmarkPack for kline data.
        phase_idx: which phase to ablate (default 0).
        horizon_hours: forward return horizon (W-0214 §3.2 default 4h).
        cost_bps: round-trip cost in bps (W-0214 D3 = 15).
        critical_threshold_pct: |drop| >= this → is_critical.
        marginal_threshold_pct: |drop| <  this → is_marginal.
        skip_ratio_threshold: skip result if ablated_n/baseline_n < this.

    Returns:
        One AblationResult per ablatable signal. Empty list if phase has
        no signals or phase_idx is out of range.
    """
    if phase_idx >= len(pattern.phases):
        raise ValueError(
            f"phase_idx {phase_idx} out of range: pattern '{pattern.slug}' "
            f"has {len(pattern.phases)} phases"
        )

    phase = pattern.phases[phase_idx]
    signal_list = get_signal_list(phase)

    if not signal_list:
        return []

    # Baseline: all signals present
    baseline: PhaseConditionalReturn = measure_phase_conditional_return(
        pattern=pattern,
        pack=pack,
        horizon_hours=horizon_hours,
        cost_bps=cost_bps,
        bars_per_hour=bars_per_hour,
    )

    results: list[AblationResult] = []

    for sig_id in signal_list:
        ablated_pattern = _make_pattern_without_signal(pattern, phase_idx, sig_id)
        ablated: PhaseConditionalReturn = measure_phase_conditional_return(
            pattern=ablated_pattern,
            pack=pack,
            horizon_hours=horizon_hours,
            cost_bps=cost_bps,
            bars_per_hour=bars_per_hour,
        )

        # Skip if sample sizes diverge too much (B2/B3 edge case)
        if baseline.n_samples > 0:
            ratio = ablated.n_samples / max(baseline.n_samples, 1)
            if ratio < skip_ratio_threshold:
                log.warning(
                    "signal=%s: ablated n=%d vs baseline n=%d (ratio=%.2f < %.2f) — skipped",
                    sig_id, ablated.n_samples, baseline.n_samples,
                    ratio, skip_ratio_threshold,
                )
                continue

        drop = baseline.mean_return_pct - ablated.mean_return_pct

        t_stat: float | None = None
        p_val: float | None = None
        if baseline.n_samples >= 3 and ablated.n_samples >= 3:
            try:
                tresult = welch_t_test(
                    list(baseline.samples),
                    list(ablated.samples),
                    alternative="two-sided",
                )
                t_stat = tresult.t_statistic
                p_val = tresult.p_value
            except Exception as exc:
                log.debug("welch_t_test failed for signal=%s: %s", sig_id, exc)

        results.append(AblationResult(
            signal_id=sig_id,
            pattern_slug=pattern.slug,
            phase_name=phase.phase_id,
            horizon_hours=horizon_hours,
            baseline_mean_pct=baseline.mean_return_pct,
            ablated_mean_pct=ablated.mean_return_pct,
            drop_pct=drop,
            n_baseline=baseline.n_samples,
            n_ablated=ablated.n_samples,
            is_critical=abs(drop) >= critical_threshold_pct,
            is_marginal=abs(drop) < marginal_threshold_pct,
            t_statistic=t_stat,
            p_value=p_val,
        ))

    return results
