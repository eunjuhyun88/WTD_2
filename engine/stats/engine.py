"""Pattern Stats Engine — deterministic SQL aggregations over pattern_outcomes.

Single source of truth for pattern performance metrics. Powers:
- Wiki frontmatter (hit_rate, ev, sample_count, btc_conditional_rates)
- LLM context assembly (PatternStats summaries)
- Pattern library display (per-pattern stats)
- F-60 multi-period gate (L-3, R-05): median+floor anti-overfit gate

Design principles (CTO):
- One batch query covers all patterns — no N+1 DB round-trips
- 5-minute in-memory TTL — wiki/LLM calls read cache, not DB
- Stats are deterministic SQL — LLM never touches numbers
- Falls back gracefully to file store when Supabase unavailable

F-60 Multi-Period Gate (Ryan Li + Kropiunig empirical basis):
- Single-period accuracy can be 0.60 while multi-period is 0.45 (overfit)
- Identical strategy: $282 / $259 / $250 ($32 variance) → seed luck
- Solution: median(W1,W2,W3) ≥ 0.55 AND min(...) ≥ 0.40
"""
from __future__ import annotations

import logging
import statistics
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

log = logging.getLogger("engine.stats.engine")

_CACHE_TTL_SECONDS = 300  # 5 minutes

# ── F-60 Gate Constants ───────────────────────────────────────────────────
F60_MIN_VERDICT_COUNT = 200            # need 200+ verdicts before measuring
F60_MIN_SAMPLES_PER_WINDOW = 10       # each rolling window needs ≥10 samples (W-0253)
F60_NUM_WINDOWS = 3                    # 3 rolling 30-day windows
F60_WINDOW_DAYS = 30
F60_MEDIAN_THRESHOLD = 0.55            # median(W1,W2,W3) must reach this
F60_FLOOR_THRESHOLD = 0.40             # min(W1,W2,W3) must reach this
# Verdict labels considered "win" (5-cat: valid/invalid/near_miss/too_early/too_late)
F60_WIN_LABELS = {"valid"}
F60_DENOM_LABELS = {"valid", "invalid", "near_miss", "too_early", "too_late"}


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
class GateStatus:
    """F-60 multi-period acceptance gate result.

    Three rolling 30-day windows of recent verdicts.
    Pass = median ≥ 0.55 AND floor ≥ 0.40 AND verdict_count ≥ 200.
    """
    slug: str
    passed: bool = False
    reason: str = "insufficient_data"  # insufficient_data | insufficient_windows | failed_threshold | passed
    verdict_count: int = 0
    remaining_to_threshold: int = 0
    median_accuracy: float = 0.0
    floor_accuracy: float = 0.0
    window_accuracies: list[float] = field(default_factory=list)
    window_counts: list[int] = field(default_factory=list)
    median_threshold: float = F60_MEDIAN_THRESHOLD
    floor_threshold: float = F60_FLOOR_THRESHOLD
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


def _outcome_judged_at(o: Any) -> datetime | None:
    """Best-effort timestamp for verdict ordering: verdict_at > breakout_at > accumulation_at."""
    for attr in ("verdict_at", "breakout_at", "accumulation_at", "created_at", "updated_at"):
        ts = getattr(o, attr, None)
        if ts is not None:
            if isinstance(ts, datetime):
                return ts.replace(tzinfo=ts.tzinfo or timezone.utc)
            try:
                return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            except (ValueError, TypeError):
                continue
    return None


