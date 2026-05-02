"""W-0361: AutoResearch Cloud Runner.

Wraps AutoResearchLoop.run_cycle() with:
- Supabase run tracking (autoresearch_runs table)
- Dedup guard: skip if another run started < 30 min ago
- promote_cap: max 50 signals per run written to pattern_signals
- Sentry alert on high promote rate or stale data
- OOS wiring fail-fast at startup

Designed for APScheduler 4h interval in Cloud Run.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

log = logging.getLogger("engine.research.autoresearch_runner")

_AUTORESEARCH_ENABLED = os.environ.get("AUTORESEARCH_ENABLED", "false").lower() == "true"
_OOS_WIRING = os.environ.get("RESEARCH_OOS_WIRING", "off").lower()
_PROMOTE_CAP = int(os.environ.get("AUTORESEARCH_PROMOTE_CAP", "50"))
_PROMOTE_RATE_ALERT = float(os.environ.get("AUTORESEARCH_PROMOTE_RATE_ALERT", "0.40"))
_DEDUP_WINDOW_MIN = int(os.environ.get("AUTORESEARCH_DEDUP_MIN", "30"))
_SIGNAL_TTL_DAYS = 7


def _supabase():
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def _is_duplicate_run() -> bool:
    """Return True if a run started within DEDUP_WINDOW_MIN minutes is still active."""
    try:
        c = _supabase()
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=_DEDUP_WINDOW_MIN)).isoformat()
        resp = (
            c.table("autoresearch_runs")
            .select("run_id")
            .eq("status", "running")
            .gt("started_at", cutoff)
            .execute()
        )
        return bool(resp.data)
    except Exception as exc:
        log.warning("Dedup check failed (proceeding): %s", exc)
        return False


def _create_run(c: Any) -> str:
    """Insert a new autoresearch_runs row. Returns run_id."""
    run_id = str(uuid.uuid4())
    c.table("autoresearch_runs").insert({
        "run_id": run_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "running",
    }).execute()
    return run_id


def _finish_run(c: Any, run_id: str, *, status: str, result: Any = None, error: str | None = None) -> None:
    update: dict[str, Any] = {
        "status": status,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    if error:
        update["error_msg"] = error[:500]
    if result is not None:
        update["n_symbols"] = result.n_symbols_scanned
        update["n_patterns"] = result.n_patterns_total
        update["n_promoted"] = result.n_promoted
        update["elapsed_s"] = result.elapsed_s
    c.table("autoresearch_runs").update(update).eq("run_id", run_id).execute()


def _promote_signals(c: Any, run_id: str, result: Any, run_bucket: datetime) -> int:
    """Write top promoted patterns to pattern_signals. Returns count written."""
    df = result.top_patterns
    if df is None or df.empty:
        return 0

    from research.autoresearch_loop import PROMOTE_SHARPE
    promoted = df[df["sharpe"] >= PROMOTE_SHARPE].head(_PROMOTE_CAP)
    if promoted.empty:
        return 0

    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=_SIGNAL_TTL_DAYS)
    rows = []
    for _, row in promoted.iterrows():
        signal_json: dict[str, Any] = {}
        for col in ("gate_passed", "wf_ok", "gate_reject_reason"):
            if col in row.index:
                signal_json[col] = row[col]

        rows.append({
            "run_id": run_id,
            "symbol": str(row.get("symbol", "")),
            "pattern": str(row.get("pattern", "")),
            "timeframe": "1h",
            "run_bucket": run_bucket.isoformat(),
            "sharpe": float(row.get("sharpe", 0)),
            "hit_rate": float(row.get("win_rate", 0)),
            "n_trades": int(row.get("n_executed", 0)),
            "expectancy": float(row.get("expectancy_pct", 0)) if "expectancy_pct" in row.index else None,
            "max_dd": float(row.get("max_drawdown_pct", 0)) if "max_drawdown_pct" in row.index else None,
            "promoted_at": now.isoformat(),
            "expires_at": expires.isoformat(),
            "signal_json": signal_json or None,
        })

    if not rows:
        return 0

    # ON CONFLICT (symbol, pattern, timeframe, run_bucket) DO UPDATE
    c.table("pattern_signals").upsert(rows, on_conflict="symbol,pattern,timeframe,run_bucket").execute()
    return len(rows)


def _sentry_alert(msg: str, extra: dict | None = None) -> None:
    try:
        import sentry_sdk
        sentry_sdk.capture_message(msg, level="warning", extras=extra or {})
    except Exception:
        log.warning("Sentry alert: %s %s", msg, extra)


def run_once() -> dict[str, Any]:
    """Execute one autoresearch cycle. Called by APScheduler every 4h.

    Returns summary dict suitable for JSON serialization.
    """
    if not _AUTORESEARCH_ENABLED:
        log.debug("AUTORESEARCH_ENABLED=false — skipping")
        return {"status": "disabled"}

    if _OOS_WIRING != "on":
        log.error("RESEARCH_OOS_WIRING is not 'on' — autoresearch aborted (lookahead risk)")
        _sentry_alert("autoresearch aborted: RESEARCH_OOS_WIRING != on")
        return {"status": "aborted", "reason": "oos_wiring_off"}

    if _is_duplicate_run():
        log.info("Another run active — skipping this tick")
        return {"status": "skipped", "reason": "duplicate"}

    c = _supabase()
    run_id = _create_run(c)
    run_bucket = _four_hour_bucket(datetime.now(timezone.utc))
    log.info("AutoResearch run %s started (bucket=%s)", run_id, run_bucket.isoformat())

    try:
        from data.parquet_provider import get_store
        from research.autoresearch_loop import AutoResearchLoop

        store = get_store()
        loop = AutoResearchLoop(store=store, scan_workers=4)
        result = loop.run_cycle(save=False)

        n_written = _promote_signals(c, run_id, result, run_bucket)

        promote_rate = result.n_promoted / max(result.n_patterns_total, 1)
        if promote_rate > _PROMOTE_RATE_ALERT:
            _sentry_alert(
                f"autoresearch high promote_rate={promote_rate:.2%}",
                {"run_id": run_id, "n_promoted": result.n_promoted, "n_patterns": result.n_patterns_total},
            )

        _finish_run(c, run_id, status="completed", result=result)
        log.info(
            "AutoResearch run %s done: %d symbols, %d promoted, %d written, %.1fs",
            run_id, result.n_symbols_scanned, result.n_promoted, n_written, result.elapsed_s,
        )
        return {
            "status": "completed",
            "run_id": run_id,
            "n_symbols": result.n_symbols_scanned,
            "n_patterns": result.n_patterns_total,
            "n_promoted": result.n_promoted,
            "n_written": n_written,
            "elapsed_s": result.elapsed_s,
        }

    except Exception as exc:
        log.exception("AutoResearch run %s failed: %s", run_id, exc)
        _sentry_alert(f"autoresearch run failed: {exc}", {"run_id": run_id})
        _finish_run(c, run_id, status="failed", error=str(exc))
        return {"status": "failed", "run_id": run_id, "error": str(exc)}


def _four_hour_bucket(dt: datetime) -> datetime:
    """Truncate datetime to the nearest 4-hour boundary (UTC)."""
    h = (dt.hour // 4) * 4
    return dt.replace(hour=h, minute=0, second=0, microsecond=0)
