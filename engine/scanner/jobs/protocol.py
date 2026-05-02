from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable, Any


@dataclass
class JobContext:
    dry_run: bool = False
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class JobResult:
    name: str
    ok: bool
    processed: int = 0
    error: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class Job(Protocol):
    name: str
    schedule: str  # cron 표현식 예: "*/5 * * * *"

    async def run(self, ctx: JobContext) -> JobResult: ...
