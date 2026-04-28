"""W-0294: Quant-grade Layer P backtest — retroactive signal detection + walk-forward.

Detects REVERSAL_SIGNAL transitions from historical klines, runs walk-forward
backtest (3mo train + 1mo test, 1mo step), then reports Sharpe/Calmar/MaxDD
plus Layer P t-stat and hit rate.

Usage:
    cd engine
    uv run python -m scripts.run_quant_backtest
    uv run python -m scripts.run_quant_backtest --symbols BTCUSDT ETHUSDT SOLUSDT --months 6 --horizon 4
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1]))
from research.validation.stats import bootstrap_ci as _stats_bootstrap_ci  # noqa: E402
from research.validation.stats import hit_rate as _stats_hit_rate  # noqa: E402
from research.validation.stats import one_sample_t_test  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("run_quant_backtest")

# Suppress high-volume internal loggers that spam during historical replay
for _noisy in [
    "engine.patterns.state_machine",
    "engine.patterns",
    "patterns.state_machine",
    "patterns",
    "scoring",
    "engine.scoring",
    "scanner",
    "engine.scanner",
]:
    logging.getLogger(_noisy).setLevel(logging.ERROR)

_CACHE = Path(__file__).parents[1] / "data_cache" / "historical"
_REPORT_PATH = Path(__file__).parents[2] / "docs" / "live" / "W-0294-backtest-report.md"


# ── Data loading ─────────────────────────────────────────────────────────────

def _load_klines(symbol: str) -> pd.DataFrame | None:
    path = _CACHE / f"{symbol}_klines_1h.csv"
    if not path.exists():
        log.error("[%s] klines not found at %s", symbol, path)
        return None
    df = pd.read_csv(path, index_col="timestamp", parse_dates=True)
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    return df.sort_index()


def _adv_usd(klines: pd.DataFrame) -> float:
    """Average daily notional volume in USD."""
    daily_vol = klines["close"] * klines["volume"]
    return float(daily_vol.resample("1D").sum().mean())


# ── Layer P stats ─────────────────────────────────────────────────────────────

def _compute_forward_return(
    klines: pd.DataFrame, ts: pd.Timestamp, horizon_h: int, direction: str
) -> float | None:
    """Signed forward return adjusted for direction (positive = profitable)."""
    try:
        i = klines.index.searchsorted(ts)
        if i >= len(klines) - horizon_h:
            return None
        p0 = float(klines.iloc[i]["close"])
        p1 = float(klines.iloc[i + horizon_h]["close"])
        raw = (p1 - p0) / p0
        return -raw if direction == "short" else raw
    except Exception:
        return None


def _layer_p_stats(
    signals: list,
    klines_by_symbol: dict[str, pd.DataFrame],
    horizon_h: int,
) -> dict:
    returns = []
    skipped = 0
    for s in signals:
        k = klines_by_symbol.get(s.symbol)
        if k is None:
            skipped += 1
            continue
        fwd = _compute_forward_return(k, pd.Timestamp(s.timestamp), horizon_h, s.direction)
        if fwd is not None:
            returns.append(fwd)
        else:
            skipped += 1

    if len(returns) < 4:
        return {"n": 0, "skipped": skipped}

    t, mean = one_sample_t_test(returns)
    ci_lo, ci_hi, _ = _stats_bootstrap_ci(returns)
    hr = _stats_hit_rate(returns)
    return {
        "n": len(returns),
        "skipped": skipped,
        "mean_pct": mean * 100,
        "t_stat": t,
        "ci_lo": ci_lo * 100,
        "ci_hi": ci_hi * 100,
        "hit_rate": hr,
        "g1_pass": abs(t) >= 2.0,
        "g2_pass": hr >= 0.55,
    }


# ── Walk-forward ──────────────────────────────────────────────────────────────

def _walk_forward_folds(
    signals: list,
    klines_by_symbol: dict[str, pd.DataFrame],
    horizon_h: int,
    train_months: int = 3,
    test_months: int = 1,
    step_months: int = 1,
) -> list[dict]:
    """PurgedKFold-style walk-forward: train window → embargo → test window."""
    if not signals:
        return []

    all_ts = sorted(s.timestamp for s in signals)
    t_min = pd.Timestamp(all_ts[0])
    t_max = pd.Timestamp(all_ts[-1])

    folds = []
    fold_start = t_min

    while True:
        train_end = fold_start + pd.DateOffset(months=train_months)
        embargo_end = train_end + pd.Timedelta(hours=24)  # López de Prado embargo
        test_start = embargo_end
        test_end = test_start + pd.DateOffset(months=test_months)

        if test_end > t_max:
            break

        test_signals = [
            s for s in signals
            if test_start <= pd.Timestamp(s.timestamp) < test_end
        ]

        if len(test_signals) < 10:
            log.warning("fold %s: only %d test signals — skipping", fold_start.date(), len(test_signals))
            fold_start += pd.DateOffset(months=step_months)
            continue

        stats = _layer_p_stats(test_signals, klines_by_symbol, horizon_h)
        stats["fold"] = fold_start.strftime("%Y-%m")
        stats["test_start"] = test_start.strftime("%Y-%m-%d")
        stats["test_end"] = test_end.strftime("%Y-%m-%d")
        folds.append(stats)

        fold_start += pd.DateOffset(months=step_months)

    return folds


# ── Backtest via simulator ────────────────────────────────────────────────────

def _run_simulator_backtest(
    signals: list,
    klines_by_symbol: dict[str, pd.DataFrame],
    adv_by_symbol: dict[str, float],
) -> dict:
    """Run D12 portfolio simulator. Returns summary dict."""
    try:
        from backtest.config import RiskConfig
        from backtest.simulator import run_backtest
        from observability.logging import StructuredLogger
        from scanner.pnl import ExecutionCosts
    except ImportError as exc:
        log.warning("simulator import failed: %s — skipping portfolio backtest", exc)
        return {}

    risk_cfg = RiskConfig(
        initial_equity=10_000.0,
        risk_per_trade_pct=0.01,
        max_concurrent_positions=3,
        stop_loss_pct=0.02,
        take_profit_pct=0.04,
        max_hold_bars=24,
    )
    costs = ExecutionCosts()
    struct_log = StructuredLogger("run_quant_backtest", "W-0294")

    try:
        result = run_backtest(
            entries=signals,
            klines_by_symbol=klines_by_symbol,
            adv_by_symbol=adv_by_symbol,
            risk_cfg=risk_cfg,
            costs=costs,
            threshold=0.5,
            logger=struct_log,
        )
        m = result.metrics
        return {
            "n_executed": m.n_executed,
            "n_blocked": m.n_blocked,
            "win_rate": m.win_rate,
            "expectancy_pct": m.expectancy_pct,
            "profit_factor": m.profit_factor,
            "max_drawdown_pct": m.max_drawdown_pct,
            "sharpe": m.sharpe,
            "calmar": m.calmar,
            "sortino": m.sortino,
        }
    except Exception as exc:
        log.warning("simulator run failed: %s", exc)
        return {}


# ── Report ────────────────────────────────────────────────────────────────────

def _print_report(
    symbols: list[str],
    months: int,
    horizon_h: int,
    n_raw: int,
    full_stats: dict,
    folds: list[dict],
    sim: dict,
    pattern_slug: str,
) -> str:
    sep = "=" * 62
    now = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    g1_all = "✅ PASS" if full_stats.get("g1_pass") else "❌ FAIL"
    g2_all = "✅ PASS" if full_stats.get("g2_pass") else "❌ FAIL"
    verdict = "🚀 PROMOTE" if (full_stats.get("g1_pass") and full_stats.get("g2_pass")) else "🔧 REFINE"

    folds_pass = sum(1 for f in folds if f.get("g1_pass") and f.get("g2_pass"))
    folds_total = len(folds)

    lines = [
        f"\n{sep}",
        f"W-0294 Quant Backtest Report",
        f"Generated: {now}",
        sep,
        f"Pattern:   {pattern_slug}",
        f"Signal:    REVERSAL_SIGNAL (SHORT)",
        f"Symbols:   {', '.join(symbols)}",
        f"Period:    {months} months",
        f"Horizon:   {horizon_h}h forward return",
        f"n_raw:     {n_raw} signals detected",
        f"n_valid:   {full_stats.get('n', 0)} (with forward return)",
        "",
        "── Full Period Layer P ──────────────────────────────────",
        f"  mean return:   {full_stats.get('mean_pct', 0):.3f}%",
        f"  t-stat:        {full_stats.get('t_stat', 0):.2f}",
        f"  95% CI:        [{full_stats.get('ci_lo', 0):.3f}%, {full_stats.get('ci_hi', 0):.3f}%]",
        f"  hit_rate:      {full_stats.get('hit_rate', 0):.1%}",
        "",
        f"  G1 (|t| ≥ 2.0): {g1_all} ({abs(full_stats.get('t_stat', 0)):.2f})",
        f"  G2 (hit ≥ 55%): {g2_all} ({full_stats.get('hit_rate', 0):.1%})",
        "",
        f"  Verdict: {verdict}",
        "",
        "── Walk-Forward Folds ──────────────────────────────────",
        f"  {folds_total} folds (3mo train / 1mo test, 24h embargo)",
        f"  G1+G2 pass: {folds_pass}/{folds_total} folds",
    ]

    for f in folds:
        g = "✅" if (f.get("g1_pass") and f.get("g2_pass")) else "❌"
        lines.append(
            f"  {g} [{f['test_start']} → {f['test_end']}]"
            f"  n={f['n']}  t={f.get('t_stat', 0):.2f}"
            f"  hit={f.get('hit_rate', 0):.0%}"
        )

    if sim:
        lines += [
            "",
            "── Portfolio Simulator (D12) ───────────────────────────",
            f"  n_executed:    {sim.get('n_executed', 0)}",
            f"  n_blocked:     {sim.get('n_blocked', 0)}",
            f"  win_rate:      {sim.get('win_rate', 0):.1%}",
            f"  expectancy:    {sim.get('expectancy_pct', 0):.3f}%",
            f"  profit_factor: {sim.get('profit_factor', 0):.2f}",
            f"  max_drawdown:  {sim.get('max_drawdown_pct', 0):.2f}%",
            f"  sharpe:        {sim.get('sharpe', 0):.2f}",
            f"  calmar:        {sim.get('calmar', 0):.2f}",
            f"  sortino:       {sim.get('sortino', 0):.2f}",
        ]

    lines.append(sep + "\n")
    report = "\n".join(lines)
    print(report)
    return report


def _save_report(report: str, symbols: list[str], months: int, folds: list[dict], sim: dict, full_stats: dict) -> None:
    _REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    verdict = "PROMOTE" if (full_stats.get("g1_pass") and full_stats.get("g2_pass")) else "REFINE"

    md = f"""# W-0294 — Quant Backtest Report

