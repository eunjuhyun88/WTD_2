"""Wait for backfill coverage to improve then run full auto-research.

Polls coverage every 5 minutes. Once target_days_median is met, runs
the full auto-research loop with production-grade gates.

Usage:
    uv run python -m scripts.wait_and_research --target-days 90 --min-promoted 5
"""
from __future__ import annotations

import argparse
import logging
import time

import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("wait_and_research")


def _coverage_stats() -> tuple[float, int]:
    """Return (median_days, n_symbols_with_90d)."""
    from data_cache.parquet_store import ParquetStore
    store = ParquetStore()
    cov = store.coverage()
    if cov.empty:
        return 0.0, 0
    cov["days"] = (
        pd.to_datetime(cov["last_ts"]) - pd.to_datetime(cov["first_ts"])
    ).dt.days
    return float(cov["days"].median()), int((cov["days"] >= 90).sum())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-days", type=int, default=90,
                        help="Min median days before running research")
    parser.add_argument("--poll-minutes", type=float, default=5.0)
    parser.add_argument("--min-promoted", type=int, default=5)
    parser.add_argument("--min-sharpe", type=float, default=0.5)
    parser.add_argument("--max-cycles", type=int, default=5)
    args = parser.parse_args()

    log.info("Waiting for median coverage >= %d days...", args.target_days)

    while True:
        median_days, n_90d = _coverage_stats()
        log.info("Coverage: median=%.0fd, symbols_with_90d=%d", median_days, n_90d)

        if median_days >= args.target_days:
            log.info("Target reached! Starting auto-research...")
            break

        log.info("Not ready yet. Sleeping %.0f minutes...", args.poll_minutes)
        time.sleep(args.poll_minutes * 60)

    # Restore production gates before running
    import research.autoresearch_loop as arl
    arl.GATE_MIN_SIGNALS = 10
    arl.GATE_MIN_HIT_RATE = 0.52
    arl.GATE_MIN_SHARPE = 0.5
    arl.GATE_MAX_DRAWDOWN = 0.30
    arl.PROMOTE_SHARPE = 1.5

    from data_cache.parquet_store import ParquetStore
    from research.autoresearch_loop import AutoResearchLoop

    store = ParquetStore()
    loop = AutoResearchLoop(store=store, scan_workers=8)
    results = loop.run_until(
        min_promoted=args.min_promoted,
        min_sharpe=args.min_sharpe,
        max_cycles=args.max_cycles,
    )

    total_promoted = sum(
        r.n_promoted for r in results if r.top_patterns is not None
    )
    log.info("Done. Total cycles: %d, total promoted: %d", len(results), total_promoted)


if __name__ == "__main__":
    main()
