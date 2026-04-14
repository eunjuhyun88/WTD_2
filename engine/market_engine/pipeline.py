"""Market Judgment Engine pipeline compatibility surface.

Thin orchestrator/re-export module for staged layer isolation.
"""
from __future__ import annotations

import time as _time

from market_engine.config import SIG_WINDOW_S
from market_engine.layers import (
    DeepResult,
    SniperGate,
    l1_rsi_realtime,
    l1_velocity,
    run_deep_analysis,
    should_promote,
)
from market_engine.sector import compute_sector_scores
from market_engine.signal_history import SignalHistory
from market_engine.verdict import score_to_verdict

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
    "_time",
    "SIG_WINDOW_S",
]


