"""Backward-compatibility tests for W-0386-B pipeline facade."""
from __future__ import annotations
import subprocess
import sys
import warnings
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent


def test_core_loop_importable():
    """engine/core_loop package imports cleanly."""
    import core_loop
    from core_loop import CoreLoop, CoreLoopBuilder, PipelineRequest, PipelineResult
    from core_loop import Stage, StageResult, DataPort, SignalStorePort


def test_pipeline_result_importable():
    """PipelineResult (domain-specific) importable from pipeline."""
    from pipeline import PipelineResult
    assert PipelineResult is not None


def test_latest_top_patterns_path_importable():
    """latest_top_patterns_path importable from pipeline (backward compat)."""
    from pipeline import latest_top_patterns_path
    result = latest_top_patterns_path()
    assert result is None or isinstance(result, Path)


def test_research_pipeline_deprecation_warning():
    """ResearchPipeline emits DeprecationWarning."""
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        from pipeline import ResearchPipeline
        ResearchPipeline()
    dep_warnings = [x for x in w if issubclass(x.category, DeprecationWarning)]
    assert len(dep_warnings) >= 1, "Expected DeprecationWarning from ResearchPipeline()"
    assert "CoreLoopBuilder" in str(dep_warnings[0].message)


def test_pipeline_cli_help():
    """python -m pipeline --help exits 0 (run from engine/ dir)."""
    import os
    env = {**os.environ, "PYTHONPATH": f"{ROOT}:{ROOT.parent}"}
    r = subprocess.run(
        [sys.executable, "-m", "pipeline", "--help"],
        capture_output=True, cwd=ROOT, env=env,
    )
    assert r.returncode == 0, r.stderr.decode()
    assert b"scan" in r.stdout.lower() or b"pipeline" in r.stdout.lower()


def test_core_loop_contracts():
    """PipelineRequest / StageResult / PipelineResult dataclass defaults."""
    from core_loop.contracts import PipelineRequest, StageResult, PipelineResult

    req = PipelineRequest(symbols=["BTCUSDT"])
    assert req.refresh_data is False
    assert req.top_n == 20
    assert req.run_id is not None

    sr = StageResult(stage="test", ok=True, duration_s=0.1)
    assert sr.error is None

    result = PipelineResult(request=req)
    assert result.ok is True
    assert result.failed_stages() == []


def test_core_loop_ports_protocol():
    """Port Protocol checks via runtime_checkable."""
    from core_loop.ports import DataPort, SignalStorePort, OutcomeStorePort, LedgerPort

    class FakeDataPort:
        async def refresh(self, symbols): pass

    class FakeSignalPort:
        def upsert_events(self, events): pass
        def resolve_outcome(self, sid, pnl): pass

    class FakeOutcomePort:
        def write_outcomes(self, outcomes): pass

    class FakeLedgerPort:
        def append(self, records): pass
        def latest_path(self): return None

    assert isinstance(FakeDataPort(), DataPort)
    assert isinstance(FakeSignalPort(), SignalStorePort)
    assert isinstance(FakeOutcomePort(), OutcomeStorePort)
    assert isinstance(FakeLedgerPort(), LedgerPort)


def test_core_loop_single_stage():
    """CoreLoop executes a single stage and returns result."""
    import asyncio
    from core_loop.contracts import PipelineRequest, StageResult, PipelineResult
    from core_loop.spine import CoreLoop

    class OkStage:
        name = "ok"
        async def run(self, req, result):
            return StageResult(stage="ok", ok=True, duration_s=0.0)

    loop = CoreLoop(stages=[OkStage()])
    req = PipelineRequest(symbols=["BTCUSDT"])
    result = asyncio.run(loop.run(req))
    assert result.ok
    assert len(result.stages) == 1


def test_core_loop_stops_on_failure():
    """CoreLoop stops after first failing stage."""
    import asyncio
    from core_loop.contracts import PipelineRequest, StageResult
    from core_loop.spine import CoreLoop

    class FailStage:
        name = "fail"
        async def run(self, req, result):
            return StageResult(stage="fail", ok=False, duration_s=0.0, error="boom")

    class ShouldNotRun:
        name = "skip"
        async def run(self, req, result):
            raise AssertionError("Should not run after failure")

    loop = CoreLoop(stages=[FailStage(), ShouldNotRun()])
    result = asyncio.run(loop.run(PipelineRequest(symbols=[])))
    assert not result.ok
    assert len(result.stages) == 1
    assert result.stages[0].error == "boom"


def test_builder_fluent_api():
    """CoreLoopBuilder is fluent — returns self on each with_*."""
    from core_loop.builder import CoreLoopBuilder
    from core_loop.ports import DataPort, SignalStorePort

    class FDP:
        async def refresh(self, s): pass
    class FSP:
        def upsert_events(self, e): pass
        def resolve_outcome(self, sid, pnl): pass

    b = CoreLoopBuilder()
    assert b.with_data(FDP()) is b
    assert b.with_signal_store(FSP()) is b


def test_builder_with_custom_stage():
    """CoreLoopBuilder.with_stage + run executes cleanly."""
    import asyncio
    from core_loop.builder import CoreLoopBuilder
    from core_loop.contracts import PipelineRequest, StageResult

    class NopStage:
        name = "nop"
        async def run(self, req, result):
            return StageResult(stage="nop", ok=True, duration_s=0.0)

    result = CoreLoopBuilder().with_stage(NopStage()).run(PipelineRequest(symbols=[]))
    assert result.ok


def test_pipeline_stages_module_importable():
    """pipeline_stages.py imports cleanly."""
    from pipeline_stages import (
        ResearchPipelineResult, build_default_stages,
        run_research_pipeline, latest_top_patterns_path,
        BH_ALPHA, BH_MIN_N,
    )
    assert BH_ALPHA == 0.05
    assert BH_MIN_N == 5


def test_import_linter_active_contract():
    """import-linter passes (scheduler-no-research-core)."""
    r = subprocess.run(
        ["uv", "run", "lint-imports", "--config", ".importlinter"],
        capture_output=True, text=True, cwd=ROOT,
        env={**__import__("os").environ, "PYTHONPATH": str(ROOT)},
    )
    assert "0 broken" in r.stdout, f"import-linter violations:\n{r.stdout}"
