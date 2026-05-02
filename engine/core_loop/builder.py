from __future__ import annotations
import asyncio
from core_loop.contracts import PipelineRequest, PipelineResult
from core_loop.ports import DataPort, SignalStorePort, OutcomeStorePort, LedgerPort
from core_loop.spine import CoreLoop, Stage


class CoreLoopBuilder:
    """Fluent builder for CoreLoop. Prefer this over ResearchPipeline for new code."""

    def __init__(self) -> None:
        self._stages: list[Stage] = []
        self._data_port: DataPort | None = None
        self._signal_port: SignalStorePort | None = None
        self._outcome_port: OutcomeStorePort | None = None
        self._ledger_port: LedgerPort | None = None

    def with_data(self, port: DataPort) -> "CoreLoopBuilder":
        self._data_port = port
        return self

    def with_signal_store(self, port: SignalStorePort) -> "CoreLoopBuilder":
        self._signal_port = port
        return self

    def with_outcome_store(self, port: OutcomeStorePort) -> "CoreLoopBuilder":
        self._outcome_port = port
        return self

    def with_ledger(self, port: LedgerPort) -> "CoreLoopBuilder":
        self._ledger_port = port
        return self

    def with_stage(self, stage: Stage) -> "CoreLoopBuilder":
        self._stages.append(stage)
        return self

    def build(self) -> CoreLoop:
        from pipeline_stages import build_default_stages
        stages = self._stages or build_default_stages(
            data_port=self._data_port,
            signal_port=self._signal_port,
            outcome_port=self._outcome_port,
            ledger_port=self._ledger_port,
        )
        return CoreLoop(stages=stages)

    def run(self, request: PipelineRequest) -> PipelineResult:
        return asyncio.run(self.build().run(request))
