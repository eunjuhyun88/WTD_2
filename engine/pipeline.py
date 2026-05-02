"""Research Pipeline facade — backward-compatible entrypoint.

Prefer CoreLoopBuilder for new code.
"""
from __future__ import annotations
import argparse
import asyncio
import logging
import os
import sys
import warnings
from pathlib import Path

try:
    import env_bootstrap  # noqa: F401
except ModuleNotFoundError: pass

from pipeline_stages import (
    ResearchPipelineResult as PipelineResult,
    latest_top_patterns_path,
    run_research_pipeline,
)

log = logging.getLogger("engine.pipeline")


class ResearchPipeline:
    """Backward-compatible facade. Use CoreLoopBuilder for new code."""

    def __init__(self, store=None, out_dir=None, scan_workers: int = 4, ledger_store=None):
        warnings.warn(
            "ResearchPipeline is deprecated. Use engine.core_loop.CoreLoopBuilder.",
            DeprecationWarning, stacklevel=2,
        )
        self._store = store
        self._out_dir = Path(out_dir) if out_dir else None
        self._scan_workers = scan_workers
        self._ledger_store = ledger_store

    def run(self, symbols=None, refresh: bool = False, top_n: int = 20) -> PipelineResult:
        return run_research_pipeline(
            symbols=symbols, refresh=refresh, top_n=top_n,
            store=self._store, scan_workers=self._scan_workers,
            ledger_store=self._ledger_store, out_dir=self._out_dir,
        )

    def _verify(self, df):
        """Backward-compat: run VerifyStage logic on a DataFrame."""
        import pandas as pd
        from pipeline_stages import ScanStage, ValidateStage, VerifyStage
        from core_loop.contracts import PipelineRequest, PipelineResult as CoreResult

        if isinstance(df, pd.DataFrame) and df.empty:
            return df
        fake_scan = ScanStage()
        validate = ValidateStage(scan_stage=fake_scan)
        validate.bh_passed = df.copy() if hasattr(df, "copy") else df
        stage = VerifyStage(validate_stage=validate, ledger_store=self._ledger_store)
        req = PipelineRequest(symbols=[])
        asyncio.run(stage.run(req, CoreResult(request=req)))
        return validate.bh_passed

    def _score(self, df):
        """Backward-compat: run ScoreStage logic on a DataFrame."""
        import pandas as pd
        from pipeline_stages import ScanStage, ValidateStage, ScoreStage
        from core_loop.contracts import PipelineRequest, PipelineResult as CoreResult

        if isinstance(df, pd.DataFrame) and df.empty:
            return df
        fake_scan = ScanStage()
        validate = ValidateStage(scan_stage=fake_scan)
        validate.bh_passed = df.copy() if hasattr(df, "copy") else df
        stage = ScoreStage(validate_stage=validate)
        req = PipelineRequest(symbols=[])
        asyncio.run(stage.run(req, CoreResult(request=req)))
        return validate.bh_passed


def _parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Research pipeline: data → scan → validate → report",
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--symbols", nargs="*")
    p.add_argument("--symbols-file")
    p.add_argument("--refresh", action="store_true")
    p.add_argument("--top", type=int, default=20)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--out")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--skip-verification", action="store_true")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s  %(message)s",
                        datefmt="%H:%M:%S", stream=sys.stderr)
    if args.skip_verification:
        os.environ["PIPELINE_SKIP_VERIFICATION"] = "1"

    symbols = None
    if args.symbols_file:
        path = Path(args.symbols_file)
        if not path.exists():
            log.error("symbols-file not found: %s", path)
            return 1
        symbols = [s.strip() for s in path.read_text().splitlines() if s.strip()]
    elif args.symbols:
        symbols = args.symbols

    result = run_research_pipeline(symbols=symbols, refresh=args.refresh, top_n=args.top,
                                   scan_workers=args.workers, out_dir=Path(args.out) if args.out else None)
    return 0 if result.n_bh_passed > 0 or result.n_candidates >= 0 else 1


if __name__ == "__main__":
    sys.exit(main())
