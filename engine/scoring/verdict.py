"""Auto Verdict: determine trade outcome from price movement.

Design (from cogochi-v7 spec):
    HIT  = price moves ≥ +target% in the signal direction within horizon
    MISS = price moves ≥ -stop% against the signal direction within horizon
    VOID = neither target nor stop hit within horizon (timeout)

This is the ground-truth labeller for the feedback loop:
    Signal → Wait → Verdict → trade_log → Hill Climbing → Retrain

Two modes:
    1. verdict_from_bars() — historical: given a bar series after signal, compute verdict
    2. VerdictTracker       — live: accumulate bars and emit verdict when resolved

The verdict uses pessimistic intrabar evaluation (ADR-002):
    - For longs: check if LOW hits stop BEFORE checking if HIGH hits target
    - For shorts: check if HIGH hits stop BEFORE checking if LOW hits target
    - If both stop and target are touched in the same bar, it's a MISS (pessimistic)
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional

import numpy as np
import pandas as pd


class VerdictOutcome(str, Enum):
    HIT = "hit"       # reached target
    MISS = "miss"     # hit stop loss
    VOID = "void"     # timed out (neither hit)
    PENDING = "pending"  # not yet resolved (live tracking)


@dataclass(frozen=True)
class Verdict:
    """Outcome of a signal evaluation."""
    outcome: VerdictOutcome
    pnl_pct: float              # realized PnL as fraction (e.g., 0.02 = +2%)
    bars_held: int              # how many bars until resolution
    exit_price: float           # price at resolution
    max_favorable: float        # best unrealized PnL during trade (MFE)
    max_adverse: float          # worst unrealized PnL during trade (MAE)
    direction: str              # "long" or "short"

    def to_dict(self) -> dict:
        return {
            "outcome": self.outcome.value,
            "pnl_pct": round(self.pnl_pct, 6),
            "bars_held": self.bars_held,
            "exit_price": round(self.exit_price, 8),
            "max_favorable": round(self.max_favorable, 6),
            "max_adverse": round(self.max_adverse, 6),
            "direction": self.direction,
        }


def verdict_from_bars(
    entry_price: float,
    bars: pd.DataFrame,
    *,
    direction: str = "long",
    target_pct: float = 0.01,   # +1% default (from spec)
    stop_pct: float = 0.01,     # -1% default (from spec)
    max_bars: int = 24,         # 24h horizon at 1h bars
) -> Verdict:
    """Compute verdict from historical OHLCV bars after signal.

    Args:
        entry_price: price at signal bar close.
        bars:        DataFrame with columns [open, high, low, close].
                     Must start from the bar AFTER the signal bar.
        direction:   "long" or "short".
        target_pct:  fraction to reach for HIT (e.g., 0.01 = 1%).
        stop_pct:    fraction to reach for MISS (e.g., 0.01 = 1%).
        max_bars:    maximum bars to wait before VOID.

    Returns:
        Verdict with outcome, PnL, and trade statistics.
    """
    if len(bars) == 0:
        return Verdict(
            outcome=VerdictOutcome.PENDING,
            pnl_pct=0.0, bars_held=0, exit_price=entry_price,
            max_favorable=0.0, max_adverse=0.0, direction=direction,
        )

    is_long = direction == "long"
    target_price = entry_price * (1 + target_pct) if is_long else entry_price * (1 - target_pct)
    stop_price = entry_price * (1 - stop_pct) if is_long else entry_price * (1 + stop_pct)

    max_favorable = 0.0
    max_adverse = 0.0
    n_bars = min(len(bars), max_bars)

    for i in range(n_bars):
        bar = bars.iloc[i]
        h, l, c = float(bar["high"]), float(bar["low"]), float(bar["close"])

        if is_long:
            # Pessimistic: check stop (low) before target (high)
            bar_pnl_low = (l - entry_price) / entry_price
            bar_pnl_high = (h - entry_price) / entry_price
            bar_pnl_close = (c - entry_price) / entry_price

            max_favorable = max(max_favorable, bar_pnl_high)
            max_adverse = min(max_adverse, bar_pnl_low)

            # Stop hit?
            if l <= stop_price:
                return Verdict(
                    outcome=VerdictOutcome.MISS,
                    pnl_pct=-stop_pct,
                    bars_held=i + 1,
                    exit_price=stop_price,
                    max_favorable=max_favorable,
                    max_adverse=max_adverse,
                    direction=direction,
                )
            # Target hit?
            if h >= target_price:
                return Verdict(
                    outcome=VerdictOutcome.HIT,
                    pnl_pct=target_pct,
                    bars_held=i + 1,
                    exit_price=target_price,
                    max_favorable=max_favorable,
                    max_adverse=max_adverse,
                    direction=direction,
                )
        else:
            # Short: check stop (high) before target (low)
            bar_pnl_high = (entry_price - h) / entry_price
            bar_pnl_low = (entry_price - l) / entry_price
            bar_pnl_close = (entry_price - c) / entry_price

            max_favorable = max(max_favorable, bar_pnl_low)
            max_adverse = min(max_adverse, bar_pnl_high)

            # Stop hit?
            if h >= stop_price:
                return Verdict(
                    outcome=VerdictOutcome.MISS,
                    pnl_pct=-stop_pct,
                    bars_held=i + 1,
                    exit_price=stop_price,
                    max_favorable=max_favorable,
                    max_adverse=max_adverse,
                    direction=direction,
                )
            # Target hit?
            if l <= target_price:
                return Verdict(
                    outcome=VerdictOutcome.HIT,
                    pnl_pct=target_pct,
                    bars_held=i + 1,
                    exit_price=target_price,
                    max_favorable=max_favorable,
                    max_adverse=max_adverse,
                    direction=direction,
                )

    # If we haven't exhausted max_bars yet, it's still pending
    last_close = float(bars.iloc[n_bars - 1]["close"])
    if is_long:
        final_pnl = (last_close - entry_price) / entry_price
    else:
        final_pnl = (entry_price - last_close) / entry_price

    # VOID only if we've seen all max_bars; otherwise PENDING
    is_complete = len(bars) >= max_bars
    outcome = VerdictOutcome.VOID if is_complete else VerdictOutcome.PENDING

    return Verdict(
        outcome=outcome,
        pnl_pct=final_pnl,
        bars_held=n_bars,
        exit_price=last_close,
        max_favorable=max_favorable,
        max_adverse=max_adverse,
        direction=direction,
    )


class VerdictTracker:
    """Live verdict tracker — feed bars one at a time.

    Usage:
        tracker = VerdictTracker(entry_price=50000, direction="long")
        for bar in live_bars:
            verdict = tracker.feed(bar)
            if verdict.outcome != VerdictOutcome.PENDING:
                save_to_trade_log(verdict)
                break
    """

    def __init__(
        self,
        entry_price: float,
        direction: str = "long",
        target_pct: float = 0.01,
        stop_pct: float = 0.01,
        max_bars: int = 24,
    ) -> None:
        self.entry_price = entry_price
        self.direction = direction
        self.target_pct = target_pct
        self.stop_pct = stop_pct
        self.max_bars = max_bars
        self._bars: list[dict] = []
        self._resolved: Optional[Verdict] = None

    @property
    def is_resolved(self) -> bool:
        return self._resolved is not None

    @property
    def result(self) -> Optional[Verdict]:
        return self._resolved

    def feed(self, high: float, low: float, close: float) -> Verdict:
        """Feed one bar and check for resolution.

        Returns Verdict with PENDING if not yet resolved.
        """
        if self._resolved is not None:
            return self._resolved

        self._bars.append({"high": high, "low": low, "close": close})
        bars_df = pd.DataFrame(self._bars)

        verdict = verdict_from_bars(
            self.entry_price, bars_df,
            direction=self.direction,
            target_pct=self.target_pct,
            stop_pct=self.stop_pct,
            max_bars=self.max_bars,
        )

        if verdict.outcome != VerdictOutcome.PENDING:
            self._resolved = verdict

        return verdict
