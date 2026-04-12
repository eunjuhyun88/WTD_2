"""POST /scanner/run — trigger a scan cycle.

Called by:
  - Vercel Cron (every hour)
  - Manual trigger from dashboard
  - CLI: curl -X POST http://localhost:8000/scanner/run
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field

from scanner.realtime import run_scan, ScanResult, DEFAULT_SYMBOLS
from scanner.alerts import send_telegram_alert, send_scan_summary

router = APIRouter()


class ScanRequest(BaseModel):
    symbols: Optional[list[str]] = None   # None = DEFAULT_SYMBOLS
    send_alerts: bool = True


class ScanResponse(BaseModel):
    scanned_at: str
    n_symbols: int
    n_signals: int
    signals: list[dict]
    errors: list[str]
    duration_sec: float


@router.post("/run", response_model=ScanResponse)
async def trigger_scan(
    req: ScanRequest = ScanRequest(),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> ScanResponse:
    """Run a full scan cycle and optionally send Telegram alerts."""
    result = await run_scan(symbols=req.symbols)

    # Send alerts in background (don't block response)
    if req.send_alerts:
        for signal in result.signals:
            background_tasks.add_task(
                send_telegram_alert, signal.to_dict()
            )
        background_tasks.add_task(
            send_scan_summary, result.to_dict()
        )

    return ScanResponse(**result.to_dict())
