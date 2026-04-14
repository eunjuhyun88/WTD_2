"""Market Judgment Engine — 4-layer pipeline.

    from market_engine import run_deep_analysis, SniperGate, l1_velocity
    from market_engine.l0_context import fetch_global_ctx
"""
from market_engine.pipeline import (
    run_deep_analysis,
    l1_velocity,
    l1_rsi_realtime,
    should_promote,
    SniperGate,
    DeepResult,
)
from market_engine.sector import compute_sector_scores
from market_engine.signal_history import SignalHistory
from market_engine.verdict import score_to_verdict
from market_engine.l0_context import fetch_global_ctx
from market_engine.types import GlobalCtx, LayerResult

__all__ = [
    "run_deep_analysis",
    "compute_sector_scores",
    "score_to_verdict",
    "l1_velocity",
    "l1_rsi_realtime",
    "should_promote",
    "SniperGate",
    "SignalHistory",
    "DeepResult",
    "fetch_global_ctx",
    "GlobalCtx",
    "LayerResult",
]
