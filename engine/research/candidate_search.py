"""Candidate Search — SearchQuerySpec → ranked pattern candidates.

Full pipeline:

  SearchQuerySpec
      ↓
  [1] SQL hard filter (feature_windows) → top-N candidates (fast)
      ↓
  [2] Feature similarity score (Layer A)
      ↓
  [3] Sequence score (Layer B) — populated from PatternStateStore or phase_path arg
      ↓
  [4] Context score (Layer C)
      ↓
  [5] Final hybrid rank → top-k RankedCandidate

Usage:
    from research.candidate_search import search_similar_patterns
    from research.query_transformer import transform_pattern_draft

    spec = transform_pattern_draft(pattern_draft_dict)
    result = search_similar_patterns(spec, top_k=10)
    for candidate in result.candidates:
        print(candidate.symbol, candidate.final_score)

The search is corpus-first: it only reads from the feature_windows SQLite
store, never from raw provider endpoints. feature_windows must be populated
by feature_windows_builder before searches return meaningful results.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from .feature_windows import CandidateWindow, FeatureWindowStore, FEATURE_WINDOW_STORE, SIGNAL_COLUMNS
from .query_transformer import PhaseQuery, SearchQuerySpec
from .similarity_ranker import RankedCandidate, rank_candidates

log = logging.getLogger("engine.research.candidate_search")

# ─────────────────────────────────────────────────────────────────────────────
# Search result envelope
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PatternSearchResult:
    """Full search result returned by search_similar_patterns()."""

    spec_pattern_family: str
    spec_phase_path: list[str]
    reference_timeframe: str
    total_candidates_found: int
    top_k: int
    candidates: list[RankedCandidate]
    search_meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "spec_pattern_family": self.spec_pattern_family,
            "spec_phase_path": self.spec_phase_path,
            "reference_timeframe": self.reference_timeframe,
            "total_candidates_found": self.total_candidates_found,
            "top_k": self.top_k,
            "candidates": [c.to_dict() for c in self.candidates],
            "search_meta": self.search_meta,
        }


# ─────────────────────────────────────────────────────────────────────────────
# SQL constraint extraction from SearchQuerySpec
# ─────────────────────────────────────────────────────────────────────────────

def _must_have_flag_signals(spec: SearchQuerySpec) -> list[str]:
    """Extract boolean flag signals from must_have_signals that exist in SIGNAL_COLUMNS."""
    flags: list[str] = []
    for signal in spec.must_have_signals:
        # Try the signal as-is (e.g. 'oi_spike_flag')
        if signal in SIGNAL_COLUMNS and signal.endswith("_flag"):
            flags.append(signal)
        # Try appending _flag (e.g. 'oi_spike' → 'oi_spike_flag')
        flag_name = f"{signal}_flag"
        if flag_name in SIGNAL_COLUMNS and flag_name not in flags:
            flags.append(flag_name)
    return flags


def _required_numeric_constraints_from_spec(spec: SearchQuerySpec) -> list[dict[str, Any]]:
    """Extract numeric constraints from the first required phase (pre-filter only).

    For the full feature score, all phases are evaluated by the ranker.
    For the pre-filter we only apply the most selective first-phase constraints
    to avoid over-restricting the candidate pool.
    """
    constraints: list[dict[str, Any]] = []
    if not spec.phase_queries:
        return constraints
    # Use the first phase (pre-filter) — the ranker scores all phases
    first_phase = min(spec.phase_queries, key=lambda p: p.sequence_order)
    for col, config in (first_phase.required_numeric or {}).items():
        if col not in SIGNAL_COLUMNS:
            continue
        if "min" in config:
            constraints.append({"col": col, "op": ">=", "value": config["min"]})
        if "max" in config:
            constraints.append({"col": col, "op": "<=", "value": config["max"]})
    return constraints


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def search_similar_patterns(
    spec: SearchQuerySpec,
    top_k: int = 10,
    max_pre_filter: int = 500,
    since_days: int | None = 180,
    until_ms: int | None = None,
    store: FeatureWindowStore | None = None,
    observed_phase_paths: dict[str, list[str]] | None = None,
) -> PatternSearchResult:
    """Run the full 3-layer pattern similarity search.

    Args:
        spec: SearchQuerySpec produced by QueryTransformer
        top_k: number of top candidates to return
        max_pre_filter: hard cap on SQL pre-filter results
        since_days: look back this many days (None = all history)
        until_ms: upper bound on bar_ts_ms (None = now)
        store: override the default FeatureWindowStore
        observed_phase_paths: optional map of (symbol+timeframe+ts key) →
            observed phase path list from a prior state machine replay.
            When provided, enables Layer B sequence scoring.
            Key format: "{symbol}:{timeframe}:{bar_ts_ms}"

    Returns:
        PatternSearchResult with ranked candidates
    """
    fw_store = store or FEATURE_WINDOW_STORE

    # Compute time bounds
    since_ms: int | None = None
    if since_days is not None:
        now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
        since_ms = now_ms - since_days * 86_400_000

    # [1] SQL hard filter
    must_flags = _must_have_flag_signals(spec)
    numeric_constraints = _required_numeric_constraints_from_spec(spec)

    log.debug(
        "candidate_search: must_flags=%s, numeric=%d, timeframes=%s",
        must_flags,
        len(numeric_constraints),
        spec.preferred_timeframes,
    )

    raw_candidates = fw_store.filter_candidates(
        must_have_signals=must_flags,
        preferred_timeframes=spec.preferred_timeframes or [spec.reference_timeframe],
        symbol_scope=spec.symbol_scope or None,
        since_ms=since_ms,
        until_ms=until_ms,
        max_candidates=max_pre_filter,
        numeric_constraints=numeric_constraints,
    )

    total_found = len(raw_candidates)
    log.debug("candidate_search: pre-filter returned %d candidates", total_found)

    if not raw_candidates:
        return PatternSearchResult(
            spec_pattern_family=spec.pattern_family,
            spec_phase_path=spec.phase_path,
            reference_timeframe=spec.reference_timeframe,
            total_candidates_found=0,
            top_k=top_k,
            candidates=[],
            search_meta={
                "pre_filter_count": 0,
                "must_flags_applied": must_flags,
                "store_empty": fw_store.count() == 0,
            },
        )

    # [2-4] Enrich candidates with observed_phase_path from caller if provided
    enriched: list[CandidateWindow] = []
    for c in raw_candidates:
        obs_path: list[str] = []
        if observed_phase_paths:
            key = f"{c.symbol}:{c.timeframe}:{c.bar_ts_ms}"
            obs_path = observed_phase_paths.get(key, [])

        # Replace candidate with enriched version (frozen dataclass → rebuild)
        enriched.append(
            CandidateWindow(
                symbol=c.symbol,
                timeframe=c.timeframe,
                bar_ts_ms=c.bar_ts_ms,
                signals=c.signals,
                observed_phase_path=obs_path,
            )
        )

    # [5] Rank
    ranked = rank_candidates(spec, enriched, top_k=top_k)

    return PatternSearchResult(
        spec_pattern_family=spec.pattern_family,
        spec_phase_path=spec.phase_path,
        reference_timeframe=spec.reference_timeframe,
        total_candidates_found=total_found,
        top_k=top_k,
        candidates=ranked,
        search_meta={
            "pre_filter_count": total_found,
            "must_flags_applied": must_flags,
            "numeric_constraints": numeric_constraints,
            "since_days": since_days,
            "transformer_version": spec.transformer_meta.transformer_version if spec.transformer_meta else None,
            "signal_vocab_version": spec.transformer_meta.signal_vocab_version if spec.transformer_meta else None,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Convenience: search from raw PatternDraft dict
# ─────────────────────────────────────────────────────────────────────────────

def search_from_pattern_draft(
    pattern_draft: dict[str, Any],
    top_k: int = 10,
    **kwargs: Any,
) -> PatternSearchResult:
    """Convenience wrapper: PatternDraft dict → search result.

    Applies QueryTransformer first, then runs search_similar_patterns.
    """
    from .query_transformer import transform_pattern_draft
    spec = transform_pattern_draft(pattern_draft)
    return search_similar_patterns(spec, top_k=top_k, **kwargs)


__all__ = [
    "PatternSearchResult",
    "search_similar_patterns",
    "search_from_pattern_draft",
]
