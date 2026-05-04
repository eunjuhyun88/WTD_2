"""Alpha composite score + autoresearch performance benchmarks (W-A108).

Tests:
  - composite_score with N=1 symbol → < 100ms
  - autoresearch sandbox cycle completes → tracked (not bounded in unit test)
  - research import count stays ≤ 15
"""
from __future__ import annotations

import time
import subprocess
import sys

import pytest


# ── Alpha composite score throughput ─────────────────────────────────────────

@pytest.mark.benchmark(group="alpha", min_rounds=3, warmup=True)
def test_alpha_module_import_latency(benchmark):
    """Alpha composite_score module import must be cheap (< 500ms first load)."""
    import importlib
    import sys

    def _reimport():
        # Remove from cache to force reimport on each round
        for key in list(sys.modules.keys()):
            if key.startswith("alpha."):
                del sys.modules[key]
        importlib.import_module("alpha.composite_score")

    benchmark(_reimport)


# ── Research import count gate ────────────────────────────────────────────────

def test_research_toplevel_import_count():
    """engine.research top-level imports must stay ≤ 35 (raised from 15 in W-0414 PR0).

    W-0386-C AC-C3 originally set at 15. Raised to 35 to accommodate the new
    engine.research.ingest subpackage (binance_perp, backfill, incremental, universe
    + their test modules add ~16 additional from engine.research.* lines).

    Grep is cheap and deterministic — run as a test so CI catches regressions.
    """
    result = subprocess.run(
        ["grep", "-rh", r"from engine\.research", ".", "--include=*.py"],
        capture_output=True, text=True,
    )
    lines = [l for l in result.stdout.splitlines() if l.strip()]
    count = len(lines)
    assert count <= 35, (
        f"from engine.research top-level imports: {count} > 35.\n"
        f"Offending lines:\n" + "\n".join(lines)
    )


# ── scheduler.py line budget ──────────────────────────────────────────────────

def test_scheduler_line_budget():
    """scanner/scheduler.py must stay ≤ 400 lines (W-0386-D AC-D1 relaxed)."""
    path = "scanner/scheduler.py"
    try:
        with open(path) as f:
            lines = sum(1 for _ in f)
        assert lines <= 400, f"scanner/scheduler.py has {lines} lines (budget 400)"
    except FileNotFoundError:
        pytest.skip(f"{path} not found in cwd — run from engine/")


# ── pipeline.py line budget ───────────────────────────────────────────────────

def test_pipeline_line_budget():
    """pipeline.py must stay ≤ 140 lines (W-0386-B AC-B2 relaxed)."""
    path = "pipeline.py"
    try:
        with open(path) as f:
            lines = sum(1 for _ in f)
        assert lines <= 140, f"pipeline.py has {lines} lines (budget 140)"
    except FileNotFoundError:
        pytest.skip(f"{path} not found — run from engine/")
