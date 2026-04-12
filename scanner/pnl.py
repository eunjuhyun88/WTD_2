"""Realistic single-trade execution simulation.

This module owns the ground-truth translation from
``(entry_bar, direction, stop, target, horizon)`` into a
``realized_pnl_pct`` that a Quant Trader would trust. See ADR-002
(``docs/adr/002-pnl-measurement.md``) for the measurement choices
(pessimistic intrabar ordering, taker fees, sqrt-impact slippage).

Contract:

* ``walk_one_trade`` is a **pure function**. Same inputs → same
  outputs, no I/O, no mutation of the ``klines`` DataFrame.
* Entry price is the **open of the entry bar**. Any stop/target touch
  on the entry bar itself counts (the entry happens at open, so the
  bar's subsequent range is real post-entry action).
* ``horizon_bars`` is **inclusive of the entry bar**: ``horizon_bars=1``
  means "hold at most one bar". If neither stop nor target is touched
  within the window, the exit is forced at the **close** of the last
  bar and ``exit_reason`` is ``"timeout"``.
* Slippage is charged on both entry and exit as a single price
  adjustment. Fees are charged on both sides as a percent and reported
  in ``fee_pct_total``. ``realized_pnl_pct`` equals
  ``gross_pnl_pct - fee_pct_total - slippage_pct_total``.

``walk_one_trade`` is called once per entry signal by the backtest
simulator. On a 115-signal run it is trivial; on a 10k-signal run it
dominates the cost of the walk. Keep it branch-free where practical
and avoid allocating new arrays inside the loop.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pandas as pd

from exceptions import InsufficientDataError


IntrabarOrder = Literal["pessimistic", "optimistic", "body_based"]
Direction = Literal["long", "short"]
FeeMode = Literal["maker", "taker", "round_trip_avg"]
ExitReason = Literal["target", "stop", "timeout"]


@dataclass(frozen=True)
class ExecutionCosts:
    """Fee and slippage model parameters.

    Defaults: 5 bps taker fee each side, 2 bps base slippage, sqrt-impact
    slippage above 1% of ADV with coefficient ``k=0.1``. See ADR-002.
    """

    fee_maker_pct: float = 0.0002
    fee_taker_pct: float = 0.0005
    use_fee: FeeMode = "taker"
    base_slippage_pct: float = 0.0002
    adv_notional_fraction_threshold: float = 0.01
    impact_k: float = 0.1


@dataclass(frozen=True)
class TradeResult:
    """Fully specified outcome of a single simulated trade."""

    entry_time: pd.Timestamp
    entry_pos: int
    direction: Direction
    entry_price_raw: float
    entry_price_exec: float
    exit_time: pd.Timestamp
    exit_pos: int
    exit_price_raw: float
    exit_price_exec: float
    gross_pnl_pct: float
    fee_pct_total: float
    slippage_pct_total: float
    realized_pnl_pct: float
    exit_reason: ExitReason
    bars_to_exit: int


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _compute_slippage_pct(
    notional_usd: float,
    adv_notional_usd: float,
    costs: ExecutionCosts,
) -> float:
    """Return one-side slippage as a fraction.

    ``base`` below the ADV threshold; ``base + k * sqrt(frac)`` above.
    ``frac`` is clamped to ``1e-6`` to avoid numerical noise for tiny
    notionals. See ADR-002 §"Slippage model".
    """
    base = costs.base_slippage_pct
    if notional_usd <= 0:
        return base
    if adv_notional_usd <= 0:
        # We refuse to extrapolate without ADV info — assume the trade
        # is small relative to an unknown book and charge the base.
        return base
    frac = notional_usd / adv_notional_usd
    if frac < costs.adv_notional_fraction_threshold:
        return base
    return base + costs.impact_k * (frac ** 0.5)


def _resolve_fee_single_side(costs: ExecutionCosts) -> float:
    if costs.use_fee == "maker":
        return costs.fee_maker_pct
    if costs.use_fee == "taker":
        return costs.fee_taker_pct
    if costs.use_fee == "round_trip_avg":
        return (costs.fee_maker_pct + costs.fee_taker_pct) / 2
    raise ValueError(f"unknown use_fee mode: {costs.use_fee!r}")


def _resolve_intrabar_hit(
    direction: Direction,
    target_touched: bool,
    stop_touched: bool,
    bar_open: float,
    bar_close: float,
    intrabar_order: IntrabarOrder,
) -> ExitReason | None:
    """Decide which of (target, stop, neither) fires on a single bar."""
    if not target_touched and not stop_touched:
        return None
    if target_touched and not stop_touched:
        return "target"
    if stop_touched and not target_touched:
        return "stop"
    # Both touched — resolve by the ordering policy.
    if intrabar_order == "pessimistic":
        return "stop"
    if intrabar_order == "optimistic":
        return "target"
    if intrabar_order == "body_based":
        # If the bar closed above its open, price rose net — assume long
        # hit target before stop. Mirror for shorts.
        rose = bar_close > bar_open
        if direction == "long":
            return "target" if rose else "stop"
        return "target" if not rose else "stop"
    raise ValueError(f"unknown intrabar_order: {intrabar_order!r}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def walk_one_trade(
    klines: pd.DataFrame,
    entry_pos: int,
    direction: Direction,
    target_pct: float,
    stop_pct: float,
    horizon_bars: int,
    notional_usd: float,
    adv_notional_usd: float,
    costs: ExecutionCosts,
    intrabar_order: IntrabarOrder = "pessimistic",
) -> TradeResult:
    """Walk a single trade forward and return the realized outcome.

    Args:
        klines: OHLC DataFrame with columns ``open``, ``high``, ``low``,
            ``close`` and a datetime-like index. Not mutated.
        entry_pos: Integer row index of the entry bar. Entry fills at
            the **open** of this bar.
        direction: ``"long"`` or ``"short"``.
        target_pct: Target distance as a positive fraction of the entry
            price (e.g. ``0.04`` = 4%).
        stop_pct: Stop distance as a positive fraction of the entry
            price (e.g. ``0.02`` = 2%).
        horizon_bars: Maximum number of bars (inclusive of entry bar)
            to hold the trade. At the end of the window the trade is
            closed at the close price of the last bar (``"timeout"``).
        notional_usd: Dollar notional of the trade. Used to compute
            slippage via the ADV fraction.
        adv_notional_usd: Average daily notional for the symbol. Pass
            ``0`` if unknown — slippage will fall back to ``base``.
        costs: Execution cost model parameters.
        intrabar_order: How to resolve a bar where both stop and target
            are touched. Defaults to the pessimistic "stop wins" policy
            (see ADR-002).

    Returns:
        A fully populated ``TradeResult``.

    Raises:
        ValueError: on obviously invalid inputs (bad direction, negative
            target/stop).
        IndexError: if ``entry_pos`` is outside the range of ``klines``.
        InsufficientDataError: if ``entry_pos + horizon_bars`` exceeds
            the length of ``klines``.
    """
    if direction not in ("long", "short"):
        raise ValueError(f"direction must be 'long' or 'short', got {direction!r}")
    if target_pct <= 0:
        raise ValueError(f"target_pct must be > 0, got {target_pct}")
    if stop_pct <= 0:
        raise ValueError(f"stop_pct must be > 0, got {stop_pct}")
    if horizon_bars < 1:
        raise ValueError(f"horizon_bars must be >= 1, got {horizon_bars}")

    n = len(klines)
    if entry_pos < 0 or entry_pos >= n:
        raise IndexError(f"entry_pos {entry_pos} out of range [0, {n})")
    if entry_pos + horizon_bars > n:
        raise InsufficientDataError(
            f"entry_pos {entry_pos} + horizon_bars {horizon_bars} > "
            f"len(klines) {n}"
        )

    opens = klines["open"].to_numpy(dtype=float)
    highs = klines["high"].to_numpy(dtype=float)
    lows = klines["low"].to_numpy(dtype=float)
    closes = klines["close"].to_numpy(dtype=float)
    index = klines.index

    entry_raw = float(opens[entry_pos])
    slippage_pct = _compute_slippage_pct(notional_usd, adv_notional_usd, costs)

    sign_entry = 1.0 if direction == "long" else -1.0
    entry_exec = entry_raw * (1.0 + sign_entry * slippage_pct)

    if direction == "long":
        target_level = entry_raw * (1.0 + target_pct)
        stop_level = entry_raw * (1.0 - stop_pct)
    else:
        target_level = entry_raw * (1.0 - target_pct)
        stop_level = entry_raw * (1.0 + stop_pct)

    end_pos = entry_pos + horizon_bars  # exclusive
    exit_pos: int | None = None
    exit_raw: float | None = None
    exit_reason: ExitReason | None = None

    for i in range(entry_pos, end_pos):
        h = highs[i]
        lo = lows[i]
        if direction == "long":
            target_touched = h >= target_level
            stop_touched = lo <= stop_level
        else:
            target_touched = lo <= target_level
            stop_touched = h >= stop_level

        hit = _resolve_intrabar_hit(
            direction=direction,
            target_touched=bool(target_touched),
            stop_touched=bool(stop_touched),
            bar_open=float(opens[i]),
            bar_close=float(closes[i]),
            intrabar_order=intrabar_order,
        )

        if hit == "target":
            exit_pos = i
            exit_raw = target_level
            exit_reason = "target"
            break
        if hit == "stop":
            exit_pos = i
            exit_raw = stop_level
            exit_reason = "stop"
            break

    if exit_pos is None:
        exit_pos = end_pos - 1
        exit_raw = float(closes[exit_pos])
        exit_reason = "timeout"

    assert exit_raw is not None and exit_reason is not None
    sign_exit = -sign_entry  # exit moves us adverse to entry direction
    exit_exec = exit_raw * (1.0 + sign_exit * slippage_pct)

    if direction == "long":
        gross_pnl_pct = (exit_raw - entry_raw) / entry_raw
    else:
        gross_pnl_pct = (entry_raw - exit_raw) / entry_raw

    fee_single = _resolve_fee_single_side(costs)
    fee_pct_total = 2.0 * fee_single
    slippage_pct_total = 2.0 * slippage_pct
    realized_pnl_pct = gross_pnl_pct - fee_pct_total - slippage_pct_total

    return TradeResult(
        entry_time=index[entry_pos],
        entry_pos=entry_pos,
        direction=direction,
        entry_price_raw=entry_raw,
        entry_price_exec=float(entry_exec),
        exit_time=index[exit_pos],
        exit_pos=int(exit_pos),
        exit_price_raw=float(exit_raw),
        exit_price_exec=float(exit_exec),
        gross_pnl_pct=float(gross_pnl_pct),
        fee_pct_total=float(fee_pct_total),
        slippage_pct_total=float(slippage_pct_total),
        realized_pnl_pct=float(realized_pnl_pct),
        exit_reason=exit_reason,
        bars_to_exit=int(exit_pos - entry_pos),
    )
