"""ThresholdAdapter: compute per-user threshold deltas via Beta-Binomial inference."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Mapping

from personalization.types import (
    ALL_VERDICT_LABELS,
    BetaState,
    ThresholdDelta,
    UserPatternState,
    VerdictLabel,
)

# Sensitivity coefficients per verdict label
_SENSITIVITY: dict[str, dict[str, float]] = {
    "stop_mul":     {"near_miss": 0.6, "too_early": 0.0, "too_late": 0.0,
                     "valid": -0.1, "invalid": -0.4},
    "entry_strict": {"near_miss": 0.0, "too_early": 0.5, "too_late": -0.2,
                     "valid": -0.1, "invalid": 0.2},
    "target_mul":   {"near_miss": 0.2, "too_early": 0.0, "too_late": 0.3,
                     "valid": 0.0, "invalid": -0.3},
}

_DELTA_MAX: float = 0.3
_N_SHRINK: int = 30
_ALPHA_PRIOR: float = 1.0
_BETA_PRIOR: float = 1.0


class ThresholdAdapter:
    """Compute threshold deltas from user verdict history."""

    def __init__(
        self,
        global_priors: dict[str, dict[str, float]],  # pattern_slug → {label → rate}
    ) -> None:
        self._global_priors = global_priors

    def _get_global_rate(self, pattern_slug: str, label: str) -> float:
        p = self._global_priors.get(pattern_slug, {})
        return p.get(label, 0.2)  # default 20% for all labels

    def compute_delta(
        self,
        state: UserPatternState,
        pattern_slug: str,
    ) -> ThresholdDelta:
        n = state.n_total
        shrinkage = min(1.0, n / _N_SHRINK)
        clamped = False

        def _compute_axis(axis: str) -> float:
            coeffs = _SENSITIVITY[axis]
            delta = 0.0
            for label, coeff in coeffs.items():
                bs = state.states.get(label)
                if bs is None:
                    continue
                n_label = bs.alpha - _ALPHA_PRIOR  # posterior events
                p_label = n_label / n if n > 0 else 0.0
                p_global = self._get_global_rate(pattern_slug, label)
                delta += coeff * (p_label - p_global) * shrinkage
            return delta

        stop_mul = _compute_axis("stop_mul")
        entry_strict = _compute_axis("entry_strict")
        target_mul = _compute_axis("target_mul")

        # Clamp
        if abs(stop_mul) > _DELTA_MAX:
            stop_mul = _DELTA_MAX * (1.0 if stop_mul > 0 else -1.0)
            clamped = True
        if abs(entry_strict) > _DELTA_MAX:
            entry_strict = _DELTA_MAX * (1.0 if entry_strict > 0 else -1.0)
            clamped = True
        if abs(target_mul) > _DELTA_MAX:
            target_mul = _DELTA_MAX * (1.0 if target_mul > 0 else -1.0)
            clamped = True

        return ThresholdDelta(
            stop_mul_delta=round(stop_mul, 6),
            entry_strict_delta=round(entry_strict, 6),
            target_mul_delta=round(target_mul, 6),
            n_used=n,
            shrinkage_factor=shrinkage,
            clamped=clamped,
        )

    def update_on_verdict(
        self,
        state: UserPatternState,
        verdict: VerdictLabel,
        at_iso: str,
    ) -> UserPatternState:
        """Update Beta posteriors using OvR (One-vs-Rest) Beta-Binomial model.

        For the observed verdict label: α += 1 (success).
        For all other labels: β += 1 (non-occurrence counter).
        This β accumulation is intentional — apply_decay uses both α and β to
        preserve per-label effective counts through concept-drift decay.
        compute_delta reads only α; β serves as decay state bookkeeping.
        """
        new_states = dict(state.states)
        existing = new_states.get(verdict, BetaState(alpha=_ALPHA_PRIOR, beta=_BETA_PRIOR))
        # Increment alpha (successes for this label)
        new_states[verdict] = BetaState(
            alpha=existing.alpha + 1.0,
            beta=existing.beta,
        )
        # For all other labels, increment their beta (failures = non-occurrence)
        for label in ALL_VERDICT_LABELS:
            if label != verdict:
                other = new_states.get(label, BetaState(alpha=_ALPHA_PRIOR, beta=_BETA_PRIOR))
                new_states[label] = BetaState(alpha=other.alpha, beta=other.beta + 1.0)

        return UserPatternState(
            user_id=state.user_id,
            pattern_slug=state.pattern_slug,
            states=new_states,
            n_total=state.n_total + 1,
            last_verdict_at=at_iso,
            decay_applied_at=state.decay_applied_at,
        )

    @staticmethod
    def initial_state(
        user_id: str,
        pattern_slug: str,
        global_priors: dict[str, float] | None = None,
        pseudo_count: float = 0.0,
    ) -> UserPatternState:
        """Create initial state.

        When pseudo_count > 0 and global_priors is provided, initializes with
        informed Beta priors (α = 1 + pseudo_count·p_global, β = 1 + pseudo_count·(1−p_global)).
        Default pseudo_count=0.0 → uniform Beta(1,1), backwards-compatible.
        """
        priors = global_priors or {}
        states = {
            label: BetaState(
                alpha=_ALPHA_PRIOR + pseudo_count * priors.get(label, 0.2),
                beta=_BETA_PRIOR + pseudo_count * (1.0 - priors.get(label, 0.2)),
            )
            for label in ALL_VERDICT_LABELS
        }
        return UserPatternState(
            user_id=user_id,
            pattern_slug=pattern_slug,
            states=states,
            n_total=0,
            last_verdict_at=None,
            decay_applied_at=None,
        )
