"""Quant research report generator.

Produces a professional-grade research report from AutoResearch scan results,
including statistical significance tests, Sharpe confidence intervals,
coverage diagnostics, and actionable next-steps.

Usage:
    from research.report import generate_report
    report_str = generate_report(scan_df, cycle_id=1, cycle_ts="2026-04-29T18:54")
    print(report_str)

    # Or from AutoResearchLoop:
    result = loop.run_cycle(...)
    print(generate_report(result.top_patterns, cycle_id=result.cycle_id))
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import NamedTuple

import numpy as np
import pandas as pd


# ── Statistical helpers ───────────────────────────────────────────────────────

def _t_stat(win_rate: float, n: int) -> float:
    """Binomial t-stat: how many std errors above 0.50."""
    if n < 2:
        return 0.0
    se = math.sqrt(win_rate * (1 - win_rate) / n)
    return (win_rate - 0.50) / max(se, 1e-9)


def _p_value(t: float, n: int) -> float:
    """One-tailed p-value from t-distribution (n-1 df)."""
    try:
        from scipy import stats as scipy_stats
        return float(scipy_stats.t.sf(t, df=max(n - 1, 1)))
    except ImportError:
        # Normal approximation if scipy not available
        z = abs(t)
        return float(0.5 * math.erfc(z / math.sqrt(2)))


def _sharpe_ci(sharpe: float, n: int, alpha: float = 0.05) -> tuple[float, float]:
    """Approximate 95% CI for annualised Sharpe using Lo (2002) SE formula.

    SE(SR) ≈ sqrt((1 + SR²/2) / n)
    """
    if n < 2:
        return (sharpe, sharpe)
    se = math.sqrt((1 + sharpe ** 2 / 2) / n)
    z = 1.96
    return (sharpe - z * se, sharpe + z * se)


class RowStats(NamedTuple):
    t_stat: float
    p_value: float
    ci_lo: float
    ci_hi: float
    verdict: str


def _row_stats(row: pd.Series) -> RowStats:
    n = int(row["n_executed"])
    wr = float(row["win_rate"])
    sr = float(row["sharpe"])
    t = _t_stat(wr, n)
    p = _p_value(t, n)
    lo, hi = _sharpe_ci(sr, n)
    if p < 0.05:
        verdict = "SIGNIFICANT ●"
    elif p < 0.10:
        verdict = "MARGINAL"
    else:
        verdict = "NOISE"
    return RowStats(t_stat=t, p_value=p, ci_lo=lo, ci_hi=hi, verdict=verdict)


# ── Coverage helpers ──────────────────────────────────────────────────────────

def _coverage_summary() -> dict:
    try:
        from data_cache.parquet_store import ParquetStore
        store = ParquetStore()
        cov = store.coverage()
        if cov.empty:
            return {}
        total_syms = len(cov)
        # Compute days_covered from first/last ts
        if "first_ts" in cov.columns and "last_ts" in cov.columns:
            cov = cov.copy()
            cov["first_ts"] = pd.to_datetime(cov["first_ts"], utc=True)
            cov["last_ts"] = pd.to_datetime(cov["last_ts"], utc=True)
            cov["days"] = (cov["last_ts"] - cov["first_ts"]).dt.days
            avg_days = float(cov["days"].mean())
            pct_365 = float((cov["days"] >= 365).mean())
        else:
            avg_days = 0.0
            pct_365 = 0.0

        # Derivatives coverage — count unique symbols (not files)
        import re
        from pathlib import Path
        deriv_dir = store._deriv
        deriv_syms = {re.sub(r"_(funding|oi|ls_ratio|oi_change)\.parquet$", "", f.name)
                      for f in deriv_dir.glob("*.parquet")
                      if re.search(r"_(funding)\.parquet$", f.name)}
        return {
            "ohlcv_total": total_syms,
            "avg_days": avg_days,
            "pct_1yr": pct_365,
            "deriv_total": len(deriv_syms),
        }
    except Exception:
        return {}


# ── Section builders ──────────────────────────────────────────────────────────

_W = 72  # report width


def _rule(char: str = "─") -> str:
    return char * _W


def _header(cycle_id: int, cycle_ts: str, n_total_combos: int,
            n_symbols: int, gate_desc: str) -> str:
    lines = [
        "═" * _W,
        f"  PATTERN RESEARCH REPORT  —  Cycle #{cycle_id}",
        f"  Generated : {cycle_ts[:19]} UTC",
        f"  Universe  : {n_symbols} symbols  |  Combos: {n_total_combos}  |  Gate: {gate_desc}",
        "═" * _W,
    ]
    return "\n".join(lines)


def _summary_section(df_all: pd.DataFrame, df_gate: pd.DataFrame,
                     promote_threshold: float, n_total_combos: int) -> str:
    # n_all = total unique (symbol, pattern) pairs actually evaluated
    n_all = df_all["symbol"].nunique() * df_all["pattern"].nunique() if not df_all.empty else 0
    # But better: use the passed n_total_combos
    n_evaluated = n_total_combos
    n_gate = len(df_gate)
    n_sig = int((df_gate.apply(_row_stats, axis=1).apply(lambda r: r.p_value < 0.10).sum())
                if not df_gate.empty else 0)
    n_promoted = int((df_gate["sharpe"] >= promote_threshold).sum()) if not df_gate.empty else 0
    pct = f"{100*n_gate/max(n_evaluated,1):.2f}%"

    lines = [
        "",
        "◆ EXECUTIVE SUMMARY",
        f"  Patterns evaluated : {n_evaluated:,}",
        f"  Gate passed        : {n_gate}  ({pct})",
        f"  Stat sig (p < 0.10): {n_sig}",
        f"  Promoted (S ≥ {promote_threshold:.1f})  : {n_promoted}",
    ]
    return "\n".join(lines)


def _ranked_table(df: pd.DataFrame) -> str:
    if df.empty:
        return "\n◆ RANKED RESULTS\n  (none passed gates)\n"

    lines = [
        "",
        "◆ RANKED RESULTS",
        _rule(),
        f"  {'#':>3}  {'Symbol':<14} {'Pattern':<34} {'S':>5}  {'WinR':>5}  {'Exp%':>5}  {'n':>4}  {'t':>5}  {'MDD%':>6}  {'Calmar':>6}",
        "  " + _rule("─"),
    ]

    for rank, (_, row) in enumerate(df.iterrows(), 1):
        stats = _row_stats(row)
        symbol = str(row["symbol"])[:14]
        pattern = str(row["pattern"])[:33]
        sharpe = float(row["sharpe"])
        win_rate = float(row["win_rate"])
        exp_pct = float(row["expectancy_pct"]) * 100
        n = int(row["n_executed"])
        mdd = float(row["max_drawdown_pct"]) * 100
        calmar = float(row.get("calmar", 0))

        flag = "★" if stats.p_value < 0.10 else " "
        lines.append(
            f"  {rank:>3}  {symbol:<14} {pattern:<34} {sharpe:>5.3f}  "
            f"{win_rate*100:>4.1f}%  {exp_pct:>5.2f}  {n:>4}  "
            f"{stats.t_stat:>5.2f}  {mdd:>5.1f}%  {calmar:>6.2f}  {flag}"
        )

    lines.append("  " + _rule("─"))
    lines.append("  ★ = marginal or significant (p < 0.10)  |  S = annualised Sharpe  |  Exp% = avg return/trade")
    return "\n".join(lines)


def _by_pattern_section(df: pd.DataFrame) -> str:
    if df.empty:
        return ""
    grp = (
        df.groupby("pattern")
        .agg(
            n_symbols=("symbol", "count"),
            med_sharpe=("sharpe", "median"),
            avg_wr=("win_rate", "mean"),
            avg_n=("n_executed", "mean"),
        )
        .sort_values("med_sharpe", ascending=False)
        .reset_index()
    )

    lines = [
        "",
        "◆ BY PATTERN TYPE",
        _rule(),
        f"  {'Pattern':<40} {'Sym':>4}  {'med S':>6}  {'avg WR':>7}  {'avg n':>6}",
        "  " + _rule("─"),
    ]
    for _, r in grp.iterrows():
        lines.append(
            f"  {str(r['pattern']):<40} {int(r['n_symbols']):>4}  "
            f"{r['med_sharpe']:>6.3f}  {r['avg_wr']*100:>6.1f}%  {r['avg_n']:>6.1f}"
        )
    return "\n".join(lines)


def _stats_section(df: pd.DataFrame) -> str:
    if df.empty:
        return ""

    sig_rows = []
    for _, row in df.iterrows():
        stats = _row_stats(row)
        if stats.p_value < 0.15:
            sig_rows.append((row, stats))

    if not sig_rows:
        return (
            "\n◆ STATISTICAL QUALITY\n"
            "  No results meet p < 0.15 threshold\n"
        )

    lines = [
        "",
        "◆ STATISTICAL QUALITY  (p < 0.15 only)",
        _rule(),
        f"  {'Symbol':<16} {'Pattern':<30} {'t-stat':>6}  {'p-val':>6}  {'Sharpe CI 95%':>16}  verdict",
        "  " + _rule("─"),
    ]
    for row, stats in sorted(sig_rows, key=lambda x: x[1].p_value):
        ci = f"[{stats.ci_lo:+.2f} – {stats.ci_hi:+.2f}]"
        lines.append(
            f"  {str(row['symbol']):<16} {str(row['pattern'])[:29]:<30} "
            f"{stats.t_stat:>6.2f}  {stats.p_value:>6.3f}  {ci:>16}  {stats.verdict}"
        )
    return "\n".join(lines)


def _coverage_section(blocked_patterns: list[str]) -> str:
    cov = _coverage_summary()
    lines = [
        "",
        "◆ DATA COVERAGE",
        _rule(),
    ]
    if cov:
        lines.append(
            f"  OHLCV        : {cov['ohlcv_total']} symbols | "
            f"avg {cov['avg_days']:.0f}d | {cov['pct_1yr']*100:.0f}% ≥ 1yr"
        )
        lines.append(
            f"  Derivatives  : {cov['deriv_total']} symbols | ~180d (funding, OI, L/S)"
        )
    if blocked_patterns:
        n = len(blocked_patterns)
        total = n + (12 - n)
        lines.append(f"  Patterns blocked by missing derivatives ({n}/12):")
        chunk = ", ".join(blocked_patterns[:5])
        rest = len(blocked_patterns) - 5
        lines.append(f"    {chunk}" + (f" + {rest} more" if rest > 0 else ""))
    return "\n".join(lines)


def _next_steps_section(df: pd.DataFrame, promote_threshold: float) -> str:
    lines = [
        "",
        "◆ NEXT ACTIONS",
        _rule(),
    ]

    promoted = df[df["sharpe"] >= promote_threshold] if not df.empty else pd.DataFrame()
    if promoted.empty:
        lines.append(f"  ✘ No patterns promoted  (target Sharpe ≥ {promote_threshold:.1f})")

    if not df.empty:
        stats_rows = [(row, _row_stats(row)) for _, row in df.iterrows()]
        sig = [(r, s) for r, s in stats_rows if s.p_value < 0.05]
        marginal = [(r, s) for r, s in stats_rows if 0.05 <= s.p_value < 0.10]
        high_n = df[df["n_executed"] >= 40]

        for row, s in sig[:3]:
            lines.append(
                f"  → {row['symbol']}/{row['pattern']}: "
                f"p={s.p_value:.3f} SIGNIFICANT — run OOS validation"
            )
        for row, s in marginal[:2]:
            lines.append(
                f"  → {row['symbol']}/{row['pattern']}: "
                f"p={s.p_value:.3f} marginal — accumulate more data"
            )
        if not high_n.empty:
            best = high_n.sort_values("sharpe", ascending=False).iloc[0]
            lines.append(
                f"  → {best['symbol']}/{best['pattern']}: "
                f"n={int(best['n_executed'])} trades, stable sample — candidate for live watch"
            )
    lines.append(
        "  → Run: derivatives backfill 6yr  to unlock 10 blocked OI/funding patterns"
    )
    return "\n".join(lines)


def _footer() -> str:
    return "\n" + "═" * _W + "\n"


# ── Public API ────────────────────────────────────────────────────────────────

_DERIVATIVES_BLOCKED = [
    "tradoor-oi-reversal-v1",
    "funding-flip-reversal-v1",
    "wyckoff-spring-reversal-v1",
    "liquidity-sweep-reversal-v1",
    "oi-presurge-long-v1",
    "alpha-confluence-v1",
    "funding-flip-short-v1",
    "gap-fade-short-v1",
    "whale-accumulation-reversal-v1",
    "alpha-presurge-v1",
]


def generate_report(
    df_gate: pd.DataFrame,
    *,
    df_all: pd.DataFrame | None = None,
    cycle_id: int = 1,
    cycle_ts: str | None = None,
    n_symbols: int | None = None,
    n_combos: int = 12,
    gate_desc: str = "n≥5 | WinR≥50% | Sharpe≥0.30",
    promote_threshold: float = 1.0,
    blocked_patterns: list[str] | None = None,
) -> str:
    """Build and return a full quant research report string.

    Args:
        df_gate: DataFrame of gate-passed results (from AutoResearchLoop.run_cycle).
        df_all: Full pre-gate DataFrame (for counts). Falls back to df_gate if None.
        cycle_id: Research cycle number.
        cycle_ts: ISO timestamp string. Defaults to now.
        n_symbols: Number of symbols scanned (derived from df_all if available).
        n_combos: Number of patterns tested per symbol.
        gate_desc: Human-readable gate description.
        promote_threshold: Sharpe threshold for "promoted" status.
        blocked_patterns: List of pattern names blocked by missing data.
    """
    if cycle_ts is None:
        cycle_ts = datetime.now(timezone.utc).isoformat()

    df_all = df_all if df_all is not None else df_gate

    if n_symbols is None and "symbol" in df_all.columns:
        n_symbols = df_all["symbol"].nunique()
    n_symbols = n_symbols or 0
    n_total_combos = n_symbols * n_combos

    blocked = blocked_patterns if blocked_patterns is not None else _DERIVATIVES_BLOCKED

    # Sort gate-passed by sharpe
    df_ranked = (
        df_gate.sort_values("sharpe", ascending=False).reset_index(drop=True)
        if not df_gate.empty
        else df_gate
    )

    sections = [
        _header(cycle_id, cycle_ts, n_total_combos, n_symbols, gate_desc),
        _summary_section(df_all, df_gate, promote_threshold, n_total_combos),
        _ranked_table(df_ranked),
        _by_pattern_section(df_ranked),
        _stats_section(df_ranked),
        _coverage_section(blocked),
        _next_steps_section(df_ranked, promote_threshold),
        _footer(),
    ]
    return "\n".join(sections)


def print_report(df_gate: pd.DataFrame, **kwargs) -> None:
    """Print report to stdout."""
    print(generate_report(df_gate, **kwargs))
