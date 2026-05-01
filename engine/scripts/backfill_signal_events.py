"""
Backfill scan_signal_events + scan_signal_outcomes from historical backtest.

Usage:
    python scripts/backfill_signal_events.py [--days 90] [--symbols BTCUSDT,ETHUSDT] [--dry-run]

This takes the run_pattern_backtest() output and writes to Supabase,
so we can immediately test the full alpha pipeline without waiting for live data.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
log = logging.getLogger("backfill")

# Add engine to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


def _sb():
    from supabase import create_client
    url = os.environ["PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def backfill_pattern(
    pattern_slug: str,
    universe: list[str],
    since: datetime,
    dry_run: bool = False,
) -> dict:
    from research.backtest import run_pattern_backtest, BacktestSignal

    log.info("Running backtest: %s on %s since %s", pattern_slug, universe, since.date())
    result = run_pattern_backtest(pattern_slug, universe, since=since)
    log.info("  Found %d signals", result.n_signals)

    if dry_run:
        log.info("  DRY RUN — not writing to DB")
        for s in result.signals[:3]:
            log.info("    %s %s @ %.2f entry_time=%s return_72h=%s",
                     s.symbol, s.pattern_slug, s.entry_price,
                     s.entry_time, s.fwd_return_72h)
        return {"dry_run": True, "n_signals": result.n_signals}

    sb = _sb()
    inserted = 0
    outcomes_written = 0

    for sig in result.signals:
        signal_id = str(uuid.uuid4())
        fired_at = sig.entry_time.isoformat() if sig.entry_time.tzinfo else \
                   sig.entry_time.replace(tzinfo=timezone.utc).isoformat()

        component_scores = {
            "phase_scores": [],
            "indicator_snapshot": {},
            "overall_score": 0.6,
            "schema_version": 1,
        }

        # Infer direction from fwd_return
        direction = "long"

        row = {
            "id": signal_id,
            "fired_at": fired_at,
            "symbol": sig.symbol,
            "pattern": sig.pattern_slug,
            "direction": direction,
            "entry_price": sig.entry_price,
            "component_scores": component_scores,
        }

        try:
            sb.table("scan_signal_events").upsert(row, on_conflict="id").execute()
            inserted += 1
        except Exception as e:
            log.warning("  Failed to insert signal %s: %s", signal_id, e)
            continue

        # Write outcomes for each horizon
        horizons = [
            (1,  None),   # 1h — backtest doesn't track separately, use 24h as proxy
            (4,  None),
            (24, sig.fwd_return_24h),
            (72, sig.fwd_return_72h),
        ]

        fired_dt = sig.entry_time if sig.entry_time.tzinfo else \
                   sig.entry_time.replace(tzinfo=timezone.utc)

        for horizon_h, pnl in horizons:
            if pnl is None and horizon_h < 24:
                # use 24h as proxy for shorter horizons (backtest only has 24h/72h)
                pnl = sig.fwd_return_24h

            outcome_at = fired_dt + timedelta(hours=horizon_h)

            # triple_barrier classification
            if pnl is None:
                triple_outcome = "timeout"
                realized_pnl = None
            elif pnl > 0.005:   # > 0.5%
                triple_outcome = "profit_take"
                realized_pnl = pnl
            elif pnl < -0.005:  # < -0.5%
                triple_outcome = "stop_loss"
                realized_pnl = pnl
            else:
                triple_outcome = "timeout"
                realized_pnl = pnl

            outcome_row = {
                "signal_id": signal_id,
                "horizon_h": horizon_h,
                "outcome_at": outcome_at.isoformat(),
                "triple_barrier_outcome": triple_outcome,
                "realized_pnl_pct": realized_pnl,
                "resolved": True,
                "resolved_at": datetime.now(timezone.utc).isoformat(),
            }

            try:
                sb.table("scan_signal_outcomes").upsert(
                    outcome_row, on_conflict="signal_id,horizon_h"
                ).execute()
                outcomes_written += 1
            except Exception as e:
                log.warning("  Outcome insert failed: %s", e)

    log.info("  Inserted %d signals, %d outcomes", inserted, outcomes_written)
    return {"inserted": inserted, "outcomes_written": outcomes_written}


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=30, help="Lookback days (default 30)")
    parser.add_argument("--symbols", default="BTCUSDT,ETHUSDT", help="Comma-separated symbols")
    parser.add_argument("--patterns", default=None, help="Comma-separated pattern slugs (default: all)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    universe = [s.strip() for s in args.symbols.split(",")]
    since = datetime.now(timezone.utc) - timedelta(days=args.days)

    # Load .env
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_file):
        for line in open(env_file):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

    # Get pattern list
    if args.patterns:
        patterns = [p.strip() for p in args.patterns.split(",")]
    else:
        try:
            from scanner.alerts_pattern import _PATTERN_LEVELS
            patterns = list(_PATTERN_LEVELS.keys())[:5]  # first 5 for initial test
            log.info("Using %d patterns: %s", len(patterns), patterns)
        except Exception:
            patterns = ["tradoor-oi-reversal-v1", "compression_v1"]

    total = {"inserted": 0, "outcomes_written": 0}
    for pattern in patterns:
        try:
            r = backfill_pattern(pattern, universe, since, dry_run=args.dry_run)
            if not args.dry_run:
                total["inserted"] += r.get("inserted", 0)
                total["outcomes_written"] += r.get("outcomes_written", 0)
        except Exception as e:
            log.error("Pattern %s failed: %s", pattern, e)

    log.info("=== Done: %d signals, %d outcomes total ===", total["inserted"], total["outcomes_written"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
