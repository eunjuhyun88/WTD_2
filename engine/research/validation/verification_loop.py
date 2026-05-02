"""W-0367: Hourly outcome resolver for scan_signal_events."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

log = logging.getLogger("engine.research.verification_loop")

HORIZONS = [1, 4, 24, 72]


def resolve_pending_outcomes() -> int:
    """Fetch unresolved signal outcomes, get current prices, compute triple_barrier.

    Returns count of resolved outcomes.
    """
    from research.signal_event_store import fetch_unresolved, resolve_outcome

    unresolved = fetch_unresolved(limit=500)
    resolved_count = 0

    for row in unresolved:
        try:
            _resolve_one(row)
            resolved_count += 1
        except Exception as exc:
            log.warning(
                "resolve failed for signal %s horizon %s: %s",
                row.get("signal_id"),
                row.get("horizon_h"),
                exc,
            )

    return resolved_count


def _resolve_one(row: dict) -> None:
    """Resolve one signal/horizon outcome using market price at horizon."""
    from research.signal_event_store import resolve_outcome

    signal_id = row["signal_id"]
    horizon_h = row["horizon_h"]
    fired_at: datetime = row["fired_at"]
    entry_price: float | None = row.get("entry_price")
    direction: str = row.get("direction", "long")
    tp_pct: float = row.get("tp_pct", 0.60)
    sl_pct: float = row.get("sl_pct", 0.30)
    symbol: str = row["symbol"]

    now = datetime.now(timezone.utc)

    # Ensure fired_at is tz-aware
    if isinstance(fired_at, str):
        fired_at = datetime.fromisoformat(fired_at.replace("Z", "+00:00"))
    if fired_at.tzinfo is None:
        fired_at = fired_at.replace(tzinfo=timezone.utc)

    outcome_at = fired_at + timedelta(hours=horizon_h)
    if now < outcome_at:
        return  # horizon not yet elapsed

    if entry_price is None:
        resolve_outcome(signal_id, horizon_h, {
            "outcome_error": "entry_price_missing",
            "resolved_at": now.isoformat(),
        })
        return

    current_price = _fetch_close_at(symbol, outcome_at)
    if current_price is None:
        resolve_outcome(signal_id, horizon_h, {
            "outcome_error": "price_fetch_failed",
            "resolved_at": now.isoformat(),
        })
        return

    if direction == "long":
        pnl_pct = (current_price - entry_price) / entry_price * 100.0
    else:
        pnl_pct = (entry_price - current_price) / entry_price * 100.0

    tp_hit = pnl_pct >= tp_pct
    sl_hit = pnl_pct <= -sl_pct

    if tp_hit:
        tbo = "profit_take"
    elif sl_hit:
        tbo = "stop_loss"
    else:
        tbo = "timeout"

    resolve_outcome(signal_id, horizon_h, {
        "outcome_at": outcome_at.isoformat(),
        "realized_pnl_pct": pnl_pct,
        "peak_pnl_pct": pnl_pct,  # simplified: use realized as peak proxy
        "triple_barrier_outcome": tbo,
        "resolved_at": now.isoformat(),
    })


def _fetch_close_at(symbol: str, target_ts: datetime) -> float | None:
    """Fetch close price at or near target_ts using Binance Futures API."""
    try:
        import httpx

        base = "https://fapi.binance.com"
        ts_ms = int(target_ts.timestamp() * 1000)
        resp = httpx.get(
            f"{base}/fapi/v1/klines",
            params={
                "symbol": symbol,
                "interval": "1h",
                "startTime": ts_ms - 3_600_000,
                "limit": 2,
            },
            timeout=5.0,
        )
        resp.raise_for_status()
        data = resp.json()
        if data:
            return float(data[-1][4])  # close of last candle
    except Exception as exc:
        log.debug("price fetch failed for %s at %s: %s", symbol, target_ts, exc)
    return None


def register_scheduler(scheduler) -> None:
    """Register hourly verification job with APScheduler instance."""
    scheduler.add_job(
        resolve_pending_outcomes,
        trigger="interval",
        seconds=3600,
        id="signal_outcome_resolver",
        name="Signal outcome resolver (W-0367)",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=600,
    )
