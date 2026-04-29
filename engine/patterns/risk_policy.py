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


import math
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from research.validation.regime import RegimeLabel, VolLabel


@dataclass(frozen=True)
class KellyPolicy:
    """Kelly Criterion + Regime-conditioned + Portfolio-aware sizing."""
    hit_rate: float
    n_samples: int
    rr_ratio: float = 3.0
    kelly_fraction: float = 0.25
    kelly_cap: float = 0.25
    min_samples: int = 10
    min_position_usdt: float = 50.0
    min_stop_pct: float = 0.005
    max_stop_pct: float = 0.05

    def __post_init__(self) -> None:
        if not (0.0 <= self.hit_rate <= 1.0):
            raise ValueError(f"hit_rate {self.hit_rate} not in [0,1]")
        if self.rr_ratio <= 0:
            raise ValueError("rr_ratio must be positive")
        if self.n_samples < 0:
            raise ValueError("n_samples must be >= 0")

    def is_active(self) -> bool:
        return self.n_samples >= self.min_samples and self.kelly_star() > 0

    def kelly_star(self) -> float:
        b, p = self.rr_ratio, self.hit_rate
        q = 1.0 - p
        return (b * p - q) / b

    def kelly_used(self) -> float:
        f_star = self.kelly_star()
        if f_star <= 0:
            return 0.0
        return min(self.kelly_fraction * f_star, self.kelly_cap)

    def get_position_usdt(
        self,
        account_equity: float,
        regime_mult: float = 1.0,
        portfolio_mult: float = 1.0,
    ) -> float:
        if account_equity <= 0:
            raise ValueError("account_equity must be > 0")
        if not self.is_active():
            return 0.0
        size = account_equity * self.kelly_used() * regime_mult * portfolio_mult
        if size < self.min_position_usdt:
            return 0.0
        return size

    def get_stop_price(
        self,
        entry: float,
        atr: float,
        regime: "RegimeLabel | None" = None,
        vol_label: "VolLabel | None" = None,
        direction: str = "long",
    ) -> float:
        from research.validation.sizing import dynamic_atr_multiplier
        from research.validation.regime import RegimeLabel as RL
        r = regime if regime is not None else RL.RANGE
        atr_mult = dynamic_atr_multiplier(r, vol_label)
        stop_dist = atr_mult * atr
        stop_dist = max(stop_dist, entry * self.min_stop_pct)
        stop_dist = min(stop_dist, entry * self.max_stop_pct)
        if direction == "long":
            return entry - stop_dist
        return entry + stop_dist

    def get_target_price(self, entry: float, stop: float, direction: str = "long") -> float:
        risk = abs(entry - stop)
        if direction == "long":
            return entry + risk * self.rr_ratio
        return entry - risk * self.rr_ratio

    def summary(
        self,
        entry: float,
        atr: float,
        account_equity: float,
        regime: "RegimeLabel | None" = None,
        vol_label: "VolLabel | None" = None,
        regime_mult: float = 1.0,
        portfolio_mult: float = 1.0,
        direction: str = "long",
    ) -> dict:
        stop = self.get_stop_price(entry, atr, regime, vol_label, direction)
        target = self.get_target_price(entry, stop, direction)
        position_usdt = self.get_position_usdt(account_equity, regime_mult, portfolio_mult)
        size_coin = position_usdt / entry if entry > 0 else 0.0
        risk_per_unit = abs(entry - stop)
        max_loss = size_coin * risk_per_unit
        potential_gain = max_loss * self.rr_ratio
        return {
            "policy":              "kelly",
            "kelly_star":          round(self.kelly_star(), 4),
            "kelly_used":          round(self.kelly_used(), 4),
            "regime_mult":         regime_mult,
            "portfolio_mult":      portfolio_mult,
            "entry_price":         round(entry, 4),
            "stop_price":          round(stop, 4),
            "target_price":        round(target, 4),
            "position_size_coin":  round(size_coin, 6),
            "position_size_usdt":  round(position_usdt, 2),
            "max_loss_usdt":       round(max_loss, 2),
            "potential_gain_usdt": round(potential_gain, 2),
            "rr_ratio":            self.rr_ratio,
            "stop_dist_pct":       round(risk_per_unit / entry * 100, 2) if entry > 0 else 0.0,
            "active":              self.is_active(),
        }


def build_risk_policy(
    hit_rate: float,
    n_samples: int,
    rr_ratio: float = 3.0,
) -> "FixedStopPolicy | KellyPolicy":
    kp = KellyPolicy(hit_rate=hit_rate, n_samples=n_samples, rr_ratio=rr_ratio)
    if kp.is_active():
        return kp
    return FixedStopPolicy(stop_loss_usdt=200.0, rr_ratio=rr_ratio)
