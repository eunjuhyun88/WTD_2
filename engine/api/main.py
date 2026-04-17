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
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from api.routes import backtest, captures, challenge, ctx, score, train, verdict, scanner, deep, universe, patterns, memory, screener, opportunity, rag
from market_engine.ctx_cache import refresh_global_ctx
from scanner.scheduler import is_running, next_run_time, start_scheduler, stop_scheduler
from security_runtime import (
    assert_public_runtime_security,
    build_allowed_hosts,
    build_allowed_origins,
    build_docs_urls,
    get_public_runtime_security_warnings,
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
    # Warm up L0 GlobalCtx cache before serving requests
    try:
        await refresh_global_ctx()
    except Exception as exc:
        log.warning("GlobalCtx warm-up failed (non-fatal): %s", exc)
    if scheduler_enabled():
        start_scheduler()
        log.info("Engine started — GlobalCtx warm, background scanner active")
    else:
        log.info("Engine started — GlobalCtx warm, scheduler disabled")
    yield
    if scheduler_enabled():
        stop_scheduler()
        log.info("Engine shutdown — scanner stopped")
    else:
        log.info("Engine shutdown")


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

app.add_middleware(TrustedHostMiddleware, allowed_hosts=build_allowed_hosts())

app.add_middleware(
    CORSMiddleware,
    allow_origins=build_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["authorization", "content-type", "x-request-id"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):  # noqa: ANN001
    start = time.perf_counter()
    request_id = request.headers.get("x-request-id") or str(uuid4())
    increment("http.requests_total")
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000.0
    observe_ms(f"http.route.{request.url.path}", duration_ms)
    observe_ms("http.request_duration_ms", duration_ms)
    increment(f"http.status.{response.status_code}")
    response.headers["x-request-id"] = request_id
    log.info("%s %s status=%s request_id=%s", request.method, request.url.path, response.status_code, request_id)
    return response

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

app.include_router(score.router,    prefix="/score",    tags=["scoring"])
app.include_router(deep.router,     prefix="/deep",     tags=["deep"])
app.include_router(ctx.router,      prefix="/ctx",      tags=["context"])
app.include_router(universe.router, prefix="/universe", tags=["universe"])
app.include_router(opportunity.router, prefix="/opportunity", tags=["opportunity"])
app.include_router(backtest.router, prefix="/backtest", tags=["backtest"])
app.include_router(challenge.router, prefix="/challenge", tags=["challenge"])
app.include_router(train.router, prefix="/train", tags=["training"])
app.include_router(verdict.router, prefix="/verdict", tags=["verdict"])
app.include_router(scanner.router, prefix="/scanner", tags=["scanner"])
app.include_router(patterns.router, prefix="/patterns", tags=["patterns"])
app.include_router(captures.router, prefix="/captures", tags=["captures"])
app.include_router(memory.router, prefix="/memory", tags=["memory"])
app.include_router(screener.router, prefix="/screener", tags=["screener"])
app.include_router(rag.router, prefix="/rag", tags=["rag"])


@app.get("/healthz", tags=["meta"])
def healthz() -> dict:
    return health_payload(app.version)


@app.get("/readyz", tags=["meta"])
def readyz() -> dict:
    return readiness_payload(app.version, scheduler_enabled=scheduler_enabled())


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
