"""Rolling signal history and heat ranking."""
from __future__ import annotations

import time as _time
from collections import defaultdict, deque

from market_engine.config import SIG_WINDOW_S, HOT_THRESHOLD, FIRE_THRESHOLD


class SignalHistory:
    """30-min rolling signal counter per symbol."""

    def __init__(self) -> None:
        self._events: deque[tuple[float, str, str]] = deque()

    def record(self, symbol: str, signal_type: str) -> None:
        self._events.append((_time.time(), symbol, signal_type))
        self._prune()

    def _prune(self) -> None:
        cutoff = _time.time() - SIG_WINDOW_S
        while self._events and self._events[0][0] < cutoff:
            self._events.popleft()

    def ranking(self) -> list[dict]:
        self._prune()
        counts: dict[str, dict] = defaultdict(
            lambda: {
                "total": 0,
                "GOLDEN": 0,
                "WHALE": 0,
                "SQUEEZE": 0,
                "IMBALANCE": 0,
            }
        )
        for _, sym, sig in self._events:
            counts[sym]["total"] += 1
            if sig in counts[sym]:
                counts[sym][sig] += 1

        result = []
        for sym, c in sorted(counts.items(), key=lambda x: -x[1]["total"]):
            heat = "fire" if c["total"] >= FIRE_THRESHOLD else "hot" if c["total"] >= HOT_THRESHOLD else ""
            result.append(
                {
                    "symbol": sym,
                    "total": c["total"],
                    "golden": c["GOLDEN"],
                    "whale": c["WHALE"],
                    "squeeze": c["SQUEEZE"],
                    "imbalance": c["IMBALANCE"],
                    "heat": heat,
                }
            )
        return result

    def top(self, n: int = 10) -> list[dict]:
        return self.ranking()[:n]
