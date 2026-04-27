"""Validation modules for W-0214 MM Hunter Core (V-* track).

V-00 augment-only enforcement: ``engine/research/pattern_search.py`` is
READ-ONLY for this package. All measures are thin wrappers / extensions
that compose pattern_search primitives.

Modules:
    cv           -- V-01 (W-0217) PurgedKFold cross-validation.
    phase_eval   -- V-02 (W-0218) phase-conditional forward return (M1).
    sequence     -- V-04 (W-0222) sequence completion (M3) thin wrapper.
    stats        -- V-06 (W-0220) Welch + BH + DSR + Bootstrap.
"""

from .sequence import SequenceCompletionResult, measure_sequence_completion
from .phase_eval import PhaseConditionalReturn, measure_phase_conditional_return, measure_random_baseline

__all__ = [
    "SequenceCompletionResult",
    "measure_sequence_completion",
    "PhaseConditionalReturn",
    "measure_phase_conditional_return",
    "measure_random_baseline",
]
