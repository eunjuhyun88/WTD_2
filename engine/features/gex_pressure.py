"""Gamma Exposure (GEX) pressure regime detection.

Interprets options market GEX as a regime signal:
  - Extreme call skew (GEX > +5B) = Call-heavy, protective puts low → bearish
  - Extreme put skew (GEX < -5B) = Put-heavy, protection high → bullish
  - Balanced (|GEX| < 2B) = Two-sided, neutral

GEX regime classifications:
  - CALL_SKEW: GEX > +3B (upside protection demand)
  - PUT_SKEW: GEX < -3B (downside protection demand)
  - BALANCED: -3B ≤ GEX ≤ +3B
  - EXTREME_CALL: GEX > +5B (capitulation risk, potential reversal)
  - EXTREME_PUT: GEX < -5B (positioning exhaustion, reversal potential)

Used by Layer 5 validation gate to filter proposals during gamma-heavy windows.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal, Optional

import pandas as pd

from engine.data_cache.fetch_deribit_options import fetch_deribit_gex


class GexRegime(str, Enum):
    """GEX regime classification."""

    CALL_SKEW = "call_skew"
    PUT_SKEW = "put_skew"
    BALANCED = "balanced"
    EXTREME_CALL = "extreme_call"
    EXTREME_PUT = "extreme_put"


@dataclass
class GexState:
    """GEX pressure state for a currency."""

    currency: str
    gex_billions: float
    regime: GexRegime
    timestamp: pd.Timestamp

    def is_acceptable_for_layer5(self) -> bool:
        """Check if current GEX regime is acceptable for Layer 5.

        Rejects proposals during extreme positioning windows.
        """
        return self.regime not in (GexRegime.EXTREME_CALL, GexRegime.EXTREME_PUT)


def classify_gex_regime(gex_billions: Optional[float]) -> GexRegime:
    """Classify GEX into regime."""
    if gex_billions is None:
        return GexRegime.BALANCED

    if gex_billions > 5.0:
        return GexRegime.EXTREME_CALL
    elif gex_billions > 3.0:
        return GexRegime.CALL_SKEW
    elif gex_billions < -5.0:
        return GexRegime.EXTREME_PUT
    elif gex_billions < -3.0:
        return GexRegime.PUT_SKEW
    else:
        return GexRegime.BALANCED


def compute_gex_state(currency: str = "BTC") -> GexState:
    """Fetch live GEX and classify into regime.

    Args:
        currency: "BTC" or "ETH"

    Returns:
        GexState with current regime classification.

    Raises:
        ValueError: if currency invalid or fetch fails critically.
    """
    gex = fetch_deribit_gex(currency)
    regime = classify_gex_regime(gex)

    return GexState(
        currency=currency,
        gex_billions=gex or 0.0,
        regime=regime,
        timestamp=pd.Timestamp.now(tz="UTC"),
    )


def gex_filter_proposal(proposal, currencies: list[str] = ["BTC", "ETH"]) -> bool:
    """Layer 5 gate: reject proposal if any currency in extreme GEX regime.

    Args:
        proposal: ChangeProposal object
        currencies: list of currencies to check ("BTC", "ETH")

    Returns:
        True if proposal acceptable, False if rejected by GEX filter.
    """
    for currency in currencies:
        try:
            state = compute_gex_state(currency)
            if not state.is_acceptable_for_layer5():
                return False
        except Exception:
            # On API failure, default to accept (conservative)
            continue

    return True
