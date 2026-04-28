"""W-0290 Phase 1 — 검증용 비용 모델 (버전 객체)."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class CostModel:
    cost_model_id: str = "binance_perp_taker_15bps_v1"
    taker_roundtrip_bps: float = 10.0   # 5bps × 2 legs
    slippage_bps: float = 5.0
    funding_policy: Literal["exclude", "include_24h_plus"] = "include_24h_plus"
    funding_bps_per_8h: float = 1.0     # perp funding 근사치

    def total_cost_bps(self, horizon_hours: int) -> float:
        """총 거래 비용 (bps). funding은 24h+ 시 포함."""
        base = self.taker_roundtrip_bps + self.slippage_bps
        if self.funding_policy == "include_24h_plus" and horizon_hours >= 24:
            periods = horizon_hours / 8
            return base + self.funding_bps_per_8h * periods
        return base

    def net_edge_threshold_bps(self) -> float:
        """최소 의미있는 순수익: 비용의 2배."""
        return 2.0 * (self.taker_roundtrip_bps + self.slippage_bps)


# 사전 정의 모델
BINANCE_PERP_TAKER_15BPS_V1 = CostModel()
BINANCE_PERP_ALT_45BPS_V1 = CostModel(
    cost_model_id="binance_perp_alt_45bps_v1",
    slippage_bps=30.0,
)
BINANCE_SPOT_TAKER_20BPS_V1 = CostModel(
    cost_model_id="binance_spot_taker_20bps_v1",
    taker_roundtrip_bps=10.0,
    slippage_bps=10.0,
    funding_policy="exclude",
)

COST_MODEL_REGISTRY: dict[str, CostModel] = {
    m.cost_model_id: m
    for m in [BINANCE_PERP_TAKER_15BPS_V1, BINANCE_PERP_ALT_45BPS_V1, BINANCE_SPOT_TAKER_20BPS_V1]
}


def get_cost_model(cost_model_id: str) -> CostModel:
    if cost_model_id not in COST_MODEL_REGISTRY:
        raise KeyError(f"Unknown cost_model_id: {cost_model_id!r}. Available: {list(COST_MODEL_REGISTRY)}")
    return COST_MODEL_REGISTRY[cost_model_id]
