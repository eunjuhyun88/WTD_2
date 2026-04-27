"""V-11 (W-0224) — Gate v2: G1~G7 + existing PromotionGatePolicy integration.

Augment-only: ``engine/research/pattern_search.py`` is NOT modified.

F-60 gate single source of truth::

    overall_pass = existing_7_pass AND new_G1_to_G7_pass

``existing_7_pass`` comes from :class:`~research.pattern_search.PromotionReport`
(decision="promote_candidate").  ``new_G1_to_G7_pass`` is evaluated here from a
:class:`~research.validation.pipeline.ValidationReport`.

Usage::

    from engine.research.validation.gates import evaluate_gate_v2, GateV2Config

    result = evaluate_gate_v2(
        validation_report=pipeline_result,
        existing_pass=promotion_report.decision == "promote_candidate",
    )
    if result.overall_pass:
        ...  # F-60 marketplace eligibility
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from engine.research.validation.pipeline import ValidationReport


# ---------------------------------------------------------------------------
# Gate enum
# ---------------------------------------------------------------------------


class Gate(str, Enum):
    """New acceptance gates introduced in V-11 (G1~G7)."""

    G1 = "G1"  # Welch t-stat ≥ t_min
    G2 = "G2"  # Deflated Sharpe > dsr_min
    G3 = "G3"  # Hit rate ≥ hit_rate_min
    G4 = "G4"  # Bootstrap CI lower bound > ci_lo_min
    G5 = "G5"  # Profit factor ≥ profit_factor_min
    G6 = "G6"  # CV fold pass count ≥ fold_pass_min
    G7 = "G7"  # Regime-conditional (optional, from V-05)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@dataclass
class GateV2Config:
    """Thresholds for G1~G7 gates (W-0224 §3.7).

    Attributes:
        t_min: minimum Welch t-stat for G1 (default 2.0).
        dsr_min: minimum deflated Sharpe for G2 (default 0.0).
        hit_rate_min: minimum hit rate for G3 (default 0.52).
        ci_lo_min: minimum bootstrap CI lower bound for G4 (default 0.0).
        profit_factor_min: minimum profit factor for G5 (default 1.2).
        fold_pass_min: minimum CV fold pass count for G6 (default 3).
        g7_enabled: whether G7 (regime-conditional) is evaluated (default
            ``False`` — requires V-05 result injected via ``g7_pass``).
    """

    t_min: float = 2.0
    dsr_min: float = 0.0
    hit_rate_min: float = 0.52
    ci_lo_min: float = 0.0
    profit_factor_min: float = 1.2
    fold_pass_min: int = 3
    g7_enabled: bool = False


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass
class GateV2Result:
    """Combined gate evaluation result.

    Attributes:
        existing_pass: ``True`` when PromotionReport.decision ==
            "promote_candidate".
        new_passes: Mapping of :class:`Gate` → bool for each evaluated gate.
        overall_pass: ``existing_pass AND all(new_passes.values())``.
        reason: Human-readable failure summary (empty string on full pass).
    """

    existing_pass: bool
    new_passes: dict[Gate, bool] = field(default_factory=dict)
    overall_pass: bool = False
    reason: str = ""

    @property
    def all_new_pass(self) -> bool:
        """True when every evaluated new gate passed."""
        return bool(self.new_passes) and all(self.new_passes.values())

    def to_dict(self) -> dict[str, Any]:
        return {
            "existing_pass": self.existing_pass,
            "new_passes": {g.value: v for g, v in self.new_passes.items()},
            "overall_pass": self.overall_pass,
            "reason": self.reason,
        }


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def evaluate_gate_v2(
    validation_report: ValidationReport,
    existing_pass: bool,
    *,
    config: GateV2Config | None = None,
    g7_pass: bool | None = None,
) -> GateV2Result:
    """Evaluate G1~G7 gates against a ValidationReport and existing gate.

    Args:
        validation_report: Output of
            :func:`~research.validation.pipeline.run_validation_pipeline`.
            The best (highest ``t_vs_b0``) horizon report is used for
            scalar gate thresholds.
        existing_pass: Whether the existing ``PromotionGatePolicy`` (7
            thresholds from ``pattern_search.py``) already passed.
            Typically ``promotion_report.decision == "promote_candidate"``.
        config: :class:`GateV2Config` overrides; uses defaults when ``None``.
        g7_pass: Pre-computed V-05 regime gate result.  Ignored unless
            ``config.g7_enabled=True``.

    Returns:
        :class:`GateV2Result` where ``overall_pass = existing_pass AND
        all new gates pass``.
    """
    cfg = config or GateV2Config()

    # Pick the best horizon report (highest t-stat) as the representative
    reports = validation_report.horizon_reports
    if not reports:
        return GateV2Result(
            existing_pass=existing_pass,
            new_passes={},
            overall_pass=False,
            reason="no horizon reports in ValidationReport",
        )

    best = max(reports, key=lambda r: r.t_vs_b0)

    new_passes: dict[Gate, bool] = {
        Gate.G1: best.t_vs_b0 >= cfg.t_min,
        Gate.G2: best.dsr > cfg.dsr_min,
        Gate.G3: best.hit_rate >= cfg.hit_rate_min,
        Gate.G4: best.bootstrap_ci[0] > cfg.ci_lo_min,
        Gate.G5: best.profit_factor >= cfg.profit_factor_min,
        Gate.G6: validation_report.fold_pass_count >= cfg.fold_pass_min,
    }

    if cfg.g7_enabled:
        new_passes[Gate.G7] = bool(g7_pass)

    failed_new = [g.value for g, v in new_passes.items() if not v]
    all_new = not failed_new
    overall = existing_pass and all_new

    reason_parts: list[str] = []
    if not existing_pass:
        reason_parts.append("existing_gate=FAIL")
    if failed_new:
        reason_parts.append(f"new_gates_failed={','.join(failed_new)}")

    return GateV2Result(
        existing_pass=existing_pass,
        new_passes=new_passes,
        overall_pass=overall,
        reason="; ".join(reason_parts),
    )
