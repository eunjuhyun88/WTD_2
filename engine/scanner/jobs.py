"""Scanner job implementations extracted from scheduler lifecycle wiring."""
from __future__ import annotations

import logging
import time
from typing import Any, Awaitable, Callable

import httpx

from exceptions import CacheMiss

log = logging.getLogger("engine.scanner.jobs")


def candidate_key(pattern_slug: str, symbol: str) -> str:
    return f"{pattern_slug}:{symbol}"


def filter_new_pattern_entries(scan_result: dict[str, Any], last_pattern_entry_keys: set[str]) -> tuple[dict[str, Any], int, set[str]]:
    """Keep only newly-entered pattern candidates and return updated key state."""
    entry_candidates = scan_result.get("entry_candidates", {}) or {}
    current_keys = {
        candidate_key(slug, symbol)
        for slug, symbols in entry_candidates.items()
        for symbol in symbols
    }
    new_keys = current_keys - last_pattern_entry_keys

    if not new_keys:
        return {**scan_result, "entry_candidates": {}}, 0, current_keys

    filtered: dict[str, list[str]] = {}
    for slug, symbols in entry_candidates.items():
        fresh_symbols = [symbol for symbol in symbols if candidate_key(slug, symbol) in new_keys]
        if fresh_symbols:
            filtered[slug] = fresh_symbols

    return {**scan_result, "entry_candidates": filtered}, len(new_keys), current_keys


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
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            log.info("Alert pushed: %s blocks=%s", payload["symbol"], payload["blocks_triggered"])
    except Exception as exc:
        log.error("Failed to push alert for %s: %s", payload.get("symbol"), exc)


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
    """Scan all universe symbols and push alerts for any block hits."""
    t_start = time.monotonic()
    universe = await load_universe_async(universe_name)
    if not universe:
        log.warning("Empty universe '%s' — skipping scan", universe_name)
        return

    log.info("Scanner: starting scan of %d symbols (universe=%s)", len(universe), universe_name)
    macro = load_macro_bundle(offline=True)
    hits = 0

    for symbol in universe:
        try:
            klines_df = load_klines(symbol, offline=True)
            perp_df = load_perp(symbol, offline=True)
        except CacheMiss:
            log.debug("Cache miss — skipping %s", symbol)
            continue
        except Exception as exc:
            log.warning("Load failed for %s: %s", symbol, exc)
            continue

        try:
            features_df = compute_features_table(klines_df, symbol, perp=perp_df, macro=macro)
        except Exception as exc:
            log.warning("Feature calc failed for %s: %s", symbol, exc)
            continue

        if features_df.empty:
            continue

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
            continue

        try:
            triggered = evaluate_blocks(snap, features_df, klines_df)
        except Exception as exc:
            log.warning("Block eval failed for %s: %s", symbol, exc)
            continue

        if len(triggered) < min_blocks:
            continue

        p_win: float | None = None
        try:
            lgbm = get_engine()
            if lgbm.is_trained:
                p_win = lgbm.predict_one(snap)
        except Exception:
            pass

        snap_dict = snap.model_dump(mode="json")
        payload: dict[str, Any] = {
            "symbol": symbol,
            "timeframe": "4h",
            "blocks_triggered": triggered,
            "snapshot": snap_dict,
        }
        if p_win is not None:
            payload["p_win"] = round(p_win, 4)

        await push_alert_fn(payload)
        if scan_telegram_enabled:
            await send_pattern_engine_alert(payload)
        hits += 1

    elapsed = time.monotonic() - t_start
    if scan_telegram_enabled:
        await send_scan_summary({"n_signals": hits, "n_symbols": len(universe), "duration_sec": elapsed})
    log.info("Scanner: scan complete in %.1fs — %d/%d symbols hit", elapsed, hits, len(universe))


async def pattern_scan_job(
    *,
    universe_name: str,
    scan_telegram_enabled: bool,
    last_pattern_entry_keys: set[str],
    load_universe_async: Callable[[str], Awaitable[list[str]]],
    send_pattern_scan_summary: Callable[[dict[str, Any]], Awaitable[bool | None]],
) -> tuple[set[str], dict[str, Any]]:
    """Run pattern state-machine scan and return updated candidate key state."""
    from patterns.scanner import run_pattern_scan, prewarm_perp_cache

    universe = await load_universe_async(universe_name)
    prewarm_perp_cache(universe, max_workers=5)
    result = await run_pattern_scan(universe_name, prewarm=False, symbols=universe)

    n_candidates = sum(len(v) for v in result.get("entry_candidates", {}).values())
    new_candidate_result, n_new_candidates, current_keys = filter_new_pattern_entries(result, last_pattern_entry_keys)
    if scan_telegram_enabled and n_new_candidates > 0:
        await send_pattern_scan_summary(new_candidate_result, universe_name=universe_name)

    log.info(
        "Pattern scan: %d symbols, %d evaluated, %d entry candidates, %dms",
        result.get("n_symbols", 0),
        result.get("n_evaluated", 0),
        n_candidates,
        result.get("elapsed_ms", 0),
    )
    return current_keys, result


async def auto_evaluate_job() -> None:
    """Auto-evaluate pending ledger outcomes past their evaluation window."""
    from ledger.store import LedgerStore
    from patterns.library import PATTERN_LIBRARY

    store = LedgerStore()
    total_evaluated = 0
    for slug in PATTERN_LIBRARY:
        evaluated = store.auto_evaluate_pending(slug)
        total_evaluated += len(evaluated)

    if total_evaluated > 0:
        log.info("Auto-evaluate: %d outcomes evaluated across all patterns", total_evaluated)
