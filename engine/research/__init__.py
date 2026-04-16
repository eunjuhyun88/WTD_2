"""Engine research tools — experiment tracking, eval protocol, CLI."""

from .eval_protocol import feature_importance_report, walk_forward_eval
from .experiment import Experiment
from .objectives import (
    PatternReadinessPlan,
    PatternResearchObjective,
    build_pattern_readiness_plan,
    derive_pattern_research_objective,
)
from .pattern_refinement import PatternBoundedEvalConfig, run_pattern_bounded_eval
from .state_store import ResearchStateStore
from .tracker import ExperimentTracker
from .train_handoff import execute_train_candidate_handoff
from .worker_control import ResearchWorkerController

__all__ = [
    "Experiment",
    "ExperimentTracker",
    "PatternBoundedEvalConfig",
    "PatternReadinessPlan",
    "PatternResearchObjective",
    "ResearchStateStore",
    "ResearchWorkerController",
    "build_pattern_readiness_plan",
    "derive_pattern_research_objective",
    "execute_train_candidate_handoff",
    "run_pattern_bounded_eval",
    "walk_forward_eval",
    "feature_importance_report",
]
