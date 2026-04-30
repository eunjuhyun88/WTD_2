"""Research Pipeline — end-to-end from data → scan → validate → report.

Stages:
  1. DATA     — Refresh Parquet store if stale (--refresh flag)
  2. SCAN     — AutoResearchLoop pattern scan over universe
  3. VALIDATE — BH-FDR multiple-testing correction on candidate p-values
  4. SAVE     — Persist results to experiments/pipeline_results.parquet
  5. REPORT   — Terminal summary

Usage:
    uv run python -m engine.pipeline
    uv run python -m engine.pipeline --symbols BTCUSDT ETHUSDT SOLUSDT
    uv run python -m engine.pipeline --refresh --top 20
    uv run python -m engine.pipeline --symbols-file symbols.txt --out out/
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import math
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from research.validation.stats import bh_correct as _bh_correct_stats

try:
    import env_bootstrap  # noqa: F401
except ModuleNotFoundError:
    pass

log = logging.getLogger("engine.pipeline")

_OUT_DIR = Path(__file__).parent / "experiments" / "pipeline"
_COMPRESS = "zstd"

# BH-FDR threshold
BH_ALPHA = 0.05
# Minimum signals to include in BH family
BH_MIN_N = 5


# ── BH-FDR ────────────────────────────────────────────────────────────────────

def _t_to_p(t: float, n: int) -> float:
    """One-tailed p-value from t-statistic (win_rate vs 0.50 baseline)."""
    if n < 3 or t <= 0:
        return 1.0
    try:
        from scipy import stats as scipy_stats
        return float(scipy_stats.t.sf(t, df=max(n - 1, 1)))
    except Exception:
        # Fallback: normal approximation
        import math
        return 1.0 - 0.5 * (1 + math.erf(t / math.sqrt(2)))



# ── Data refresh ──────────────────────────────────────────────────────────────

async def _refresh_data(symbols: list[str] | None) -> None:
    """Trigger incremental data refresh via pipeline_1000 steps."""
    log.info("Stage 1: DATA REFRESH")
    try:
        from data_cache.backfill_async import backfill_symbols_async
        syms = symbols or []
        if syms:
            log.info("  Refreshing %d symbols ...", len(syms))
            await backfill_symbols_async(syms, timeframe="1h", months=1)
        else:
            log.info("  No symbol list — skipping incremental refresh (run pipeline_1000 for full refresh)")
    except Exception as exc:
        log.warning("  Data refresh skipped: %s", exc)


# ── Pipeline ──────────────────────────────────────────────────────────────────

@dataclass
class PipelineResult:
    run_ts: str
    n_symbols: int
    n_candidates: int         # gate-passed before BH
    n_bh_passed: int          # after BH-FDR
    top_patterns: pd.DataFrame
    rejected_patterns: pd.DataFrame
    elapsed_s: float
    cycle_id: int = 0

    def summary(self) -> str:
        """Fallback summary (use generate_report for full output)."""
        lines = [
            "",
            "=" * 60,
            f"  RESEARCH PIPELINE  [{self.run_ts}]",
            "=" * 60,
            f"  Symbols scanned    : {self.n_symbols}",
            f"  Gate-passed        : {self.n_candidates}",
            f"  BH-FDR passed      : {self.n_bh_passed}  (α={BH_ALPHA})",
            f"  Elapsed            : {self.elapsed_s:.1f}s",
            "",
        ]
        if not self.top_patterns.empty:
            cols = ["symbol", "pattern", "direction", "n_executed",
                    "win_rate", "sharpe", "t_stat", "bh_q", "confidence_tier"]
            show = [c for c in cols if c in self.top_patterns.columns]
            lines.append("  TOP PATTERNS (BH-passed):")
            lines.append(self.top_patterns[show].head(20).to_string(index=False))
        else:
            lines.append("  No patterns passed BH-FDR gate.")
        lines.append("=" * 60)
        return "\n".join(lines)


class ResearchPipeline:
    def __init__(
        self,
        store=None,
        out_dir: Path | None = None,
        scan_workers: int = 4,
        ledger_store=None,
    ):
        self.out_dir = Path(out_dir) if out_dir else _OUT_DIR
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.scan_workers = scan_workers
        self._last_m_total: int = 0
        self._store = store
        self._ledger_store = ledger_store

    @property
    def store(self):
        if self._store is None:
            from data_cache.parquet_store import ParquetStore
            self._store = ParquetStore()
        return self._store

    @property
    def ledger_store(self):
        if self._ledger_store is None:
            from ledger.store import LedgerRecordStore
            self._ledger_store = LedgerRecordStore()
        return self._ledger_store

    # ── Stage 2: Scan ─────────────────────────────────────────────────────────

    def _run_scan(self, symbols: list[str] | None) -> tuple[pd.DataFrame, int]:
        from research.autoresearch_loop import AutoResearchLoop
        log.info("Stage 2: PATTERN SCAN")
        loop = AutoResearchLoop(store=self.store, scan_workers=self.scan_workers)
        result = loop.run_cycle(symbols=symbols, save=True)
        # Capture m_total from scanner for BH family (W-0341)
        self._last_m_total = getattr(loop.scanner, "last_m_total", 0)
        log.info(
            "  Scanned %d symbols, %d patterns total, %d gate-passed (m_total=%d)",
            result.n_symbols_scanned,
            result.n_patterns_total,
            result.n_gate_passed,
            self._last_m_total,
        )
        return result.top_patterns, result.cycle_id

    # ── Stage 3: BH-FDR validate ──────────────────────────────────────────────

    def _validate(self, gate_passed: pd.DataFrame) -> pd.DataFrame:
        log.info("Stage 3: BH-FDR VALIDATION (%d candidates)", len(gate_passed))
        if gate_passed.empty:
            return gate_passed

        df = gate_passed.copy()

        # Compute t-stat and p-value per row
        def _t_stat(row) -> float:
            n = int(row.get("n_executed", 0))
            if n < 2:
                return 0.0
            p = float(row.get("win_rate", 0.5))
            se = math.sqrt(p * (1 - p) / n)
            return (p - 0.5) / max(se, 1e-9)

        df["t_stat"] = df.apply(_t_stat, axis=1)
        df["p_value"] = df.apply(
            lambda r: _t_to_p(r["t_stat"], int(r.get("n_executed", 0))), axis=1
        )

        # BH-FDR correction
        eligible = df["n_executed"] >= BH_MIN_N
        p_vals = df.loc[eligible, "p_value"].tolist()
        m_total = self._last_m_total if self._last_m_total >= len(p_vals) else None
        if m_total:
            log.info("  BH-FDR: using m_total=%d (full search space)", m_total)
        if m_total is not None:
            assert m_total >= len(p_vals), (
                f"m_total={m_total} must be >= eligible count={len(p_vals)}"
            )
        if p_vals:
            reject, corrected_p = _bh_correct_stats(p_vals, alpha=BH_ALPHA, m_total=m_total)
            df.loc[eligible[eligible].index, "bh_reject"] = reject
            df.loc[eligible[eligible].index, "bh_q"] = corrected_p
        else:
            df["bh_reject"] = False
            df["bh_q"] = 1.0

        n_passed = df["bh_reject"].sum()
        log.info("  BH-FDR: %d / %d passed (α=%.2f)", n_passed, len(df), BH_ALPHA)

        # confidence_tier assignment
        def _tier(row) -> str:
            n = int(row.get("n_executed", 0))
            bh = bool(row.get("bh_reject", False))
            if bh and n >= 30:
                return "high"
            if bh and n >= 10:
                return "medium"
            if bh:
                return "low"
            return "unaudited"

        df["confidence_tier"] = df.apply(_tier, axis=1)
        return df

    # ── Stage 6: Paper verification ───────────────────────────────────────────

    def _verify(self, df: pd.DataFrame) -> pd.DataFrame:
        """Stage 6: paper-trade verification via ledger outcomes."""
        if df.empty:
            return df
        log.info("Stage 6: PAPER VERIFICATION (%d patterns)", len(df))
        from verification.executor import run_paper_verification

        result_df = df.copy()
        cols = ["n_trades_paper", "win_rate_paper", "sharpe_paper",
                "expectancy_pct_paper", "dd_pct_paper", "pass_gate_paper"]
        for c in cols:
            result_df[c] = float("nan")
        result_df["pass_gate_paper"] = False

        for idx, row in result_df.iterrows():
            slug = str(row.get("pattern", ""))
            if not slug:
                continue
            try:
                vr = run_paper_verification(slug, self.ledger_store)
                result_df.at[idx, "n_trades_paper"] = vr.n_trades
                result_df.at[idx, "win_rate_paper"] = vr.win_rate
                result_df.at[idx, "sharpe_paper"] = vr.sharpe
                result_df.at[idx, "expectancy_pct_paper"] = vr.expectancy_pct
                result_df.at[idx, "dd_pct_paper"] = vr.max_drawdown_pct
                result_df.at[idx, "pass_gate_paper"] = vr.pass_gate
            except Exception as exc:
                log.warning("Stage 6: verification failed for %s (%s) — skipping", slug, exc)

        n_verified = int((result_df["n_trades_paper"] > 0).sum())
        log.info("  Verified %d / %d patterns with ledger data", n_verified, len(df))
        return result_df

    # ── Stage 7: Composite scoring ────────────────────────────────────────────

    def _score(self, df: pd.DataFrame) -> pd.DataFrame:
        """Stage 7: composite score (0–100) + quality grade (S/A/B/C)."""
        if df.empty:
            return df
        log.info("Stage 7: COMPOSITE SCORING (%d patterns)", len(df))
        from verification.composite_score import compute_composite_score
        from verification.types import PaperVerificationResult

        result_df = df.copy()
        result_df["composite_score"] = float("nan")
        result_df["quality_grade"] = None

        for idx, row in result_df.iterrows():
            n_trades = row.get("n_trades_paper", float("nan"))
            if not isinstance(n_trades, (int, float)) or n_trades != n_trades:  # nan check
                continue
            n_trades_int = int(n_trades)
            if n_trades_int < 10:
                continue  # leave NaN — not enough data
            try:
                win_rate = float(row.get("win_rate_paper", 0))
                n_hit = int(round(n_trades_int * win_rate))
                pvr = PaperVerificationResult(
                    pattern_slug=str(row.get("pattern", "")),
                    n_trades=n_trades_int,
                    n_hit=n_hit,
                    n_miss=n_trades_int - n_hit,
                    n_expired=0,
                    win_rate=win_rate,
                    avg_return_pct=float(row.get("expectancy_pct_paper", 0)),
                    sharpe=float(row.get("sharpe_paper", float("nan"))),
                    max_drawdown_pct=float(row.get("dd_pct_paper", 0)),
                    expectancy_pct=float(row.get("expectancy_pct_paper", 0)),
                    avg_duration_hours=4.0,
                    pass_gate=bool(row.get("pass_gate_paper", False)),
                )
                cs = compute_composite_score(pvr)
                result_df.at[idx, "composite_score"] = cs.composite
                result_df.at[idx, "quality_grade"] = cs.quality_grade
            except Exception as exc:
                log.warning("Stage 7: scoring failed for %s (%s)", row.get("pattern"), exc)

        n_scored = int(result_df["composite_score"].notna().sum())
        log.info("  Scored %d / %d patterns", n_scored, len(df))
        return result_df

    # ── Stage 4: Save ─────────────────────────────────────────────────────────

    def _save(self, df: pd.DataFrame, run_ts: str) -> Path:
        out_path = self.out_dir / f"results_{run_ts[:10]}.parquet"
        df.to_parquet(out_path, compression=_COMPRESS, index=False)
        log.info("Stage 4: SAVED → %s", out_path)
        return out_path

    # ── Main run ──────────────────────────────────────────────────────────────

    def run(
        self,
        symbols: list[str] | None = None,
        refresh: bool = False,
        top_n: int = 20,
    ) -> PipelineResult:
        t0 = time.monotonic()
        run_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        log.info("=== Research Pipeline starting [%s] ===", run_ts)

        # Stage 1: optional data refresh
        if refresh:
            asyncio.run(_refresh_data(symbols))

        # Stage 2: scan
        gate_passed, cycle_id = self._run_scan(symbols)

        # Stage 3: BH-FDR
        validated = self._validate(gate_passed)

        bh_passed = validated[validated.get("bh_reject", pd.Series(False, index=validated.index))].copy() if not validated.empty else pd.DataFrame()
        bh_rejected = validated[~validated.get("bh_reject", pd.Series(False, index=validated.index))].copy() if not validated.empty else pd.DataFrame()

        if not bh_passed.empty:
            bh_passed = bh_passed.sort_values("sharpe", ascending=False).reset_index(drop=True)

        # Stage 6+7: verification + composite scoring
        skip_verification = (
            os.environ.get("PIPELINE_SKIP_VERIFICATION", "").lower() in ("1", "true", "yes")
        )
        if not bh_passed.empty and not skip_verification:
            bh_passed = self._verify(bh_passed)
            bh_passed = self._score(bh_passed)

        # Stage 4: save
        if not validated.empty:
            self._save(validated, run_ts)

        elapsed = time.monotonic() - t0
        n_symbols = len(symbols) if symbols else 0

        result = PipelineResult(
            run_ts=run_ts,
            n_symbols=n_symbols,
            n_candidates=len(gate_passed),
            n_bh_passed=len(bh_passed),
            top_patterns=bh_passed.head(top_n) if not bh_passed.empty else pd.DataFrame(),
            rejected_patterns=bh_rejected,
            elapsed_s=elapsed,
            cycle_id=cycle_id,
        )

        log.info("Stage 5: REPORT")
        try:
            from research.report import generate_report
            from research.pattern_scan.pattern_object_combos import LIBRARY_COMBOS
            report_str = generate_report(
                df_gate=result.top_patterns if not result.top_patterns.empty else pd.DataFrame(),
                df_all=validated if not validated.empty else pd.DataFrame(),
                cycle_id=result.cycle_id,
                cycle_ts=result.run_ts,
                n_symbols=result.n_symbols,
                n_combos=len(LIBRARY_COMBOS),
                gate_desc=f"BH-FDR α={BH_ALPHA}",
                promote_threshold=0.6,
            )
            print(report_str)
        except Exception as exc:
            log.warning("Report generation failed (%s) — using summary fallback", exc)
            print(result.summary())

        return result


# ── CLI ───────────────────────────────────────────────────────────────────────

def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Research pipeline: data → scan → validate → report",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--symbols", nargs="*", help="Symbols to scan (default: all in Parquet store)")
    p.add_argument("--symbols-file", help="File with one symbol per line")
    p.add_argument("--refresh", action="store_true", help="Refresh data before scanning")
    p.add_argument("--top", type=int, default=20, help="Max patterns to show (default: 20)")
    p.add_argument("--workers", type=int, default=4, help="Parallel scan workers")
    p.add_argument("--out", help="Output directory (default: experiments/pipeline/)")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--skip-verification", action="store_true",
                   help="Skip paper verification and composite scoring (Stage 6+7)")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s  %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stderr,
    )

    if args.skip_verification:
        os.environ["PIPELINE_SKIP_VERIFICATION"] = "1"

    symbols: list[str] | None = None
    if args.symbols_file:
        path = Path(args.symbols_file)
        if not path.exists():
            log.error("symbols-file not found: %s", path)
            return 1
        symbols = [s.strip() for s in path.read_text().splitlines() if s.strip()]
    elif args.symbols:
        symbols = args.symbols

    pipeline = ResearchPipeline(
        out_dir=args.out,
        scan_workers=args.workers,
    )

    result = pipeline.run(
        symbols=symbols,
        refresh=args.refresh,
        top_n=args.top,
    )

    return 0 if result.n_bh_passed > 0 or result.n_candidates >= 0 else 1


if __name__ == "__main__":
    sys.exit(main())
