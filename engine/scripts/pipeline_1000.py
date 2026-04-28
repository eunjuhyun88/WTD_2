"""CMC 1000+ data pipeline CLI.

Steps (run in order):
  1. universe  — build/refresh universe.parquet (CMC 1000 ranks)
  2. ohlcv     — backfill 12mo 1h OHLCV for all symbols (parallel, 40 workers)
  3. derivatives — funding + OI + L/S for Futures symbols (parallel)
  4. onchain   — fetch on-chain data for BTC/ETH/SOL/BNB
  5. indicators — compute RSI/MACD/BB/ATR and save back to Parquet
  6. all       — run all steps in order

Usage:
    uv run python -m scripts.pipeline_1000 all
    uv run python -m scripts.pipeline_1000 universe
    uv run python -m scripts.pipeline_1000 ohlcv --months 6
    uv run python -m scripts.pipeline_1000 ohlcv --force
    uv run python -m scripts.pipeline_1000 status
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path

# Bootstrap env (loads .env, sets Python path)
try:
    import env_bootstrap  # noqa: F401
except ModuleNotFoundError:
    try:
        from engine import env_bootstrap  # type: ignore  # noqa: F401
    except ModuleNotFoundError:
        pass

import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pipeline_1000")


# ── Step runners ──────────────────────────────────────────────────────────────

async def step_universe(force: bool = False) -> pd.DataFrame:
    from data_cache.universe_builder import build_universe, load_universe
    if not force:
        cached = load_universe()
        if cached is not None:
            log.info("Universe: cached (%d symbols)", len(cached))
            return cached
    log.info("Building universe (CoinGecko top 1000 + Binance)...")
    df = await build_universe(save=True)
    log.info("Universe: %d total (%d futures + %d spot)",
             len(df),
             (df["has_perp"] == True).sum(),
             (df["has_perp"] == False).sum())
    return df


async def step_ohlcv(
    universe: pd.DataFrame,
    months: int = 12,
    tf: str = "1h",
    force: bool = False,
) -> None:
    from data_cache.backfill_async import BackfillPipeline
    log.info("Starting OHLCV backfill: %d symbols, %dm history, tf=%s", len(universe), months, tf)
    t0 = time.monotonic()
    pipeline = BackfillPipeline(workers=40)
    result = await pipeline.run_ohlcv(universe, months=months, tf=tf, force=force)
    elapsed = time.monotonic() - t0
    log.info("OHLCV done in %.1fs: %d ok, %d failed", elapsed, result["ok"], result["failed"])


async def step_derivatives(universe: pd.DataFrame, months: int = 6) -> None:
    from data_cache.backfill_async import BackfillPipeline
    futures = universe[universe["has_perp"] == True]["symbol"].tolist()
    log.info("Derivatives backfill: %d futures symbols, %dm history", len(futures), months)
    t0 = time.monotonic()
    pipeline = BackfillPipeline(workers=20)
    await pipeline.run_derivatives(futures, months=months)
    log.info("Derivatives done in %.1fs", time.monotonic() - t0)


async def step_onchain() -> None:
    log.info("On-chain data fetch (BTC/ETH/SOL/BNB)...")
    from data_cache.fetch_onchain import (
        fetch_active_addresses,
        fetch_tx_count,
        fetch_mvrv_zscore,
        fetch_puell_multiple,
    )
    from data_cache.parquet_store import ParquetStore
    store = ParquetStore()

    onchain_fetchers = {
        "BTC": [
            ("active_addresses", fetch_active_addresses),
            ("tx_count", fetch_tx_count),
            ("mvrv_zscore", fetch_mvrv_zscore),
            ("puell_multiple", fetch_puell_multiple),
        ],
        "ETH": [
            ("active_addresses", fetch_active_addresses),
            ("tx_count", fetch_tx_count),
            ("mvrv_zscore", fetch_mvrv_zscore),
        ],
    }

    for base, fetchers in onchain_fetchers.items():
        frames = []
        for name, fn in fetchers:
            try:
                df = fn(days=365)
                if df is not None and not df.empty:
                    frames.append(df.rename(columns={df.columns[0]: name}))
            except Exception as exc:
                log.warning("[%s] %s failed: %s", base, name, exc)

        if frames:
            merged = frames[0]
            for f in frames[1:]:
                merged = merged.join(f, how="outer")
            merged = merged.reset_index().rename(columns={"index": "ts", "date": "ts"})
            if "ts" not in merged.columns and merged.index.name:
                merged = merged.reset_index().rename(columns={merged.index.name: "ts"})
            store.write_onchain(base, merged)
            log.info("[%s] on-chain saved (%d rows)", base, len(merged))


def step_indicators(universe: pd.DataFrame, tf: str = "1h") -> None:
    from data_cache.indicator_calc import IndicatorEngine
    symbols = universe["symbol"].tolist()
    log.info("Computing indicators for %d symbols...", len(symbols))
    t0 = time.monotonic()
    eng = IndicatorEngine()
    result = eng.compute_all(symbols, tf=tf)
    log.info("Indicators done in %.1fs: %d ok, %d failed",
             time.monotonic() - t0, result["ok"], result["failed"])


def step_status() -> None:
    from data_cache.parquet_store import ParquetStore
    from data_cache.universe_builder import load_universe
    store = ParquetStore()

    print("\n=== CMC 1000 Pipeline Status ===")

    uni = load_universe(max_age_s=86400)
    if uni is None:
        print("Universe: NOT BUILT (run: pipeline_1000 universe)")
    else:
        print(f"Universe: {len(uni)} symbols ({(uni['has_perp']==True).sum()} futures + "
              f"{(uni['has_perp']==False).sum()} spot)")

    cov = store.coverage()
    if cov.empty:
        print("OHLCV:    NO DATA (run: pipeline_1000 ohlcv)")
    else:
        total_rows = cov["rows"].sum()
        total_mb = cov["size_kb"].sum() / 1024
        avg_days = cov["days_covered"].mean() if "days_covered" in cov.columns else 0
        # Recompute days_covered if not present
        if "days_covered" not in cov.columns and "first_ts" in cov.columns:
            cov["days_covered"] = (cov["last_ts"] - cov["first_ts"]).dt.days
            avg_days = cov["days_covered"].mean()
        print(f"OHLCV:    {len(cov)} symbols, {total_rows:,} rows, {total_mb:.1f}MB, "
              f"avg coverage {avg_days:.0f}d")

    deriv_symbols = len(list((store._deriv).glob("*_funding.parquet")))
    print(f"Derivatives: {deriv_symbols} symbols with funding data")

    onchain_assets = len(list(store._onchain.glob("*.parquet")))
    print(f"On-chain: {onchain_assets} assets")
    print()


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="CMC 1000+ market data pipeline")
    parser.add_argument(
        "step",
        choices=["all", "universe", "ohlcv", "derivatives", "onchain", "indicators", "status"],
        help="Pipeline step to run",
    )
    parser.add_argument("--months", type=int, default=12, help="History months (default: 12)")
    parser.add_argument("--tf", default="1h", help="Timeframe (default: 1h)")
    parser.add_argument("--force", action="store_true", help="Force re-fetch (ignore cache)")
    parser.add_argument("--limit", type=int, default=None, help="Limit to first N symbols (testing)")
    args = parser.parse_args()

    if args.step == "status":
        step_status()
        return

    async def run():
        if args.step in ("all", "universe"):
            universe = await step_universe(force=args.force)
        else:
            from data_cache.universe_builder import get_universe_sync
            universe = get_universe_sync()

        if args.limit:
            universe = universe.head(args.limit)
            log.info("Limited to %d symbols for testing", args.limit)

        if args.step in ("all", "ohlcv"):
            await step_ohlcv(universe, months=args.months, tf=args.tf, force=args.force)

        if args.step in ("all", "derivatives"):
            await step_derivatives(universe, months=min(args.months, 6))

        if args.step in ("all", "onchain"):
            await step_onchain()

        if args.step in ("all", "indicators"):
            step_indicators(universe, tf=args.tf)

        if args.step == "all":
            step_status()

    asyncio.run(run())


if __name__ == "__main__":
    main()
