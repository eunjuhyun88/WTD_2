"""GET /live-signals, POST /live-signals/verdict — W-0092 User Overlay.

Exposes live pattern phase scan results to the app surface and stores
user verdicts for future threshold calibration.

Endpoints:
    GET  /live-signals          → run (or return cached) scan_universe_live()
    POST /live-signals/verdict  → append user verdict to verdicts.jsonl
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from research.live_monitor import LiveScanResult, scan_universe_live

router = APIRouter()

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

_CACHE_TTL = int(os.getenv("LIVE_SIGNAL_CACHE_TTL_SECONDS", "3600"))
_cache_result: list[dict] | None = None
_cache_ts: float = 0.0

# ---------------------------------------------------------------------------
# Verdict storage
# ---------------------------------------------------------------------------

_VERDICTS_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "research" / "experiments" / "verdicts.jsonl"
)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class _VerdictBody(BaseModel):
    signal_id: str
    symbol: str
    phase: str
    verdict: str   # "valid" | "invalid" | "late" | "noisy"
    note: str | None = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def get_live_signals() -> dict:
    """Return current live scan results (ACCUMULATION / REAL_DUMP candidates).

    Results are cached for LIVE_SIGNAL_CACHE_TTL_SECONDS (default 1h) to
    avoid hammering the Binance API on every terminal load.
    """
    global _cache_result, _cache_ts

    now = time.monotonic()
    cached = _cache_result is not None and (now - _cache_ts) < _CACHE_TTL

    if not cached:
        results: list[LiveScanResult] = await asyncio.to_thread(scan_universe_live)
        _cache_result = [r.to_dict() for r in results]
        _cache_ts = now

    return {
        "signals": _cache_result,
        "cached": cached,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "cache_ttl_seconds": _CACHE_TTL,
    }


@router.post("/verdict")
async def post_verdict(body: _VerdictBody) -> dict:
    """Record user verdict for a live signal.

    Appends one JSON line to verdicts.jsonl.
    """
    record = {
        "signal_id": body.signal_id,
        "symbol": body.symbol,
        "phase": body.phase,
        "verdict": body.verdict,
        "note": body.note,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }
    _VERDICTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _VERDICTS_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")

    return {"ok": True, "recorded": record}