> Generated: {now}
> Symbols: {', '.join(symbols)} | Period: {months}mo | Pattern: liquidity-sweep-reversal-v1

## Full Period Results

| Metric | Value |
|---|---|
| n_signals | {full_stats.get('n', 0)} |
| mean_return | {full_stats.get('mean_pct', 0):.3f}% |
| t_stat | {full_stats.get('t_stat', 0):.2f} |
| 95% CI | [{full_stats.get('ci_lo', 0):.3f}%, {full_stats.get('ci_hi', 0):.3f}%] |
| hit_rate | {full_stats.get('hit_rate', 0):.1%} |
| G1 (\\|t\\| ≥ 2.0) | {'✅ PASS' if full_stats.get('g1_pass') else '❌ FAIL'} |
| G2 (hit ≥ 55%) | {'✅ PASS' if full_stats.get('g2_pass') else '❌ FAIL'} |
| **Verdict** | **{verdict}** |

## Walk-Forward Folds

| Fold | Test Period | n | t-stat | hit_rate | G1+G2 |
|---|---|---|---|---|---|
"""
    for f in folds:
        g = "✅" if (f.get("g1_pass") and f.get("g2_pass")) else "❌"
        md += (
            f"| {f['fold']} | {f['test_start']} → {f['test_end']} "
            f"| {f['n']} | {f.get('t_stat', 0):.2f} "
            f"| {f.get('hit_rate', 0):.0%} | {g} |\n"
        )

    if sim:
        md += f"""
