"""Scroll segment → similar historical windows pipeline (W-0384).

Bridges ScrollSegmentResult to the existing 3-layer candidate_search engine.
Adds forward P&L from scan_signal_outcomes for each similar window.
"""
from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

log = logging.getLogger("engine.alpha.scroll_similar_compose")


@dataclass
class SimilarSegment:
    symbol: str
    from_ts: datetime
    to_ts: datetime
    similarity_score: float
    layer_scores: dict[str, float]
    forward_pnl_1h: float | None
    forward_pnl_4h: float | None
    forward_pnl_24h: float | None
    outcome: str | None
    explanation: str


@dataclass
class SimilarSegmentResponse:
    query_symbol: str
    query_from_ts: datetime
    query_to_ts: datetime
    similar_segments: list[SimilarSegment]
    win_rate: float | None
    avg_pnl: float | None
    confidence: str   # "high" (n≥15) | "medium" (n≥5) | "low"
    run_id: str


def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def _build_query_spec(
    indicator_snapshot: dict[str, float],
    timeframe: str,
    symbol: str,
) -> "SearchQuerySpec":
    """Convert indicator_snapshot to a minimal SearchQuerySpec.

    Uses only the fields that exist in SIGNAL_COLUMNS. No must_have_signals
    so the pre-filter returns all candidates (up to max_pre_filter=500),
    then Layer A L1 distance ranks them by actual feature similarity.
    """
    from research.query_transformer import SearchQuerySpec, TransformerMeta

    # Derive must_have_signals from anomaly thresholds in indicator_snapshot
    must_signals: list[str] = []
    snap = indicator_snapshot
    if snap.get("avg_volume_ratio", 1.0) > 2.0:
        must_signals.append("volume_spike")
    if snap.get("funding_extreme_flag", 0.0) > 0.5:
        must_signals.append("funding_extreme_short")
    if snap.get("price_change_pct", 0.0) > 3.0:
        must_signals.append("price_spike")
    elif snap.get("price_change_pct", 0.0) < -3.0:
        must_signals.append("price_dump")

    return SearchQuerySpec(
        schema_version=1,
        pattern_family="scroll-segment-similarity",
        reference_timeframe=timeframe,
        phase_path=[],
        phase_queries=[],
        must_have_signals=must_signals,
        preferred_timeframes=[timeframe],
        exclude_patterns=[],
        similarity_focus=["oi", "volume", "price"],
        symbol_scope=[],
        transformer_meta=TransformerMeta(),
    )


def _fetch_pnl_for_window(symbol: str, bar_ts_ms: int) -> dict[str, Any]:
    """Query scan_signal_outcomes for events near the candidate bar time.

    Matches events within ±2h of bar_ts_ms for the given symbol.
    Returns dict with forward_pnl_1h/4h/24h and outcome, or empty dict on miss.
    """
    try:
        bar_dt = datetime.fromtimestamp(bar_ts_ms / 1000, tz=timezone.utc)
        lo = (bar_dt - timedelta(hours=2)).isoformat()
        hi = (bar_dt + timedelta(hours=2)).isoformat()

        sb = _sb()
        result = (
            sb.table("scan_signal_outcomes")
            .select(
                "horizon_h, realized_pnl_pct, triple_barrier_outcome, "
                "scan_signal_events!inner(symbol, fired_at)"
            )
            .not_.is_("resolved_at", "null")
            .execute()
        )
        rows = result.data or []
        # Filter by symbol + time window in Python (Supabase nested filter is limited)
        pnl_by_horizon: dict[int, float] = {}
        outcome_by_horizon: dict[int, str] = {}
        for row in rows:
            event = row.get("scan_signal_events") or {}
            if event.get("symbol") != symbol:
                continue
            fired_at = event.get("fired_at", "")
            if not fired_at:
                continue
            try:
                evt_dt = datetime.fromisoformat(fired_at.replace("Z", "+00:00"))
            except Exception:
                continue
            if lo <= evt_dt.isoformat() <= hi:
                h = row.get("horizon_h")
                if h is not None:
                    pnl_by_horizon[h] = float(row.get("realized_pnl_pct") or 0)
                    if row.get("triple_barrier_outcome"):
                        outcome_by_horizon[h] = row["triple_barrier_outcome"]

        if not pnl_by_horizon:
            return {}
        return {
            "forward_pnl_1h": pnl_by_horizon.get(1),
            "forward_pnl_4h": pnl_by_horizon.get(4),
            "forward_pnl_24h": pnl_by_horizon.get(24),
            "outcome": outcome_by_horizon.get(24) or outcome_by_horizon.get(4),
        }
    except Exception as e:
        log.debug("pnl lookup failed for %s@%d: %s", symbol, bar_ts_ms, e)
        return {}


