from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class PipelineRequest:
    symbols: list[str]
    refresh_data: bool = False
    top_n: int = 20
    out_dir: str | None = None
    run_id: str = field(default_factory=lambda: datetime.utcnow().strftime("%Y%m%d_%H%M%S"))


@dataclass
class StageResult:
    stage: str
    ok: bool
    duration_s: float
    meta: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


@dataclass
class PipelineResult:
    request: PipelineRequest
    stages: list[StageResult] = field(default_factory=list)
    ok: bool = True
    total_duration_s: float = 0.0
    out_path: str | None = None

    def failed_stages(self) -> list[StageResult]:
        return [s for s in self.stages if not s.ok]
