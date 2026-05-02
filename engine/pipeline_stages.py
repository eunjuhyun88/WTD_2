"""Pipeline stage implementations — extracted from pipeline.py for core_loop.

All business logic lives here. pipeline.py is a thin facade that imports from this module.
"""
from __future__ import annotations
import asyncio
import logging
import math
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from research.validation.stats import bh_correct as _bh_correct_stats
from core_loop.contracts import PipelineRequest, PipelineResult as CorePipelineResult, StageResult

log = logging.getLogger("engine.pipeline")

_OUT_DIR = Path(__file__).parent / "experiments" / "pipeline"
_COMPRESS = "zstd"
BH_ALPHA = 0.05
BH_MIN_N = 5


# ── Domain result (research-specific, kept for backward compat) ───────────────

@dataclass
class ResearchPipelineResult:
    run_ts: str
    n_symbols: int
    n_candidates: int
    n_bh_passed: int
    top_patterns: pd.DataFrame
    rejected_patterns: pd.DataFrame
    elapsed_s: float
    cycle_id: int = 0

    def summary(self) -> str:
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


def latest_top_patterns_path() -> Path | None:
    files = list(_OUT_DIR.glob("results_*.parquet"))
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _t_to_p(t: float, n: int) -> float:
    if n < 3 or t <= 0:
        return 1.0
    try:
        from scipy import stats as scipy_stats
        return float(scipy_stats.t.sf(t, df=max(n - 1, 1)))
    except Exception:
        return 1.0 - 0.5 * (1 + math.erf(t / math.sqrt(2)))


# ── Stage implementations ─────────────────────────────────────────────────────

class DataRefreshStage:
    name = "data_refresh"

    def __init__(self, symbols: list[str] | None = None) -> None:
        self._symbols = symbols

    async def run(self, req: PipelineRequest, result: CorePipelineResult) -> StageResult:
        t0 = time.monotonic()
        syms = req.symbols or self._symbols or []
        try:
            from data_cache.backfill_async import backfill_symbols_async
            if syms:
                await backfill_symbols_async(syms, timeframe="1h", months=1)
        except Exception as exc:
            log.warning("Data refresh skipped: %s", exc)
        return StageResult(stage=self.name, ok=True, duration_s=time.monotonic() - t0)


class ScanStage:
    name = "scan"

    def __init__(self, store=None, scan_workers: int = 4) -> None:
        self._store = store
        self._scan_workers = scan_workers
        self.last_m_total: int = 0
        self.gate_passed: pd.DataFrame = pd.DataFrame()
        self.cycle_id: int = 0

    async def run(self, req: PipelineRequest, result: CorePipelineResult) -> StageResult:
        t0 = time.monotonic()
        from research.autoresearch_loop import AutoResearchLoop
        loop = AutoResearchLoop(store=self._store, scan_workers=self._scan_workers)
        cycle_result = loop.run_cycle(symbols=req.symbols or None, save=True)
        self.last_m_total = getattr(loop.scanner, "last_m_total", 0)
        self.gate_passed = cycle_result.top_patterns
        self.cycle_id = cycle_result.cycle_id
        return StageResult(
            stage=self.name, ok=True, duration_s=time.monotonic() - t0,
            meta={"n_gate_passed": cycle_result.n_gate_passed, "cycle_id": self.cycle_id},
        )


class ValidateStage:
    name = "validate"

    def __init__(self, scan_stage: ScanStage) -> None:
        self._scan = scan_stage
        self.validated: pd.DataFrame = pd.DataFrame()
        self.bh_passed: pd.DataFrame = pd.DataFrame()
        self.bh_rejected: pd.DataFrame = pd.DataFrame()

    async def run(self, req: PipelineRequest, result: CorePipelineResult) -> StageResult:
        t0 = time.monotonic()
        gate_passed = self._scan.gate_passed
        m_total = self._scan.last_m_total

        if gate_passed.empty:
            self.validated = gate_passed
            return StageResult(stage=self.name, ok=True, duration_s=time.monotonic() - t0)

        df = gate_passed.copy()

        def _t_stat(row) -> float:
            n = int(row.get("n_executed", 0))
            if n < 2:
                return 0.0
            p = float(row.get("win_rate", 0.5))
            se = math.sqrt(p * (1 - p) / n)
            return (p - 0.5) / max(se, 1e-9)

        df["t_stat"] = df.apply(_t_stat, axis=1)
        df["p_value"] = df.apply(lambda r: _t_to_p(r["t_stat"], int(r.get("n_executed", 0))), axis=1)

        eligible = df["n_executed"] >= BH_MIN_N
        p_vals = df.loc[eligible, "p_value"].tolist()
        _m = m_total if m_total >= len(p_vals) else None
        if p_vals:
            reject, corrected_p = _bh_correct_stats(p_vals, alpha=BH_ALPHA, m_total=_m)
            df.loc[eligible[eligible].index, "bh_reject"] = reject
            df.loc[eligible[eligible].index, "bh_q"] = corrected_p
        else:
            df["bh_reject"] = False
            df["bh_q"] = 1.0

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
        self.validated = df
        mask = df.get("bh_reject", pd.Series(False, index=df.index))
        self.bh_passed = df[mask].sort_values("sharpe", ascending=False).reset_index(drop=True)
        self.bh_rejected = df[~mask]
        n_passed = int(mask.sum())
        return StageResult(stage=self.name, ok=True, duration_s=time.monotonic() - t0,
                           meta={"n_bh_passed": n_passed})


