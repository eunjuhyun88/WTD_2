"""Structured observability primitives (logging + in-process metrics).

Phase D12 provides ``observability.logging.StructuredLogger`` only;
``observability.metrics`` is reserved for a future in-process counter
dict and is not implemented in this phase.
"""

from observability.health import health_payload, readiness_payload
from observability.metrics import increment, observe_ms, snapshot
from observability.timing import timed

__all__ = [
    "health_payload",
    "readiness_payload",
    "increment",
    "observe_ms",
    "snapshot",
    "timed",
]
