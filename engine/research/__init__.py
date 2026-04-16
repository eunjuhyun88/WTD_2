"""Engine research tools — experiment tracking, eval protocol, CLI."""

from .eval_protocol import feature_importance_report, walk_forward_eval
from .experiment import Experiment
from .objectives import (
    PatternReadinessDeficit,
    PatternReadinessPlan,
    PatternReadinessWarning,
    PatternResearchObjective,
    build_pattern_readiness_plan,
    derive_pattern_research_objective,
)
from .pattern_refinement import PatternBoundedEvalConfig, run_pattern_bounded_eval
from .reporting import build_research_run_report, research_run_report_path, write_research_run_report
from .state_store import ResearchStateStore
from .tracker import ExperimentTracker
from .train_handoff import execute_train_candidate_handoff
from .worker_control import ResearchWorkerController

__all__ = [
    "Experiment",
    "ExperimentTracker",
    "PatternBoundedEvalConfig",
    "PatternReadinessDeficit",
    "PatternReadinessPlan",
    "PatternReadinessWarning",
    "PatternResearchObjective",
    "ResearchStateStore",
    "ResearchWorkerController",
    "build_research_run_report",
    "build_pattern_readiness_plan",
    "derive_pattern_research_objective",
    "execute_train_candidate_handoff",
    "research_run_report_path",
    "run_pattern_bounded_eval",
    "write_research_run_report",
    "walk_forward_eval",
    "feature_importance_report",
]