class VerifyStage:
    name = "verify"

    def __init__(self, validate_stage: ValidateStage, ledger_store=None) -> None:
        self._validate = validate_stage
        self._ledger_store = ledger_store

    async def run(self, req: PipelineRequest, result: CorePipelineResult) -> StageResult:
        t0 = time.monotonic()
        if self._validate.bh_passed.empty:
            return StageResult(stage=self.name, ok=True, duration_s=time.monotonic() - t0)

        from verification.executor import run_paper_verification
        ls = self._ledger_store
        if ls is None:
            from ledger.store import LedgerRecordStore
            ls = LedgerRecordStore()

        df = self._validate.bh_passed.copy()
        cols = ["n_trades_paper", "win_rate_paper", "sharpe_paper",
                "expectancy_pct_paper", "dd_pct_paper", "pass_gate_paper"]
        for c in cols:
            df[c] = float("nan")
        df["pass_gate_paper"] = False

        for idx, row in df.iterrows():
            slug = str(row.get("pattern", ""))
            if not slug:
                continue
            try:
                vr = run_paper_verification(slug, ls)
                df.at[idx, "n_trades_paper"] = vr.n_trades
                df.at[idx, "win_rate_paper"] = vr.win_rate
                df.at[idx, "sharpe_paper"] = vr.sharpe
                df.at[idx, "expectancy_pct_paper"] = vr.expectancy_pct
                df.at[idx, "dd_pct_paper"] = vr.max_drawdown_pct
                df.at[idx, "pass_gate_paper"] = vr.pass_gate
            except Exception as exc:
                log.warning("Verify failed for %s: %s", slug, exc)

        self._validate.bh_passed = df
        return StageResult(stage=self.name, ok=True, duration_s=time.monotonic() - t0)


class ScoreStage:
    name = "score"

    def __init__(self, validate_stage: ValidateStage) -> None:
        self._validate = validate_stage

    async def run(self, req: PipelineRequest, result: CorePipelineResult) -> StageResult:
        t0 = time.monotonic()
        if self._validate.bh_passed.empty:
            return StageResult(stage=self.name, ok=True, duration_s=time.monotonic() - t0)

        from verification.composite_score import compute_composite_score
        from verification.types import PaperVerificationResult

        df = self._validate.bh_passed.copy()
        df["composite_score"] = float("nan")
        df["quality_grade"] = None

        for idx, row in df.iterrows():
            n_trades = row.get("n_trades_paper", float("nan"))
            if not isinstance(n_trades, (int, float)) or n_trades != n_trades:
                continue
            n_trades_int = int(n_trades)
            if n_trades_int < 10:
                continue
            try:
                win_rate = float(row.get("win_rate_paper", 0))
                n_hit = int(round(n_trades_int * win_rate))
                pvr = PaperVerificationResult(
                    pattern_slug=str(row.get("pattern", "")),
                    n_trades=n_trades_int, n_hit=n_hit,
                    n_miss=n_trades_int - n_hit, n_expired=0,
                    win_rate=win_rate,
                    avg_return_pct=float(row.get("expectancy_pct_paper", 0)),
                    sharpe=float(row.get("sharpe_paper", float("nan"))),
                    max_drawdown_pct=float(row.get("dd_pct_paper", 0)),
                    expectancy_pct=float(row.get("expectancy_pct_paper", 0)),
                    avg_duration_hours=4.0,
                    pass_gate=bool(row.get("pass_gate_paper", False)),
                )
                cs = compute_composite_score(pvr)
                df.at[idx, "composite_score"] = cs.composite
                df.at[idx, "quality_grade"] = cs.quality_grade
            except Exception as exc:
                log.warning("Score failed for %s: %s", row.get("pattern"), exc)

        self._validate.bh_passed = df
        return StageResult(stage=self.name, ok=True, duration_s=time.monotonic() - t0)


