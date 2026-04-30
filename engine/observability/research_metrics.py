"""Structured metrics for the research/discovery pipeline.

Usage:
    from observability.research_metrics import set_cycle_id, record_cycle, record_tool_error

cycle_id is propagated via contextvars — any logger in the same async task
can call get_cycle_id() to annotate logs without parameter threading.
"""
from __future__ import annotations

import contextvars
import logging
import time
from typing import Literal

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# cycle_id context propagation
# ---------------------------------------------------------------------------
_cycle_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "research_cycle_id", default=""
)


def set_cycle_id(cycle_id: str) -> None:
    _cycle_id_var.set(cycle_id)


def get_cycle_id() -> str:
    return _cycle_id_var.get()


# ---------------------------------------------------------------------------
# Structured event logging
# ---------------------------------------------------------------------------

StopReason = Literal[
    "disabled", "max_turns", "no_tool_calls", "cost_cap",
    "proposals_limit", "stop_tool", "error"
]


def record_cycle(
    *,
    cycle_id: str,
    stop_reason: str,
    proposals: int,
    turns_used: int,
    cost_usd: float,
    duration_ms: float,
    error: str | None = None,
) -> None:
    """Emit one structured log per completed cycle. Ingested by Loki/Datadog."""
    log.info(
        "research_cycle_complete",
        extra={
            "event": "research_cycle_complete",
            "cycle_id": cycle_id,
            "stop_reason": stop_reason,
            "proposals": proposals,
            "turns_used": turns_used,
            "cost_usd": round(cost_usd, 5),
            "duration_ms": round(duration_ms, 1),
            "error": error,
        },
    )


def record_tool_error(
    *,
    tool_name: str,
    error: str,
    cycle_id: str | None = None,
) -> None:
    """Emit structured log for per-tool exception (agent continues after this)."""
    log.warning(
        "research_tool_error",
        extra={
            "event": "research_tool_error",
            "cycle_id": cycle_id or get_cycle_id(),
            "tool_name": tool_name,
            "error": error,
        },
    )


def record_validation(
    *,
    slug: str,
    family: str,
    overall_pass: bool,
    stage: str,
    registry_ok: bool,
    cost_usd: float = 0.0,
) -> None:
    """Emit structured log per validate_and_gate() call."""
    log.info(
        "research_validation",
        extra={
            "event": "research_validation",
            "cycle_id": get_cycle_id(),
            "slug": slug,
            "family": family,
            "overall_pass": overall_pass,
            "stage": stage,
            "registry_ok": registry_ok,
        },
    )


# ---------------------------------------------------------------------------
# Simple wall-clock timer (no dependency)
# ---------------------------------------------------------------------------

class CycleTimer:
    """Lightweight timer. Use as context manager or call .elapsed_ms()."""

    def __init__(self) -> None:
        self._start = time.monotonic()

    def elapsed_ms(self) -> float:
        return (time.monotonic() - self._start) * 1000
