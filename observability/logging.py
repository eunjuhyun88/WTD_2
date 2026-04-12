"""Structured JSON logger for cogochi-autoresearch.

One event = one JSON line on stdout. The key set is deliberately fixed
(``ts``, ``level``, ``module``, ``event``, ``run_id``, plus caller-supplied
fields) so downstream jq/grep/pandas pipelines are stable.

Rationale: Phase D12's backtest produces thousands of structured events
(entry considered, signal blocked, trade closed, circuit breaker fired,
…) and we need to be able to answer questions like *"of the 115
lgb-long-v1 signals, how many were blocked by ``max_concurrent`` vs
``daily_loss_halt``?"* without scraping free-form print output.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any, TextIO


class StructuredLogger:
    """Emit JSON-per-line events to a text stream (default: stdout).

    This is deliberately not a wrapper around the stdlib ``logging``
    module. We want a strict, fixed schema (no format strings), and we
    do not need log levels filtering, rotation, or handlers. If Phase
    D18 needs those, swap this out for ``logging.Logger`` with a JSON
    formatter at that time.
    """

    def __init__(
        self,
        module: str,
        run_id: str,
        *,
        stream: TextIO | None = None,
    ) -> None:
        self.module = module
        self.run_id = run_id
        self.stream: TextIO = stream if stream is not None else sys.stdout

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------
    def _emit(self, level: str, event: str, fields: dict[str, Any]) -> None:
        record: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "module": self.module,
            "event": event,
            "run_id": self.run_id,
        }
        # Caller-supplied fields are appended after the fixed schema. We
        # do NOT allow them to overwrite the fixed keys; doing so would
        # let a distracted caller silently break downstream jq filters.
        for key, value in fields.items():
            if key in record:
                raise ValueError(
                    f"StructuredLogger: caller-supplied field {key!r} "
                    "collides with a fixed schema key"
                )
            record[key] = value
        # ``default=str`` keeps pd.Timestamp, numpy scalars, Path, etc.
        # JSON-serialisable without the caller having to pre-cast them.
        self.stream.write(json.dumps(record, default=str) + "\n")
        self.stream.flush()

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------
    def info(self, event: str, **fields: Any) -> None:
        """Emit an ``info``-level event."""
        self._emit("info", event, fields)

    def warning(self, event: str, **fields: Any) -> None:
        """Emit a ``warn``-level event. (Spelled without ``n`` on purpose.)"""
        self._emit("warn", event, fields)

    def error(self, event: str, **fields: Any) -> None:
        """Emit an ``error``-level event. Caller is responsible for still raising."""
        self._emit("error", event, fields)
