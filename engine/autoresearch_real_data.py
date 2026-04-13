"""AutoResearch with real market data.

End-to-end pipeline test:
  1. Load real Binance klines + perp data (or use cache)
  2. Compute 28 features via scanner.feature_calc
  3. Build Context + run building block triggers → entry signals
  4. Run portfolio backtest → metrics
  5. Grid-search over block combinations, print best result

Usage:
    cd engine
    python autoresearch_real_data.py                        # BTCUSDT default
    python autoresearch_real_data.py --symbol ETHUSDT
    python autoresearch_real_data.py --symbol BTCUSDT --offline  # cache only

Exits with code 1 if no data is available and --offline was set.
"""
from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from typing import NamedTuple

import pandas as pd

from backtest.config import RiskConfig
from backtest.simulator import run_backtest
from backtest.types import EntrySignal
from building_blocks.context import Context
from building_blocks.triggers.breakout_above_high import breakout_above_high
from building_blocks.triggers.recent_rally import recent_rally
from building_blocks.triggers.recent_decline import recent_decline
from building_blocks.triggers.volume_spike import volume_spike
from building_blocks.entries.rsi_threshold import rsi_threshold
from building_blocks.confirmations.oi_change import oi_change
from data_cache.loader import load_klines, load_perp, load_macro_bundle, load_onchain_bundle
from exceptions import CacheMiss
from observability.logging import StructuredLogger
from scanner.feature_calc import compute_features_table
from scanner.pnl import ExecutionCosts


# ─── Experiment config ─────────────────────────────────────────────────────

@dataclass
class BlockCombo:
    name: str
    direction: str  # "long" | "short"
    description: str

    def fire(self, ctx: Context) -> pd.Series:
        raise NotImplementedError


@dataclass
class BreakoutLongCombo(BlockCombo):
    def fire(self, ctx: Context) -> pd.Series:
        trigger = breakout_above_high(ctx, lookback_days=20)
        spike = volume_spike(ctx)
        return trigger & spike


@dataclass
class RallyLongCombo(BlockCombo):
    def fire(self, ctx: Context) -> pd.Series:
        return recent_rally(ctx)


@dataclass
class DeclineShortCombo(BlockCombo):
    def fire(self, ctx: Context) -> pd.Series:
        return recent_decline(ctx)


@dataclass
class RSILongCombo(BlockCombo):
    def fire(self, ctx: Context) -> pd.Series:
        # Oversold bounce
        return rsi_threshold(ctx, threshold=35, direction="below")


@dataclass
class RSIShortCombo(BlockCombo):
    def fire(self, ctx: Context) -> pd.Series:
        # Overbought short
        return rsi_threshold(ctx, threshold=65, direction="above")


BLOCK_COMBOS: list[BlockCombo] = [
    BreakoutLongCombo(
        name="breakout_volume_long",
        direction="long",
        description="20d breakout + volume spike → long",
    ),
    RallyLongCombo(
        name="recent_rally_long",
        direction="long",
        description="recent rally continuation → long",
    ),
    DeclineShortCombo(
        name="recent_decline_short",
        direction="short",
        description="recent decline continuation → short",
    ),
    RSILongCombo(
        name="rsi_oversold_long",
        direction="long",
        description="RSI < 35 oversold bounce → long",
    ),
    RSIShortCombo(
        name="rsi_overbought_short",
        direction="short",
        description="RSI > 65 overbought fade → short",
    ),
]


# ─── Signal builder ────────────────────────────────────────────────────────

def build_signals(
    ctx: Context,
    combo: BlockCombo,
    *,
    predicted_prob: float = 0.6,
) -> list[EntrySignal]:
    """Run a block combo and convert True bars → EntrySignal list."""
    fired: pd.Series = combo.fire(ctx)
    signals: list[EntrySignal] = []
    for ts, val in fired.items():
        if val:
            signals.append(
                EntrySignal(
                    symbol=ctx.symbol,
                    timestamp=ts,
                    direction=combo.direction,
                    predicted_prob=predicted_prob,
                    source_model=combo.name,
                )
            )
    return signals


# ─── Single run ────────────────────────────────────────────────────────────

class RunResult(NamedTuple):
    combo_name: str
    n_signals: int
    n_executed: int
    win_rate: float
    expectancy_pct: float
    max_drawdown_pct: float
    sharpe: float
    final_equity: float


def run_combo(
    combo: BlockCombo,
    ctx: Context,
    klines_by_symbol: dict[str, pd.DataFrame],
    adv_by_symbol: dict[str, float],
    risk_cfg: RiskConfig,
    costs: ExecutionCosts,
    logger: StructuredLogger,
) -> RunResult:
    signals = build_signals(ctx, combo)
    if not signals:
        return RunResult(
            combo_name=combo.name,
            n_signals=0,
            n_executed=0,
            win_rate=0.0,
            expectancy_pct=0.0,
            max_drawdown_pct=0.0,
            sharpe=0.0,
            final_equity=risk_cfg.initial_equity,
        )

    result = run_backtest(
        entries=signals,
        klines_by_symbol=klines_by_symbol,
        adv_by_symbol=adv_by_symbol,
        risk_cfg=risk_cfg,
        costs=costs,
        threshold=0.55,
        logger=logger,
    )
    m = result.metrics
    return RunResult(
        combo_name=combo.name,
        n_signals=len(signals),
        n_executed=m.n_executed,
        win_rate=m.win_rate,
        expectancy_pct=m.expectancy_pct,
        max_drawdown_pct=m.max_drawdown_pct,
        sharpe=m.sharpe,
        final_equity=m.final_equity,
    )


