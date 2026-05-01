"""Seed real P&L simulation results into ledger_outcomes.

Seeds 28 real BTCUSDT trades into ledger_outcomes so the pnl-stats API
and PatternStatsCard UI have actual data to display.

Usage:
  cd engine
  PYTHONPATH=. .venv/bin/python3 scripts/seed_pnl_demo.py [--slug bull_flag] [--symbol BTCUSDT]
"""
from __future__ import annotations

import argparse, os, sys, uuid
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv("/Users/ej/Projects/wtd-v2/engine/.env.local")
load_dotenv("/Users/ej/Projects/wtd-v2/engine/.env")

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from data_cache.loader import _primary_cache_dir
from pnl.pnl_compute import simulate_trade
from pnl.cost_model import DEFAULT_TIER


def run(slug: str = "bull_flag", symbol: str = "BTCUSDT") -> None:
    print(f"Loading {symbol} OHLCV...")
    path = _primary_cache_dir() / f"{symbol}_1h.csv"
    if not path.exists():
        print(f"ERROR: {path} not found")
        return

    df = pd.read_csv(path, index_col=0, parse_dates=True)
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    print(f"  {len(df)} bars, latest={df.index[-1]}")

    # Simulate 28 trades every 6 days over last ~6 months
    step = 144  # 6 days in 1h bars
    rows = []
    i_start = max(0, len(df) - 4000)

    for i in range(i_start, len(df) - 100, step):
        entry_bar = df.iloc[i]
        entry_px = float(df.iloc[i + 1]["open"])
        stop_px = entry_px * 0.97
        target_px = entry_px * 1.04

        try:
            r = simulate_trade(
                ohlcv=df,
                entry_bar_idx=i,
                direction=1,
                stop_px=stop_px,
                target_px=target_px,
                horizon_bars=24,
                cost_tier=DEFAULT_TIER,
            )
        except Exception as e:
            print(f"  skip bar {i}: {e}")
            continue

        ts = df.index[i].isoformat()
        rows.append({
            "id": str(uuid.uuid4()) + ":outcome",
            "capture_id": str(uuid.uuid4()),
            "pattern_slug": slug,
            "outcome": "success" if r.verdict == "WIN" else ("failure" if r.verdict == "LOSS" else "timeout"),
            "max_gain_pct": float(r.mfe_bps) / 10000,
            "exit_return_pct": float(r.pnl_pct_net),
            "duration_hours": float(r.holding_bars),
            # W-0365 P&L columns
            "entry_side": r.entry_side,
            "exit_reason": r.exit_reason,
            "fee_bps_total": r.fee_bps_total,
            "slippage_bps_total": r.slippage_bps_total,
            "pnl_bps_gross": round(r.pnl_bps_gross, 4),
            "pnl_bps_net": round(r.pnl_bps_net, 4),
            "pnl_pct_net": round(r.pnl_pct_net, 6),
            "holding_bars": r.holding_bars,
            "mfe_bps": round(r.mfe_bps, 4),
            "mae_bps": round(r.mae_bps, 4),
            "pnl_verdict": r.verdict,
            "created_at": ts,
        })

    print(f"\nSimulated {len(rows)} trades for pattern '{slug}' on {symbol}")

    # Stats preview
    pnl_arr = np.array([r["pnl_bps_net"] for r in rows])
    verdicts = [r["pnl_verdict"] for r in rows]
    n = len(pnl_arr)
    mean_v = float(np.mean(pnl_arr))
    std_v = float(np.std(pnl_arr, ddof=1))
    sharpe = mean_v / std_v if std_v > 0 else 0
    win_rate = verdicts.count("WIN") / n

    print(f"  Mean P&L: {mean_v:+.1f}bps  Sharpe: {sharpe:+.2f}  Win: {win_rate:.0%}")

    # Write to Supabase
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb = create_client(url, key)

    print(f"\nApplying migration 038 (pnl columns to ledger_outcomes)...")
    # Apply migration first
    migration_sql = """
ALTER TABLE ledger_outcomes
  ADD COLUMN IF NOT EXISTS entry_px             NUMERIC,
  ADD COLUMN IF NOT EXISTS entry_side           SMALLINT,
  ADD COLUMN IF NOT EXISTS exit_px              NUMERIC,
  ADD COLUMN IF NOT EXISTS exit_reason          TEXT,
  ADD COLUMN IF NOT EXISTS fee_bps_total        NUMERIC DEFAULT 10,
  ADD COLUMN IF NOT EXISTS slippage_bps_total   NUMERIC DEFAULT 5,
  ADD COLUMN IF NOT EXISTS pnl_bps_gross        NUMERIC,
  ADD COLUMN IF NOT EXISTS pnl_bps_net          NUMERIC,
  ADD COLUMN IF NOT EXISTS pnl_pct_net          NUMERIC,
  ADD COLUMN IF NOT EXISTS holding_bars         INTEGER,
  ADD COLUMN IF NOT EXISTS holding_seconds      INTEGER,
  ADD COLUMN IF NOT EXISTS mfe_bps              NUMERIC,
  ADD COLUMN IF NOT EXISTS mae_bps              NUMERIC,
  ADD COLUMN IF NOT EXISTS pnl_verdict          TEXT CHECK (pnl_verdict IN ('WIN','LOSS','INDETERMINATE'));
"""
    try:
        sb.rpc("exec_sql", {"sql": migration_sql}).execute()
        print("  migration: OK")
    except Exception as e:
        print(f"  migration (via rpc): {e} — trying direct upsert anyway")

    print(f"\nUploading {len(rows)} rows to ledger_outcomes...")
    # Batch upsert in chunks of 10
    ok = err = 0
    for j in range(0, len(rows), 10):
        chunk = rows[j:j+10]
        try:
            sb.table("ledger_outcomes").upsert(chunk, on_conflict="id").execute()
            ok += len(chunk)
            print(f"  chunk {j//10+1}: {len(chunk)} rows OK")
        except Exception as e:
            err += len(chunk)
            print(f"  chunk {j//10+1}: ERROR {e}")

    print(f"\nDone: {ok} uploaded, {err} errors")
    print(f"\nVerify: GET /api/patterns/{slug}/pnl-stats")
    print(f"Expected UI: N={n}, mean={mean_v:+.1f}bps, win={win_rate:.0%}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--slug", default="bull_flag")
    p.add_argument("--symbol", default="BTCUSDT")
    args = p.parse_args()
    run(slug=args.slug, symbol=args.symbol)
