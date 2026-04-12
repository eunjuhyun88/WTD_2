"""Shared frozen dataclass contracts between backtest submodules.

These are the typed hand-offs referenced in
``docs/design/phase-d12-to-e.md`` §5.2. Phase D12 only uses a subset:

* ``EntrySignal``    — Layer 2 output (classifier / pattern hit)
* ``OpenPosition``   — live position state inside the Portfolio
* ``ExecutedTrade``  — closed-trade record fed into metrics

The richer ``FilteredSignal`` / ``TradeCandidate`` types from §5.2 are
reserved for Phase D13 (signals module refactor) and are intentionally
not implemented here to avoid dead code.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pandas as pd


Direction = Literal["long", "short"]
ExitReason = Literal["target", "stop", "timeout", "forced_close"]


@dataclass(frozen=True)
class EntrySignal:
    """A classifier or pattern-matcher's proposal to enter a trade.

    The ``timestamp`` is the **bar on which the signal fired**; the
    actual entry fill happens at the open of this bar (see
    ``scanner/pnl.walk_one_trade``'s contract).
    """

    symbol: str
    timestamp: pd.Timestamp
    direction: Direction
    predicted_prob: float
    source_model: str


@dataclass
class OpenPosition:
    """A live position held by the Portfolio.

    Not frozen — ``last_mark_price`` and ``unrealized_pnl_pct`` are
    updated as new bars arrive. All other fields are set at entry
    time and treated as read-only by convention.
    """

    symbol: str
    direction: Direction
    entry_time: pd.Timestamp
    entry_price_raw: float
    entry_price_exec: float
    size_units: float
    notional_usd: float
    stop_price: float
    target_price: float
    source_model: str
    last_mark_price: float
    unrealized_pnl_pct: float = 0.0

    def update_mark(self, price: float) -> None:
        """Refresh ``last_mark_price`` and ``unrealized_pnl_pct`` in place."""
        self.last_mark_price = price
        if self.direction == "long":
            self.unrealized_pnl_pct = (price - self.entry_price_raw) / self.entry_price_raw
        else:
            self.unrealized_pnl_pct = (self.entry_price_raw - price) / self.entry_price_raw


@dataclass(frozen=True)
class ExecutedTrade:
    """A closed trade — what ``backtest.metrics`` aggregates."""

    symbol: str
    direction: Direction
    source_model: str
    entry_time: pd.Timestamp
    entry_price_raw: float
    entry_price_exec: float
    exit_time: pd.Timestamp
    exit_price_raw: float
    exit_price_exec: float
    notional_usd: float
    size_units: float
    gross_pnl_pct: float
    fee_pct_total: float
    slippage_pct_total: float
    realized_pnl_pct: float
    realized_pnl_usd: float
    exit_reason: ExitReason
    bars_to_exit: int
