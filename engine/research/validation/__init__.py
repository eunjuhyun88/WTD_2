"""Validation modules for W-0214 MM Hunter Core (V-* track).

V-00 augment-only enforcement: ``engine/research/pattern_search.py`` is
READ-ONLY for this package. All measures are thin wrappers / extensions
that compose pattern_search primitives.

Modules:
    cv           -- V-01 (W-0217) PurgedKFold cross-validation.
    phase_eval   -- V-02 (W-0218) phase-conditional forward return (M1).
    sequence     -- V-04 (W-0222) sequence completion (M3) thin wrapper.
    stats        -- V-06 (W-0220) Welch + BH + DSR + Bootstrap.
    regime       -- V-05 (W-0223) regime-conditional return + G7 gate.
    gates        -- V-11 (W-0224) GateV2 G1~G7 integration.
"""

from .cv import PurgedKFold, PurgedKFoldConfig
from .sequence import SequenceCompletionResult, measure_sequence_completion
from .phase_eval import PhaseConditionalReturn, measure_phase_conditional_return, measure_random_baseline
from .ablation import AblationResult, run_ablation, get_signal_list
from .pipeline import (
    ValidationPipelineConfig,
    ValidationReport,
    HorizonReport,
    GateResult,
    run_validation_pipeline,
)
from .regime import (
    RegimeLabel,
    RegimeGateResult,
    RegimeConditionalReturn,
    label_regime,
    measure_regime_conditional_return,
)
from .gates import (
    Gate,
    GateV2Config,
    GateV2Result,
    evaluate_gate_v2,
)
from .runner import run_full_validation
from .hypothesis_registry_store import HypothesisRegistryStore

__all__ = [
    # cv (V-01)
    "PurgedKFold",
    "PurgedKFoldConfig",
    # pipeline (V-08)
    "ValidationPipelineConfig",
    "ValidationReport",
    "HorizonReport",
    "GateResult",
    "run_validation_pipeline",
    # phase_eval (V-02)
    "PhaseConditionalReturn",
    "measure_phase_conditional_return",
    "measure_random_baseline",
    # sequence (V-04)
    "SequenceCompletionResult",
    "measure_sequence_completion",
    # ablation (V-06)
    "AblationResult",
    "run_ablation",
    "get_signal_list",
    # regime (V-05)
    "RegimeLabel",
    "RegimeGateResult",
    "RegimeConditionalReturn",
    "label_regime",
    "measure_regime_conditional_return",
    # gates (V-11)
    "Gate",
    "GateV2Config",
    "GateV2Result",
    "evaluate_gate_v2",
    # runner (W-0280)
    "run_full_validation",
    # hypothesis registry
    "HypothesisRegistryStore",
]
