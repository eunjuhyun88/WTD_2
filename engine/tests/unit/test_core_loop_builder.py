"""CoreLoopBuilder unit tests — 12 cases (W-0386-D)."""
import asyncio
import pytest
from pathlib import Path

from core_loop.builder import CoreLoopBuilder
from core_loop.contracts import PipelineRequest, PipelineResult, StageResult
from core_loop.ports import DataPort, SignalStorePort, OutcomeStorePort, LedgerPort
from core_loop.spine import CoreLoop


# ── Fake port implementations ──────────────────────────────────────────────────

class FakeDataPort:
    async def refresh(self, symbols: list[str]) -> None:
        pass


class FakeSignalPort:
    def upsert_events(self, events: list[dict]) -> None:
        pass

    def resolve_outcome(self, signal_id: str, pnl_bps: float) -> None:
        pass


class FakeOutcomePort:
    def write_outcomes(self, outcomes: list[dict]) -> None:
        pass


class FakeLedgerPort:
    def append(self, records: list[dict]) -> None:
        pass

    def latest_path(self) -> Path | None:
        return None


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_builder_default_build():
    loop = CoreLoopBuilder().build()
    assert loop is not None


def test_builder_with_ports():
    loop = (CoreLoopBuilder()
            .with_data(FakeDataPort())
            .with_signal_store(FakeSignalPort())
            .with_outcome_store(FakeOutcomePort())
            .with_ledger(FakeLedgerPort())
            .build())
    assert loop is not None


def test_builder_fluent_returns_self():
    b = CoreLoopBuilder()
    assert b.with_data(FakeDataPort()) is b
    assert b.with_signal_store(FakeSignalPort()) is b
    assert b.with_outcome_store(FakeOutcomePort()) is b
    assert b.with_ledger(FakeLedgerPort()) is b


def test_pipeline_request_defaults():
    req = PipelineRequest(symbols=["BTCUSDT"])
    assert req.refresh_data is False
    assert req.top_n == 20
    assert req.run_id is not None


def test_pipeline_result_ok_default():
    req = PipelineRequest(symbols=[])
    result = PipelineResult(request=req)
    assert result.ok is True
    assert result.failed_stages() == []


def test_stage_result_error():
    sr = StageResult(stage="test", ok=False, duration_s=0.1, error="boom")
    assert not sr.ok
    assert sr.error == "boom"


def test_port_protocols():
    assert isinstance(FakeDataPort(), DataPort)
    assert isinstance(FakeSignalPort(), SignalStorePort)
    assert isinstance(FakeOutcomePort(), OutcomeStorePort)
    assert isinstance(FakeLedgerPort(), LedgerPort)


def test_core_loop_single_stage():
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
    class FailStage:
        name = "fail"

        async def run(self, req, result):
            return StageResult(stage="fail", ok=False, duration_s=0.0, error="err")

    class ShouldNotRun:
        name = "skip"

        async def run(self, req, result):
            raise AssertionError("Should not run after failure")

    loop = CoreLoop(stages=[FailStage(), ShouldNotRun()])
    result = asyncio.run(loop.run(PipelineRequest(symbols=[])))
    assert not result.ok
    assert len(result.stages) == 1


def test_builder_custom_stage():
    class NopStage:
        name = "nop"

        async def run(self, req, result):
            return StageResult(stage="nop", ok=True, duration_s=0.0)

    result = (CoreLoopBuilder()
              .with_stage(NopStage())
              .run(PipelineRequest(symbols=[])))
    assert result.ok


def test_job_protocol():
    from scanner.jobs.protocol import Job, JobContext, JobResult

    class FakeJob:
        name = "fake"
        schedule = "*/5 * * * *"

        async def run(self, ctx: JobContext) -> JobResult:
            return JobResult(name=self.name, ok=True)

    assert isinstance(FakeJob(), Job)


def test_job_registry_add_get():
    from scanner.jobs import registry
    from scanner.jobs.protocol import JobContext, JobResult

    class RegJob:
        name = "reg_test_job"
        schedule = "0 * * * *"

        async def run(self, ctx: JobContext) -> JobResult:
            return JobResult(name=self.name, ok=True)

    registry.register(RegJob())
    assert registry.get("reg_test_job") is not None
