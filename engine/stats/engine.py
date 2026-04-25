"""Pattern Stats Engine — deterministic SQL aggregations over pattern_outcomes.

Single source of truth for pattern performance metrics. Powers:
- Wiki frontmatter (hit_rate, ev, sample_count, btc_conditional_rates)
- LLM context assembly (PatternStats summaries)
- Pattern library display (per-pattern stats)

Design principles (CTO):
- One batch query covers all patterns — no N+1 DB round-trips
- 5-minute in-memory TTL — wiki/LLM calls read cache, not DB
- Stats are deterministic SQL — LLM never touches numbers
- Falls back gracefully to file store when Supabase unavailable
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger("engine.stats.engine")

_CACHE_TTL_SECONDS = 300  # 5 minutes


@dataclass
class PatternPerf:
    """Compact performance summary for one pattern slug."""
    slug: str
    sample_count: int = 0
    win_rate: float = 0.0          # success / (success + failure)
    avg_gain_pct: float = 0.0      # mean max_gain_pct for successes
    avg_loss_pct: float = 0.0      # mean exit_return_pct for failures
    expected_value: float = 0.0    # P(win)×avg_gain + P(loss)×avg_loss
    btc_bull_win_rate: float = 0.0
    btc_bear_win_rate: float = 0.0
    btc_neutral_win_rate: float = 0.0
    avg_duration_hours: float = 0.0
    pending_count: int = 0
    last_updated: float = field(default_factory=time.time)


@dataclass
class StatsCache:
    by_slug: dict[str, PatternPerf] = field(default_factory=dict)
    built_at: float = 0.0

    def is_fresh(self) -> bool:
        return (time.time() - self.built_at) < _CACHE_TTL_SECONDS

    def get(self, slug: str) -> PatternPerf | None:
        return self.by_slug.get(slug)

    def all_slugs(self) -> list[str]:
        return list(self.by_slug.keys())


def _safe_div(a: float, b: float, default: float = 0.0) -> float:
    return a / b if b > 0 else default


def _compute_perf_from_outcomes(slug: str, outcomes: list[Any]) -> PatternPerf:
    """Pure Python computation from a list of PatternOutcome objects.

    Deterministic. No LLM involvement.
    """
    perf = PatternPerf(slug=slug)
    if not outcomes:
        return perf

    successes = [o for o in outcomes if getattr(o, "outcome", None) == "success"]
    failures = [o for o in outcomes if getattr(o, "outcome", None) == "failure"]
    pending = [o for o in outcomes if getattr(o, "outcome", None) == "pending"]
    closed = successes + failures

    perf.sample_count = len(closed)
    perf.pending_count = len(pending)

    if not closed:
        return perf

    perf.win_rate = _safe_div(len(successes), len(closed))

    gains = [
        float(o.max_gain_pct) for o in successes
        if getattr(o, "max_gain_pct", None) is not None
    ]
    losses = [
        float(o.exit_return_pct) for o in failures
        if getattr(o, "exit_return_pct", None) is not None
    ]
    perf.avg_gain_pct = _safe_div(sum(gains), len(gains)) if gains else 0.0
    perf.avg_loss_pct = _safe_div(sum(losses), len(losses)) if losses else 0.0
    perf.expected_value = (
        perf.win_rate * perf.avg_gain_pct
        + (1 - perf.win_rate) * perf.avg_loss_pct
    )

    # BTC trend conditional rates
    for trend_val, attr in (
        ("bull", "btc_bull_win_rate"),
        ("bear", "btc_bear_win_rate"),
        ("neutral", "btc_neutral_win_rate"),
    ):
        trend_closed = [
            o for o in closed
            if getattr(o, "btc_trend_at_entry", None) == trend_val
        ]
        trend_wins = [
            o for o in trend_closed
            if getattr(o, "outcome", None) == "success"
        ]
        setattr(perf, attr, _safe_div(len(trend_wins), len(trend_closed)))

    durations = [
        float(o.duration_hours) for o in closed
        if getattr(o, "duration_hours", None) is not None
    ]
    perf.avg_duration_hours = _safe_div(sum(durations), len(durations)) if durations else 0.0
    perf.last_updated = time.time()

    return perf


class PatternStatsEngine:
    """Compute and cache pattern performance statistics.

    Usage:
        engine = PatternStatsEngine()
        perf = engine.get("whale-accumulation-reversal-v1")
        all_perfs = engine.get_all()
    """

    def __init__(self) -> None:
        self._cache = StatsCache()

    # ── Public API ────────────────────────────────────────────────────────

    def get(self, slug: str, *, force_refresh: bool = False) -> PatternPerf:
        """Return PatternPerf for one slug. Refreshes cache if stale."""
        if force_refresh or not self._cache.is_fresh():
            self._refresh()
        return self._cache.get(slug) or PatternPerf(slug=slug)

    def get_all(self, *, force_refresh: bool = False) -> dict[str, PatternPerf]:
        """Return all cached PatternPerf objects."""
        if force_refresh or not self._cache.is_fresh():
            self._refresh()
        return dict(self._cache.by_slug)

    def as_wiki_frontmatter(self, slug: str) -> dict[str, Any]:
        """Return frontmatter-ready dict for a wiki page.

        Only deterministic numbers — never prose. LLM writes body_md only.
        """
        perf = self.get(slug)
        return {
            "slug": perf.slug,
            "sample_count": perf.sample_count,
            "win_rate": round(perf.win_rate, 4),
            "avg_gain_pct": round(perf.avg_gain_pct, 4),
            "avg_loss_pct": round(perf.avg_loss_pct, 4),
            "expected_value": round(perf.expected_value, 4),
            "btc_bull_win_rate": round(perf.btc_bull_win_rate, 4),
            "btc_bear_win_rate": round(perf.btc_bear_win_rate, 4),
            "btc_neutral_win_rate": round(perf.btc_neutral_win_rate, 4),
            "avg_duration_hours": round(perf.avg_duration_hours, 2),
            "pending_count": perf.pending_count,
            "stats_updated_at": time.strftime(
                "%Y-%m-%dT%H:%M:%SZ", time.gmtime(perf.last_updated)
            ),
        }

    def invalidate(self) -> None:
        """Force next get/get_all to re-query DB."""
        self._cache.built_at = 0.0

    # ── Internal ─────────────────────────────────────────────────────────

    def _refresh(self) -> None:
        """Rebuild cache — one batch query covers all slugs."""
        try:
            self._refresh_from_supabase()
        except Exception as exc:
            log.warning("Supabase stats refresh failed, falling back to file store: %s", exc)
            self._refresh_from_file_store()

    def _refresh_from_supabase(self) -> None:
        """Single Supabase query → all pattern outcomes → all stats."""
        from ledger.supabase_store import SupabaseLedgerStore  # type: ignore

        store = SupabaseLedgerStore()
        by_slug = store.batch_list_all()

        new_cache = StatsCache(built_at=time.time())
        for slug, outcomes in by_slug.items():
            new_cache.by_slug[slug] = _compute_perf_from_outcomes(slug, outcomes)

        self._cache = new_cache
        log.debug(
            "stats refresh from Supabase: %d slugs, %d total outcomes",
            len(new_cache.by_slug),
            sum(p.sample_count + p.pending_count for p in new_cache.by_slug.values()),
        )

    def _refresh_from_file_store(self) -> None:
        """Fall back to file-based ledger (local dev / Supabase unreachable)."""
        from ledger.store import FileLedgerStore  # type: ignore
        from patterns.library import PATTERN_REGISTRY  # type: ignore

        store = FileLedgerStore()
        new_cache = StatsCache(built_at=time.time())

        slugs = list(PATTERN_REGISTRY.keys()) if PATTERN_REGISTRY else []
        for slug in slugs:
            try:
                outcomes = store.list_all(slug)
                new_cache.by_slug[slug] = _compute_perf_from_outcomes(slug, outcomes)
            except Exception as exc:
                log.warning("Failed to load outcomes for %s: %s", slug, exc)
                new_cache.by_slug[slug] = PatternPerf(slug=slug)

        self._cache = new_cache
        log.debug("stats refresh from file store: %d slugs", len(new_cache.by_slug))


# ── Module-level singleton ─────────────────────────────────────────────────

_engine: PatternStatsEngine | None = None


def get_stats_engine() -> PatternStatsEngine:
    """Return module-level singleton PatternStatsEngine."""
    global _engine
    if _engine is None:
        _engine = PatternStatsEngine()
    return _engine
