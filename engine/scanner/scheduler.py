"""Background scanner — L4 real-time alert engine.

Runs inside the FastAPI process via APScheduler (AsyncIOScheduler).
Every 15 minutes it scans every symbol in the configured universe,
computes features, evaluates all building blocks, and pushes any
signal hit to the `engine_alerts` Supabase table.
Start/stop is controlled by the FastAPI lifespan hook in api/main.py.
The scan loop is intentionally sequential (not concurrent) to avoid
bursting Binance rate limits during the feature-calc phase.
Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SCAN_INTERVAL_SECONDS,
SCAN_MIN_BLOCKS, SCAN_UNIVERSE.
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

from data_cache.loader import load_klines, load_macro_bundle, load_perp
from data_cache.market_search import refresh_market_search_index
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
from scanner.jobs.extreme_event_tracker import (
    extreme_event_detector_job,
    extreme_event_outcome_job,
)
from workers.feature_windows_prefetcher import prefetch_feature_windows as _fw_prefetch
from scanner.jobs.universe_scan import push_alert, scan_universe_job
from scanner.feature_calc import compute_features_table, compute_snapshot
from scoring.block_evaluator import evaluate_blocks
from scoring.lightgbm_engine import get_engine
from universe.config import DEFAULT_SCAN_UNIVERSE
from universe.loader import load_universe_async

log = logging.getLogger("engine.scanner")


def _watched_symbols() -> set[str]:
    """Return symbols from all is_watching=True captures (W-0335 PR-1)."""
    try:
        from capture.store import CaptureStore
        store = CaptureStore()
        captures = store.list(is_watching=True, limit=200)
        return {c.symbol for c in captures if c.symbol}
    except Exception as exc:
        log.debug("_watched_symbols: failed to read CaptureStore: %s", exc)
        return set()


async def _load_universe_with_watches(universe_name: str) -> list[str]:
    """Union default universe with watched-capture symbols (W-0335 PR-1)."""
    base = set(await load_universe_async(universe_name))
    watches = _watched_symbols()
    if watches - base:
        log.info("W-0335: adding %d watched symbols to scan universe: %s",
                 len(watches - base), sorted(watches - base)[:10])
    return sorted(base | watches)


_scheduler: AsyncIOScheduler | None = None
_last_pattern_entry_keys: set[str] = set()

# ── Config ────────────────────────────────────────────────────────────────────

SCAN_INTERVAL = int(os.environ.get("SCAN_INTERVAL_SECONDS", "900"))
MIN_BLOCKS = int(os.environ.get("SCAN_MIN_BLOCKS", "1"))
UNIVERSE_NAME = DEFAULT_SCAN_UNIVERSE
_ON = {"1", "true", "yes", "on"}
_OFF = {"0", "false", "no", "off"}
PATTERN_REFINEMENT_ENABLED = os.environ.get("ENABLE_PATTERN_REFINEMENT_JOB", "false").strip().lower() in _ON
PATTERN_REFINEMENT_INTERVAL = int(os.environ.get("PATTERN_REFINEMENT_INTERVAL_SECONDS", "21600"))
MARKET_SEARCH_INDEX_REFRESH_INTERVAL = int(os.environ.get("MARKET_SEARCH_INDEX_REFRESH_SECONDS", "1800"))
PATTERN_REFINEMENT_AUTO_TRAIN = os.environ.get("PATTERN_REFINEMENT_AUTO_TRAIN", "false").strip().lower() in _ON
SEARCH_CORPUS_ENABLED = os.environ.get("ENABLE_SEARCH_CORPUS_JOB", "false").strip().lower() in _ON
SEARCH_CORPUS_INTERVAL = int(os.environ.get("SEARCH_CORPUS_INTERVAL_SECONDS", "3600"))
SCAN_TELEGRAM_ENABLED = os.environ.get("SCAN_TELEGRAM_ENABLED", "1").strip().lower() not in _OFF
FEATURE_MATERIALIZATION_ENABLED = os.environ.get("ENABLE_FEATURE_MATERIALIZATION_JOB", "true").strip().lower() not in _OFF
FEATURE_MATERIALIZATION_INTERVAL = int(os.environ.get("FEATURE_MATERIALIZATION_INTERVAL_SECONDS", "900"))

# A8: Beta job gates — flywheel jobs default ON (W-0336); heavy infra jobs off.
_BETA_JOB_FLAGS = {
    "outcome_resolver": os.environ.get("ENABLE_OUTCOME_RESOLVER_JOB", "true"),
    "refinement_trigger": os.environ.get("ENABLE_REFINEMENT_TRIGGER_JOB", "true"),
    "fetch_okx_signals": os.environ.get("ENABLE_FETCH_OKX_SIGNALS_JOB", "true"),
    "corpus_bridge_sync": os.environ.get("ENABLE_CORPUS_BRIDGE_SYNC_JOB", "false"),
    "feature_windows_prefetch": os.environ.get("ENABLE_FEATURE_WINDOWS_PREFETCH_JOB", "false"),
    "alpha_observer_cold": os.environ.get("ENABLE_ALPHA_OBSERVER_COLD_JOB", "false"),
    "alpha_observer_warm": os.environ.get("ENABLE_ALPHA_OBSERVER_WARM_JOB", "false"),
    "extreme_event_detector": os.environ.get("EXTREME_EVENT_TRACKER_JOB", "false"),
    "extreme_event_outcome": os.environ.get("EXTREME_EVENT_OUTCOME_JOB", "false"),
    "backtest_stats_refresh": os.environ.get("ENABLE_BACKTEST_STATS_REFRESH_JOB", "false"),
    # W-0385: blocked candidate resolver + formula evidence materializer
    "blocked_candidate_resolver": os.environ.get("ENABLE_BLOCKED_CANDIDATE_RESOLVER_JOB", "true"),
    "formula_evidence_materializer": os.environ.get("ENABLE_FORMULA_EVIDENCE_MATERIALIZER_JOB", "true"),
}


def _job_enabled(job_id: str) -> bool:
    return _BETA_JOB_FLAGS.get(job_id, "true").strip().lower() in {"1", "true", "yes", "on"}


SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
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


# ── Core scan loop ─────────────────────────────────────────────────────────────

async def _scan_universe() -> None:
    await scan_universe_job(
        universe_name=UNIVERSE_NAME,
        min_blocks=MIN_BLOCKS,
        scan_telegram_enabled=SCAN_TELEGRAM_ENABLED,
        load_universe_async=_load_universe_with_watches,
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


async def _pattern_scan_job() -> None:
    """Pattern state machine scan (separate from block alerts)."""
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


async def _search_corpus_refresh_job() -> None:
    await search_corpus_refresh_job(universe_name=UNIVERSE_NAME)


async def _market_search_index_refresh_job() -> None:
    result = refresh_market_search_index()
    log.info("market_search_index refreshed: row_count=%d refreshed_at=%s", result.row_count, result.refreshed_at)


async def _corpus_bridge_sync_job() -> None:
    """Sync FeatureMaterializationStore → SearchCorpusStore (every 30 min)."""
    from features.corpus_bridge import sync_all_corpus  # noqa: PLC0415
    try:
        result = await asyncio.to_thread(sync_all_corpus)
        log.info("corpus_bridge_sync: %s", result)
    except Exception as exc:
        log.warning("corpus_bridge_sync failed (non-fatal): %s", exc)


# ── Lifecycle API ──────────────────────────────────────────────────────────────

def start_scheduler() -> None:
    """Start the APScheduler background scan loop."""
    global _scheduler
    if _scheduler is not None:
        log.debug("Scheduler already running")
        return
    validate_scheduler_secrets()

    _scheduler = AsyncIOScheduler(timezone="UTC")
    _add = _scheduler.add_job  # brevity alias

    # Always-on jobs
    _add(_scan_universe, "interval", seconds=SCAN_INTERVAL,
         id="universe_scan", name="Universe block scanner",
         max_instances=1, coalesce=True, misfire_grace_time=120)
    _add(_pattern_scan_job, "interval", seconds=SCAN_INTERVAL,
         id="pattern_scan", name="Pattern state machine scanner",
         max_instances=1, coalesce=True, misfire_grace_time=120)
    _add(auto_evaluate_job, "interval", seconds=3600,
         id="auto_evaluate", name="Ledger auto-evaluator",
         max_instances=1, coalesce=True, misfire_grace_time=300)

    # Beta-gated flywheel jobs
    if _job_enabled("outcome_resolver"):
        _add(outcome_resolver_job, "interval", seconds=3600,
             id="outcome_resolver", name="Capture outcome resolver",
             max_instances=1, coalesce=True, misfire_grace_time=300)
    if _job_enabled("refinement_trigger"):
        _add(refinement_trigger_job, "interval", seconds=86400,
             id="refinement_trigger", name="Data-driven refinement trigger",
             max_instances=1, coalesce=True, misfire_grace_time=3600)
    if _job_enabled("fetch_okx_signals"):
        from scanner.jobs.okx_signals import fetch_okx_signals_job as _okx  # noqa: PLC0415
        _add(_okx, "interval", seconds=21600,
             id="fetch_okx_signals", name="OKX smart money signal fetcher",
             max_instances=1, coalesce=True, misfire_grace_time=300)

    # Flag-gated optional jobs
    if PATTERN_REFINEMENT_ENABLED:
        _add(lambda: pattern_refinement_job(auto_train_candidate=PATTERN_REFINEMENT_AUTO_TRAIN),
             "interval", seconds=PATTERN_REFINEMENT_INTERVAL,
             id="pattern_refinement", name="Pattern refinement cycle",
             max_instances=1, coalesce=True, misfire_grace_time=300)
    if SEARCH_CORPUS_ENABLED:
        _add(lambda: search_corpus_refresh_job(universe_name=UNIVERSE_NAME),
             "interval", seconds=SEARCH_CORPUS_INTERVAL,
             id="search_corpus_refresh", name="Search corpus accumulator",
             max_instances=1, coalesce=True, misfire_grace_time=300)
    if FEATURE_MATERIALIZATION_ENABLED:
        from scanner.jobs.feature_materialization import run_materialization_refresh as _mat  # noqa: PLC0415
        _add(lambda: _mat(universe_name=UNIVERSE_NAME), "interval",
             seconds=FEATURE_MATERIALIZATION_INTERVAL,
             id="feature_materialization_refresh", name="Canonical feature plane materializer",
             max_instances=1, coalesce=True, misfire_grace_time=120)

    # Heavy infra jobs (off by default)
    if _job_enabled("corpus_bridge_sync"):
        _add(_corpus_bridge_sync_job, "interval", seconds=1800,
             id="corpus_bridge_sync", name="Corpus bridge (40+ dims)",
             max_instances=1, coalesce=True, misfire_grace_time=300)
    if _job_enabled("feature_windows_prefetch"):
        _add(_fw_prefetch, "interval", seconds=21600,
             id="feature_windows_prefetch", name="Feature windows prefetcher",
             max_instances=1, coalesce=True, misfire_grace_time=600)
    if _job_enabled("alpha_observer_cold"):
        _add(scan_alpha_observer_job, "interval", seconds=14400,
             id="alpha_observer_cold", name="Alpha COLD observer (4h)",
             max_instances=1, coalesce=True, misfire_grace_time=600)
    if _job_enabled("alpha_observer_warm"):
        _add(scan_alpha_warm_job, "interval", seconds=1800,
             id="alpha_observer_warm", name="Alpha WARM observer (30min)",
             max_instances=1, coalesce=True, misfire_grace_time=120)
    if _job_enabled("extreme_event_detector"):
        _add(lambda: extreme_event_detector_job(UNIVERSE_NAME), "interval",
             seconds=1800, jitter=60, id="extreme_event_detector",
             name="Extreme event detector (30min)",
             max_instances=1, coalesce=True, misfire_grace_time=300)
    if _job_enabled("extreme_event_outcome"):
        _add(extreme_event_outcome_job, "interval", seconds=3600, jitter=120,
             id="extreme_event_outcome", name="Extreme event outcome resolver (1h)",
             max_instances=1, coalesce=True, misfire_grace_time=600)

    # W-0377: Signal outcome resolver — hourly, default ON
    if os.environ.get("ENABLE_SIGNAL_EVENTS", "true").lower() == "true":
        from scanner.jobs.signal_events_job import register_signal_events  # noqa: PLC0415
        register_signal_events(_scheduler)

    # W-0369: Daily backtest stats refresh — 03:00 UTC
    if _job_enabled("backtest_stats_refresh"):
        from scanner.jobs.backtest_stats_refresh import backtest_stats_refresh_job as _bsr  # noqa: PLC0415
        _add(_bsr, "cron", hour=3, minute=0, id="backtest_stats_refresh",
             name="Daily backtest stats refresh (W-0369)",
             max_instances=1, coalesce=True, misfire_grace_time=3600)

    # W-0385: Blocked candidate P&L resolver — hourly
    if _job_enabled("blocked_candidate_resolver"):
        async def _blocked_candidate_resolve_job() -> None:  # noqa: E306
            from scanner.jobs.blocked_candidate_resolver import resolve_batch  # noqa: PLC0415
            filled = await asyncio.to_thread(resolve_batch)
            log.info("blocked_candidate_resolver: %d rows filled", filled)
        _add(_blocked_candidate_resolve_job, "interval", seconds=3600,
             id="blocked_candidate_resolver", name="Blocked candidate P&L resolver (W-0385)",
             max_instances=1, coalesce=True, misfire_grace_time=600)

    # W-0385: Formula evidence daily materializer — 03:30 UTC
    if _job_enabled("formula_evidence_materializer"):
        async def _formula_evidence_materialize_job() -> None:  # noqa: E306
            from scanner.jobs.formula_evidence_materializer import materialize_all  # noqa: PLC0415
            rows = await asyncio.to_thread(materialize_all)
            log.info("formula_evidence_materializer: %d rows written", rows)
        _add(_formula_evidence_materialize_job, "cron", hour=3, minute=30,
             id="formula_evidence_materializer", name="Formula evidence daily materializer (W-0385)",
             max_instances=1, coalesce=True, misfire_grace_time=1800)

    _scheduler.start()
    log.info(
        "Scanner started: block_scan=%ds pattern_scan=%ds universe=%s",
        SCAN_INTERVAL, SCAN_INTERVAL, UNIVERSE_NAME,
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


def get_jobs_status() -> list[dict]:
    """Return status snapshot of all registered APScheduler jobs.

    Used by GET /api/agent-status for real-time harness observability.
    """
    if _scheduler is None:
        return []
    result = []
    for job in _scheduler.get_jobs():
        next_run = job.next_run_time.isoformat() if job.next_run_time else None
        result.append({
            "id": job.id,
            "name": job.name,
            "next_run": next_run,
            "pending": job.pending,
            "misfire_grace_time": job.misfire_grace_time,
        })
    return result
