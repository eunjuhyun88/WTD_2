"""Cold-start detection for personalization."""
from __future__ import annotations

from personalization.types import UserPatternState

COLD_START_THRESHOLD: int = 10      # global: < 10 total verdicts
PER_PATTERN_COLD_START: int = 3     # per-pattern: < 3 verdicts
RESCUE_VALID_RATE: float = 0.05     # always-invalid threshold
RESCUE_MIN_N: int = 30              # min verdicts before rescue check


def is_cold(
    state: UserPatternState | None,
    pattern_slug: str | None = None,
) -> bool:
    """True if insufficient verdicts for personalization."""
    if state is None:
        return True
    return state.n_total < COLD_START_THRESHOLD


def needs_rescue(state: UserPatternState) -> bool:
    """True if valid_rate < 5% with at least 30 verdicts (always-invalid trap)."""
    if state.n_total < RESCUE_MIN_N:
        return False
    valid_bs = state.states.get("valid", None)
    if valid_bs is None:
        return False
    n_valid = valid_bs.alpha - 1.0  # subtract prior
    valid_rate = max(0.0, n_valid) / max(1, state.n_total)
    return valid_rate < RESCUE_VALID_RATE
