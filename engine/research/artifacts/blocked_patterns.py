"""W-0365 T7: Auto-register patterns with negative P&L expectation.

Refinement trigger: mean_pnl_bps <= 0 OR sharpe_like < 0 (dry-run default).
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone

log = logging.getLogger(__name__)

DRY_RUN = os.getenv("BLOCKED_PATTERNS_DRY_RUN", "true").lower() != "false"


@dataclass
class BlockedPatternRecord:
    pattern_slug: str
    reason: str              # 'negative_mean_pnl' | 'negative_sharpe' | 'both'
    mean_pnl_bps: float | None
    sharpe_like: float | None
    n: int
    blocked_at: datetime


_blocked: dict[str, BlockedPatternRecord] = {}


def maybe_auto_block(
    pattern_slug: str,
    n: int,
    mean_pnl_bps: float | None,
    sharpe_like: float | None,
    min_n: int = 30,
) -> BlockedPatternRecord | None:
    """Evaluate and optionally register a pattern as blocked.

    Only acts when n >= min_n (N<30 = preliminary, not enough data).
    Returns the BlockedPatternRecord if blocked, None otherwise.
    """
    if n < min_n:
        return None
    if mean_pnl_bps is None and sharpe_like is None:
        return None

    negative_mean = mean_pnl_bps is not None and mean_pnl_bps <= 0
    negative_sharpe = sharpe_like is not None and sharpe_like < 0

    if not (negative_mean or negative_sharpe):
        return None

    reason = "both" if (negative_mean and negative_sharpe) else (
        "negative_mean_pnl" if negative_mean else "negative_sharpe"
    )
    record = BlockedPatternRecord(
        pattern_slug=pattern_slug,
        reason=reason,
        mean_pnl_bps=mean_pnl_bps,
        sharpe_like=sharpe_like,
        n=n,
        blocked_at=datetime.now(timezone.utc),
    )

    if DRY_RUN:
        log.warning(
            "[DRY-RUN] would block %s: %s (mean=%.1f, sharpe=%s, n=%d)",
            pattern_slug, reason, mean_pnl_bps or 0, sharpe_like, n,
        )
    else:
        _blocked[pattern_slug] = record
        log.warning(
            "AUTO-BLOCKED %s: %s (mean=%.1f, sharpe=%s, n=%d)",
            pattern_slug, reason, mean_pnl_bps or 0, sharpe_like, n,
        )

    return record


def is_blocked(pattern_slug: str) -> bool:
    return pattern_slug in _blocked


def get_blocked() -> list[BlockedPatternRecord]:
    return list(_blocked.values())
