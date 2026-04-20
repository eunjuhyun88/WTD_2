"""Risk policy plane — 딸깍 전략 리스크 관리.

원칙:
  "포지션 규모와 관계없이 200 USDT 고정 손절. 감정 배제."
  "단방향 원칙 — 헷징 없이 명확한 추세에만 베팅."
  "적게 여러 번 잃고, 크게 몇 번 먹는다 (Small losses, Big wins)."

이 모듈은 포지션 사이징 계산만 한다.
실제 주문 집행은 별도 레이어 (주문 API) 에서 담당.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class FixedStopPolicy:
    """200 USDT 고정 손절 기반 포지션 사이징.

    Args:
        stop_loss_usdt: 고정 손절 금액 (기본 200 USDT).
        rr_ratio:       목표 R:R 비율 (기본 3.0 = 3:1).
    """

    stop_loss_usdt: float = 200.0
    rr_ratio: float = 3.0

    def get_stop_price(self, entry: float, atr: float) -> float:
        """ATR 기반 stop 가격 계산.

        1.5 ATR stop을 기본으로 하되,
        해당 손실이 stop_loss_usdt를 초과하면 더 좁힌다.

        Args:
            entry: 진입가 (USDT)
            atr:   현재 ATR (USDT)

        Returns:
            stop 가격 (entry 보다 낮음)
        """
        atr_stop_dist = 1.5 * atr
        # 200 USDT 손실에 해당하는 최대 거리 계산
        size = self.get_position_size(entry, entry - atr_stop_dist)
        if size > 0:
            max_stop_dist = self.stop_loss_usdt / size
        else:
            max_stop_dist = atr_stop_dist

        stop_dist = min(atr_stop_dist, max_stop_dist)
        return entry - stop_dist

    def get_position_size(self, entry: float, stop: float) -> float:
        """stop_loss_usdt 손실에 해당하는 포지션 크기 역산.

        포지션 크기(계약 수) = 고정손실 / 단위당 리스크

        Args:
            entry: 진입가 (USDT)
            stop:  손절가 (USDT)

        Returns:
            포지션 크기 (코인 수량 기준)
        """
        risk_per_unit = abs(entry - stop)
        if risk_per_unit == 0:
            return 0.0
        return self.stop_loss_usdt / risk_per_unit

    def get_target_price(self, entry: float, stop: float) -> float:
        """R:R 기반 목표가 계산.

        Args:
            entry: 진입가 (USDT)
            stop:  손절가 (USDT)

        Returns:
            목표가 (USDT)
        """
        risk = abs(entry - stop)
        return entry + (risk * self.rr_ratio)

    def summary(self, entry: float, atr: float) -> dict:
        """전체 포지션 플랜 요약.

        Args:
            entry: 진입가 (USDT)
            atr:   현재 ATR (USDT)

        Returns:
            포지션 플랜 딕셔너리
        """
        stop = self.get_stop_price(entry, atr)
        size_coins = self.get_position_size(entry, stop)
        target = self.get_target_price(entry, stop)
        size_usdt = size_coins * entry
        potential_gain = self.stop_loss_usdt * self.rr_ratio

        return {
            "entry_price":        round(entry, 4),
            "stop_price":         round(stop, 4),
            "target_price":       round(target, 4),
            "position_size_coin": round(size_coins, 6),
            "position_size_usdt": round(size_usdt, 2),
            "max_loss_usdt":      round(self.stop_loss_usdt, 2),
            "potential_gain_usdt": round(potential_gain, 2),
            "rr_ratio":           self.rr_ratio,
            "stop_dist_pct":      round(abs(entry - stop) / entry * 100, 2),
        }


# 전략 기본 인스턴스 (대부분의 경우 이걸 직접 사용)
DEFAULT_POLICY = FixedStopPolicy(stop_loss_usdt=200.0, rr_ratio=3.0)
