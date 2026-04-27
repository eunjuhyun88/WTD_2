"""Validation modules for W-0214 MM Hunter Core (V-* track).

V-00 augment-only enforcement: ``engine/research/pattern_search.py`` is
READ-ONLY for this package. All measures are thin wrappers / extensions
that compose pattern_search primitives.

Modules:
    sequence -- V-04 (W-0222) sequence completion (M3) thin wrapper.
"""

from .sequence import SequenceCompletionResult, measure_sequence_completion

__all__ = [
    "SequenceCompletionResult",
    "measure_sequence_completion",
]
