from __future__ import annotations

from dataclasses import dataclass, field

from patterns.position_guard import Direction, OpenPosition


class PatternFamily:
    """Simple string-based pattern family — no enum dependency."""
    HAMMER = "hammer"
    ENGULFING = "engulfing"
    INSIDE_BAR = "inside_bar"
    DOJI = "doji"
    PIN_BAR = "pin_bar"
    CONTINUATION = "continuation"
    REVERSAL = "reversal"
    BREAKOUT = "breakout"


@dataclass
class PortfolioGuard:
    same_direction_threshold: int = 2
    same_family_threshold: int = 2
    same_dir_penalty: float = 0.5
    same_family_penalty: float = 0.7
    portfolio_max_positions: int = 5

    _positions: dict[str, tuple[OpenPosition, str]] = field(
        default_factory=dict, init=False, repr=False
    )

    def register(self, pos: OpenPosition, family: str) -> None:
        self._positions[pos.symbol] = (pos, family)

    def close(self, symbol: str) -> None:
        self._positions.pop(symbol, None)

    def compute_penalty(
        self,
        new_direction: Direction,
        new_family: str,
    ) -> tuple[float, dict]:
        items = list(self._positions.values())
        if len(items) >= self.portfolio_max_positions:
            return 0.0, {"reason": "portfolio_full", "n": len(items)}

        same_dir = sum(1 for p, _ in items if p.direction == new_direction)
        same_family = sum(1 for _, f in items if f == new_family)

        penalty = 1.0
        applied: list[str] = []
        if same_dir >= self.same_direction_threshold:
            penalty *= self.same_dir_penalty
            applied.append(f"same_dir({same_dir})")
        if same_family >= self.same_family_threshold:
            penalty *= self.same_family_penalty
            applied.append(f"same_family({same_family})")

        return penalty, {
            "penalty":     penalty,
            "same_dir":    same_dir,
            "same_family": same_family,
            "applied":     applied,
            "n_positions": len(items),
        }

    def open_count(self) -> int:
        return len(self._positions)

    def snapshot(self) -> list[dict]:
        return [
            {"symbol": s, "direction": p.direction.value, "family": f}
            for s, (p, f) in self._positions.items()
        ]


_PORTFOLIO_GUARD = PortfolioGuard()


def get_portfolio_guard() -> PortfolioGuard:
    return _PORTFOLIO_GUARD


def reset_portfolio_guard() -> None:
    global _PORTFOLIO_GUARD
    _PORTFOLIO_GUARD = PortfolioGuard()
