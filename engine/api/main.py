"""Cogochi Engine — FastAPI server.

Entry point:
    uv run uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

Environment variables:
    ENGINE_PORT     (default: 8000)
    ENGINE_LOG      structured | plain (default: plain)
    ENGINE_ENABLE_SCHEDULER  true | false (default: true)
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler  # type: ignore[import]
from slowapi.errors import RateLimitExceeded  # type: ignore[import]
from starlette.middleware.trustedhost import TrustedHostMiddleware

from api.limiter import limiter
from api.routes import backtest, captures, challenge, chart, ctx, score, train, verdict, scanner, deep, universe, patterns, memory, screener, opportunity, rag, live_signals, observability, dalkkak, alpha, jobs, refinement
from cache.http_client import close_client, init_client
from cache.kline_cache import close_pool, init_pool
from market_engine.ctx_cache import refresh_global_ctx
from scanner.scheduler import is_running, next_run_time, start_scheduler, stop_scheduler
from workers.kline_prefetcher import prefetch_klines
from security_runtime import (
    assert_public_runtime_security,
    build_allowed_hosts,
    build_allowed_origins,
    build_docs_urls,
    get_runtime_role,
    get_public_runtime_security_warnings,
    runtime_serves_public_api,
    runtime_serves_worker_control,
    validate_internal_request,
)
from universe.config import DEFAULT_SCAN_UNIVERSE
from observability.health import health_payload, readiness_payload
from observability.metrics import increment, observe_ms, snapshot as metrics_snapshot

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("engine")
for runtime_warning in get_public_runtime_security_warnings():
    log.warning("[runtime-security] %s", runtime_warning)


def scheduler_enabled() -> bool:
    if not runtime_serves_worker_control():
        return False
    return os.getenv("ENGINE_ENABLE_SCHEDULER", "true").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }

# ---------------------------------------------------------------------------
# Lifespan — start/stop background scanner
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN001
    # HTTP pool — shared AsyncClient for all engine outbound requests
    await init_client()

    # Redis pool — must be second so downstream warm-ups can write to cache
    await init_pool()

    # Warm up L0 GlobalCtx cache before serving requests
    try:
        await refresh_global_ctx()
    except Exception as exc:
        log.warning("GlobalCtx warm-up failed (non-fatal): %s", exc)

    # Pre-populate Redis kline cache from local CSV (non-blocking, best-effort)
    try:
        await prefetch_klines()
    except Exception as exc:
        log.warning("kline prefetch warm-up failed (non-fatal): %s", exc)

    if scheduler_enabled():
        from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore[import]
        _kline_scheduler = AsyncIOScheduler()
        _kline_scheduler.add_job(
            prefetch_klines,
            "interval",
            minutes=5,
            id="kline_prefetch",
            replace_existing=True,
        )
        _kline_scheduler.start()
        start_scheduler()
        log.info("Engine started — Redis warm, GlobalCtx warm, background scanner active")
    else:
        _kline_scheduler = None
        log.info("Engine started — Redis warm, GlobalCtx warm, scheduler disabled")

    yield

    if _kline_scheduler is not None:
        _kline_scheduler.shutdown(wait=False)
    if scheduler_enabled():
        stop_scheduler()
        log.info("Engine shutdown — scanner stopped")
    else:
        log.info("Engine shutdown")
    await close_pool()
    await close_client()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

assert_public_runtime_security()
docs_url, openapi_url = build_docs_urls()

app = FastAPI(
    title="Cogochi Engine",
    version="0.2.0",
    description=(
        "Python intelligence layer: feature calculation, LightGBM scoring, "
        "historical pattern matching, backtest, and learning loop."
    ),
    docs_url=docs_url,
    redoc_url=None,
    openapi_url=openapi_url,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=build_allowed_hosts())

app.add_middleware(
    CORSMiddleware,
    allow_origins=build_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["authorization", "content-type", "x-request-id"],
)


import re as _re

def _route_label(path: str) -> str:
    """Normalise dynamic path segments so metric keys stay bounded."""
    path = _re.sub(r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/{uuid}', path)
    path = _re.sub(r'/[A-Z]{2,10}USDT?(?=/|$)', '/{symbol}', path)
    path = _re.sub(r'/\d+(?=/|$)', '/{id}', path)
    return path


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):  # noqa: ANN001
    start = time.perf_counter()
    request_id = request.headers.get("x-request-id") or str(uuid4())
    increment("http.requests_total")
    auth_error = validate_internal_request(
        request.url.path,
        request.headers.get("x-engine-internal-secret", "").strip(),
    )
    if auth_error is not None:
        status, detail = auth_error
        response = JSONResponse({"detail": detail}, status_code=status)
        response.headers["x-request-id"] = request_id
        increment(f"http.status.{status}")
        return response
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000.0
    observe_ms(f"http.route.{_route_label(request.url.path)}", duration_ms)
    observe_ms("http.request_duration_ms", duration_ms)
    increment(f"http.status.{response.status_code}")
    response.headers["x-request-id"] = request_id
    response.headers["x-process-time-ms"] = f"{duration_ms:.1f}"
    _level = logging.WARNING if duration_ms > 500 else logging.INFO
    log.log(_level, "%s %s status=%s dur=%.0fms request_id=%s",
            request.method, request.url.path, response.status_code, duration_ms, request_id)
    return response

def _include_public_engine_routes(target: FastAPI) -> None:
    target.include_router(chart.router, prefix="/chart", tags=["chart"])
    target.include_router(score.router, prefix="/score", tags=["scoring"])
    target.include_router(deep.router, prefix="/deep", tags=["deep"])
    target.include_router(ctx.router, prefix="/ctx", tags=["context"])
    target.include_router(universe.router, prefix="/universe", tags=["universe"])
    target.include_router(opportunity.router, prefix="/opportunity", tags=["opportunity"])
    target.include_router(backtest.router, prefix="/backtest", tags=["backtest"])
    target.include_router(challenge.router, prefix="/challenge", tags=["challenge"])
    target.include_router(train.router, prefix="/train", tags=["training"])
    target.include_router(verdict.router, prefix="/verdict", tags=["verdict"])
    target.include_router(scanner.router, prefix="/scanner", tags=["scanner"])
    target.include_router(patterns.router, prefix="/patterns", tags=["patterns"])
    target.include_router(captures.router, prefix="/captures", tags=["captures"])
    target.include_router(memory.router, prefix="/memory", tags=["memory"])
    target.include_router(screener.router, prefix="/screener", tags=["screener"])
    target.include_router(rag.router, prefix="/rag", tags=["rag"])
    target.include_router(live_signals.router, prefix="/live-signals", tags=["live-signals"])
    target.include_router(observability.router, prefix="/observability", tags=["observability"])
    target.include_router(dalkkak.router, prefix="/dalkkak", tags=["dalkkak"])
    target.include_router(alpha.router, tags=["alpha"])
    target.include_router(refinement.router, prefix="/refinement", tags=["refinement"])


def _include_worker_control_routes(target: FastAPI) -> None:
    target.include_router(jobs.router, tags=["jobs"])


def include_engine_routes(target: FastAPI, *, runtime_role: str | None = None) -> None:
    role = runtime_role or get_runtime_role()
    if runtime_serves_public_api(role):
        _include_public_engine_routes(target)
    if runtime_serves_worker_control(role):
        _include_worker_control_routes(target)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

include_engine_routes(app)


@app.get("/healthz", tags=["meta"])
def healthz() -> dict:
    return health_payload(app.version)


@app.get("/readyz", tags=["meta"])
def readyz() -> dict:
    return readiness_payload(
        app.version,
        scheduler_enabled=scheduler_enabled(),
        runtime_role=get_runtime_role(),
    )


@app.get("/metrics", tags=["meta"])
def metrics() -> dict:
    return metrics_snapshot()


@app.get("/scanner/status", tags=["meta"])
def scanner_status() -> dict:
    return {
        "running": is_running(),
        "next_scan": next_run_time(),
        "interval_seconds": int(os.getenv("SCAN_INTERVAL_SECONDS", "900")),
        "universe": DEFAULT_SCAN_UNIVERSE,
    }


# ---------------------------------------------------------------------------
# Dev entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=int(os.getenv("ENGINE_PORT", "8000")),
        reload=True,
        log_level="info",
    )