## Portfolio Simulator (D12)

| Metric | Value |
|---|---|
| n_executed | {sim.get('n_executed', 0)} |
| win_rate | {sim.get('win_rate', 0):.1%} |
| expectancy | {sim.get('expectancy_pct', 0):.3f}% |
| profit_factor | {sim.get('profit_factor', 0):.2f} |
| max_drawdown | {sim.get('max_drawdown_pct', 0):.2f}% |
| sharpe | {sim.get('sharpe', 0):.2f} |
| calmar | {sim.get('calmar', 0):.2f} |
"""

    _REPORT_PATH.write_text(md)
    log.info("report saved → %s", _REPORT_PATH)


# ── Main ──────────────────────────────────────────────────────────────────────

def run(symbols: list[str], months: int, horizon_h: int, pattern_slug: str) -> None:
    log.info("detecting signals: %s, %dmo, pattern=%s", symbols, months, pattern_slug)

    from research.validation.historical_runner import detect_historical_signals
    signals = detect_historical_signals(symbols, months=months, pattern_slug=pattern_slug)

    if not signals:
        log.error("no signals detected — cannot backtest")
        sys.exit(1)

    log.info("total signals: %d", len(signals))

    klines_by_symbol = {}
    adv_by_symbol = {}
    for sym in symbols:
        k = _load_klines(sym)
        if k is not None:
            klines_by_symbol[sym] = k
            adv_by_symbol[sym] = _adv_usd(k)

    # Full-period Layer P stats
    full_stats = _layer_p_stats(signals, klines_by_symbol, horizon_h)
    log.info(
        "full period: n=%d, t=%.2f, hit=%.1f%%",
        full_stats.get("n", 0),
        full_stats.get("t_stat", 0),
        full_stats.get("hit_rate", 0) * 100,
    )

    # Walk-forward folds
    folds = _walk_forward_folds(signals, klines_by_symbol, horizon_h)
    log.info("walk-forward: %d folds", len(folds))

    # Portfolio simulator
    sim = _run_simulator_backtest(signals, klines_by_symbol, adv_by_symbol)

    report = _print_report(symbols, months, horizon_h, len(signals), full_stats, folds, sim, pattern_slug)
    _save_report(report, symbols, months, folds, sim, full_stats)


def main() -> None:
    parser = argparse.ArgumentParser(description="W-0294 quant backtest")
    parser.add_argument("--symbols", nargs="+", default=["BTCUSDT", "ETHUSDT", "SOLUSDT"])
    parser.add_argument("--months", type=int, default=6)
    parser.add_argument("--horizon", type=int, default=4, help="forward return horizon (hours)")
    parser.add_argument("--pattern", default="liquidity-sweep-reversal-v1")
    args = parser.parse_args()
    run(args.symbols, args.months, args.horizon, args.pattern)


if __name__ == "__main__":
    main()
