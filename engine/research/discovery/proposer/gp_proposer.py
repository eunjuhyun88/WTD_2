"""Genetic programming proposer using DEAP."""
from __future__ import annotations

from dataclasses import dataclass

from research.discovery.proposer.schemas import ChangeProposal


@dataclass(frozen=True)
class GPProposerConfig:
    """Configuration for GP proposer."""

    population_size: int = 50
    n_generations: int = 5
    crossover_prob: float = 0.5
    mutation_prob: float = 0.2
    tournament_k: int = 3


class GPProposer:
    """Genetic programming proposer using filter tree expressions."""

    def __init__(self, config: GPProposerConfig | None = None) -> None:
        self.config = config or GPProposerConfig()

    def propose(self, rules_before: dict, eval_fn) -> list[ChangeProposal]:
        """Run GP and return top-k individuals as ChangeProposals.

        TODO: Phase 4 full implementation with DEAP.
        """
        return []
