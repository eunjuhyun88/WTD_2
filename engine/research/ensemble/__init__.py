"""Ensemble strategies for autoresearch proposers."""
from __future__ import annotations

__all__ = [
    "SingleStrategy",
    "ParallelVoteStrategy",
    "RankFusionStrategy",
    "MoERegimeStrategy",
    "JudgeArbitrateStrategy",
    "RolePipelineStrategy",
    "TournamentStrategy",
    "SelfRefineStrategy",
    "DebateStrategy",
    "MoAStrategy",
]

from research.ensemble.single import SingleStrategy
from research.ensemble.parallel_vote import ParallelVoteStrategy
from research.ensemble.rank_fusion import RankFusionStrategy
from research.ensemble.moe_regime import MoERegimeStrategy
from research.ensemble.judge_arbitrate import JudgeArbitrateStrategy
from research.ensemble.role_pipeline import RolePipelineStrategy
from research.ensemble.tournament import TournamentStrategy
from research.ensemble.self_refine import SelfRefineStrategy
from research.ensemble.debate import DebateStrategy
from research.ensemble.moa import MoAStrategy
