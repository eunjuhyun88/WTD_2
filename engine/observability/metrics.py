"""In-process metrics counters for engine runtime health."""
from __future__ import annotations

import threading
from collections import defaultdict
from dataclasses import dataclass


@dataclass
class _MetricStore:
    counters: dict[str, int]
    timings_ms: dict[str, list[float]]


_LOCK = threading.Lock()
_COUNTERS: dict[str, int] = defaultdict(int)
_TIMINGS_MS: dict[str, list[float]] = defaultdict(list)


def increment(name: str, value: int = 1) -> None:
    with _LOCK:
        _COUNTERS[name] += value


def observe_ms(name: str, duration_ms: float) -> None:
    with _LOCK:
        _TIMINGS_MS[name].append(float(duration_ms))
        # Keep memory bounded.
        if len(_TIMINGS_MS[name]) > 2000:
            _TIMINGS_MS[name] = _TIMINGS_MS[name][-2000:]


def snapshot() -> dict:
    with _LOCK:
        timings_summary = {}
        for k, values in _TIMINGS_MS.items():
            if not values:
                timings_summary[k] = {"count": 0, "avg_ms": 0.0, "p95_ms": 0.0}
                continue
            sorted_vals = sorted(values)
            idx = min(len(sorted_vals) - 1, int(len(sorted_vals) * 0.95))
            timings_summary[k] = {
                "count": len(sorted_vals),
                "avg_ms": sum(sorted_vals) / len(sorted_vals),
                "p95_ms": sorted_vals[idx],
            }
        return {"counters": dict(_COUNTERS), "timings_ms": timings_summary}

