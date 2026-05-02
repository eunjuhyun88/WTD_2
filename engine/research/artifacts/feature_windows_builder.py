"""Feature Windows Builder — populates the FeatureWindowStore from raw data.

This is the ETL worker that runs as a scheduled job (or on-demand CLI)
to keep the feature_windows SQLite store up to date.

Pipeline per symbol/timeframe:
  1. Load raw klines via data_cache.loader.load_klines()
  2. Load perp metrics via data_cache.loader.load_perp()
  3. Compute feature table via scanner.feature_calc.compute_features_table()
  4. Derive named signals via signal_derivations.derive_signals_table()
  5. Bulk upsert into FeatureWindowStore (incremental from latest_bar_ts_ms)

Design:
  - Incremental: skips bars already in the store
  - Restartable: safe to run multiple times (UPSERT)
  - Symbol/timeframe scoped: can build for a single pair or sweep all
  - derive_signals_table() is vectorized but still O(n²) on higher_low_count;
    for large histories, chunk by 500 bars is recommended

Typical usage:
  python -m research.feature_windows_builder --symbol TRADOORUSDT --tf 15m
  python -m research.feature_windows_builder --all --tf 15m --since-days 90
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import pandas as pd

from scanner.feature_calc import compute_features_table, MIN_HISTORY_BARS
from .feature_windows import FeatureWindowStore, FEATURE_WINDOW_STORE, get_all_feature_window_stores
from .signal_derivations import derive_all_signals

log = logging.getLogger("engine.research.feature_windows_builder")


# ─────────────────────────────────────────────────────────────────────────────
# Build helpers
# ─────────────────────────────────────────────────────────────────────────────

def _ts_to_ms(ts: Any) -> int:
    """Convert a pandas Timestamp or datetime to epoch milliseconds."""
    if isinstance(ts, pd.Timestamp):
        return int(ts.timestamp() * 1000)
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return int(ts.timestamp() * 1000)
    return int(ts)


def build_for_symbol(
    symbol: str,
    timeframe: str,
    store: FeatureWindowStore | None = None,
    since_days: int | None = 90,
    chunk_size: int = 200,
    klines_df: pd.DataFrame | None = None,
    perp_df: pd.DataFrame | None = None,
) -> dict[str, Any]:
    """Build (or update) feature windows for one symbol/timeframe.

    Args:
        symbol: e.g. 'TRADOORUSDT'
        timeframe: e.g. '15m', '1h'
        store: override default store
        since_days: how far back to load (None = all available)
        chunk_size: bars processed per batch for derive_all_signals
        klines_df: preloaded klines (skip load_klines if provided)
        perp_df: preloaded perp metrics (skip load_perp if provided)

    Returns:
        dict with 'symbol', 'timeframe', 'rows_written', 'rows_skipped', 'error'
    """
    fw_store = store or FEATURE_WINDOW_STORE

    try:
        # Find incremental start point
        latest_ts_ms = fw_store.latest_bar_ts_ms(symbol, timeframe)

        # Load klines
        if klines_df is None:
            try:
                from data_cache.loader import load_klines
                klines_df = load_klines(symbol, offline=False)
            except Exception as exc:
                log.warning("build_for_symbol: load_klines(%s) failed: %s", symbol, exc)
                return {"symbol": symbol, "timeframe": timeframe, "rows_written": 0,
                        "rows_skipped": 0, "error": str(exc)}

        if klines_df is None or klines_df.empty:
            return {"symbol": symbol, "timeframe": timeframe, "rows_written": 0,
                    "rows_skipped": 0, "error": "empty klines"}

        # Load perp (optional)
        if perp_df is None:
            try:
                from data_cache.loader import load_perp
                perp_df = load_perp(symbol, offline=False)
            except Exception:
                perp_df = None

        # Resample to requested timeframe if needed (klines may be 1h default)
        # For now: assume klines are already in the correct tf or close enough
        # TODO: add tf resample when data_cache supports it natively

        # Drop warmup bars
        if len(klines_df) < MIN_HISTORY_BARS:
            log.warning("build_for_symbol: %s has only %d bars (need %d)",
                        symbol, len(klines_df), MIN_HISTORY_BARS)
            if len(klines_df) < 50:
                return {"symbol": symbol, "timeframe": timeframe, "rows_written": 0,
                        "rows_skipped": 0, "error": "insufficient history"}

        # Filter to bars after latest stored ts
        if latest_ts_ms is not None:
            # Keep overlap of MIN_HISTORY_BARS for rolling calculations
            cutoff_idx = None
            for i, idx in enumerate(klines_df.index):
                ts_ms = _ts_to_ms(idx)
                if ts_ms > latest_ts_ms:
                    cutoff_idx = max(0, i - MIN_HISTORY_BARS)
                    break
            if cutoff_idx is not None:
                klines_df = klines_df.iloc[cutoff_idx:]
            else:
                # All bars already stored
                return {"symbol": symbol, "timeframe": timeframe, "rows_written": 0,
                        "rows_skipped": len(klines_df), "error": None}

        # Apply since_days filter
        if since_days is not None:
            cutoff_dt = datetime.now(tz=timezone.utc) - timedelta(days=since_days)
            cutoff_ms = int(cutoff_dt.timestamp() * 1000)
            mask = pd.Series(
                [_ts_to_ms(idx) >= cutoff_ms for idx in klines_df.index],
                index=klines_df.index,
            )
            klines_df = klines_df[mask]

        if klines_df.empty:
            return {"symbol": symbol, "timeframe": timeframe, "rows_written": 0,
                    "rows_skipped": 0, "error": None}

        # Compute full feature table (vectorized)
        try:
            from data_cache.resample import tf_string_to_minutes
            tf_minutes = tf_string_to_minutes(timeframe)
        except Exception:
            tf_minutes = 60  # default to 1h

        feature_df = compute_features_table(
            klines_df,
            symbol=symbol,
            perp=perp_df,
            tf_minutes=tf_minutes,
        )

        if feature_df.empty:
            return {"symbol": symbol, "timeframe": timeframe, "rows_written": 0,
                    "rows_skipped": 0, "error": "feature_df empty after compute"}

        # Ensure 'close' column is available for price structure signals
        if "close" in klines_df.columns:
            feature_df["close"] = klines_df["close"].reindex(feature_df.index)
        if "high" in klines_df.columns:
            feature_df["high"] = klines_df["high"].reindex(feature_df.index)
        if "low" in klines_df.columns:
            feature_df["low"] = klines_df["low"].reindex(feature_df.index)

        # Derive named signals per bar (chunked to control memory)
        rows_written = 0
        rows_skipped = 0
        batch: list[tuple[int, dict[str, float]]] = []

        for i in range(len(feature_df)):
            bar_ts_ms = _ts_to_ms(feature_df.index[i])

            # Skip already stored bars
            if latest_ts_ms is not None and bar_ts_ms <= latest_ts_ms:
                rows_skipped += 1
                continue

            # Derive signals for bar i using rows 0..i (past-only)
            window_df = feature_df.iloc[: i + 1]
            signals = derive_all_signals(window_df, row_idx=-1)
            batch.append((bar_ts_ms, signals))

            if len(batch) >= chunk_size:
                rows_written += fw_store.upsert_batch(symbol, timeframe, batch)
                batch = []

        if batch:
            rows_written += fw_store.upsert_batch(symbol, timeframe, batch)

        log.info(
            "build_for_symbol: %s/%s wrote=%d skipped=%d",
            symbol, timeframe, rows_written, rows_skipped,
        )
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "rows_written": rows_written,
            "rows_skipped": rows_skipped,
            "error": None,
        }

    except Exception as exc:
        log.exception("build_for_symbol: %s/%s error: %s", symbol, timeframe, exc)
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "rows_written": 0,
            "rows_skipped": 0,
            "error": str(exc),
        }


def build_for_universe(
    symbols: list[str],
    timeframes: list[str],
    store: FeatureWindowStore | None = None,
    since_days: int | None = 90,
) -> list[dict[str, Any]]:
    """Build feature windows for a list of symbols and timeframes.

    Returns a list of per-(symbol, timeframe) build results.
    """
    results: list[dict[str, Any]] = []
    total = len(symbols) * len(timeframes)
    done = 0
    for symbol in symbols:
        for tf in timeframes:
            result = build_for_symbol(
                symbol=symbol,
                timeframe=tf,
                store=store,
                since_days=since_days,
            )
            results.append(result)
            done += 1
            if done % 10 == 0:
                log.info("build_for_universe: %d/%d done", done, total)
    return results


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

def _cli() -> None:
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Build feature_windows store")
    parser.add_argument("--symbol", help="Single symbol to build (e.g. TRADOORUSDT)")
    parser.add_argument("--all", dest="all_symbols", action="store_true",
                        help="Build for all symbols in the dynamic universe")
    parser.add_argument("--tf", dest="timeframes", default="1h",
                        help="Comma-separated timeframes (e.g. 15m,1h)")
    parser.add_argument("--since-days", type=int, default=90,
                        help="How many days of history to build")
    parser.add_argument("--db", help="Override DB path")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    tfs = [t.strip() for t in args.timeframes.split(",") if t.strip()]

    # Resolve stores: custom db path overrides, otherwise write to all configured stores
    if args.db:
        stores = [FeatureWindowStore(args.db)]
    else:
        stores = get_all_feature_window_stores()
    log.info("Writing to %d store(s): %s", len(stores), [type(s).__name__ for s in stores])

    if args.symbol:
        try:
            from data_cache.loader import load_klines, load_perp
            klines_df = load_klines(args.symbol, offline=False)
            perp_df = load_perp(args.symbol, offline=False) if klines_df is not None else None
        except Exception as exc:
            print(f"Failed to load klines for {args.symbol}: {exc}")
            return
        for store in stores:
            for tf in tfs:
                result = build_for_symbol(
                    args.symbol, tf, store=store, since_days=args.since_days,
                    klines_df=klines_df, perp_df=perp_df,
                )
                print(json.dumps({**result, "backend": type(store).__name__}, indent=2))

    elif args.all_symbols:
        try:
            from universe.dynamic import get_dynamic_universe
            symbols = get_dynamic_universe()
        except Exception as exc:
            print(f"Could not load dynamic universe: {exc}")
            return
        for store in stores:
            results = build_for_universe(symbols, tfs, store=store, since_days=args.since_days)
            summary = {
                "backend": type(store).__name__,
                "total_pairs": len(results),
                "total_rows_written": sum(r.get("rows_written", 0) for r in results),
                "errors": [r for r in results if r.get("error")],
            }
            print(json.dumps(summary, indent=2))

    else:
        parser.print_help()


if __name__ == "__main__":
    _cli()


__all__ = [
    "build_for_symbol",
    "build_for_universe",
]
