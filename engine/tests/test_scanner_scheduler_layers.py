from __future__ import annotations

import asyncio
import inspect

import scanner.scheduler as scheduler
from scanner.jobs.auto_evaluate import auto_evaluate_job
from scanner.jobs.pattern_scan import pattern_scan_job
from scanner.jobs.universe_scan import scan_universe_job


def test_scheduler_module_does_not_contain_universe_scan_loop() -> None:
    source = inspect.getsource(scheduler)
    # Stage 2B boundary: heavy job internals live in scanner.jobs.* modules.
    assert "for symbol in universe" not in source
    assert "load_klines(symbol" not in source
    assert "compute_features_table(" not in source
    assert "evaluate_blocks(" not in source


def test_scheduler_internal_wrappers_delegate_to_imported_jobs(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_universe_job(**kwargs) -> None:
        calls.append("universe")

    async def fake_pattern_job(**kwargs):
        calls.append("pattern")
        return set(), {}

    async def fake_auto_job() -> None:
        calls.append("auto")

    monkeypatch.setattr(scheduler, "scan_universe_job", fake_universe_job)
    monkeypatch.setattr(scheduler, "pattern_scan_job", fake_pattern_job)
    monkeypatch.setattr(scheduler, "auto_evaluate_job", fake_auto_job)

    asyncio.run(scheduler._scan_universe())
    asyncio.run(scheduler._pattern_scan_job())
    asyncio.run(scheduler._auto_evaluate_job())

    assert calls == ["universe", "pattern", "auto"]


def test_extracted_job_functions_are_callable() -> None:
    assert callable(scan_universe_job)
    assert callable(pattern_scan_job)
    assert callable(auto_evaluate_job)