# ─── Main ──────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="AutoResearch with real Binance data")
    parser.add_argument("--symbol", default="BTCUSDT", help="e.g. BTCUSDT")
    parser.add_argument("--offline", action="store_true", help="cache only, no network")
    args = parser.parse_args()

    symbol = args.symbol.upper()
    offline = args.offline

    print(f"\n{'='*60}")
    print(f"  AutoResearch — real data  |  {symbol}  |  1h bars")
    print(f"{'='*60}")

    # ── 1. Load klines ────────────────────────────────────────────
    print(f"\n[1/4] Loading klines for {symbol}...")
    t0 = time.time()
    try:
        klines = load_klines(symbol, "1h", offline=offline)
    except CacheMiss:
        print(f"  ERROR: No cached data for {symbol}. Run without --offline to fetch.")
        sys.exit(1)
    except Exception as e:
        print(f"  ERROR fetching klines: {e}")
        sys.exit(1)

    print(f"  {len(klines)} bars  ({klines.index[0].date()} → {klines.index[-1].date()})  [{time.time()-t0:.1f}s]")

    # ── 2. Load perp (optional) ───────────────────────────────────
    print(f"\n[2/5] Loading perp data for {symbol}...")
    t0 = time.time()
    perp = load_perp(symbol, offline=offline)
    if perp is not None:
        print(f"  {len(perp)} bars of funding/OI/LS  [{time.time()-t0:.1f}s]")
    else:
        print("  No perp data — using neutral defaults (funding=0, oi=0, ls=1)")

    # ── 3. Load macro bundle ──────────────────────────────────────
    print(f"\n[3/5] Loading macro bundle (Fear&Greed, BTC dom, DXY/VIX/SPX)...")
    t0 = time.time()
    macro = load_macro_bundle(days=365, offline=offline)
    if macro is not None:
        print(f"  {len(macro)} daily rows | cols: {list(macro.columns)}  [{time.time()-t0:.1f}s]")
    else:
        print("  No macro data — using neutral defaults")

    # ── 3b. Load on-chain bundle ──────────────────────────────────
    print(f"\n[3b] Loading on-chain data for {symbol} (CoinMetrics)...")
    t0 = time.time()
    onchain = load_onchain_bundle(symbol, days=365, offline=offline)
    if onchain is not None:
        print(f"  {len(onchain)} daily rows | cols: {list(onchain.columns)}  [{time.time()-t0:.1f}s]")
    else:
        print("  No on-chain data — using neutral defaults")

    # ── 4. Compute features ───────────────────────────────────────
    n_features = len(compute_features_table.__code__.co_varnames)  # rough
    print(f"\n[4/5] Computing features ({len(list(__import__('scanner.feature_calc', fromlist=['FEATURE_COLUMNS']).FEATURE_COLUMNS))} total)...")
    t0 = time.time()
    features = compute_features_table(klines, symbol, perp, macro, onchain)
    print(f"  {len(features)} feature rows  (dropped {len(klines)-len(features)} warmup bars)  [{time.time()-t0:.1f}s]")
    print(f"  Columns: {list(features.columns)}")

    ctx = Context(klines=klines, features=features, symbol=symbol)

    # ── 5. Run block combos → backtest ────────────────────────────
    print(f"\n[5/5] Grid-search over {len(BLOCK_COMBOS)} block combos...")

    risk_cfg = RiskConfig()
    costs = ExecutionCosts()
    logger = StructuredLogger(module="autoresearch", run_id=symbol, stream=open("/dev/null", "w"))
    klines_by_symbol = {symbol: klines}

    # Rough 30d ADV estimate from last 30 days of volume * close
    last_30d = klines.tail(30 * 24)
    adv_usd = float((last_30d["volume"] * last_30d["close"]).mean() * 24)
    adv_by_symbol = {symbol: adv_usd}

    results: list[RunResult] = []
    for combo in BLOCK_COMBOS:
        t0 = time.time()
        r = run_combo(combo, ctx, klines_by_symbol, adv_by_symbol, risk_cfg, costs, logger)
        elapsed = time.time() - t0
        print(
            f"  [{combo.name:<30}] signals={r.n_signals:4d}  executed={r.n_executed:4d}"
            f"  winrate={r.win_rate:.1%}  expect={r.expectancy_pct:+.2%}"
            f"  sharpe={r.sharpe:+.2f}  dd={r.max_drawdown_pct:.1%}"
            f"  [{elapsed:.2f}s]"
        )
        results.append(r)

    # ── Summary ───────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("  RESULTS — sorted by composite score (sharpe × winrate)")
    print(f"{'='*60}")

    def composite(r: RunResult) -> float:
        if r.n_executed == 0:
            return -999.0
        return (
            0.4 * r.win_rate
            + 0.3 * max(0, r.sharpe / 3)
            + 0.3 * (1 - r.max_drawdown_pct)
        )

    ranked = sorted(results, key=composite, reverse=True)
    for i, r in enumerate(ranked):
        emoji = "🏆" if i == 0 else f"  {i+1}."
        pnl_pct = (r.final_equity / risk_cfg.initial_equity - 1) * 100
        print(
            f"  {emoji}  {r.combo_name:<30}  "
            f"trades={r.n_executed:4d}  wr={r.win_rate:.1%}  "
            f"E={r.expectancy_pct:+.3%}  sharpe={r.sharpe:+.2f}  "
            f"dd={r.max_drawdown_pct:.1%}  equity={pnl_pct:+.1f}%"
        )

    best = ranked[0]
    print(f"\n  Best combo : {best.combo_name}")
    print(f"  Final equity: ${best.final_equity:,.2f}  ({(best.final_equity/risk_cfg.initial_equity-1)*100:+.1f}%)")
    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    main()
