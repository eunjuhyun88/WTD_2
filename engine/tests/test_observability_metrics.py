from __future__ import annotations

from observability.metrics import increment, observe_ms, snapshot
from observability.timing import timed


def test_metrics_snapshot_tracks_counters_and_timings() -> None:
    increment("engine.test.counter")
    observe_ms("engine.test.latency", 10.0)
    observe_ms("engine.test.latency", 30.0)

    data = snapshot()

    assert data["counters"]["engine.test.counter"] >= 1
    timing = data["timings_ms"]["engine.test.latency"]
    assert timing["count"] == 2
    assert timing["avg_ms"] == 20.0
    assert timing["p95_ms"] == 30.0


def test_timed_decorator_records_elapsed_time() -> None:
    @timed("engine.test.decorated")
    def _work(value: int) -> int:
        return value * 2

    assert _work(21) == 42

    data = snapshot()
    timing = data["timings_ms"]["engine.test.decorated"]
    assert timing["count"] >= 1
    assert timing["avg_ms"] >= 0.0
