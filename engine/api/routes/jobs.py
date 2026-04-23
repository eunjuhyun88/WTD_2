"""
/jobs — Cloud Scheduler HTTP-triggered job endpoints.

Security:
  All endpoints require `Authorization: Bearer <SCHEDULER_SECRET>` header.
  Cloud Scheduler is configured with the same secret in the message body header.

Resource optimization:
  - Redis distributed lock prevents concurrent execution of the same job.
  - Adaptive throttle: skips if last successful run < MIN_INTERVAL_SECONDS ago.
  - Circuit breaker: after N consecutive failures, pauses the job for PAUSE_SECONDS.
  - All state stored in Redis with TTL → auto-expires, no manual cleanup.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

log = logging.getLogger("engine.jobs")

router = APIRouter(prefix="/jobs", tags=["jobs"])

# ── Config ─────────────────────────────────────────────────────────────────────

SCHEDULER_SECRET = os.environ.get("SCHEDULER_SECRET", "")

# Minimum seconds between successful runs (anti-thrash)
_MIN_INTERVAL: dict[str, int] = {
    "pattern_scan":     600,    # 10 min minimum (scheduled every 15)
    "outcome_resolver": 3300,   # 55 min minimum (scheduled hourly)
    "auto_capture":     600,    # 10 min minimum (scheduled every 15)
    "search_corpus":    1800,   # 30 min minimum (scheduled hourly)
    "db_cleanup":       82800,  # 23 hr minimum (scheduled daily)
}

# Redis lock TTL = max allowed job duration
_LOCK_TTL: dict[str, int] = {
    "pattern_scan":     840,   # 14 min
    "outcome_resolver": 300,   # 5 min
    "auto_capture":     120,   # 2 min
    "search_corpus":    600,   # 10 min
    "db_cleanup":       120,   # 2 min
}

# Circuit breaker: pause job after N consecutive failures
_CIRCUIT_FAIL_THRESHOLD = 3
_CIRCUIT_PAUSE_SECONDS  = 300  # 5 min pause


# ── Auth dependency ─────────────────────────────────────────────────────────────

def _require_scheduler(request: Request) -> None:
    if not SCHEDULER_SECRET:
        raise HTTPException(status_code=503, detail="scheduler secret not configured")
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    if auth.removeprefix("Bearer ").strip() != SCHEDULER_SECRET:
        raise HTTPException(status_code=403, detail="invalid scheduler secret")


# ── Resource guard ──────────────────────────────────────────────────────────────

async def _redis() -> Any:
    """Return the shared Redis pool, or None if unavailable."""
    try:
        import cache.kline_cache as _kc
        return _kc._pool
    except Exception:
        return None


async def _acquire_lock(job: str) -> bool:
    """Try to acquire a distributed lock for `job`. Returns True if acquired."""
    r = await _redis()
    if r is None:
        return True  # No Redis → allow (non-distributed fallback)
    key = f"job:lock:{job}"
    ttl = _LOCK_TTL.get(job, 600)
    acquired = await r.set(key, "1", nx=True, ex=ttl)
    return bool(acquired)


async def _release_lock(job: str) -> None:
    r = await _redis()
    if r is None:
        return
    await r.delete(f"job:lock:{job}")


async def _check_throttle(job: str) -> tuple[bool, int]:
    """Returns (should_skip, seconds_since_last_run)."""
    r = await _redis()
    if r is None:
        return False, 0
    key = f"job:last_ok:{job}"
    val = await r.get(key)
    if val is None:
        return False, 0
    elapsed = int(time.time()) - int(val)
    min_interval = _MIN_INTERVAL.get(job, 300)
    return elapsed < min_interval, elapsed


async def _record_success(job: str) -> None:
    r = await _redis()
    if r is None:
        return
    await r.set(f"job:last_ok:{job}", str(int(time.time())), ex=86400)
    await r.set(f"job:fail_count:{job}", "0", ex=86400)
    await r.set(f"job:last_result:{job}", "ok", ex=86400)


async def _record_failure(job: str, error: str) -> None:
    r = await _redis()
    if r is None:
        return
    key = f"job:fail_count:{job}"
    count = int(await r.incr(key))
    await r.expire(key, 86400)
    await r.set(f"job:last_result:{job}", f"error:{error[:120]}", ex=86400)
    if count >= _CIRCUIT_FAIL_THRESHOLD:
        await r.set(f"job:circuit_open:{job}", "1", ex=_CIRCUIT_PAUSE_SECONDS)
        log.warning("Circuit breaker OPEN for job=%s after %d failures", job, count)


async def _circuit_open(job: str) -> bool:
    r = await _redis()
    if r is None:
        return False
    return bool(await r.get(f"job:circuit_open:{job}"))


async def _run_with_guard(job: str, coro) -> JSONResponse:  # noqa: ANN001
    """Wrap a job coroutine with lock + throttle + circuit breaker."""
    # Circuit breaker check
    if await _circuit_open(job):
        log.info("Job %s skipped — circuit breaker open", job)
        return JSONResponse({"status": "skipped", "reason": "circuit_open"}, status_code=200)

    # Throttle check
    should_skip, elapsed = await _check_throttle(job)
    if should_skip:
        log.info("Job %s skipped — ran %ds ago (min_interval=%d)", job, elapsed, _MIN_INTERVAL.get(job))
        return JSONResponse({"status": "skipped", "reason": "throttled", "elapsed_s": elapsed}, status_code=200)

    # Distributed lock
    if not await _acquire_lock(job):
        log.info("Job %s skipped — already running (lock held)", job)
        return JSONResponse({"status": "skipped", "reason": "already_running"}, status_code=200)

    start = time.time()
    try:
        log.info("Job %s starting", job)
        await coro
        elapsed_run = round(time.time() - start, 1)
        await _record_success(job)
        log.info("Job %s completed in %.1fs", job, elapsed_run)
        return JSONResponse({"status": "ok", "elapsed_s": elapsed_run})
    except Exception as exc:
        elapsed_run = round(time.time() - start, 1)
        await _record_failure(job, str(exc))
        log.exception("Job %s failed after %.1fs: %s", job, elapsed_run, exc)
        return JSONResponse(
            {"status": "error", "error": "job execution failed", "elapsed_s": elapsed_run},
            status_code=500,
        )
    finally:
        await _release_lock(job)


# ── Endpoints ───────────────────────────────────────────────────────────────────

@router.post("/pattern_scan/run")
async def run_pattern_scan(
    _: None = Depends(_require_scheduler),
) -> JSONResponse:
    """Cloud Scheduler → trigger pattern state machine scan."""
    from scanner.scheduler import _pattern_scan_job
    return await _run_with_guard("pattern_scan", _pattern_scan_job())


@router.post("/outcome_resolver/run")
async def run_outcome_resolver(
    _: None = Depends(_require_scheduler),
) -> JSONResponse:
    """Cloud Scheduler → run outcome resolution for pending captures."""
    from scanner.scheduler import _outcome_resolver_job
    return await _run_with_guard("outcome_resolver", _outcome_resolver_job())


@router.post("/auto_capture/run")
async def run_auto_capture(
    _: None = Depends(_require_scheduler),
) -> JSONResponse:
    """Cloud Scheduler → capture current pattern candidates."""
    from api.routes.captures import _auto_capture_job
    return await _run_with_guard("auto_capture", _auto_capture_job())


@router.post("/search_corpus/run")
async def run_search_corpus(
    _: None = Depends(_require_scheduler),
) -> JSONResponse:
    """Cloud Scheduler → refresh compact search corpus from local cache."""
    from scanner.scheduler import _search_corpus_refresh_job
    return await _run_with_guard("search_corpus", _search_corpus_refresh_job())


@router.post("/db_cleanup/run")
async def run_db_cleanup(
    _: None = Depends(_require_scheduler),
) -> JSONResponse:
    """Cloud Scheduler (daily) → purge stale rows from high-growth tables.

    Retention policy:
      engine_alerts            →  7 days  (scan signals, replaced each cycle)
      opportunity_scans        →  7 days  (per-table comment: 7d recommended)
      terminal_pattern_captures → 90 days (user data: longer retention)
    """
    async def _job() -> None:
        import os
        from datetime import datetime, timedelta, timezone
        from supabase import create_client  # type: ignore[import]

        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")

        sb = create_client(url, key)
        now = datetime.now(timezone.utc)
        cutoff_7d  = (now - timedelta(days=7)).isoformat()
        cutoff_90d = (now - timedelta(days=90)).isoformat()

        # engine_alerts uses scanned_at; 7-day retention
        r1 = sb.table("engine_alerts").delete().lt("scanned_at", cutoff_7d).execute()
        # opportunity_scans uses created_at; 7-day retention (per table comment)
        r2 = sb.table("opportunity_scans").delete().lt("created_at", cutoff_7d).execute()
        # terminal_pattern_captures: user data, 90-day retention
        r3 = sb.table("terminal_pattern_captures").delete().lt("created_at", cutoff_90d).execute()

        deleted = {
            "engine_alerts":            len(r1.data or []),
            "opportunity_scans":        len(r2.data or []),
            "terminal_pattern_captures": len(r3.data or []),
        }
        log.info("db_cleanup deleted: %s", deleted)

    return await _run_with_guard("db_cleanup", _job())


@router.get("/status")
async def jobs_status() -> JSONResponse:
    """Return resource guard state for all managed jobs."""
    r = await _redis()
    jobs = ["pattern_scan", "outcome_resolver", "auto_capture", "search_corpus", "db_cleanup"]
    result: dict[str, Any] = {}

    for job in jobs:
        last_ok_raw = await r.get(f"job:last_ok:{job}") if r else None
        fail_count_raw = await r.get(f"job:fail_count:{job}") if r else None
        last_result = await r.get(f"job:last_result:{job}") if r else None
        lock_held = not bool(await r.set(f"job:lock:{job}", "1", nx=True, ex=1)) if r else False
        circuit = bool(await r.get(f"job:circuit_open:{job}")) if r else False

        last_ok_s = int(time.time()) - int(last_ok_raw) if last_ok_raw else None

        result[job] = {
            "last_ok_ago_s": last_ok_s,
            "fail_count": int(fail_count_raw) if fail_count_raw else 0,
            "last_result": last_result.decode() if isinstance(last_result, bytes) else last_result,
            "lock_held": lock_held,
            "circuit_open": circuit,
        }

    return JSONResponse({"jobs": result, "redis_connected": r is not None})
