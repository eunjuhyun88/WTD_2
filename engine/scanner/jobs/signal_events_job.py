"""Signal events scheduler registration (W-0377).

Wraps research.validation.verification_loop.register_scheduler so that
scheduler.py has zero direct research.* imports (AC-D3, W-0386-D).
"""
from __future__ import annotations


def register_signal_events(scheduler) -> None:  # type: ignore[type-arg]
    """Register verification_loop jobs on the given APScheduler instance."""
    from research.validation.verification_loop import register_scheduler as _reg  # noqa: PLC0415
    _reg(scheduler)
