"""W-0290 Phase 1 — 검증용 4종 라벨 계산.

Labels:
    return_exact_h_bps_raw  — gross exact-horizon return (bps)
    return_exact_h_bps_net  — net of cost (bps)
    mfe_bps                 — max favorable excursion (bps)
    mae_bps                 — max adverse excursion (bps)
    triple_barrier_outcome  — "profit_take" | "stop_loss" | "timeout"
"""
from __future__ import annotations
import math
from dataclasses import dataclass
from typing import Literal, Sequence

import numpy as np
import pandas as pd

from .costs import CostModel, BINANCE_PERP_TAKER_15BPS_V1


@dataclass
class TripleBarrierConfig:
    profit_take_mult: float = 2.0   # TP: entry_price × (1 ± mult × atr / price)
    stop_loss_mult: float = 1.0     # SL: 반대 방향
    use_bps: bool = True            # True이면 mult를 bps로 해석
    profit_take_bps: float = 60.0   # use_bps=True 시
    stop_loss_bps: float = 30.0


@dataclass
class ReturnLabel:
    horizon_hours: int
    return_exact_h_bps_raw: float
    return_exact_h_bps_net: float
    mfe_bps: float
    mae_bps: float
    triple_barrier_outcome: Literal["profit_take", "stop_loss", "timeout"]
    time_to_mfe_bars: int | None = None


def _bps(price_a: float, price_b: float, side: Literal["long", "short"]) -> float:
    if price_a <= 0:
        return 0.0
    raw = (price_b - price_a) / price_a * 10_000
    return raw if side == "long" else -raw


def label_entry(
    prices: pd.Series,
    entry_idx: int,
    horizon_hours: int,
    bars_per_hour: float,
    cost_model: CostModel = BINANCE_PERP_TAKER_15BPS_V1,
    side: Literal["long", "short"] = "long",
    triple_barrier: TripleBarrierConfig | None = None,
) -> ReturnLabel:
    """단일 entry에 대해 4종 라벨 계산.

    Args:
        prices: pd.Series of close prices (인덱스: 정수 봉 번호 또는 DatetimeIndex)
        entry_idx: prices.index 기준 entry 봉 인덱스
        horizon_hours: 목표 horizon (시간)
        bars_per_hour: 봉당 시간 역수 (4h봉 = 0.25, 1h봉 = 1.0)
        cost_model: 비용 모델
        side: 롱/숏
        triple_barrier: triple barrier 파라미터 (None이면 기본값 사용)
    """
    if triple_barrier is None:
        triple_barrier = TripleBarrierConfig()

    n_bars = max(1, int(horizon_hours * bars_per_hour))
    prices_arr = prices.values if hasattr(prices, "values") else np.array(prices)

    # entry_idx가 정수 위치인지 확인
    idx_pos = list(prices.index).index(entry_idx) if not isinstance(entry_idx, int) else entry_idx

    start = idx_pos
    end = min(start + n_bars, len(prices_arr) - 1)

    if start >= len(prices_arr):
        return ReturnLabel(
            horizon_hours=horizon_hours,
            return_exact_h_bps_raw=0.0,
            return_exact_h_bps_net=0.0,
            mfe_bps=0.0,
            mae_bps=0.0,
            triple_barrier_outcome="timeout",
        )

    entry_price = float(prices_arr[start])
    exit_price = float(prices_arr[end])
    window = prices_arr[start:end + 1]

    # Gross return
    raw_bps = _bps(entry_price, exit_price, side)
    cost_bps = cost_model.total_cost_bps(horizon_hours)
    net_bps = raw_bps - cost_bps

    # MFE / MAE
    if side == "long":
        mfe_bps = max((_bps(entry_price, float(p), "long") for p in window), default=0.0)
        mae_bps = min((_bps(entry_price, float(p), "long") for p in window), default=0.0)
    else:
        mfe_bps = max((_bps(entry_price, float(p), "short") for p in window), default=0.0)
        mae_bps = min((_bps(entry_price, float(p), "short") for p in window), default=0.0)

    # MFE 도달 봉 번호
    time_to_mfe: int | None = None
    mfe_val = max(
        enumerate(_bps(entry_price, float(p), side) for p in window),
        key=lambda x: x[1],
        default=None,
    )
    if mfe_val is not None:
        time_to_mfe = mfe_val[0]

    # Triple barrier outcome
    outcome: Literal["profit_take", "stop_loss", "timeout"] = "timeout"
    if triple_barrier.use_bps:
        tp_bps = triple_barrier.profit_take_bps
        sl_bps = -triple_barrier.stop_loss_bps
        for p in window:
            ret = _bps(entry_price, float(p), side)
            if ret >= tp_bps:
                outcome = "profit_take"
                break
            if ret <= sl_bps:
                outcome = "stop_loss"
                break

    return ReturnLabel(
        horizon_hours=horizon_hours,
        return_exact_h_bps_raw=raw_bps,
        return_exact_h_bps_net=net_bps,
        mfe_bps=mfe_bps,
        mae_bps=mae_bps,
        triple_barrier_outcome=outcome,
        time_to_mfe_bars=time_to_mfe,
    )


def label_entries(
    prices: pd.Series,
    entry_indices: list[int],
    horizon_hours: int,
    bars_per_hour: float = 0.25,   # 기본: 4h봉
    cost_model: CostModel = BINANCE_PERP_TAKER_15BPS_V1,
    side: Literal["long", "short"] = "long",
) -> list[ReturnLabel]:
    """여러 entry에 대해 일괄 라벨 계산."""
    return [
        label_entry(prices, idx, horizon_hours, bars_per_hour, cost_model, side)
        for idx in entry_indices
    ]
