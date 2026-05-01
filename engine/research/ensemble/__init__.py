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

from engine.research.ensemble.single import SingleStrategy
from engine.research.ensemble.parallel_vote import ParallelVoteStrategy
from engine.research.ensemble.rank_fusion import RankFusionStrategy
from engine.research.ensemble.moe_regime import MoERegimeStrategy
from engine.research.ensemble.judge_arbitrate import JudgeArbitrateStrategy
from engine.research.ensemble.role_pipeline import RolePipelineStrategy
from engine.research.ensemble.tournament import TournamentStrategy
from engine.research.ensemble.self_refine import SelfRefineStrategy
from engine.research.ensemble.debate import DebateStrategy
from engine.research.ensemble.moa import MoAStrategy
