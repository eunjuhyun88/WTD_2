"""W-0365 P&L computation — entry/exit simulation + cost + verdict."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pandas as pd

from pnl.cost_model import CostTier, DEFAULT_TIER

EntryDirection = Literal[1, -1]  # +1 long, -1 short
ExitReason = Literal['target', 'stop', 'timeout', 'indeterminate_gap']
Verdict = Literal['WIN', 'LOSS', 'INDETERMINATE']


@dataclass
class PnLResult:
    entry_px: float
    entry_side: int          # +1 / -1
    exit_px: float
    exit_reason: ExitReason
    fee_bps_total: float
    slippage_bps_total: float
    pnl_bps_gross: float
    pnl_bps_net: float
    pnl_pct_net: float
    holding_bars: int
    mfe_bps: float
    mae_bps: float
    verdict: Verdict


def simulate_trade(
    ohlcv: pd.DataFrame,        # index=datetime, cols: open/high/low/close
    entry_bar_idx: int,         # bar t; entry at bar t+1 open
    direction: EntryDirection,
    stop_px: float | None,
    target_px: float | None,
    horizon_bars: int = 24,     # timeout after N bars
    cost_tier: CostTier = DEFAULT_TIER,
    gap_threshold_pct: float = 0.5,  # D-11: >0.5% gap → INDETERMINATE
) -> PnLResult:
    """Simulate a single trade from entry_bar_idx+1 open to exit.

    Lookahead-free: entry_px = ohlcv.iloc[entry_bar_idx + 1]['open']
    """
    if entry_bar_idx + 1 >= len(ohlcv):
        raise ValueError("entry_bar_idx + 1 out of bounds")

    entry_bar = ohlcv.iloc[entry_bar_idx + 1]
    prev_close = ohlcv.iloc[entry_bar_idx]['close']
    entry_px = float(entry_bar['open'])

    # D-11: gap check
    gap_pct = abs(entry_px / prev_close - 1) * 100
    if gap_pct > gap_threshold_pct:
        return _indeterminate_gap_result(entry_px, direction, cost_tier, entry_bar_idx)

    # Iterate bars
    exit_px: float | None = None
    exit_reason: ExitReason | None = None
    holding_bars = 0
    max_favorable = entry_px
    max_adverse = entry_px

    end_idx = min(entry_bar_idx + 1 + horizon_bars, len(ohlcv))
    for i in range(entry_bar_idx + 1, end_idx):
        bar = ohlcv.iloc[i]
        holding_bars = i - (entry_bar_idx + 1) + 1
        hi, lo = float(bar['high']), float(bar['low'])

        # Track MFE/MAE
        if direction == 1:
            max_favorable = max(max_favorable, hi)
            max_adverse = min(max_adverse, lo)
        else:
            max_favorable = min(max_favorable, lo)
            max_adverse = max(max_adverse, hi)

        # Stop check (priority over target per W-0365 design)
        if stop_px is not None:
            if direction == 1 and lo <= stop_px:
                exit_px, exit_reason = stop_px, 'stop'
                break
            if direction == -1 and hi >= stop_px:
                exit_px, exit_reason = stop_px, 'stop'
                break

        # Target check
        if target_px is not None:
            if direction == 1 and hi >= target_px:
                exit_px, exit_reason = target_px, 'target'
                break
            if direction == -1 and lo <= target_px:
                exit_px, exit_reason = target_px, 'target'
                break

    # Timeout
    if exit_reason is None:
        exit_bar = ohlcv.iloc[min(entry_bar_idx + horizon_bars, len(ohlcv) - 1)]
        exit_px = float(exit_bar['close'])
        exit_reason = 'timeout'
        holding_bars = horizon_bars

    assert exit_px is not None
    assert exit_reason is not None

    gross_bps = (exit_px / entry_px - 1) * 10000 * direction
    net_bps = gross_bps - cost_tier.total_bps
    pct_net = net_bps / 10000

    mfe_bps = (max_favorable / entry_px - 1) * 10000 * direction
    mae_bps = (max_adverse / entry_px - 1) * 10000 * direction

    verdict = _compute_verdict(net_bps, exit_reason, cost_tier.total_bps)

    return PnLResult(
        entry_px=entry_px,
        entry_side=direction,
        exit_px=exit_px,
        exit_reason=exit_reason,
        fee_bps_total=cost_tier.fee_bps,
        slippage_bps_total=cost_tier.slippage_bps,
        pnl_bps_gross=gross_bps,
        pnl_bps_net=net_bps,
        pnl_pct_net=pct_net,
        holding_bars=holding_bars,
        mfe_bps=mfe_bps,
        mae_bps=mae_bps,
        verdict=verdict,
    )


def _compute_verdict(net_bps: float, exit_reason: ExitReason, total_cost_bps: float) -> Verdict:
    if exit_reason == 'indeterminate_gap':
        return 'INDETERMINATE'
    if exit_reason == 'timeout' and abs(net_bps) < total_cost_bps:
        return 'INDETERMINATE'
    return 'WIN' if net_bps > 0 else 'LOSS'


def _indeterminate_gap_result(entry_px: float, direction: int, cost_tier: CostTier, entry_bar_idx: int) -> PnLResult:
    return PnLResult(
        entry_px=entry_px,
        entry_side=direction,
        exit_px=entry_px,
        exit_reason='indeterminate_gap',
        fee_bps_total=cost_tier.fee_bps,
        slippage_bps_total=cost_tier.slippage_bps,
        pnl_bps_gross=0.0,
        pnl_bps_net=-cost_tier.total_bps,
        pnl_pct_net=-cost_tier.total_bps / 10000,
        holding_bars=0,
        mfe_bps=0.0,
        mae_bps=0.0,
        verdict='INDETERMINATE',
    )
