"""Full historical pattern backtest — W-0104.

Runs the pattern state machine bar-by-bar across the full cached history
for every symbol in a universe, collects ALL entry_phase transitions, and
measures forward returns at each signal.

Unlike benchmark_search (which evaluates hand-picked cases), this produces
unbiased population statistics:

    n_signals  : how often the pattern fires
    win_rate   : fraction where 72h forward return > 0
    avg_return : mean 72h forward return across all signals
    hit_rate   : fraction where price reaches the target_pct within forward_bars

Usage::

    from research.backtest import run_pattern_backtest
    result = run_pattern_backtest(
        "tradoor-oi-reversal-v1",
        universe=["BTCUSDT", "ETHUSDT", ...],
        since=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )
    print(result.summary())
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

log = logging.getLogger("engine.research.backtest")

# Default look-forward horizon (bars at the pattern's native timeframe)
DEFAULT_FORWARD_BARS = 72   # 72 × 1h = 3 days


@dataclass
class BacktestSignal:
    symbol: str
    pattern_slug: str
    entry_time: datetime
    entry_price: float
    fwd_return_24h: Optional[float] = None
    fwd_return_48h: Optional[float] = None
    fwd_return_72h: Optional[float] = None
    fwd_peak_pct: Optional[float] = None   # max peak within forward_bars
    target_hit: bool = False               # reached target_pct?


@dataclass
class BacktestResult:
    pattern_slug: str
    timeframe: str
    universe_size: int
    since: Optional[datetime]
    forward_bars: int
    target_pct: float
    signals: list[BacktestSignal] = field(default_factory=list)

    # ── derived stats ────────────────────────────────────────────────────────

    @property
    def n_signals(self) -> int:
        return len(self.signals)

    @property
    def win_rate(self) -> Optional[float]:
        """Fraction of signals with positive 72h return."""
        scored = [s for s in self.signals if s.fwd_return_72h is not None]
        if not scored:
            return None
        return sum(1 for s in scored if s.fwd_return_72h > 0) / len(scored)

    @property
    def avg_return_72h(self) -> Optional[float]:
        vals = [s.fwd_return_72h for s in self.signals if s.fwd_return_72h is not None]
        return sum(vals) / len(vals) if vals else None

    @property
    def avg_peak_pct(self) -> Optional[float]:
        vals = [s.fwd_peak_pct for s in self.signals if s.fwd_peak_pct is not None]
        return sum(vals) / len(vals) if vals else None

    @property
    def hit_rate(self) -> Optional[float]:
        if not self.signals:
            return None
        return sum(1 for s in self.signals if s.target_hit) / len(self.signals)

    def summary(self) -> str:
        lines = [
            f"pattern   : {self.pattern_slug}",
            f"timeframe : {self.timeframe}",
            f"universe  : {self.universe_size} symbols",
            f"since     : {self.since.date() if self.since else 'all'}",
            f"n_signals : {self.n_signals}",
        ]
        if self.n_signals:
            wr = self.win_rate
            ar = self.avg_return_72h
            hr = self.hit_rate
            ap = self.avg_peak_pct
            lines += [
                f"win_rate  : {wr:.1%}" if wr is not None else "win_rate  : N/A",
                f"avg_72h   : {ar:+.1%}" if ar is not None else "avg_72h   : N/A",
                f"hit_rate  : {hr:.1%}  (target={self.target_pct:.0%})" if hr is not None else "hit_rate  : N/A",
                f"avg_peak  : {ap:+.1%}" if ap is not None else "avg_peak  : N/A",
            ]
        return "\n".join(lines)


# ── helpers ──────────────────────────────────────────────────────────────────

def _measure_fwd(
    klines: pd.DataFrame,
    entry_idx: int,
    forward_bars: int,
    target_pct: float,
) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float], bool]:
    """Return (fwd_24h, fwd_48h, fwd_72h, peak_pct, target_hit) from entry_idx."""
    entry_close = float(klines.iloc[entry_idx]["close"])
    if entry_close <= 0:
        return None, None, None, None, False

    end_idx = min(entry_idx + forward_bars + 1, len(klines))
    fwd_slice = klines.iloc[entry_idx + 1 : end_idx]

    def _ret(n: int) -> Optional[float]:
        idx = entry_idx + n
        if idx >= len(klines):
            return None
        return float(klines.iloc[idx]["close"]) / entry_close - 1

    peak_pct: Optional[float] = None
    target_hit = False
    if not fwd_slice.empty:
        peak = float(fwd_slice["high"].max())
        peak_pct = peak / entry_close - 1
        target_hit = peak_pct >= target_pct

    return _ret(24), _ret(48), _ret(72), peak_pct, target_hit


# ── core ─────────────────────────────────────────────────────────────────────

def _scan_symbol(
    pattern_slug: str,
    symbol: str,
    *,
    timeframe: str,
    since: Optional[datetime],
    forward_bars: int,
    target_pct: float,
) -> list[BacktestSignal]:
    """Run pattern state machine across full history for one symbol."""
    from data_cache.loader import load_klines, load_perp
    from patterns.library import get_pattern
    from patterns.state_machine import PatternStateMachine
    from scanner.feature_calc import compute_features_table
    from scoring.block_evaluator import evaluate_block_masks

    try:
        klines = load_klines(symbol, timeframe)
    except Exception as exc:
        log.debug("load_klines failed for %s: %s", symbol, exc)
        return []

    if klines.empty:
        return []

    # Optional perp data — failure is fine, feature_calc uses neutral defaults
    try:
        perp = load_perp(symbol)
    except Exception:
        perp = None

    try:
        features = compute_features_table(klines, symbol, perp=perp)
    except Exception as exc:
        log.debug("compute_features_table failed for %s: %s", symbol, exc)
        return []

    if features.empty:
        return []

    # Filter to since
    if since is not None:
        features = features[features.index >= since]
        klines = klines[klines.index >= since]
    if features.empty:
        return []

    try:
        pattern = get_pattern(pattern_slug)
    except KeyError:
        log.warning("Unknown pattern slug: %s", pattern_slug)
        return []

    masks = evaluate_block_masks(features, klines, symbol)
    machine = PatternStateMachine(pattern)
    machine.reset_symbol(symbol)

    signals: list[BacktestSignal] = []
    prev_phase = "NONE"

    for idx in range(len(features)):
        ts = features.index[idx]
        timestamp = ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts

        blocks_triggered = [
            name
            for name, mask in masks.items()
            if len(mask) > idx and bool(mask.iloc[idx])
        ]

        machine.evaluate(
            symbol=symbol,
            blocks_triggered=blocks_triggered,
            timestamp=timestamp,
            feature_snapshot={},
            trigger_bar_ts=timestamp,
            data_quality={"has_perp": perp is not None},
        )

        state = machine.get_symbol_state(symbol)
        if state is not None:
            curr_phase = pattern.phases[state.current_phase_idx].phase_id
        else:
            curr_phase = "NONE"

        # Detect fresh entry_phase transition
        if curr_phase == pattern.entry_phase and prev_phase != pattern.entry_phase:
            # Find the matching bar in original (unfiltered) klines for fwd calc
            try:
                klines_idx = klines.index.get_loc(ts)
            except KeyError:
                klines_idx = idx

            fwd_24h, fwd_48h, fwd_72h, peak_pct, target_hit = _measure_fwd(
                klines, klines_idx, forward_bars, target_pct
            )
            entry_price = float(klines.iloc[klines_idx]["close"])
            signals.append(BacktestSignal(
                symbol=symbol,
                pattern_slug=pattern_slug,
                entry_time=timestamp,
                entry_price=entry_price,
                fwd_return_24h=fwd_24h,
                fwd_return_48h=fwd_48h,
                fwd_return_72h=fwd_72h,
                fwd_peak_pct=peak_pct,
                target_hit=target_hit,
            ))

        prev_phase = curr_phase

    return signals


def run_pattern_backtest(
    pattern_slug: str,
    universe: list[str],
    *,
    timeframe: str = "1h",
    since: Optional[datetime] = None,
    forward_bars: int = DEFAULT_FORWARD_BARS,
    target_pct: Optional[float] = None,
) -> BacktestResult:
    """Run full historical backtest for one pattern across the universe.

    Args:
        pattern_slug: e.g. "tradoor-oi-reversal-v1"
        universe: list of symbol strings
        timeframe: kline timeframe (default "1h")
        since: only consider bars from this datetime onward
        forward_bars: how many bars ahead to measure returns
        target_pct: win threshold for target_hit (default: from alerts_pattern levels)

    Returns:
        BacktestResult with per-signal detail and population statistics.
    """
    from scanner.alerts_pattern import _PATTERN_LEVELS, _DEFAULT_LEVELS

    if target_pct is None:
        lvl = _PATTERN_LEVELS.get(pattern_slug, _DEFAULT_LEVELS)
        target_pct = lvl["target_pct"]

    if since is None:
        from datetime import timedelta
        since = datetime.now(timezone.utc) - timedelta(days=365)

    all_signals: list[BacktestSignal] = []
    for symbol in universe:
        log.info("Backtesting %s on %s...", pattern_slug, symbol)
        sigs = _scan_symbol(
            pattern_slug, symbol,
            timeframe=timeframe,
            since=since,
            forward_bars=forward_bars,
            target_pct=target_pct,
        )
        if sigs:
            log.info("  %s: %d signals", symbol, len(sigs))
        all_signals.extend(sigs)

    return BacktestResult(
        pattern_slug=pattern_slug,
        timeframe=timeframe,
        universe_size=len(universe),
        since=since,
        forward_bars=forward_bars,
        target_pct=target_pct,
        signals=all_signals,
    )
