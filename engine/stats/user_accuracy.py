"""User Verdict Accuracy Engine — H-08.

Measures how well a user's verdict labels align with actual market outcomes.
Powers H-07 F-60 Gate's accuracy threshold check.

Design:
- 5-cat verdict: valid | invalid | near_miss | too_early | too_late
- "correct" = (valid → success) OR (invalid → failure)
- "soft labels" (near_miss, too_early, too_late) counted in resolved but not in correct
- TTL: 5 minutes (same as PatternStatsEngine)
- DB: pattern_ledger_records, 2-query approach (verdict → outcome join in Python)
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger("engine.stats.user_accuracy")

_CACHE_TTL_SECONDS = 300  # 5 minutes
_F60_GATE_MIN_COUNT = 200
_F60_GATE_MIN_ACCURACY = 0.55

# Verdict labels that can be correct/incorrect vs outcome
_HARD_LABELS = {"valid"}                              # expect outcome=success
_INVALID_LABEL = "invalid"                            # expect outcome=failure
_SOFT_LABELS = {"near_miss", "too_early", "too_late"} # timing failures — resolved but not correct


@dataclass
class UserAccuracy:
    """Per-user verdict accuracy summary."""
    user_id: str
    verdict_count: int = 0          # total verdicts given
    resolved_count: int = 0         # verdicts where outcome is resolved (not pending)
    correct_count: int = 0          # resolved verdicts that matched outcome
    accuracy: float = 0.0           # correct / resolved
    gate_eligible: bool = False     # resolved >= 200 AND accuracy >= 0.55
    remaining_for_gate: int = 0     # max(0, 200 - resolved_count)
    breakdown: dict[str, int] = field(default_factory=dict)
    computed_at: float = field(default_factory=time.time)

    def is_fresh(self) -> bool:
        return (time.time() - self.computed_at) < _CACHE_TTL_SECONDS


@dataclass
class _AccuracyCache:
    by_user: dict[str, UserAccuracy] = field(default_factory=dict)

    def get(self, user_id: str) -> UserAccuracy | None:
        entry = self.by_user.get(user_id)
        if entry and entry.is_fresh():
            return entry
        return None

    def set(self, acc: UserAccuracy) -> None:
        self.by_user[acc.user_id] = acc


_cache = _AccuracyCache()


def _safe_div(a: int, b: int) -> float:
    return a / b if b > 0 else 0.0


def compute_user_accuracy(user_id: str, *, force_refresh: bool = False) -> UserAccuracy:
    """Return UserAccuracy for a given user_id.

    Fetches verdict records from pattern_ledger_records, joins with outcome
    records, and computes accuracy. Results are cached for 5 minutes.
    """
    if not force_refresh:
        cached = _cache.get(user_id)
        if cached is not None:
            return cached

    try:
        acc = _compute_from_supabase(user_id)
    except Exception as exc:
        log.warning("Supabase accuracy query failed for %s: %s", user_id, exc)
        acc = UserAccuracy(user_id=user_id)

    _cache.set(acc)
    return acc


def _compute_from_supabase(user_id: str) -> UserAccuracy:
    """Two-query approach: fetch verdicts → fetch matching outcomes → compute."""
    import os
    from supabase import create_client  # type: ignore

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb = create_client(url, key)

    # Query 1: all verdict records for this user
    resp = (
        sb.table("pattern_ledger_records")
        .select("outcome_id, payload")
        .eq("record_type", "verdict")
        .eq("user_id", user_id)
        .execute()
    )
    verdict_rows: list[dict[str, Any]] = resp.data or []

    if not verdict_rows:
        return UserAccuracy(user_id=user_id)

    # Extract verdict labels and build outcome_id lookup
    verdict_map: dict[str, str] = {}  # outcome_id → verdict_label
    breakdown: dict[str, int] = {}
    for row in verdict_rows:
        label = (row.get("payload") or {}).get("user_verdict") or ""
        oid = row.get("outcome_id") or ""
        if label and oid:
            verdict_map[oid] = label
        breakdown[label] = breakdown.get(label, 0) + 1

    # Query 2: outcome records for those outcome_ids
    outcome_ids = list(verdict_map.keys())
    resp2 = (
        sb.table("pattern_ledger_records")
        .select("id, payload")
        .eq("record_type", "outcome")
        .in_("id", outcome_ids)
        .execute()
    )
    outcome_rows: list[dict[str, Any]] = resp2.data or []
    outcome_result: dict[str, str] = {}  # outcome_id → outcome value
    for row in outcome_rows:
        oid = row.get("id") or ""
        result = (row.get("payload") or {}).get("outcome") or ""
        if oid and result:
            outcome_result[oid] = result

    # Compute accuracy
    resolved = correct = 0
    for oid, verdict in verdict_map.items():
        outcome = outcome_result.get(oid)
        if not outcome or outcome == "pending":
            continue
        resolved += 1
        if verdict in _HARD_LABELS and outcome == "success":
            correct += 1
        elif verdict == _INVALID_LABEL and outcome == "failure":
            correct += 1
        # soft labels (near_miss, too_early, too_late): count toward resolved, not correct

    accuracy = _safe_div(correct, resolved)
    gate_eligible = resolved >= _F60_GATE_MIN_COUNT and accuracy >= _F60_GATE_MIN_ACCURACY

    return UserAccuracy(
        user_id=user_id,
        verdict_count=len(verdict_rows),
        resolved_count=resolved,
        correct_count=correct,
        accuracy=round(accuracy, 4),
        gate_eligible=gate_eligible,
        remaining_for_gate=max(0, _F60_GATE_MIN_COUNT - resolved),
        breakdown=breakdown,
    )


def invalidate_user(user_id: str) -> None:
    """Remove cached entry for a user (call after new verdict is submitted)."""
    _cache.by_user.pop(user_id, None)
