"""W-0385: Formula evidence materializer.

Runs daily at 03:30 UTC (after backtest_stats_refresh at 03:00).

For each distinct filter_reason in blocked_candidates (last N days,
forward_24h filled), computes:
  - blocked_winner_rate: fraction where forward_24h >= DRAG_WIN_THRESHOLD
  - good_block_rate: fraction where forward_24h < 0 (losers correctly blocked)
  - drag_score: blocked_winner_rate × avg_missed_pnl  (bps)

Idempotent: UPSERT ON CONFLICT (scope_kind, scope_value, period_start).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from statistics import mean

log = logging.getLogger("engine.scanner.jobs.formula_evidence_materializer")

FORMULA_EVIDENCE_TABLE = "formula_evidence"
BLOCKED_CANDIDATES_TABLE = "blocked_candidates"

# "Winner": blocked signal would have returned ≥ this threshold (bps → fraction)
DRAG_WIN_THRESHOLD_BPS = float(os.environ.get("DRAG_WIN_THRESHOLD_BPS", "50"))
_THRESHOLD = DRAG_WIN_THRESHOLD_BPS / 10_000  # 0.005 for 50bps


def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def _compute(rows: list[dict], reason: str, period_start: str, period_end: str) -> dict:
    """Compute formula_evidence row for one filter_reason bucket."""
    n = len(rows)
    if n == 0:
        return {}

    # Winners = correctly blocked signals that still went on to profit
    winners = [r for r in rows if (r.get("forward_24h") or 0.0) >= _THRESHOLD]
    # Losers = signals correctly blocked (they went negative)
    losers = [r for r in rows if r.get("forward_24h") is not None and r["forward_24h"] < 0]

    blocked_winner_rate = len(winners) / n
    good_block_rate = len(losers) / n
    avg_missed = mean(r["forward_24h"] for r in winners) if winners else 0.0
    # drag_score in bps
    drag_score = blocked_winner_rate * avg_missed * 10_000

    return {
        "scope_kind": "filter_rule",
        "scope_value": reason,
        "period_start": period_start,
        "period_end": period_end,
        "sample_n": n,
        "blocked_winner_rate": round(blocked_winner_rate, 6),
        "good_block_rate": round(good_block_rate, 6),
        "drag_score": round(drag_score, 2),
        "avg_missed_pnl": round(avg_missed * 10_000, 2),
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


def materialize_all(period_days: int = 30, min_sample: int = 5) -> int:
    """Fetch blocked_candidates, group by reason, UPSERT formula_evidence.

    Returns number of rows upserted.
    """
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=period_days)).isoformat()
    # period_start = yesterday 00:00 UTC (aligns with daily materializer cadence)
    period_start = (
        now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
    ).isoformat()
    period_end = now.isoformat()

    sb = _sb()
    rows = (
        sb.table(BLOCKED_CANDIDATES_TABLE)
        .select("reason, source, forward_24h, score, p_win, blocked_at")
        .gte("blocked_at", cutoff)
        .not_.is_("forward_24h", "null")
        .execute()
        .data
    )

    if not rows:
        log.info("formula_evidence_materializer: no filled rows in last %dd", period_days)
        return 0

    # Group by reason
    by_reason: dict[str, list[dict]] = {}
    for r in rows:
        reason = r.get("reason") or "unknown"
        by_reason.setdefault(reason, []).append(r)

    upserted = 0
    for reason, group in by_reason.items():
        if len(group) < min_sample:
            log.debug("formula_evidence_materializer: skip %s (n=%d < min=%d)", reason, len(group), min_sample)
            continue

        evidence = _compute(group, reason, period_start, period_end)
        if not evidence:
            continue

        try:
            sb.table(FORMULA_EVIDENCE_TABLE).upsert(
                evidence,
                on_conflict="scope_kind,scope_value,period_start",
            ).execute()
            upserted += 1
        except Exception as exc:
            log.warning("formula_evidence_materializer: upsert failed for %s: %s", reason, exc)

    log.info("formula_evidence_materializer: upserted %d rows (from %d source rows)", upserted, len(rows))
    return upserted
