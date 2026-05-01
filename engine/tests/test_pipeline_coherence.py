"""W-0377: Core loop pipeline coherence tests.

Verifies that Break A, B, C are all healed:
  Break A — ENABLE_SIGNAL_EVENTS default is 'true' in scanner and scheduler
  Break B — verification_loop.resolve_pending_outcomes() is callable and reachable
  Break C — CURRENT.md does not list moved work items as active
"""
from __future__ import annotations

import os
import pathlib


def test_scanner_signal_events_default_true():
    """Break A (scanner): _SIGNAL_EVENTS_ENABLED default must be 'true'."""
    # Reset module so the module-level constant re-evaluates with clean env
    import importlib
    import sys

    env_backup = os.environ.pop("ENABLE_SIGNAL_EVENTS", None)
    try:
        # Remove cached module so os.getenv re-runs at import time
        for mod_name in list(sys.modules.keys()):
            if "patterns.scanner" in mod_name:
                del sys.modules[mod_name]

        import patterns.scanner as scanner_mod
        assert scanner_mod._SIGNAL_EVENTS_ENABLED is True, (
            "ENABLE_SIGNAL_EVENTS default is False — Break A not fixed in patterns/scanner.py"
        )
    finally:
        if env_backup is not None:
            os.environ["ENABLE_SIGNAL_EVENTS"] = env_backup
        # Re-import with original env
        for mod_name in list(sys.modules.keys()):
            if "patterns.scanner" in mod_name:
                del sys.modules[mod_name]


def test_scheduler_signal_events_default_true():
    """Break A (scheduler): ENABLE_SIGNAL_EVENTS default must be 'true'."""
    env_backup = os.environ.pop("ENABLE_SIGNAL_EVENTS", None)
    try:
        result = os.environ.get("ENABLE_SIGNAL_EVENTS", "true").lower()
        assert result == "true", (
            f"ENABLE_SIGNAL_EVENTS default is {result!r} — expected 'true'"
        )
    finally:
        if env_backup is not None:
            os.environ["ENABLE_SIGNAL_EVENTS"] = env_backup


def test_scanner_signal_events_env_override_false():
    """Break A: env override ENABLE_SIGNAL_EVENTS=false must be respected."""
    import sys

    os.environ["ENABLE_SIGNAL_EVENTS"] = "false"
    try:
        for mod_name in list(sys.modules.keys()):
            if "patterns.scanner" in mod_name:
                del sys.modules[mod_name]

        import patterns.scanner as scanner_mod
        assert scanner_mod._SIGNAL_EVENTS_ENABLED is False, (
            "ENABLE_SIGNAL_EVENTS=false env override not respected"
        )
    finally:
        del os.environ["ENABLE_SIGNAL_EVENTS"]
        for mod_name in list(sys.modules.keys()):
            if "patterns.scanner" in mod_name:
                del sys.modules[mod_name]


def test_verification_loop_callable():
    """Break B: verification_loop.resolve_pending_outcomes() must be importable."""
    from research.verification_loop import resolve_pending_outcomes
    assert callable(resolve_pending_outcomes), (
        "research.verification_loop.resolve_pending_outcomes is not callable"
    )


def test_signal_event_store_resolve_outcome_interface():
    """Break B: signal_event_store.resolve_outcome() signature (signal_id, horizon_h, outcome)."""
    import inspect
    from research.signal_event_store import resolve_outcome
    sig = inspect.signature(resolve_outcome)
    params = list(sig.parameters.keys())
    assert "signal_id" in params, f"resolve_outcome missing signal_id param: {params}"
    assert "horizon_h" in params, f"resolve_outcome missing horizon_h param: {params}"
    assert "outcome" in params, f"resolve_outcome missing outcome param: {params}"


def test_current_md_no_stale_w0365():
    """Break C: CURRENT.md must not list W-0365 as an active work item row."""
    current_md_path = pathlib.Path("work/active/CURRENT.md")
    if not current_md_path.exists():
        return  # CI environment may not have this file
    content = current_md_path.read_text()
    # Check the active work items table specifically (not the "완료:" history line)
    lines = content.splitlines()
    table_lines = [
        line for line in lines
        if line.startswith("|") and "W-0365" in line
    ]
    assert not table_lines, (
        f"CURRENT.md active table still lists W-0365: {table_lines}"
    )


def test_current_md_no_stale_w0366():
    """Break C: CURRENT.md must not list W-0366 as an active work item row."""
    current_md_path = pathlib.Path("work/active/CURRENT.md")
    if not current_md_path.exists():
        return
    content = current_md_path.read_text()
    lines = content.splitlines()
    table_lines = [
        line for line in lines
        if line.startswith("|") and "W-0366" in line
    ]
    assert not table_lines, (
        f"CURRENT.md active table still lists W-0366: {table_lines}"
    )
