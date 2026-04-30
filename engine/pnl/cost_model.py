"""W-0365 cost model — 15bps round-trip (W-0214 D3 lockdown)."""
from __future__ import annotations
from dataclasses import dataclass

ROUND_TRIP_BPS = 15  # W-0214 D3 lockdown: always-taker, mid-volume tier

@dataclass(frozen=True)
class CostTier:
    label: str          # 'high' | 'mid' | 'low'
    slippage_bps: float
    fee_bps: float

    @property
    def total_bps(self) -> float:
        return self.fee_bps + self.slippage_bps

COST_TIERS = {
    'high': CostTier('high', slippage_bps=2.0,  fee_bps=10.0),  # top-50 by 24h vol
    'mid':  CostTier('mid',  slippage_bps=5.0,  fee_bps=10.0),  # 50-200 rank
    'low':  CostTier('low',  slippage_bps=10.0, fee_bps=10.0),  # rest
}
DEFAULT_TIER = COST_TIERS['mid']  # 15bps total

def get_cost_tier(symbol: str, vol_rank: int | None = None) -> CostTier:
    """Return cost tier for symbol. vol_rank=None → mid (conservative default)."""
    if vol_rank is None:
        return DEFAULT_TIER
    if vol_rank <= 50:
        return COST_TIERS['high']
    if vol_rank <= 200:
        return COST_TIERS['mid']
    return COST_TIERS['low']
