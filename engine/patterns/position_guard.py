"""단방향 원칙 — 딸깍 전략 포지션 가드.

딸깍 원칙:
  "한 심볼에 동시에 롱/숏 포지션을 잡지 않는다."
  "명확한 추세에만 베팅. 헷징 없이 단방향."

이 모듈은 포지션 충돌 검사만 한다.
실제 포지션 상태는 외부 주문 API에서 주입.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class Direction(str, Enum):
    LONG  = "long"
    SHORT = "short"


@dataclass
class OpenPosition:
    symbol: str
    direction: Direction
    entry_price: float
    size_coin: float
    stop_price: float
    target_price: float


@dataclass
class PositionGuard:
    """단방향 원칙 집행기.

    딸깍 전략에서는:
      1. 동일 심볼에 롱+숏 동시 보유 금지.
      2. 이미 보유 중인 방향과 반대 신호는 차단.
      3. 동일 심볼에 중복 진입 금지 (이미 보유 중).

    Usage::

        guard = PositionGuard()
        guard.register(pos)           # 포지션 열릴 때
        ok, reason = guard.can_enter("BTCUSDT", Direction.LONG)
        guard.close("BTCUSDT")        # 포지션 닫힐 때
    """

    _positions: dict[str, OpenPosition] = field(default_factory=dict, init=False)

    def register(self, pos: OpenPosition) -> None:
        """새 포지션 등록."""
        self._positions[pos.symbol] = pos

    def close(self, symbol: str) -> None:
        """포지션 닫기 (제거)."""
        self._positions.pop(symbol, None)

    def can_enter(
        self,
        symbol: str,
        direction: Direction,
    ) -> tuple[bool, str]:
        """진입 가능 여부 검사.

        Args:
            symbol:    심볼 (예: "BTCUSDT")
            direction: 진입 방향

        Returns:
            (True, "") — 진입 가능
            (False, reason) — 차단, reason에 이유
        """
        existing = self._positions.get(symbol)
        if existing is None:
            return True, ""

        if existing.direction == direction:
            return False, (
                f"{symbol} already has {direction.value} position "
                f"@ {existing.entry_price}"
            )

        # 반대 방향 → 단방향 원칙 위반
        return False, (
            f"{symbol} has opposing {existing.direction.value} position — "
            "단방향 원칙: close existing before reversing"
        )

    def open_symbols(self) -> list[str]:
        """현재 보유 중인 심볼 목록."""
        return list(self._positions.keys())

    def get_position(self, symbol: str) -> OpenPosition | None:
        return self._positions.get(symbol)

    def summary(self) -> list[dict]:
        """보유 포지션 요약 (API 응답용)."""
        return [
            {
                "symbol":       p.symbol,
                "direction":    p.direction.value,
                "entry_price":  p.entry_price,
                "size_coin":    p.size_coin,
                "stop_price":   p.stop_price,
                "target_price": p.target_price,
                "unrealized_rr": round(
                    (p.target_price - p.entry_price)
                    / max(abs(p.entry_price - p.stop_price), 1e-9),
                    2,
                ),
            }
            for p in self._positions.values()
        ]


# 프로세스 전역 싱글톤 (단일 실행 환경 가정)
_GUARD = PositionGuard()


def get_guard() -> PositionGuard:
    """FastAPI 의존성 주입용 접근자."""
    return _GUARD
