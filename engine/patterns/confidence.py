"""Phase confidence scoring for Alpha Universe patterns.

Computes a 0.0–1.0 confidence score for a PhaseCondition given the set of
blocks that fired in the current evaluation window.

Formula:
    disqualifier fired  → 0.0
    base  = (required_fired + any_groups_satisfied) / (n_required + n_groups)
    bonus = (optional_fired / max(n_optional, 1)) * 0.20
    score = min(base + bonus, 1.0)
"""
from __future__ import annotations

from patterns.types import PhaseCondition


def compute_phase_confidence(
    phase: PhaseCondition,
    blocks_fired: set[str],
) -> float:
    """Return confidence in [0.0, 1.0] for a phase given fired blocks.

    Args:
        phase:        PhaseCondition from a PatternObject phase.
        blocks_fired: Block names that evaluated True in the current window.

    Returns:
        0.0 if any disqualifier fired; otherwise a weighted score.
    """
    # Disqualifier: immediate veto
    for blk in phase.disqualifier_blocks:
        if blk in blocks_fired:
            return 0.0

    n_required = len(phase.required_blocks)
    n_groups = len(phase.required_any_groups)
    denominator = n_required + n_groups

    if denominator == 0:
        # No hard requirements — base is 1.0 if no disqualifier fired
        base = 1.0
    else:
        required_fired = sum(1 for b in phase.required_blocks if b in blocks_fired)
        groups_satisfied = sum(
            1 for group in phase.required_any_groups
            if any(b in blocks_fired for b in group)
        )
        base = (required_fired + groups_satisfied) / denominator

    n_optional = len(phase.optional_blocks)
    if n_optional > 0:
        optional_fired = sum(1 for b in phase.optional_blocks if b in blocks_fired)
        bonus = (optional_fired / n_optional) * 0.20
    else:
        bonus = 0.0

    return min(base + bonus, 1.0)
