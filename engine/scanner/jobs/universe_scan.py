from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any, Awaitable, Callable

import httpx

from cache.http_client import get_client
from data_cache.fetch_orderbook_depth import fetch_orderbook_depth5
from exceptions import CacheMiss
from scanner.watch_targets import WatchScanTarget, create_watch_hit_capture

log = logging.getLogger("engine.scanner.jobs")


def _inject_ob_depth(features_df: Any, symbol: str) -> None:
    """Inject live orderbook depth5 snapshot into the last bar (in-place).

    Falls back gracefully: perp first, then spot, then 0.0 if both fail.
    This wires ob_bid_usd / ob_ask_usd into orderbook_imbalance_ratio block.
    """
    try:
        result = fetch_orderbook_depth5(symbol, perp=True) or fetch_orderbook_depth5(symbol, perp=False)
        if result is not None:
            bid_usd, ask_usd = result
            features_df.loc[features_df.index[-1], "ob_bid_usd"] = bid_usd
            features_df.loc[features_df.index[-1], "ob_ask_usd"] = ask_usd
            return
    except Exception as exc:
        log.debug("[%s] OB injection failed: %s", symbol, exc)
    features_df.loc[features_df.index[-1], "ob_bid_usd"] = 0.0
    features_df.loc[features_df.index[-1], "ob_ask_usd"] = 0.0


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
    watch_targets: list[WatchScanTarget] | None = None,
    scan_id: str | None = None,
) -> dict[str, Any] | None:
    """Evaluate one symbol synchronously. Runs in a thread-pool worker.

    Returns a ready-to-push alert payload dict, or None if no alert.
    When watch_targets contains targets for this symbol and blocks fire,
    also creates a pending_outcome CaptureRecord (W-0335 PR-2).
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

    _inject_ob_depth(features_df, symbol)

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

    # W-0335 PR-2: create pending_outcome captures for watched symbols that just fired
    if watch_targets and triggered:
        sid = scan_id or str(uuid.uuid4())
        for target in watch_targets:
            created = create_watch_hit_capture(target, triggered, features_df, sid)
            if created:
                log.info("W-0335: watch-hit capture created for %s (source=%s)", symbol, target.capture_id)

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
    watch_targets: list[WatchScanTarget] | None = None,
) -> None:
    """Scan all universe symbols in parallel and push alerts for any block hits.

    Each symbol is evaluated in a thread-pool worker (asyncio.to_thread) so
    the CPU-heavy feature calc runs off the event loop. A semaphore caps
    concurrency at _SCAN_CONCURRENCY to avoid overwhelming the CSV I/O layer.

    watch_targets: Optional list of WatchScanTarget from watched captures (W-0335 PR-2).
    When provided, block hits on watched symbols also create pending_outcome captures.
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

    # Build per-symbol watch target index and a shared scan_id for this run
    scan_id = str(uuid.uuid4())
    watch_by_symbol: dict[str, list[WatchScanTarget]] = {}
    if watch_targets:
        for wt in watch_targets:
            watch_by_symbol.setdefault(wt.symbol, []).append(wt)

    async def _eval_one(symbol: str) -> dict[str, Any] | None:
        async with sem:
            return await asyncio.to_thread(
                _eval_symbol_sync,
                symbol, macro,
                load_klines, load_perp,
                compute_features_table, compute_snapshot,
                evaluate_blocks, get_engine,
                min_blocks,
                watch_by_symbol.get(symbol),
                scan_id,
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
