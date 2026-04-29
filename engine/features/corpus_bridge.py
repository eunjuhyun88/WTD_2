"""Bridge: FeatureMaterializationStore.feature_windows → SearchCorpusStore.

Converts materialized 50+ column feature windows into enriched CorpusWindow
objects and populates SearchCorpusStore with full-feature signatures.

This replaces the legacy 6-field corpus signatures with the complete
feature vector, enabling Layer A similarity search to use all 40+ signals
instead of just price/volume shape.

Run as part of the feature_materialization job (after each materialization pass)
or standalone:
    python -m engine.features.corpus_bridge --symbol BTCUSDT --timeframe 1h
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("engine.features.corpus_bridge")

# Numeric feature columns that contribute to Layer A similarity search.
# Excludes text/flag columns — those are carried in metadata, not distance.
_NUMERIC_FEATURE_COLS = (
    "return_pct", "price_dump_pct", "price_pump_pct",
    "range_width_pct", "pullback_depth_pct", "breakout_strength",
    "compression_ratio", "curvature_score",
    "volume_zscore", "volume_percentile",
    "oi_change_pct", "oi_zscore", "oi_slope",
    "funding_rate_last", "funding_rate_zscore", "funding_rate_change",
    "ls_ratio_change", "ls_ratio_zscore",
    "liq_imbalance", "liq_nearby_density",
    "cvd_delta", "cvd_slope",
    "taker_buy_ratio",
    "atr", "realized_volatility",
    "higher_low_count", "higher_high_count",
)

# Flag columns (0/1) also included as weak signals
_FLAG_COLS = (
    "breakout_flag", "volume_spike_flag", "volume_dryup_flag",
    "oi_spike_flag", "oi_hold_flag", "oi_reexpansion_flag",
    "funding_positive_flag", "funding_extreme_short_flag",
    "funding_extreme_long_flag", "funding_flip_flag",
    "absorption_flag", "cvd_divergence_price",
)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_enriched_signature(row: dict[str, Any]) -> dict[str, Any]:
    """Build a full-feature signature dict from a feature_windows row.

    Numeric features are rounded to 6 decimal places to keep JSON compact.
    None values are excluded — Layer A handles missing signals via fallback.
    """
    sig: dict[str, Any] = {}

    # Core price shape (always present)
    for key in ("close_last", "return_pct", "range_width_pct", "realized_volatility"):
        v = row.get(key)
        if v is not None:
            sig[key] = round(float(v), 6)

    # Numeric signals
    for key in _NUMERIC_FEATURE_COLS:
        v = row.get(key)
        if v is not None:
            try:
                sig[key] = round(float(v), 6)
            except (TypeError, ValueError):
                pass

    # Flag signals (int)
    for key in _FLAG_COLS:
        v = row.get(key)
        if v is not None:
            try:
                sig[key] = int(v)
            except (TypeError, ValueError):
                pass

    # Categorical metadata (carried for display, not distance)
    for key in ("volatility_regime", "trend_regime", "phase_guess", "pattern_family"):
        v = row.get(key)
        if v:
            sig[key] = str(v)

    return sig


def _row_to_corpus_window(row: dict[str, Any]) -> "CorpusWindow":
    """Convert a feature_windows row to a CorpusWindow for SearchCorpusStore."""
    from search.corpus import CorpusWindow, _stable_window_id  # type: ignore

    symbol = str(row["symbol"]).upper()
    timeframe = str(row["timeframe"])
    start_ts = str(row["window_start_ts"])
    end_ts = str(row["window_end_ts"])
    now = _utcnow_iso()

    return CorpusWindow(
        window_id=_stable_window_id(symbol, timeframe, start_ts, end_ts),
        symbol=symbol,
        timeframe=timeframe,
        start_ts=start_ts,
        end_ts=end_ts,
        bars=0,  # not stored in feature_windows; 0 = unknown
        source="feature_materialization",
        signature=_build_enriched_signature(row),
        created_at=now,
        updated_at=now,
    )


def sync_corpus(
    *,
    symbol: str,
    timeframe: str,
    mat_db_path: Path | str | None = None,
    corpus_db_path: Path | str | None = None,
    batch_size: int = 500,
) -> int:
    """Read feature_windows for (symbol, timeframe) and upsert into SearchCorpusStore.

    Returns the number of windows written.
    Uses batched writes to avoid large single transactions.
    """
    from features.materialization_store import FeatureMaterializationStore  # type: ignore
    from search.corpus import SearchCorpusStore  # type: ignore

    mat_kwargs = {"db_path": mat_db_path} if mat_db_path else {}
    corpus_kwargs = {"db_path": corpus_db_path} if corpus_db_path else {}

    mat = FeatureMaterializationStore(**mat_kwargs)
    corpus = SearchCorpusStore(**corpus_kwargs)

    total_written = 0
    offset = 0

    while True:
        # Paginate feature_windows reads
        with mat._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM feature_windows
                WHERE symbol = ? AND timeframe = ?
                ORDER BY window_end_ts DESC
                LIMIT ? OFFSET ?
                """,
                (symbol.upper(), timeframe, batch_size, offset),
            ).fetchall()

        if not rows:
            break

        windows = [_row_to_corpus_window(dict(row)) for row in rows]
        written = corpus.upsert_windows(windows)
        total_written += written
        offset += len(rows)

        log.debug("Synced %d windows (offset=%d, symbol=%s tf=%s)", written, offset, symbol, timeframe)

        if len(rows) < batch_size:
            break

    log.info("corpus_bridge: synced %d windows for %s/%s", total_written, symbol, timeframe)
    return total_written


