"""Retroactive signal detection: runs pattern state machine on historical klines.

Loads backfilled klines from engine/data_cache/historical/, computes features,
then replays liquidity-sweep-reversal-v1 pattern to find REVERSAL_SIGNAL
transitions. Returns EntrySignal objects for the backtest simulator.

Usage:
    from research.validation.historical_runner import detect_historical_signals
    signals = detect_historical_signals(["BTCUSDT", "ETHUSDT"], months=6)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

log = logging.getLogger("research.validation.historical_runner")

_HISTORICAL_CACHE = Path(__file__).parents[2] / "data_cache" / "historical"


def _load_backfilled_klines(symbol: str, timeframe: str = "1h") -> pd.DataFrame | None:
    path = _HISTORICAL_CACHE / f"{symbol}_klines_{timeframe}.csv"
    if not path.exists():
        log.warning("[%s] no backfilled klines at %s", symbol, path)
        return None
    df = pd.read_csv(path, index_col="timestamp", parse_dates=True)
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    return df.sort_index()


def _load_backfilled_perp(symbol: str) -> pd.DataFrame | None:
    """Build perp DataFrame from backfilled funding + OI."""
    funding_path = _HISTORICAL_CACHE / f"{symbol}_funding.csv"
    oi_path = _HISTORICAL_CACHE / f"{symbol}_oi_1h.csv"

    dfs = []
    if funding_path.exists():
        df_f = pd.read_csv(funding_path)
        df_f["timestamp"] = pd.to_datetime(df_f["timestamp"], format="mixed", utc=True)
        df_f = df_f.set_index("timestamp")
        dfs.append(df_f[["funding_rate"]])

    if oi_path.exists():
        df_oi = pd.read_csv(oi_path)
        df_oi["timestamp"] = pd.to_datetime(df_oi["timestamp"], utc=True)
        df_oi = df_oi.set_index("timestamp")
        # compute oi_change_1h and oi_change_24h from raw OI values
        df_oi["oi_change_1h"] = df_oi["oi_usd"].pct_change().fillna(0.0)
        df_oi["oi_change_24h"] = df_oi["oi_usd"].pct_change(periods=24).fillna(0.0)
        dfs.append(df_oi[["oi_change_1h", "oi_change_24h"]])

    if not dfs:
        return None

    perp = dfs[0] if len(dfs) == 1 else dfs[0].join(dfs[1], how="outer")
    # feature_calc expects long_short_ratio — fill with neutral 1.0 if not available
    if "long_short_ratio" not in perp.columns:
        perp["long_short_ratio"] = 1.0
    return perp.sort_index()


def detect_historical_signals(
    symbols: list[str],
    *,
    months: int = 6,
    pattern_slug: str = "liquidity-sweep-reversal-v1",
    target_phase: str = "REVERSAL_SIGNAL",
    timeframe: str = "1h",
    dedup_hours: int = 1,
) -> list:
    """Detect historical REVERSAL_SIGNAL transitions by replaying pattern state machine.

    Returns list of EntrySignal(symbol, timestamp, direction="short", ...).
    The REVERSAL_SIGNAL is a SHORT signal (price reverses after stop hunt).
    """
    from backtest.types import EntrySignal
    from patterns.library import get_pattern
    from patterns.state_machine import PatternStateMachine
    from scanner.feature_calc import compute_features_table
    from scoring.block_evaluator import evaluate_block_masks

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=30 * months)
    all_signals: list[EntrySignal] = []

    try:
        pattern = get_pattern(pattern_slug)
    except Exception as exc:
        log.error("pattern %s not found: %s", pattern_slug, exc)
        return []

    for symbol in symbols:
        log.info("[%s] loading historical klines...", symbol)
        klines = _load_backfilled_klines(symbol, timeframe)
        if klines is None or len(klines) < 500:
            log.warning("[%s] insufficient klines (%d rows), skipping", symbol, len(klines) if klines is not None else 0)
            continue

        perp = _load_backfilled_perp(symbol)
        log.info("[%s] klines=%d rows, perp=%s", symbol, len(klines),
                 f"{len(perp)} rows" if perp is not None else "none")

        # Compute features for all bars
        try:
            features = compute_features_table(klines, symbol, perp=perp)
        except Exception as exc:
            log.error("[%s] feature_calc failed: %s", symbol, exc)
            continue

        if features.empty:
            log.warning("[%s] features empty", symbol)
            continue

        log.info("[%s] features computed: %d rows", symbol, len(features))

        # Compute all block masks once for the full features DataFrame
        blocks_needed: set[str] = set()
        for phase in pattern.phases:
            blocks_needed.update(phase.required_blocks)
            blocks_needed.update(phase.optional_blocks)
            blocks_needed.update(phase.disqualifier_blocks)

        try:
            block_masks: dict[str, "pd.Series"] = evaluate_block_masks(
                features,
                klines,
                symbol,
                block_names=blocks_needed if blocks_needed else None,
            )
        except Exception as exc:
            log.warning("[%s] evaluate_block_masks failed: %s — using empty masks", symbol, exc)
            block_masks = {}

        # Replay pattern state machine bar by bar
        machine = PatternStateMachine(pattern)
        seen: set[tuple[str, str]] = set()  # (symbol, hour_bucket) for dedup
        signals_count = 0

        for ts, row in features.iterrows():
            if ts < pd.Timestamp(cutoff):
                continue

            # Build per-bar blocks_triggered from precomputed masks
            row_dict = row.to_dict()
            blocks_triggered = [
                block_id
                for block_id, mask in block_masks.items()
                if ts in mask.index and bool(mask.at[ts])
            ]

            # Feed to state machine
            try:
                t = machine.evaluate(
                    symbol,
                    blocks_triggered,
                    ts.to_pydatetime(),
                    feature_snapshot=row_dict,
                    emit_callbacks=False,
                )
            except Exception as exc:
                log.debug("[%s] evaluate error at %s: %s", symbol, ts, exc)
                continue

            # Check for target phase transition
            for t in ([t] if t is not None else []):
                if getattr(t, "to_phase", None) == target_phase:
                    # 1h dedup
                    hour_bucket = ts.strftime("%Y-%m-%dT%H")
                    key = (symbol, hour_bucket)
                    if key in seen:
                        continue
                    seen.add(key)

                    signal = EntrySignal(
                        symbol=symbol,
                        timestamp=ts,
                        direction="short",  # REVERSAL_SIGNAL = SHORT (price reversal after stop hunt)
                        predicted_prob=getattr(t, "confidence", 0.7),
                        source_model=pattern_slug,
                    )
                    all_signals.append(signal)
                    signals_count += 1

        log.info("[%s] detected %d %s signals", symbol, signals_count, target_phase)

    log.info("total signals: %d across %d symbols", len(all_signals), len(symbols))
    return all_signals
