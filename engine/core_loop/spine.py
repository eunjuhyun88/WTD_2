from __future__ import annotations
import logging
import time
from typing import Protocol, runtime_checkable

from core_loop.contracts import PipelineRequest, PipelineResult, StageResult

log = logging.getLogger("engine.core_loop.spine")


@runtime_checkable
class Stage(Protocol):
    name: str
    async def run(self, req: PipelineRequest, result: PipelineResult) -> StageResult: ...


class CoreLoop:
    """Ordered sequence of stages. Stops on first failure."""

    def __init__(self, stages: list[Stage]) -> None:
        self._stages = stages

    async def run(self, req: PipelineRequest) -> PipelineResult:
        result = PipelineResult(request=req)
        t0 = time.monotonic()
        for stage in self._stages:
            t_stage = time.monotonic()
            try:
                sr = await stage.run(req, result)
            except Exception as exc:
                sr = StageResult(
                    stage=stage.name, ok=False,
                    duration_s=time.monotonic() - t_stage,
                    error=str(exc),
                )
                log.error("Stage %s failed: %s", stage.name, exc)
            result.stages.append(sr)
            if not sr.ok:
                result.ok = False
                break
        result.total_duration_s = time.monotonic() - t0
        return result
