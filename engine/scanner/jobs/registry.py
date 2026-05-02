from __future__ import annotations
from scanner.jobs.protocol import Job
import logging

log = logging.getLogger("engine.scanner.jobs.registry")

_REGISTRY: dict[str, Job] = {}


def register(job: Job) -> None:
    _REGISTRY[job.name] = job
    log.debug("Registered job: %s (schedule=%s)", job.name, job.schedule)


def get_all() -> list[Job]:
    return list(_REGISTRY.values())


def get(name: str) -> Job | None:
    return _REGISTRY.get(name)