def _split_rolling_windows(
    verdicted: list[Any],
    n_windows: int = F60_NUM_WINDOWS,
    window_days: int = F60_WINDOW_DAYS,
    now: datetime | None = None,
) -> list[list[Any]]:
    """Split verdicted outcomes into N consecutive rolling windows of `window_days` each.

    Window 0 = most recent (now-30d ~ now), Window 1 = (now-60d ~ now-30d), etc.
    Returns [W0, W1, W2, ...] (most recent first).
    """
    now = now or datetime.now(timezone.utc)
    windows: list[list[Any]] = [[] for _ in range(n_windows)]
    for o in verdicted:
        ts = _outcome_judged_at(o)
        if ts is None:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        days_ago = (now - ts).total_seconds() / 86400
        idx = int(days_ago // window_days)
        if 0 <= idx < n_windows:
            windows[idx].append(o)
    return windows


def _compute_gate_status(slug: str, outcomes: list[Any], now: datetime | None = None) -> GateStatus:
    """F-60 multi-period acceptance gate (R-05, L-3).

    Anti-overfit: median(W1,W2,W3) >= 0.55 AND min(W1,W2,W3) >= 0.40 AND total >= 200.

    Verdict labels (main 5-cat canonical):
      win:    valid
      loss:   invalid, near_miss, too_early, too_late
    """
    verdicted = [
        o for o in outcomes
        if getattr(o, "user_verdict", None) in F60_DENOM_LABELS
    ]
    verdict_count = len(verdicted)

    if verdict_count < F60_MIN_VERDICT_COUNT:
        return GateStatus(
            slug=slug,
            passed=False,
            reason="insufficient_data",
            verdict_count=verdict_count,
            remaining_to_threshold=F60_MIN_VERDICT_COUNT - verdict_count,
        )

    windows = _split_rolling_windows(verdicted, now=now)
    accuracies: list[float] = []
    counts: list[int] = []
    for w in windows:
        wins = sum(1 for o in w if getattr(o, "user_verdict", None) in F60_WIN_LABELS)
        total = len(w)
        if total >= F60_MIN_SAMPLES_PER_WINDOW:
            accuracies.append(wins / total)
            counts.append(total)
        else:
            counts.append(total)

    if len(accuracies) < 2:
        return GateStatus(
            slug=slug,
            passed=False,
            reason="insufficient_windows",
            verdict_count=verdict_count,
            window_accuracies=accuracies,
            window_counts=counts,
        )

    median_acc = statistics.median(accuracies)
    floor_acc = min(accuracies)
    passed = median_acc >= F60_MEDIAN_THRESHOLD and floor_acc >= F60_FLOOR_THRESHOLD

    return GateStatus(
        slug=slug,
        passed=passed,
        reason="passed" if passed else "failed_threshold",
        verdict_count=verdict_count,
        median_accuracy=median_acc,
        floor_accuracy=floor_acc,
        window_accuracies=accuracies,
        window_counts=counts,
    )


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

    def get_gate_status(self, slug: str, *, force_refresh: bool = False) -> GateStatus:
        """F-60 multi-period gate (L-3, R-05).

        Loads outcomes for slug + computes median/floor across 3 rolling 30d windows.
        """
        outcomes = self._load_outcomes_for_slug(slug, force_refresh=force_refresh)
        return _compute_gate_status(slug, outcomes)

    def get_gate_status_all(self, *, force_refresh: bool = False) -> dict[str, GateStatus]:
        """All slugs' gate status (1 batch DB read)."""
        outcomes_by_slug = self._load_outcomes_all(force_refresh=force_refresh)
        return {
            slug: _compute_gate_status(slug, outcomes)
            for slug, outcomes in outcomes_by_slug.items()
        }

    def as_gate_dict(self, slug: str) -> dict[str, Any]:
        """Frontmatter/API-ready dict for one slug."""
        gs = self.get_gate_status(slug)
        return {
            "slug": gs.slug,
            "passed": gs.passed,
            "reason": gs.reason,
            "verdict_count": gs.verdict_count,
            "remaining_to_threshold": gs.remaining_to_threshold,
            "median_accuracy": round(gs.median_accuracy, 4),
            "floor_accuracy": round(gs.floor_accuracy, 4),
            "window_accuracies": [round(a, 4) for a in gs.window_accuracies],
            "window_counts": gs.window_counts,
            "median_threshold": gs.median_threshold,
            "floor_threshold": gs.floor_threshold,
            "stats_updated_at": time.strftime(
                "%Y-%m-%dT%H:%M:%SZ", time.gmtime(gs.last_updated)
            ),
        }

    def invalidate(self) -> None:
        """Force next get/get_all to re-query DB."""
        self._cache.built_at = 0.0

    # ── Internal ─────────────────────────────────────────────────────────

    def _load_outcomes_for_slug(self, slug: str, *, force_refresh: bool = False) -> list[Any]:
        """Best-effort load of all outcomes for one slug (Supabase first, file fallback)."""
        try:
            from ledger.supabase_store import SupabaseLedgerStore  # type: ignore
            store = SupabaseLedgerStore()
            return store.list_all(slug)
        except Exception as exc:
            log.debug("Supabase load failed for %s, falling back to file: %s", slug, exc)
            try:
                from ledger.store import FileLedgerStore  # type: ignore
                return FileLedgerStore().list_all(slug)
            except Exception as exc2:
                log.warning("Both ledger stores failed for %s: %s", slug, exc2)
                return []

    def _load_outcomes_all(self, *, force_refresh: bool = False) -> dict[str, list[Any]]:
        """Best-effort batch load of all slugs."""
        try:
            from ledger.supabase_store import SupabaseLedgerStore  # type: ignore
            return SupabaseLedgerStore().batch_list_all()
        except Exception as exc:
            log.debug("Supabase batch load failed, falling back to file: %s", exc)
            try:
                from ledger.store import FileLedgerStore  # type: ignore
                from patterns.library import PATTERN_REGISTRY  # type: ignore
                store = FileLedgerStore()
                slugs = list(PATTERN_REGISTRY.keys()) if PATTERN_REGISTRY else []
                return {slug: store.list_all(slug) for slug in slugs}
            except Exception as exc2:
                log.warning("Both batch loads failed: %s", exc2)
                return {}

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
