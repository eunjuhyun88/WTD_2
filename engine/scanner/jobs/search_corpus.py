"""Worker-control job for accumulating search corpus windows."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Callable, Iterable

import pandas as pd

from data_cache.loader import load_klines
from search.corpus import SearchCorpusStore, build_corpus_windows
from universe.config import DEFAULT_SCAN_UNIVERSE
from universe.loader import load_universe_async

log = logging.getLogger("engine.scanner.search_corpus")

DEFAULT_TIMEFRAMES = ("1h", "4h")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


async def search_corpus_refresh_job(
    *,
    universe_name: str = DEFAULT_SCAN_UNIVERSE,
    symbols: Iterable[str] | None = None,
    timeframes: Iterable[str] = DEFAULT_TIMEFRAMES,
    window_bars: int | None = None,
    stride_bars: int | None = None,
    lookback_bars: int | None = None,
    max_symbols: int | None = None,
    max_windows_per_series: int | None = None,
    store: SearchCorpusStore | None = None,
    load_universe: Callable[[str], object] = load_universe_async,
    load_kline_frame: Callable[..., pd.DataFrame] = load_klines,
) -> dict:
    """Refresh compact corpus windows from existing local market cache.

    The job intentionally runs with `offline=True`; provider fan-out belongs to
    ingress warmers, while search corpus accumulation indexes existing facts/cache.
    """

    window_bars = window_bars or _env_int("SEARCH_CORPUS_WINDOW_BARS", 48)
    stride_bars = stride_bars or _env_int("SEARCH_CORPUS_STRIDE_BARS", 12)
    lookback_bars = lookback_bars or _env_int("SEARCH_CORPUS_LOOKBACK_BARS", 240)
    max_symbols = max_symbols or _env_int("SEARCH_CORPUS_MAX_SYMBOLS", 20)
    max_windows_per_series = max_windows_per_series or _env_int("SEARCH_CORPUS_MAX_WINDOWS_PER_SERIES", 24)
    store = store or SearchCorpusStore()

    if symbols is None:
        loaded = load_universe(universe_name)
        if hasattr(loaded, "__await__"):
            loaded = await loaded  # type: ignore[func-returns-value]
        symbols = loaded  # type: ignore[assignment]

    selected_symbols = [str(symbol).upper() for symbol in list(symbols)[:max_symbols]]
    selected_timeframes = [str(timeframe) for timeframe in timeframes]
    inserted = 0
    skipped: list[dict] = []

    for symbol in selected_symbols:
        for timeframe in selected_timeframes:
            try:
                frame = load_kline_frame(symbol, timeframe, offline=True)
                if lookback_bars > 0:
                    frame = frame.tail(max(lookback_bars, window_bars))
                windows = build_corpus_windows(
                    symbol,
                    timeframe,
                    frame,
                    window_bars=window_bars,
                    stride_bars=stride_bars,
                    source="kline_cache",
                )
                if max_windows_per_series > 0:
                    windows = windows[-max_windows_per_series:]
                inserted += store.upsert_windows(windows)
            except Exception as exc:
                skipped.append({"symbol": symbol, "timeframe": timeframe, "reason": exc.__class__.__name__})
                log.debug("search corpus skip symbol=%s timeframe=%s: %s", symbol, timeframe, exc)

    status = "live" if inserted > 0 else "degraded"
    return {
        "ok": True,
        "owner": "engine",
        "plane": "search",
        "status": status,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "universe": universe_name,
        "symbols": selected_symbols,
        "timeframes": selected_timeframes,
        "windows_upserted": inserted,
        "skipped": skipped,
    }