def find_similar_segments(
    segment: "ScrollSegmentResult",
    top_k: int = 10,
    min_similarity: float = 0.55,
) -> SimilarSegmentResponse:
    """Run 3-layer similar search on a scroll segment and attach forward P&L."""
    from research.candidate_search import search_similar_patterns

    spec = _build_query_spec(
        segment.indicator_snapshot,
        segment.timeframe,
        segment.symbol,
    )

    search_result = search_similar_patterns(
        spec,
        top_k=top_k * 2,   # fetch more, filter by min_similarity
        since_days=365,
    )

    similar: list[SimilarSegment] = []
    for candidate in search_result.candidates:
        score = float(candidate.final_score)
        if score < min_similarity:
            continue

        bar_ts_ms = int(candidate.bar_ts_ms)
        bar_dt = datetime.fromtimestamp(bar_ts_ms / 1000, tz=timezone.utc)
        tf_hours = {"1h": 1, "4h": 4, "1d": 24}.get(candidate.timeframe, 1)
        segment_end = bar_dt + timedelta(hours=tf_hours * 5)

        pnl = _fetch_pnl_for_window(candidate.symbol, bar_ts_ms)

        layer_scores = {
            "feature": round(float(candidate.layer_a_score or 0), 4),
            "sequence": round(float(candidate.layer_b_score or 0), 4),
            "ml": round(float(candidate.layer_c_score or 0), 4),
        }

        # Build human-readable explanation from top contributing signals
        explanation_parts = [f"{candidate.symbol} {bar_dt.strftime('%Y-%m-%d %H:%M')}"]
        snap = segment.indicator_snapshot
        if snap.get("avg_volume_ratio", 1.0) > 1.5:
            explanation_parts.append("volume surge")
        if abs(snap.get("avg_funding_rate", 0.0)) > 0.03:
            explanation_parts.append("funding extreme")
        if abs(snap.get("price_change_pct", 0.0)) > 2.0:
            direction = "rally" if snap["price_change_pct"] > 0 else "dump"
            explanation_parts.append(f"price {direction}")

        similar.append(SimilarSegment(
            symbol=candidate.symbol,
            from_ts=bar_dt,
            to_ts=segment_end,
            similarity_score=round(score, 4),
            layer_scores=layer_scores,
            forward_pnl_1h=pnl.get("forward_pnl_1h"),
            forward_pnl_4h=pnl.get("forward_pnl_4h"),
            forward_pnl_24h=pnl.get("forward_pnl_24h"),
            outcome=pnl.get("outcome"),
            explanation=", ".join(explanation_parts),
        ))

        if len(similar) >= top_k:
            break

    # Compute aggregate stats from labelled cases
    labelled = [s for s in similar if s.forward_pnl_24h is not None]
    winners = [s for s in labelled if (s.forward_pnl_24h or 0) > 0]
    win_rate = len(winners) / len(labelled) if labelled else None
    avg_pnl = sum(s.forward_pnl_24h for s in labelled if s.forward_pnl_24h is not None) / len(labelled) if labelled else None

    n = len(similar)
    confidence = "high" if n >= 15 else "medium" if n >= 5 else "low"

    return SimilarSegmentResponse(
        query_symbol=segment.symbol,
        query_from_ts=segment.from_ts,
        query_to_ts=segment.to_ts,
        similar_segments=similar,
        win_rate=round(win_rate, 4) if win_rate is not None else None,
        avg_pnl=round(avg_pnl, 4) if avg_pnl is not None else None,
        confidence=confidence,
        run_id=str(uuid.uuid4()),
    )
