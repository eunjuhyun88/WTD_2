"""W-0385 PR2: Formula evidence materializer.

Runs daily at 03:30 UTC (after backtest_stats_refresh at 03:00).
For each filter_reason code and pattern_slug, computes:
  blocked_winner_rate  — proportion of blocked signals that would have been TP
  good_block_rate      — proportion that would have been SL/timeout
  drag_score           — blocked_winner_rate * avg_missed_pnl (bps)

Uses UPSERT on (scope_kind, scope_value, period_start) for idempotency.
"""
from __future__ import annotations

import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean

log = logging.getLogger("engine.scanner.jobs.formula_evidence_materializer")

DRAG_WIN_THRESHOLD_BPS = float(os.environ.get("DRAG_WIN_THRESHOLD_BPS", "50"))


def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def _compute(
    rows: list[dict],
    scope_kind: str,
    scope_value: str,
    period_start: datetime,
    period_end: datetime,
) -> dict:
    threshold = DRAG_WIN_THRESHOLD_BPS / 10000
    fwd = [r["forward_24h"] for r in rows if r.get("forward_24h") is not None]
    if not fwd:
        return {}

    winners = [v for v in fwd if v >= threshold]
    losers = [v for v in fwd if v < 0]
    n = len(fwd)
    blocked_winner_rate = len(winners) / n
    good_block_rate = len(losers) / n
    avg_missed = mean(winners) if winners else 0.0

    return {
        "scope_kind": scope_kind,
        "scope_value": scope_value,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "sample_n": n,
        "blocked_winner_rate": round(blocked_winner_rate, 4),
        "good_block_rate": round(good_block_rate, 4),
        "avg_missed_pnl": round(avg_missed, 6),
        "drag_score": round(blocked_winner_rate * avg_missed * 10000, 2),
    }


def materialize_all(period_days: int = 30) -> int:
    """Compute formula_evidence for last N days. Returns rows upserted."""
    sb = _sb()
    now = datetime.now(timezone.utc)
    period_end = now.replace(hour=0, minute=0, second=0, microsecond=0)
    period_start = period_end - timedelta(days=period_days)

    rows = (
        sb.table("blocked_candidates")
        .select("reason, pattern_slug, forward_24h")
        .gte("blocked_at", period_start.isoformat())
        .lt("blocked_at", period_end.isoformat())
        .not_.is_("forward_24h", "null")
        .execute()
        .data
    )

    if not rows:
        log.info("formula_evidence_materializer: no filled rows in last %d days", period_days)
        return 0

    upserted = 0

    # by reason_code
    by_reason: dict[str, list] = defaultdict(list)
    for r in rows:
        if r.get("reason"):
            by_reason[r["reason"]].append(r)

    for reason, group in by_reason.items():
        ev = _compute(group, "filter_rule", reason, period_start, period_end)
        if not ev:
            continue
        try:
            sb.table("formula_evidence").upsert(
                ev, on_conflict="scope_kind,scope_value,period_start"
            ).execute()
            upserted += 1
        except Exception as exc:
            log.warning("formula_evidence upsert failed (reason=%s): %s", reason, exc)

    # by pattern_slug
    by_pattern: dict[str, list] = defaultdict(list)
    for r in rows:
        slug = r.get("pattern_slug")
        if slug:
            by_pattern[slug].append(r)

    for slug, group in by_pattern.items():
        ev = _compute(group, "pattern", slug, period_start, period_end)
        if not ev:
            continue
        try:
            sb.table("formula_evidence").upsert(
                ev, on_conflict="scope_kind,scope_value,period_start"
            ).execute()
            upserted += 1
        except Exception as exc:
            log.warning("formula_evidence upsert failed (slug=%s): %s", slug, exc)

    log.info(
        "formula_evidence_materializer: %d rows upserted (%d reason + %d pattern)",
        upserted,
        len(by_reason),
        len(by_pattern),
    )
    return upserted
