"""W-0290 Phase 1 — 패턴별 검증 보고서."""
from __future__ import annotations
import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Literal

from .costs import CostModel, BINANCE_PERP_TAKER_15BPS_V1


PromotionLevel = Literal["catalog", "research_candidate", "validated", "f60_publishable", "deprecated"]


@dataclass
class RegimeSummary:
    regime: str
    n: int
    mean_net_bps: float
    t_stat: float | None = None
    enabled: bool = True


@dataclass
class GateResult:
    gate_id: str
    passed: bool
    value: float | None = None
    threshold: float | None = None
    reason: str = ""


@dataclass
class PatternValidationReport:
    """패턴별 검증 보고서 — 보고서 1장 포맷.

    4-level promotion verdict 포함.
    """
    # Identity
    pattern_slug: str
    pattern_version: str
    generated_at: datetime
    cost_model_id: str

    # Sample
    n_entries: int
    entry_source: Literal["ledger", "benchmark_proxy"]
    horizons_hours: list[int]

    # Core stats (best horizon 기준)
    mean_net_bps: float
    median_net_bps: float
    hit_rate: float
    payoff_ratio: float
    profit_factor: float
    mfe_bps: float
    mae_bps: float
    bootstrap_ci: tuple[float, float] = (0.0, 0.0)

    # Baseline t-stats
    t_vs_b0: float = 0.0
    t_vs_b1: float = 0.0
    t_vs_b2: float = 0.0
    bh_q: float = 1.0
    dsr: float = 0.0
    mann_whitney_p: float = 1.0

    # Triple barrier
    triple_barrier_tp_rate: float = 0.0
    triple_barrier_sl_rate: float = 0.0
    triple_barrier_timeout_rate: float = 0.0

    # Data hygiene
    hygiene_look_ahead_ok: bool = True
    hygiene_timezone_ok: bool = True
    hygiene_warmup_ok: bool = True
    hygiene_survivorship_flag: bool = False

    # CV
    fold_pass_count: int = 0

    # Regime
    regime_summary: list[RegimeSummary] = field(default_factory=list)

    # Gates
    gates: list[GateResult] = field(default_factory=list)

    # Promotion
    promotion_level: PromotionLevel = "catalog"
    promotion_reason: str = ""

    def _determine_promotion(self) -> PromotionLevel:
        """4-level 프로모션 레벨 자동 판정."""
        gates_by_id = {g.gate_id: g for g in self.gates}

        level: PromotionLevel = "catalog"

        # research_candidate: n≥30 + mean_net>0 + B0 beaten (t>0)
        if (
            self.n_entries >= 30
            and self.mean_net_bps > 0
            and self.t_vs_b0 > 0
        ):
            level = "research_candidate"

        # validated: n≥30 holdout + 4/5 CV folds + B1 beaten + B2 beaten + CI lower > 0
        if (
            level == "research_candidate"
            and self.fold_pass_count >= 4
            and self.t_vs_b1 > 0
            and self.t_vs_b2 > 0
            and self.bootstrap_ci[0] > 0
        ):
            level = "validated"

        # f60_publishable: validated + G1+G2 mandatory pass
        g1 = gates_by_id.get("G1")
        g2 = gates_by_id.get("G2")
        if (
            level == "validated"
            and g1 and g1.passed
            and g2 and g2.passed
        ):
            level = "f60_publishable"

        return level

    def finalize(self) -> "PatternValidationReport":
        """프로모션 레벨 확정."""
        self.promotion_level = self._determine_promotion()
        if self.promotion_level == "catalog":
            self.promotion_reason = f"n={self.n_entries} < 30 or mean_net={self.mean_net_bps:.1f}bps <= 0 or t_b0={self.t_vs_b0:.2f} <= 0"
        return self

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["generated_at"] = self.generated_at.isoformat()
        d["bootstrap_ci"] = list(self.bootstrap_ci)
        return d

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, default=str)

    def summary_text(self) -> str:
        """터미널 출력용 요약 1장."""
        lines = [
            f"Pattern: {self.pattern_slug} v{self.pattern_version}",
            f"Cost model: {self.cost_model_id}",
            "-" * 60,
            f"Data hygiene     look_ahead={'OK' if self.hygiene_look_ahead_ok else 'FAIL'}  "
            f"timezone={'OK' if self.hygiene_timezone_ok else 'FAIL'}  "
            f"warmup={'OK' if self.hygiene_warmup_ok else 'FAIL'}",
            "                 survivorship=WARN (corpus excludes delisted)",
            "-" * 60,
            f"Sample           n = {self.n_entries} phase-entry events",
            f"  Source         {self.entry_source}",
            f"  Horizons       {self.horizons_hours}h",
            "-" * 60,
            f"  mean net       {self.mean_net_bps:+.1f} bps",
            f"  median net     {self.median_net_bps:+.1f} bps",
            f"  hit rate       {self.hit_rate:.0%}",
            f"  payoff ratio   {self.payoff_ratio:.2f}",
            f"  MFE / MAE      {self.mfe_bps:+.1f} / {self.mae_bps:+.1f} bps",
            f"  vs B0 random:  t = {self.t_vs_b0:.2f}  BH q = {self.bh_q:.4f}",
            f"  vs B1 hold:    t = {self.t_vs_b1:.2f}",
            f"  vs B2 phase0:  t = {self.t_vs_b2:.2f}",
            f"  Bootstrap CI   [{self.bootstrap_ci[0]:+.1f}, {self.bootstrap_ci[1]:+.1f}] bps",
            f"  Mann-Whitney p = {self.mann_whitney_p:.4f}",
            "-" * 60,
            f"Triple barrier  TP={self.triple_barrier_tp_rate:.0%}  SL={self.triple_barrier_sl_rate:.0%}  "
            f"Timeout={self.triple_barrier_timeout_rate:.0%}",
            "-" * 60,
            f"DSR = {self.dsr:.3f}   fold_pass = {self.fold_pass_count}/5",
        ]
        if self.regime_summary:
            lines.append("-" * 60)
            lines.append("Regime (5-label)")
            for r in self.regime_summary:
                lines.append(
                    f"  {r.regime:<10} n={r.n:3d}  mean={r.mean_net_bps:+.1f} bps"
                    + (f"  t={r.t_stat:.1f}" if r.t_stat else "")
                )
        if self.gates:
            lines.append("-" * 60)
            lines.append(f"Gates  {sum(g.passed for g in self.gates)}/{len(self.gates)} PASS")
            for g in self.gates:
                status = "[PASS]" if g.passed else "[FAIL]"
                lines.append(f"  {status} {g.gate_id:<5} {g.reason}")
        lines += [
            "-" * 60,
            f"Promotion level: {self.promotion_level.upper()}",
            f"Reason: {self.promotion_reason or 'OK'}",
        ]
        return "\n".join(lines)