def sync_all_corpus(
    *,
    mat_db_path: Path | str | None = None,
    corpus_db_path: Path | str | None = None,
    batch_size: int = 500,
) -> dict[str, int]:
    """Sync all (symbol, timeframe) pairs found in feature_windows.

    Returns dict of "symbol/timeframe" → windows_written.
    Typically called after a full materialization pass.
    """
    from features.materialization_store import FeatureMaterializationStore  # type: ignore

    mat_kwargs = {"db_path": mat_db_path} if mat_db_path else {}
    mat = FeatureMaterializationStore(**mat_kwargs)

    with mat._connect() as conn:
        pairs = conn.execute(
            "SELECT DISTINCT symbol, timeframe FROM feature_windows ORDER BY symbol, timeframe"
        ).fetchall()

    results: dict[str, int] = {}
    for row in pairs:
        symbol, timeframe = row["symbol"], row["timeframe"]
        key = f"{symbol}/{timeframe}"
        try:
            count = sync_corpus(
                symbol=symbol,
                timeframe=timeframe,
                mat_db_path=mat_db_path,
                corpus_db_path=corpus_db_path,
                batch_size=batch_size,
            )
            results[key] = count
        except Exception as exc:
            log.error("corpus_bridge: failed to sync %s: %s", key, exc)
            results[key] = -1

    log.info(
        "corpus_bridge: sync_all complete — %d pairs, %d total windows",
        len(results),
        sum(v for v in results.values() if v >= 0),
    )
    return results


def ingest_capture_snapshot(
    *,
    capture_id: str,
    symbol: str,
    timeframe: str,
    captured_at_ms: int,
    feature_snapshot: dict[str, Any],
    corpus_db_path: Path | str | None = None,
    window_bars: int = 48,
) -> str | None:
    """Write a scanner capture's feature_snapshot into the SearchCorpusStore.

    The scanner captures patterns at a specific bar. This writes that bar's
    feature state as a CorpusWindow so future similarity searches can find it.

    Window bounds: [captured_at_ms - window_bars*bar_secs, captured_at_ms]
    Bar seconds: 3600 for 1h, 14400 for 4h.

    Returns the generated window_id, or None if the snapshot has no usable data.
    """
    if not feature_snapshot or not any(
        isinstance(v, (int, float)) for v in feature_snapshot.values()
    ):
        return None

    from datetime import datetime, timezone
    from search.corpus import SearchCorpusStore, _stable_window_id  # type: ignore

    bar_secs = {"1h": 3600, "4h": 14400, "15m": 900, "1d": 86400}.get(timeframe, 3600)
    end_epoch = captured_at_ms // 1000
    start_epoch = end_epoch - window_bars * bar_secs

    def _epoch_to_iso(ts: int) -> str:
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()

    start_ts = _epoch_to_iso(start_epoch)
    end_ts = _epoch_to_iso(end_epoch)
    symbol_upper = symbol.upper()

    window_id = _stable_window_id(symbol_upper, timeframe, start_ts, end_ts)
    now = _utcnow_iso()

    # Build enriched signature from the raw feature_snapshot
    sig: dict[str, Any] = {}
    for k, v in feature_snapshot.items():
        if v is None:
            continue
        if isinstance(v, (int, float)):
            try:
                sig[k] = round(float(v), 6)
            except (TypeError, ValueError):
                pass
        elif isinstance(v, str):
            sig[k] = v

    if not sig:
        return None

    from search.corpus import CorpusWindow, SearchCorpusStore  # type: ignore
    corpus_kwargs = {"db_path": corpus_db_path} if corpus_db_path else {}
    corpus = SearchCorpusStore(**corpus_kwargs)

    window = CorpusWindow(
        window_id=window_id,
        symbol=symbol_upper,
        timeframe=timeframe,
        start_ts=start_ts,
        end_ts=end_ts,
        bars=window_bars,
        source=f"capture:{capture_id}",
        signature=sig,
        created_at=now,
        updated_at=now,
    )
    corpus.upsert_windows([window])
    log.debug("corpus_bridge: ingested capture %s → window %s", capture_id, window_id)
    return window_id


if __name__ == "__main__":
    import argparse
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Sync feature_windows → search corpus")
    parser.add_argument("--symbol", help="Symbol to sync (e.g. BTCUSDT). Omit for all.")
    parser.add_argument("--timeframe", default="1h", help="Timeframe (default: 1h)")
    parser.add_argument("--all", action="store_true", help="Sync all symbol/timeframe pairs")
    args = parser.parse_args()

    if args.all or not args.symbol:
        result = sync_all_corpus()
        for key, count in result.items():
            status = f"{count} windows" if count >= 0 else "FAILED"
            print(f"  {key}: {status}")
    else:
        n = sync_corpus(symbol=args.symbol, timeframe=args.timeframe)
        print(f"Synced {n} windows for {args.symbol}/{args.timeframe}")
        sys.exit(0 if n >= 0 else 1)
