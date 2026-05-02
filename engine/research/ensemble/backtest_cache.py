"""Supabase-backed read/write cache for pattern backtest stats — W-0369 Phase 2."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any

log = logging.getLogger(__name__)

TABLE = "pattern_backtest_stats"
CACHE_TTL_HOURS = 25  # stale after 25h → triggers fresh compute


def _client():
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    return create_client(url, key)


def get_cached(slug: str, timeframe: str = "1h", universe: str = "default") -> dict[str, Any] | None:
    """Return cached stats if fresh (< CACHE_TTL_HOURS old), else None."""
    try:
        client = _client()
        row = (
            client.table(TABLE)
            .select("*")
            .eq("slug", slug)
            .eq("timeframe", timeframe)
            .eq("universe", universe)
            .maybe_single()
            .execute()
        )
        if not row.data:
            return None
        computed_at = datetime.fromisoformat(row.data["computed_at"].replace("Z", "+00:00"))
        age = datetime.now(timezone.utc) - computed_at
        if age > timedelta(hours=CACHE_TTL_HOURS):
            return None
        return row.data
    except Exception as exc:
        log.warning("backtest_cache.get failed for %s: %s", slug, exc)
        return None


def upsert_stats(slug: str, stats: dict[str, Any], timeframe: str = "1h", universe: str = "default") -> None:
    """Write/overwrite stats row for slug."""
    try:
        client = _client()
        client.table(TABLE).upsert({
            "slug": slug,
            "timeframe": timeframe,
            "universe": universe,
            "n_signals": stats.get("n_signals", 0),
            "win_rate": stats.get("win_rate"),
            "avg_return_72h": stats.get("avg_return_72h"),
            "hit_rate": stats.get("hit_rate"),
            "avg_peak_pct": stats.get("avg_peak_pct"),
            "sharpe": stats.get("sharpe"),
            "apr": stats.get("apr"),
            "equity_curve": stats.get("equity_curve", []),
            "insufficient_data": stats.get("insufficient_data", True),
            "since": stats.get("since"),
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="slug,timeframe,universe").execute()
    except Exception as exc:
        log.error("backtest_cache.upsert failed for %s: %s", slug, exc)


def refresh_all_patterns(universe_symbols: list[str], timeframe: str = "1h") -> dict[str, str]:
    """Compute + cache backtest stats for every PatternObject in Supabase.

    Returns {slug: "ok" | "skip" | "error"}.
    Called by the daily APScheduler job.
    """
    import time
    from research.backtest import run_pattern_backtest
    from research.live_monitor import DEFAULT_UNIVERSE
    from datetime import timedelta
    from patterns.store import PatternStore

    uni = universe_symbols or DEFAULT_UNIVERSE
    since = datetime.now(timezone.utc) - timedelta(days=365)

    try:
        slugs = [r["slug"] for r in PatternStore().list(limit=100)]
    except Exception as exc:
        log.error("refresh_all_patterns: PatternStore.list failed: %s", exc)
        return {}

    results: dict[str, str] = {}
    for slug in slugs:
        try:
            result = run_pattern_backtest(slug, uni, timeframe=timeframe, since=since)
            stats = {
                "n_signals": result.n_signals,
                "win_rate": result.win_rate,
                "avg_return_72h": result.avg_return_72h,
                "hit_rate": result.hit_rate,
                "avg_peak_pct": result.avg_peak_pct,
                "sharpe": result.sharpe,
                "apr": result.apr,
                "equity_curve": result.equity_curve,
                "insufficient_data": result.n_signals < 10,
                "since": since.isoformat(),
            }
            upsert_stats(slug, stats, timeframe=timeframe, universe="default")
            results[slug] = "ok"
            log.info("refresh_all_patterns: %s ✓ (%d signals)", slug, result.n_signals)
        except Exception as exc:
            log.error("refresh_all_patterns: %s failed: %s", slug, exc)
            results[slug] = "error"
        time.sleep(5)  # throttle to avoid Cloud Run memory spike

    log.info("refresh_all_patterns complete: %d slugs", len(slugs))
    return results
