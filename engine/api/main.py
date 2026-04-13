"""Cogochi Engine — FastAPI server.

Entry point:
    uv run uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

Environment variables:
    ENGINE_PORT     (default: 8000)
    ENGINE_LOG      structured | plain (default: plain)
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import backtest, challenge, ctx, score, train, verdict, scanner, deep, universe, patterns
from market_engine.ctx_cache import refresh_global_ctx
from scanner.scheduler import is_running, next_run_time, start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("engine")


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
    start_scheduler()
    log.info("Engine started — GlobalCtx warm, background scanner active")
    yield
    stop_scheduler()
    log.info("Engine shutdown — scanner stopped")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Cogochi Engine",
    version="0.2.0",
    description=(
        "Python intelligence layer: feature calculation, LightGBM scoring, "
        "historical pattern matching, backtest, and learning loop."
    ),
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

# Allow SvelteKit dev server and production domain.
_origins = [
    "http://localhost:5173",   # SvelteKit dev
    "http://localhost:4173",   # SvelteKit preview
    os.getenv("APP_ORIGIN", "https://cogochi.com"),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

app.include_router(score.router,    prefix="/score",    tags=["scoring"])
app.include_router(deep.router,     prefix="/deep",     tags=["deep"])
app.include_router(ctx.router,      prefix="/ctx",      tags=["context"])
app.include_router(universe.router, prefix="/universe", tags=["universe"])
app.include_router(backtest.router, prefix="/backtest", tags=["backtest"])
app.include_router(challenge.router, prefix="/challenge", tags=["challenge"])
<<<<<<< HEAD
app.include_router(train.router,     prefix="/train",    tags=["training"])
app.include_router(verdict.router,   prefix="/verdict",  tags=["verdict"])
app.include_router(scanner.router,   prefix="/scanner",  tags=["scanner"])
app.include_router(patterns.router,  prefix="/patterns", tags=["patterns"])
=======
app.include_router(train.router, prefix="/train", tags=["training"])
app.include_router(verdict.router, prefix="/verdict", tags=["verdict"])
app.include_router(scanner.router, prefix="/scanner", tags=["scanner"])
app.include_router(patterns.router, prefix="/patterns", tags=["patterns"])
>>>>>>> ff2ede4 (feat(pattern-engine): TRADOOR pattern engine — StateMachine, Ledger, ChartBoard, 5 blocks)


@app.get("/healthz", tags=["meta"])
def healthz() -> dict:
    return {"status": "ok", "version": app.version}


@app.get("/scanner/status", tags=["meta"])
def scanner_status() -> dict:
    return {
        "running": is_running(),
        "next_scan": next_run_time(),
        "interval_seconds": int(os.getenv("SCAN_INTERVAL_SECONDS", "900")),
        "universe": os.getenv("SCAN_UNIVERSE", "binance_30"),
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
