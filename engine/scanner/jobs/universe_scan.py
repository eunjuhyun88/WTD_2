from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable

import httpx

from cache.http_client import get_client
from exceptions import CacheMiss

log = logging.getLogger("engine.scanner.jobs")

# Max symbols evaluated concurrently. Each slot does CSV I/O + CPU feature
# calc, so we cap at 12 to avoid thrashing the event loop thread pool while
# still getting ~8-12× speedup vs the old serial loop.
_SCAN_CONCURRENCY = 12


async def push_alert(payload: dict[str, Any], supabase_url: str, supabase_role_key: str) -> None:
    """Insert one row into engine_alerts via Supabase REST API."""
    if not supabase_url or not supabase_role_key:
        log.warning("Supabase env vars not set — alert not pushed: %s", payload.get("symbol"))
        return

    url = f"{supabase_url}/rest/v1/engine_alerts"
    headers = {
        "apikey": supabase_role_key,
        "Authorization": f"Bearer {supabase_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    try:
        client = get_client()
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        log.info("Alert pushed: %s blocks=%s", payload["symbol"], payload["blocks_triggered"])
    except Exception as exc:
        log.error("Failed to push alert for %s: %s", payload.get("symbol"), exc)


def _eval_symbol_sync(
    symbol: str,
    macro: Any,
    load_klines: Callable[..., Any],
    load_perp: Callable[..., Any],
    compute_features_table: Callable[..., Any],
    compute_snapshot: Callable[..., Any],
    evaluate_blocks: Callable[..., list[str]],
    get_engine: Callable[[], Any],
    min_blocks: int,
) -> dict[str, Any] | None:
    """Evaluate one symbol synchronously. Runs in a thread-pool worker.

    Returns a ready-to-push alert payload dict, or None if no alert.
    """
    try:
        klines_df = load_klines(symbol, offline=True)
        perp_df = load_perp(symbol, offline=True)
    except CacheMiss:
        log.debug("Cache miss — skipping %s", symbol)
        return None
    except Exception as exc:
        log.warning("Load failed for %s: %s", symbol, exc)
        return None

    try:
        features_df = compute_features_table(klines_df, symbol, perp=perp_df, macro=macro)
    except Exception as exc:
        log.warning("Feature calc failed for %s: %s", symbol, exc)
        return None

    if features_df.empty:
        return None

    perp_dict: dict | None = None
    if perp_df is not None and not perp_df.empty:
        last = perp_df.iloc[-1]
        perp_dict = {
            "funding_rate": float(last.get("funding_rate", 0.0)),
            "long_short_ratio": float(last.get("long_short_ratio", 1.0)),
        }

    try:
        snap = compute_snapshot(klines_df, symbol, perp=perp_dict)
    except Exception as exc:
        log.warning("Snapshot failed for %s: %s", symbol, exc)
        return None

    try:
        triggered = evaluate_blocks(snap, features_df, klines_df)
    except Exception as exc:
        log.warning("Block eval failed for %s: %s", symbol, exc)
        return None

    if len(triggered) < min_blocks:
        return None

    p_win: float | None = None
    try:
        lgbm = get_engine()
        if lgbm.is_trained:
            p_win = lgbm.predict_one(snap)
    except Exception:
        pass

    payload: dict[str, Any] = {
        "symbol": symbol,
        "timeframe": "4h",
        "blocks_triggered": triggered,
        "snapshot": snap.model_dump(mode="json"),
    }
    if p_win is not None:
        payload["p_win"] = round(p_win, 4)
    return payload


async def scan_universe_job(
    *,
    universe_name: str,
    min_blocks: int,
    scan_telegram_enabled: bool,
    load_universe_async: Callable[[str], Awaitable[list[str]]],
    load_macro_bundle: Callable[..., Any],
    load_klines: Callable[..., Any],
    load_perp: Callable[..., Any],
    compute_features_table: Callable[..., Any],
    compute_snapshot: Callable[..., Any],
    evaluate_blocks: Callable[..., list[str]],
    get_engine: Callable[[], Any],
    push_alert_fn: Callable[[dict[str, Any]], Awaitable[None]],
    send_pattern_engine_alert: Callable[[dict[str, Any]], Awaitable[bool | None]],
    send_scan_summary: Callable[[dict[str, Any]], Awaitable[bool | None]],
) -> None:
    """Scan all universe symbols in parallel and push alerts for any block hits.

    Each symbol is evaluated in a thread-pool worker (asyncio.to_thread) so
    the CPU-heavy feature calc runs off the event loop. A semaphore caps
    concurrency at _SCAN_CONCURRENCY to avoid overwhelming the CSV I/O layer.
    """
    t_start = time.monotonic()
    universe = await load_universe_async(universe_name)
    if not universe:
        log.warning("Empty universe '%s' — skipping scan", universe_name)
        return

    log.info(
        "Scanner: starting parallel scan of %d symbols (universe=%s, concurrency=%d)",
        len(universe),
        universe_name,
        _SCAN_CONCURRENCY,
    )
    macro = load_macro_bundle(offline=True)
    sem = asyncio.Semaphore(_SCAN_CONCURRENCY)

    async def _eval_one(symbol: str) -> dict[str, Any] | None:
        async with sem:
            return await asyncio.to_thread(
                _eval_symbol_sync,
                symbol, macro,
                load_klines, load_perp,
                compute_features_table, compute_snapshot,
                evaluate_blocks, get_engine,
                min_blocks,
            )

    results = await asyncio.gather(*[_eval_one(s) for s in universe], return_exceptions=True)

    hits = 0
    for result in results:
        if isinstance(result, BaseException):
            log.warning("Symbol eval raised exception: %s", result)
            continue
        if result is None:
            continue
        await push_alert_fn(result)
        if scan_telegram_enabled:
            await send_pattern_engine_alert(result)
        hits += 1

    elapsed = time.monotonic() - t_start
    if scan_telegram_enabled:
        await send_scan_summary({"n_signals": hits, "n_symbols": len(universe), "duration_sec": elapsed})
    log.info("Scanner: scan complete in %.1fs — %d/%d symbols hit", elapsed, hits, len(universe))
