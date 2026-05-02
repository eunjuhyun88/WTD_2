"""W-0382: Supabase store for blocked_candidates (NEUTRAL / filtered signals).

Records every signal that was discarded before emission so counterfactual
analysis can measure what the filter cost us.
"""
from __future__ import annotations

import logging
import os
from typing import Literal

log = logging.getLogger("engine.research.blocked_candidate_store")

BLOCKED_CANDIDATES_TABLE = "blocked_candidates"

FilterReason = Literal[
    "below_min_conviction",
    "timing_conflict",
    "regime_mismatch",
    "heat_too_high",
    "insufficient_liquidity",
    "spread_too_wide",
    "duplicate_signal",
    "conflicting_signals",
    "stale_context",
]


def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def insert_blocked_candidate(
    *,
    symbol: str,
    timeframe: str = "1h",
    direction: str,
    reason: FilterReason,
    score: float | None = None,
    p_win: float | None = None,
) -> None:
    """Fire-and-forget insert. Logs on failure, never raises."""
    row: dict = {
        "symbol": symbol,
        "timeframe": timeframe,
        "direction": direction,
        "reason": reason,
    }
    if score is not None:
        row["score"] = score
    if p_win is not None:
        row["p_win"] = p_win

    try:
        sb = _sb()
        sb.table(BLOCKED_CANDIDATES_TABLE).insert(row).execute()
    except Exception as exc:
        log.warning("blocked_candidate insert failed (%s %s %s): %s", symbol, timeframe, reason, exc)
