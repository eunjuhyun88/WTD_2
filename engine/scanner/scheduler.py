"""Background scanner — L4 real-time alert engine.

Runs inside the FastAPI process via APScheduler (AsyncIOScheduler).
Every 15 minutes it scans every symbol in the configured universe,
computes features, evaluates all building blocks, and pushes any
signal hit to the `engine_alerts` Supabase table.

Start/stop is controlled by the FastAPI lifespan hook in api/main.py.
The scan loop is intentionally sequential (not concurrent) to avoid
bursting Binance rate limits during the feature-calc phase.

Environment variables used:
  SUPABASE_URL             — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY — Service-role key (bypasses RLS)
  SCAN_INTERVAL_SECONDS    — Override default 900 (15 min)
  SCAN_MIN_BLOCKS          — Minimum blocks to fire an alert (default 1)
  SCAN_UNIVERSE            — Universe name for load_universe() (default "binance_dynamic")
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

try:
    import env_bootstrap  # noqa: F401
except ModuleNotFoundError:
    from engine import env_bootstrap  # type: ignore  # noqa: F401

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from data_cache.market_search import refresh_market_search_index
from data_cache.loader import load_klines, load_macro_bundle, load_perp
from data_cache.fetch_okx_historical import fetch_and_cache_signals, SYMBOL_CHAIN_MAP
from scanner.alerts import (
    send_pattern_engine_alert,
    send_pattern_scan_summary,
    send_scan_summary,
)
from scanner.jobs.auto_evaluate import auto_evaluate_job
from scanner.jobs.outcome_resolver import outcome_resolver_job
from scanner.jobs.pattern_refinement import pattern_refinement_job
from scanner.jobs.refinement_trigger import refinement_trigger_job
from scanner.jobs.alpha_observer import scan_alpha_observer_job
from scanner.jobs.alpha_warm import scan_alpha_warm_job
from scanner.jobs.pattern_scan import pattern_scan_job
from scanner.jobs.search_corpus import search_corpus_refresh_job
from workers.feature_windows_prefetcher import prefetch_feature_windows as _fw_prefetch
from scanner.jobs.universe_scan import (
    push_alert,
    scan_universe_job,
)
from scanner.feature_calc import compute_features_table, compute_snapshot
from scoring.block_evaluator import evaluate_blocks
from scoring.lightgbm_engine import get_engine
from universe.config import DEFAULT_SCAN_UNIVERSE
from universe.loader import load_universe_async

log = logging.getLogger("engine.scanner")

_scheduler: AsyncIOScheduler | None = None
_last_pattern_entry_keys: set[str] = set()

# ── Config ────────────────────────────────────────────────────────────────────

SCAN_INTERVAL = int(os.environ.get("SCAN_INTERVAL_SECONDS", "900"))
MIN_BLOCKS     = int(os.environ.get("SCAN_MIN_BLOCKS", "1"))
UNIVERSE_NAME  = DEFAULT_SCAN_UNIVERSE
PATTERN_REFINEMENT_ENABLED = os.environ.get("ENABLE_PATTERN_REFINEMENT_JOB", "false").strip().lower() in {
    "1", "true", "yes", "on",
}
PATTERN_REFINEMENT_INTERVAL = int(os.environ.get("PATTERN_REFINEMENT_INTERVAL_SECONDS", "21600"))
MARKET_SEARCH_INDEX_REFRESH_INTERVAL = int(os.environ.get("MARKET_SEARCH_INDEX_REFRESH_SECONDS", "1800"))
PATTERN_REFINEMENT_AUTO_TRAIN = os.environ.get("PATTERN_REFINEMENT_AUTO_TRAIN", "false").strip().lower() in {
    "1", "true", "yes", "on",
}
SEARCH_CORPUS_ENABLED = os.environ.get("ENABLE_SEARCH_CORPUS_JOB", "false").strip().lower() in {
    "1", "true", "yes", "on",
}
SEARCH_CORPUS_INTERVAL = int(os.environ.get("SEARCH_CORPUS_INTERVAL_SECONDS", "3600"))
SCAN_TELEGRAM_ENABLED = os.environ.get("SCAN_TELEGRAM_ENABLED", "1").strip().lower() not in {
    "0", "false", "no", "off",
}
FEATURE_MATERIALIZATION_ENABLED = os.environ.get("ENABLE_FEATURE_MATERIALIZATION_JOB", "true").strip().lower() not in {
    "0", "false", "no", "off",
}
FEATURE_MATERIALIZATION_INTERVAL = int(os.environ.get("FEATURE_MATERIALIZATION_INTERVAL_SECONDS", "900"))

SUPABASE_URL      = os.environ.get("SUPABASE_URL", "")
SUPABASE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

_PLACEHOLDER_HINTS = ("your_", "your-", "placeholder", "changeme", "example", "dummy", "<")


def _looks_like_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    if not normalized:
        return False
    return any(hint in normalized for hint in _PLACEHOLDER_HINTS)


def validate_scheduler_secrets() -> None:
    if not SUPABASE_URL.strip():
        raise RuntimeError("SUPABASE_URL is required when ENGINE_ENABLE_SCHEDULER=true")
    if not SUPABASE_ROLE_KEY.strip():
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required when ENGINE_ENABLE_SCHEDULER=true")
    if _looks_like_placeholder(SUPABASE_URL):
        raise RuntimeError("SUPABASE_URL still looks like a placeholder value")
    if _looks_like_placeholder(SUPABASE_ROLE_KEY):
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY still looks like a placeholder value")


async def _push_alert(payload: dict[str, Any]) -> None:
    await push_alert(payload, SUPABASE_URL, SUPABASE_ROLE_KEY)


async def _corpus_bridge_sync_job() -> None:
    """Sync FeatureMaterializationStore → SearchCorpusStore (enriched 40+ field signatures).

    Runs every 30 min — after _feature_materialization_refresh_job (15 min) so
    the corpus always reflects the latest materialized features.
    """
    import asyncio
    from features.corpus_bridge import sync_all_corpus
    try:
        result = await asyncio.to_thread(sync_all_corpus)
        log.info("corpus_bridge_sync: %s", result)
    except Exception as exc:
        log.warning("corpus_bridge_sync failed (non-fatal): %s", exc)



async def _search_corpus_refresh_job() -> None:
    """Scheduler wrapper: refresh the feature-window search corpus."""
    await search_corpus_refresh_job(universe_name=UNIVERSE_NAME)


async def _market_search_index_refresh_job() -> None:
    """Scheduler wrapper: refresh the flat market search index."""
    result = refresh_market_search_index()
    log.info(
        "market_search_index refreshed: row_count=%d refreshed_at=%s",
        result.row_count,
        result.refreshed_at,
    )

async def _feature_windows_prefetch_job() -> None:
    """Build feature_windows.sqlite for all BINANCE_30 symbols.

    Populates the FeatureWindowStore used by similar.py Layer A/C enrichment
    (40+ dimensional signal vectors). Runs every 6 hours.
    """
    try:
        result = await _fw_prefetch()
        log.info("feature_windows_prefetch: %s", result)
    except Exception as exc:
        log.warning("feature_windows_prefetch failed (non-fatal): %s", exc)


async def _feature_materialization_refresh_job() -> None:
    """Materialize feature_windows for all universe symbols from local cache.

    Intentionally offline — reads from existing CSV cache, never fans out to
    providers. Run after universe_scan so freshly cached data is consumed.
    """
    import asyncio
    from features.materialization_store import FeatureMaterializationStore
    from scanner.jobs.feature_materialization import materialize_symbol_window

    store = FeatureMaterializationStore()
    loaded = await load_universe_async(UNIVERSE_NAME)
    symbols = list(loaded)[:60]
    materialized = skipped = 0
    for symbol in symbols:
        for timeframe in ("1h", "4h"):
            try:
                await asyncio.to_thread(
                    materialize_symbol_window,
                    symbol=symbol,
                    timeframe=timeframe,
                    venue="binance",
                    offline=True,
                    store=store,
                )
                materialized += 1
            except Exception:
                skipped += 1
    log.info(
        "feature_materialization: symbols=%d materialized=%d skipped=%d",
        len(symbols), materialized, skipped,
    )


# ── Core scan loop ────────────────────────────────────────────────────────────

async def _scan_universe() -> None:
    await scan_universe_job(
        universe_name=UNIVERSE_NAME,
        min_blocks=MIN_BLOCKS,
        scan_telegram_enabled=SCAN_TELEGRAM_ENABLED,
        load_universe_async=load_universe_async,
        load_macro_bundle=load_macro_bundle,
        load_klines=load_klines,
        load_perp=load_perp,
        compute_features_table=compute_features_table,
        compute_snapshot=compute_snapshot,
        evaluate_blocks=evaluate_blocks,
        get_engine=get_engine,
        push_alert_fn=_push_alert,
        send_pattern_engine_alert=send_pattern_engine_alert,
        send_scan_summary=send_scan_summary,
    )


# ── Lifecycle API (called from api/main.py lifespan) ─────────────────────────

async def _pattern_scan_job() -> None:
    """Run pattern state machine scan across all symbols.

    This is a separate job from _scan_universe (block alerts).
    Pattern scan tracks multi-phase progression (FAKE_DUMP → BREAKOUT).
    """
    global _last_pattern_entry_keys
    _last_pattern_entry_keys, _ = await pattern_scan_job(
        universe_name=UNIVERSE_NAME,
        scan_telegram_enabled=SCAN_TELEGRAM_ENABLED,
        last_pattern_entry_keys=_last_pattern_entry_keys,
        load_universe_async=load_universe_async,
        send_pattern_scan_summary=send_pattern_scan_summary,
    )


async def _auto_evaluate_job() -> None:
    await auto_evaluate_job()


async def _outcome_resolver_job() -> None:
    await outcome_resolver_job()


async def _pattern_refinement_job() -> None:
    await pattern_refinement_job(auto_train_candidate=PATTERN_REFINEMENT_AUTO_TRAIN)


async def _refinement_trigger_job() -> None:
    await refinement_trigger_job()


async def _fetch_okx_signals_job() -> None:
    """Fetch and cache recent OKX smart money signals (every 6 hours).

    W-0109 integration: Populates historical cache for smart_money_accumulation block.
    """
    log.debug("Fetching OKX smart money signals...")
    results = []
    for symbol in list(SYMBOL_CHAIN_MAP.keys())[:20]:  # Limit to avoid rate limit
        result = fetch_and_cache_signals(
            symbol,
            wallet_types="1,2,3",
            min_amount_usd=1000.0,
            max_age_hours=24.0,
        )
        results.append(result)
        if result.get("signals_appended", 0) > 0:
            log.info(f"  {symbol}: {result['signals_appended']} signals cached")
    total_appended = sum(r.get("signals_appended", 0) for r in results)
    log.info(f"✓ OKX signals job complete: {total_appended} total signals cached")


def start_scheduler() -> None:
    """Start the APScheduler background scan loop."""
    global _scheduler
    if _scheduler is not None:
        log.debug("Scheduler already running")
        return
    validate_scheduler_secrets()

    _scheduler = AsyncIOScheduler(timezone="UTC")

    # Job 1: Universe block scanner (existing) — every 15 min
    _scheduler.add_job(
        _scan_universe,
        trigger="interval",
        seconds=SCAN_INTERVAL,
        id="universe_scan",
        name="Universe block scanner",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )

    # Job 2: Pattern state machine scan — every 15 min (offset by 5 min)
    _scheduler.add_job(
        _pattern_scan_job,
        trigger="interval",
        seconds=SCAN_INTERVAL,
        id="pattern_scan",
        name="Pattern state machine scanner",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )

    # Job 3: Auto-evaluate pending ledger outcomes — every 1 hour
    _scheduler.add_job(
        _auto_evaluate_job,
        trigger="interval",
        seconds=3600,
        id="auto_evaluate",
        name="Ledger auto-evaluator",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    # Job 3b: Outcome resolver for user captures (flywheel axis 1→2) — hourly
    _scheduler.add_job(
        _outcome_resolver_job,
        trigger="interval",
        seconds=3600,
        id="outcome_resolver",
        name="Capture outcome resolver",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    # Job 3c: Refinement trigger (flywheel axis 3→4) — daily, data-driven
    # Fires pattern_refinement only when verdict_count >= 10 AND days_since >= 7.
    _scheduler.add_job(
        _refinement_trigger_job,
        trigger="interval",
        seconds=86400,
        id="refinement_trigger",
        name="Data-driven refinement trigger",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
    )

    # Job 4: OKX Smart Money signals cache refresh (W-0109) — every 6 hours
    _scheduler.add_job(
        _fetch_okx_signals_job,
        trigger="interval",
        seconds=21600,  # 6 hours
        id="fetch_okx_signals",
        name="OKX smart money signal fetcher",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    if PATTERN_REFINEMENT_ENABLED:
        _scheduler.add_job(
            _pattern_refinement_job,
            trigger="interval",
            seconds=PATTERN_REFINEMENT_INTERVAL,
            id="pattern_refinement",
            name="Pattern refinement methodology cycle",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=300,
        )

    if SEARCH_CORPUS_ENABLED:
        _scheduler.add_job(
            _search_corpus_refresh_job,
            trigger="interval",
            seconds=SEARCH_CORPUS_INTERVAL,
            id="search_corpus_refresh",
            name="Search corpus window accumulator",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=300,
        )

    if FEATURE_MATERIALIZATION_ENABLED:
        _scheduler.add_job(
            _feature_materialization_refresh_job,
            trigger="interval",
            seconds=FEATURE_MATERIALIZATION_INTERVAL,
            id="feature_materialization_refresh",
            name="Canonical feature plane materializer",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=120,
        )

    # Job: Corpus bridge — FeatureMaterializationStore → SearchCorpusStore (every 30 min)
    # Runs after feature_materialization (15 min) so corpus stays enriched.
    # Always on — core search quality path.
    _scheduler.add_job(
        _corpus_bridge_sync_job,
        trigger="interval",
        seconds=1800,
        id="corpus_bridge_sync",
        name="Corpus bridge enrichment (40+ dims)",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    # Job: Feature windows prefetcher — builds feature_windows.sqlite (every 6 hours)
    # Powers similar.py Layer A/C enrichment (3D → 40+D).
    # Always on — core search quality path.
    _scheduler.add_job(
        _feature_windows_prefetch_job,
        trigger="interval",
        seconds=21600,
        id="feature_windows_prefetch",
        name="Feature windows store prefetcher",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=600,
    )

    # Job: Alpha Universe COLD scanner — every 4 hours
    _scheduler.add_job(
        scan_alpha_observer_job,
        trigger="interval",
        seconds=14400,
        id="alpha_observer_cold",
        name="Alpha Universe COLD observer (4h)",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=600,
    )

    # Job: Alpha Universe WARM scanner — every 30 minutes (active phases only)
    _scheduler.add_job(
        scan_alpha_warm_job,
        trigger="interval",
        seconds=1800,
        id="alpha_observer_warm",
        name="Alpha Universe WARM observer (30min)",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )

    _scheduler.start()
    log.info(
        "Scanner started: block_scan=%ds pattern_scan=%ds auto_eval=3600s search_index=%ds refinement=%s universe=%s",
        SCAN_INTERVAL,
        SCAN_INTERVAL,
        MARKET_SEARCH_INDEX_REFRESH_INTERVAL,
        f"{PATTERN_REFINEMENT_INTERVAL}s" if PATTERN_REFINEMENT_ENABLED else "off",
        f"{SEARCH_CORPUS_INTERVAL}s" if SEARCH_CORPUS_ENABLED else "off",
        f"{FEATURE_MATERIALIZATION_INTERVAL}s" if FEATURE_MATERIALIZATION_ENABLED else "off",
        UNIVERSE_NAME,
    )


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    log.info("Scanner stopped")


def is_running() -> bool:
    return _scheduler is not None and _scheduler.running


def next_run_time() -> str | None:
    """ISO timestamp of the next scheduled scan, or None."""
    if _scheduler is None:
        return None
    job = _scheduler.get_job("universe_scan")
    if job is None or job.next_run_time is None:
        return None
    return job.next_run_time.isoformat()
