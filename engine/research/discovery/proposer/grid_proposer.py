"""Optuna TPE grid proposer."""
from __future__ import annotations

from engine.research.proposer.schemas import ChangeProposal


class GridProposer:
    """Optuna TPE sampler for threshold space exploration."""

    def __init__(self, n_trials: int = 30) -> None:
        self.n_trials = n_trials

    def propose(self, rules_before: dict, eval_fn) -> list[ChangeProposal]:
        """Optuna TPE sweep on threshold space.

        TODO: Phase 4 full implementation with Optuna TPE.
        """
        return []
