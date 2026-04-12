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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import backtest, challenge, score, train

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("engine")

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

app.include_router(score.router, prefix="/score", tags=["scoring"])
app.include_router(backtest.router, prefix="/backtest", tags=["backtest"])
app.include_router(challenge.router, prefix="/challenge", tags=["challenge"])
app.include_router(train.router, prefix="/train", tags=["training"])


@app.get("/healthz", tags=["meta"])
def healthz() -> dict:
    return {"status": "ok", "version": app.version}


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
