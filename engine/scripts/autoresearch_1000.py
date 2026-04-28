"""Auto-Research CLI — run full pattern research cycle on CMC 1000.

Usage:
    # Single cycle
    uv run python -m scripts.autoresearch_1000 cycle

    # Run until 5 promoted patterns found (max 3 cycles)
    uv run python -m scripts.autoresearch_1000 run --min-promoted 5 --max-cycles 3

    # Show best patterns from experiment DB
    uv run python -m scripts.autoresearch_1000 best --top 20

    # Quick test on 20 symbols
    uv run python -m scripts.autoresearch_1000 cycle --limit 20
"""
from __future__ import annotations

import argparse
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("autoresearch_1000")

try:
    import env_bootstrap  # noqa: F401
except ModuleNotFoundError:
    try:
        from engine import env_bootstrap  # type: ignore  # noqa: F401
    except ModuleNotFoundError:
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Auto-Research loop for CMC 1000")
    sub = parser.add_subparsers(dest="cmd")

    # cycle
    p_cycle = sub.add_parser("cycle", help="Run one research cycle")
    p_cycle.add_argument("--limit", type=int, default=None, help="Limit to first N symbols")
    p_cycle.add_argument("--workers", type=int, default=8)

    # run
    p_run = sub.add_parser("run", help="Run until exit criterion")
    p_run.add_argument("--min-promoted", type=int, default=5)
    p_run.add_argument("--min-sharpe", type=float, default=1.5)
    p_run.add_argument("--max-cycles", type=int, default=5)
    p_run.add_argument("--limit", type=int, default=None)
    p_run.add_argument("--workers", type=int, default=8)

    # best
    p_best = sub.add_parser("best", help="Show best patterns from experiment DB")
    p_best.add_argument("--top", type=int, default=20)
    p_best.add_argument("--min-sharpe", type=float, default=1.5)

    args = parser.parse_args()

    if args.cmd is None:
        parser.print_help()
        return

    from research.autoresearch_loop import AutoResearchLoop
    from data_cache.parquet_store import ParquetStore

    store = ParquetStore()
    loop = AutoResearchLoop(store=store, scan_workers=getattr(args, "workers", 8))

    if args.cmd == "cycle":
        symbols = None
        if args.limit:
            all_syms = store.list_symbols("1h")
            symbols = sorted(all_syms)[: args.limit]
            log.info("Limited to %d symbols", len(symbols))
        loop.run_cycle(symbols=symbols)

    elif args.cmd == "run":
        symbols = None
        if args.limit:
            all_syms = store.list_symbols("1h")
            symbols = sorted(all_syms)[: args.limit]
        loop.run_until(
            min_promoted=args.min_promoted,
            min_sharpe=args.min_sharpe,
            max_cycles=args.max_cycles,
            symbols=symbols,
        )

    elif args.cmd == "best":
        df = loop.get_best_patterns(top_n=args.top, min_sharpe=args.min_sharpe)
        if df.empty:
            print("No results yet. Run: autoresearch_1000 cycle")
        else:
            cols = ["symbol", "pattern", "sharpe", "win_rate", "n_executed",
                    "expectancy_pct", "max_drawdown_pct", "cycle_ts"]
            show = [c for c in cols if c in df.columns]
            print(f"\nTop {args.top} patterns (Sharpe ≥ {args.min_sharpe}):\n")
            print(df[show].to_string(index=False))
            print()


if __name__ == "__main__":
    main()
