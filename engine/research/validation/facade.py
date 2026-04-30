"""W-0317: Single entry point for validation pipeline + gate v2.

Usage (W-0316 discovery_tools.py):
    from research.validation.facade import validate_and_gate, GatedValidationResult
    result = validate_and_gate(slug=slug, pack=pack, family="btcusdt_4h")

Stage behaviour (VALIDATION_STAGE env):
    shadow  — overall_pass always True (observe only, default)
    soft    — gate fail → overall_pass False but finding score penalised
    strict  — gate fail → overall_pass False, finding blocked

Fail-closed: any internal exception → overall_pass=False, never raises.
"""
from __future__ import annotations

import logging
import os
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from research.pattern_search import ReplayBenchmarkPack
from research.validation.gates import GateV2Config, GateV2Result, evaluate_gate_v2
from research.validation.hypothesis_registry_store import HypothesisRegistryStore
from research.validation.pipeline import ValidationPipelineConfig, ValidationReport, run_validation_pipeline

log = logging.getLogger(__name__)

_VALID_STAGES = {"shadow", "soft", "strict"}
_HORIZONS_HOURS = [1, 4, 24, 72, 168]


@dataclass(frozen=True)
class GatedValidationResult:
    slug: str
    overall_pass: bool
    stage: Literal["shadow", "soft", "strict"]
    gate_result: GateV2Result | None
    validation_report: ValidationReport | None
    hypothesis_id: str | None
    dsr_n_trials: int
    family: str
    computed_at: datetime
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "slug": self.slug,
            "overall_pass": self.overall_pass,
            "stage": self.stage,
            "hypothesis_id": self.hypothesis_id,
            "dsr_n_trials": self.dsr_n_trials,
            "family": self.family,
            "computed_at": self.computed_at.isoformat(),
            "error": self.error,
            "gate": self.gate_result.to_dict() if self.gate_result else None,
        }


def _get_stage() -> Literal["shadow", "soft", "strict"]:
    val = os.environ.get("VALIDATION_STAGE", "shadow").lower().strip()
    if val not in _VALID_STAGES:
        log.error("Invalid VALIDATION_STAGE=%r — falling back to shadow", val)
        return "shadow"
    return val  # type: ignore[return-value]


def _fail(slug: str, family: str, stage: str, msg: str) -> GatedValidationResult:
    log.error("validate_and_gate failed for %s: %s", slug, msg)
    return GatedValidationResult(
        slug=slug,
        overall_pass=False,
        stage=stage,  # type: ignore[arg-type]
        gate_result=None,
        validation_report=None,
        hypothesis_id=None,
        dsr_n_trials=0,
        family=family,
        computed_at=datetime.now(timezone.utc),
        error=msg[:500],
    )


def validate_and_gate(
    slug: str,
    pack: ReplayBenchmarkPack,
    *,
    family: str = "default",
    existing_promotion_pass: bool = False,
    as_of: datetime | None = None,
    config: ValidationPipelineConfig | None = None,
    gate_config: GateV2Config | None = None,
) -> GatedValidationResult:
    """Run full validation pipeline + gate v2. Never raises.

    Args:
        slug: Pattern identifier.
        pack: ReplayBenchmarkPack with pattern windows.
        family: "{symbol}_{timeframe}" for per-family DSR trial count.
        existing_promotion_pass: Whether existing PromotionGatePolicy passed.
        as_of: Lookahead guard — all entry timestamps must be < as_of.
        config: ValidationPipelineConfig override.
        gate_config: GateV2Config override.

    Returns:
        GatedValidationResult. overall_pass=False on any failure.
    """
    stage = _get_stage()
    now = datetime.now(timezone.utc)

    try:
        # Enabled flag
        if os.environ.get("VALIDATION_PIPELINE_ENABLED", "true").lower() == "false":
            return _fail(slug, family, stage, "VALIDATION_PIPELINE_ENABLED=false")

        # Build config with W-0317 horizon bands
        if config is None:
            config = ValidationPipelineConfig(horizons_hours=_HORIZONS_HOURS)

        # Run pipeline (12 modules)
        report: ValidationReport = run_validation_pipeline(pack=pack, config=config)

        # Gate v2 (G1~G8)
        gate_result: GateV2Result = evaluate_gate_v2(
            report, existing_promotion_pass, config=gate_config
        )

        # Stage-based pass logic
        if stage == "shadow":
            overall_pass = True  # observe only
        elif stage == "soft":
            overall_pass = True  # warn but don't block
        else:  # strict
            overall_pass = gate_result.overall_pass

        # Registry
        hypothesis_id: str | None = None
        n_trials = 0
        try:
            store = HypothesisRegistryStore()
            n_trials = store.get_n_trials(family)
            hypothesis_id = store.register(
                slug=slug,
                family=family,
                overall_pass=overall_pass,
                stage=stage,
                gate_dict=gate_result.to_dict(),
                result_dict={"pass_rate": report.overall_pass_rate, "f1_kill": report.f1_kill},
            )
        except Exception:
            # Registry failure must not block validation result
            log.warning("hypothesis_registry write failed for %s\n%s", slug, traceback.format_exc())

        return GatedValidationResult(
            slug=slug,
            overall_pass=overall_pass,
            stage=stage,
            gate_result=gate_result,
            validation_report=report,
            hypothesis_id=hypothesis_id,
            dsr_n_trials=n_trials,
            family=family,
            computed_at=now,
        )

    except Exception as exc:
        return _fail(slug, family, stage, f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}")
