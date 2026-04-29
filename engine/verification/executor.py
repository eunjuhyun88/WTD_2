from __future__ import annotations

import math

from ledger.store import LedgerRecordStore
from ledger.types import OutcomePayload

from .types import PaperTrade, PaperVerificationResult

_MIN_TRADES = 10
_MIN_WIN_RATE = 0.55
# annualisation factor: sqrt(365 * 24 / 4) for 4-hour bars
_ANNUALISE = math.sqrt(365 * 24 / 4)


def run_paper_verification(
    slug: str,
    store: LedgerRecordStore,
) -> PaperVerificationResult:
    records = store.list(slug, record_type="outcome")
    trades: list[PaperTrade] = []
    for r in records:
        payload = OutcomePayload.from_dict(r.payload)
        outcome = (payload.outcome or "").lower()
        if outcome not in ("hit", "miss", "expired"):
            continue
        trades.append(
            PaperTrade(
                outcome_id=r.id,
                symbol=r.symbol,
                outcome=outcome,
                exit_return_pct=payload.exit_return_pct or 0.0,
                duration_hours=payload.duration_hours or 0.0,
                max_gain_pct=payload.max_gain_pct or 0.0,
            )
        )
    return _compute_result(slug, trades)


def _compute_result(slug: str, trades: list[PaperTrade]) -> PaperVerificationResult:
    n = len(trades)
    if n == 0:
        return PaperVerificationResult(
            pattern_slug=slug,
            n_trades=0,
            n_hit=0,
            n_miss=0,
            n_expired=0,
            win_rate=0.0,
            avg_return_pct=0.0,
            sharpe=float("nan"),
            max_drawdown_pct=0.0,
            expectancy_pct=0.0,
            avg_duration_hours=0.0,
            pass_gate=False,
            gate_reasons=["n_trades=0 < 10"],
        )

    n_hit = sum(1 for t in trades if t.outcome == "hit")
    n_miss = sum(1 for t in trades if t.outcome == "miss")
    n_expired = sum(1 for t in trades if t.outcome == "expired")

    countable = [t for t in trades if t.outcome in ("hit", "miss")]
    n_countable = len(countable)
    win_rate = n_hit / n_countable if n_countable > 0 else 0.0

    returns = [t.exit_return_pct for t in trades]
    avg_return = sum(returns) / n
    sharpe = _sharpe(returns)
    drawdown = _max_drawdown(returns)
    avg_dur = sum(t.duration_hours for t in trades) / n

    hit_avg = (
        sum(t.exit_return_pct for t in countable if t.outcome == "hit") / n_hit
        if n_hit
        else 0.0
    )
    miss_avg = (
        sum(t.exit_return_pct for t in countable if t.outcome == "miss") / n_miss
        if n_miss
        else 0.0
    )
    expectancy = win_rate * hit_avg + (1 - win_rate) * miss_avg

    gate_reasons: list[str] = []
    if n < _MIN_TRADES:
        gate_reasons.append(f"n_trades={n} < {_MIN_TRADES}")
    if win_rate < _MIN_WIN_RATE:
        gate_reasons.append(f"win_rate={win_rate:.3f} < {_MIN_WIN_RATE}")

    return PaperVerificationResult(
        pattern_slug=slug,
        n_trades=n,
        n_hit=n_hit,
        n_miss=n_miss,
        n_expired=n_expired,
        win_rate=win_rate,
        avg_return_pct=avg_return,
        sharpe=sharpe,
        max_drawdown_pct=drawdown,
        expectancy_pct=expectancy,
        avg_duration_hours=avg_dur,
        pass_gate=len(gate_reasons) == 0,
        gate_reasons=gate_reasons,
    )


def _sharpe(returns: list[float]) -> float:
    n = len(returns)
    if n < 2:
        return float("nan")
    mean = sum(returns) / n
    var = sum((r - mean) ** 2 for r in returns) / (n - 1)
    std = math.sqrt(var)
    if std == 0:
        return float("nan")
    return (mean / std) * _ANNUALISE


def _max_drawdown(returns: list[float]) -> float:
    """Peak-to-trough drawdown on cumulative product curve. Returns ≤ 0."""
    if not returns:
        return 0.0
    equity = 1.0
    peak = 1.0
    max_dd = 0.0
    for r in returns:
        equity *= 1 + r
        if equity > peak:
            peak = equity
        dd = (equity - peak) / peak
        if dd < max_dd:
            max_dd = dd
    return max_dd
