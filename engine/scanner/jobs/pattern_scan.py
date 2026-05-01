from __future__ import annotations

import inspect
import logging
from typing import Any, Awaitable, Callable

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


async def pattern_scan_job(
    *,
    universe_name: str,
    scan_telegram_enabled: bool,
    last_pattern_entry_keys: set[str],
    load_universe_async: Callable[[str], Awaitable[list[str]]],
    send_pattern_scan_summary: Callable[[dict[str, Any]], Awaitable[bool | None]],
) -> tuple[set[str], dict[str, Any]]:
    """Run pattern state-machine scan and return updated candidate key state.

    On new entry candidates:
    1. Send per-symbol detailed entry alert (price / target / stop / p_win gate).
    2. Send brief summary as before (kept for channel overview).
    """
    from patterns.scanner import prewarm_perp_cache, run_pattern_scan
    from scanner.alerts_pattern import send_pattern_entry_alerts

    universe = await load_universe_async(universe_name)
    _prewarm = prewarm_perp_cache(universe, max_workers=5)
    if inspect.isawaitable(_prewarm):
        await _prewarm
    result = await run_pattern_scan(universe_name, prewarm=False, symbols=universe)

    n_candidates = sum(len(v) for v in result.get("entry_candidates", {}).values())
    new_candidate_result, n_new_candidates, current_keys = filter_new_pattern_entries(result, last_pattern_entry_keys)

    if scan_telegram_enabled and n_new_candidates > 0:
        # 1. Per-symbol detailed entry alerts (with p_win gate + entry/target/stop)
        new_keys = current_keys - last_pattern_entry_keys
        try:
            n_sent = await send_pattern_entry_alerts(new_keys, new_candidate_result)
            log.info("Entry alerts sent: %d/%d candidates passed p_win gate", n_sent, n_new_candidates)
        except Exception as exc:
            log.warning("Entry alert dispatch failed: %s", exc)

        # 2. Channel summary (kept for overview)
        await send_pattern_scan_summary(new_candidate_result, universe_name=universe_name)

    log.info(
        "Pattern scan: %d symbols, %d evaluated, %d entry candidates, %dms",
        result.get("n_symbols", 0),
        result.get("n_evaluated", 0),
        n_candidates,
        result.get("elapsed_ms", 0),
    )
    return current_keys, result