class SaveStage:
    name = "save"

    def __init__(self, validate_stage: ValidateStage, out_dir: Path | None = None) -> None:
        self._validate = validate_stage
        self._out_dir = out_dir or _OUT_DIR

    async def run(self, req: PipelineRequest, result: CorePipelineResult) -> StageResult:
        t0 = time.monotonic()
        df = self._validate.validated
        if df.empty:
            return StageResult(stage=self.name, ok=True, duration_s=time.monotonic() - t0)
        run_ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        self._out_dir.mkdir(parents=True, exist_ok=True)
        out_path = self._out_dir / f"results_{run_ts}.parquet"
        df.to_parquet(out_path, compression=_COMPRESS, index=False)
        result.out_path = str(out_path)
        return StageResult(stage=self.name, ok=True, duration_s=time.monotonic() - t0,
                           meta={"out_path": str(out_path)})


class ReportStage:
    name = "report"

    def __init__(self, scan_stage: ScanStage, validate_stage: ValidateStage) -> None:
        self._scan = scan_stage
        self._validate = validate_stage

    async def run(self, req: PipelineRequest, result: CorePipelineResult) -> StageResult:
        t0 = time.monotonic()
        try:
            from research.report import generate_report
            from research.pattern_scan.pattern_object_combos import LIBRARY_COMBOS
            report_str = generate_report(
                df_gate=self._validate.bh_passed,
                df_all=self._validate.validated,
                cycle_id=self._scan.cycle_id,
                cycle_ts=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                n_symbols=len(req.symbols),
                n_combos=len(LIBRARY_COMBOS),
                gate_desc=f"BH-FDR α={BH_ALPHA}",
                promote_threshold=0.6,
            )
            print(report_str)
        except Exception as exc:
            log.warning("Report failed (%s) — skipping", exc)
        return StageResult(stage=self.name, ok=True, duration_s=time.monotonic() - t0)


# ── Factory ───────────────────────────────────────────────────────────────────

def build_default_stages(
    store=None,
    scan_workers: int = 4,
    ledger_store=None,
    out_dir: Path | None = None,
    data_port=None,
    signal_port=None,
    outcome_port=None,
    ledger_port=None,
) -> list:
    scan = ScanStage(store=store, scan_workers=scan_workers)
    validate = ValidateStage(scan_stage=scan)
    skip_verify = os.environ.get("PIPELINE_SKIP_VERIFICATION", "").lower() in ("1", "true", "yes")
    stages: list = [scan, validate]
    if not skip_verify:
        stages += [VerifyStage(validate_stage=validate, ledger_store=ledger_store),
                   ScoreStage(validate_stage=validate)]
    stages += [SaveStage(validate_stage=validate, out_dir=out_dir), ReportStage(scan, validate)]
    return stages


def run_research_pipeline(
    symbols: list[str] | None = None,
    refresh: bool = False,
    top_n: int = 20,
    store=None,
    scan_workers: int = 4,
    ledger_store=None,
    out_dir: Path | None = None,
) -> ResearchPipelineResult:
    """Run the full research pipeline, return domain-specific result."""
    import asyncio as _asyncio
    from core_loop.contracts import PipelineRequest
    from core_loop.spine import CoreLoop

    req = PipelineRequest(symbols=symbols or [], refresh_data=refresh, top_n=top_n)
    t0 = time.monotonic()
    run_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    stages = []
    if refresh:
        stages.append(DataRefreshStage(symbols=symbols))
    scan = ScanStage(store=store, scan_workers=scan_workers)
    validate = ValidateStage(scan_stage=scan)
    skip_verify = os.environ.get("PIPELINE_SKIP_VERIFICATION", "").lower() in ("1", "true", "yes")
    stages += [scan, validate]
    if not skip_verify:
        stages += [VerifyStage(validate_stage=validate, ledger_store=ledger_store),
                   ScoreStage(validate_stage=validate)]
    stages += [SaveStage(validate_stage=validate, out_dir=out_dir or _OUT_DIR),
               ReportStage(scan, validate)]

    loop = CoreLoop(stages=stages)
    _asyncio.run(loop.run(req))

    bh_passed = validate.bh_passed.head(top_n) if not validate.bh_passed.empty else pd.DataFrame()
    return ResearchPipelineResult(
        run_ts=run_ts,
        n_symbols=len(symbols) if symbols else 0,
        n_candidates=len(scan.gate_passed),
        n_bh_passed=len(validate.bh_passed),
        top_patterns=bh_passed,
        rejected_patterns=validate.bh_rejected,
        elapsed_s=time.monotonic() - t0,
        cycle_id=scan.cycle_id,
    )
