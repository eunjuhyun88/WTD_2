"""Context passed to every building block.

Rationale for a wrapper (rather than positional args):
  - Phase F will add perps / liquidations / order-book series. Adding a
    field to Context is backward compatible; adding a positional arg to
    every block signature is not.
  - Self-documenting: one object whose attributes say what's available.
  - Lets the composer reuse a single Context per symbol across all blocks
    instead of plumbing two DataFrames through every call.
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class Context:
    """Per-symbol input to a building block.

    Attributes:
        klines: Full OHLCV history with columns
            open, high, low, close, volume, taker_buy_base_volume.
            Indexed by UTC timestamp. MAY start before features.index[0]
            (warmup bars that feature_calc dropped but blocks can still
            reach for deeper lookbacks).
        features: Feature table from scanner.feature_calc.compute_features_table.
            Post-warmup (skips the first MIN_HISTORY_BARS rows of klines).
            Columns are FEATURE_COLUMNS.
        symbol: e.g. "BTCUSDT". For diagnostics only.
    """

    klines: pd.DataFrame
    features: pd.DataFrame
    symbol: str

    def __post_init__(self) -> None:
        if len(self.features) == 0 or len(self.klines) == 0:
            return
        f0, f1 = self.features.index[0], self.features.index[-1]
        k0, k1 = self.klines.index[0], self.klines.index[-1]
        if f0 < k0:
            raise ValueError(
                f"{self.symbol}: features start {f0} before klines start {k0}"
            )
        if f1 > k1:
            raise ValueError(
                f"{self.symbol}: features end {f1} after klines end {k1}"
            )
