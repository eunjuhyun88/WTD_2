"""Timing decorators/helpers for observability."""
from __future__ import annotations

import time
from collections.abc import Callable
from typing import TypeVar

from observability.metrics import observe_ms

F = TypeVar("F", bound=Callable)


def timed(metric_name: str):
    def _decorator(fn: F) -> F:
        def _wrapped(*args, **kwargs):
            start = time.perf_counter()
            try:
                return fn(*args, **kwargs)
            finally:
                elapsed = (time.perf_counter() - start) * 1000.0
                observe_ms(metric_name, elapsed)

        return _wrapped  # type: ignore[return-value]

    return _decorator

