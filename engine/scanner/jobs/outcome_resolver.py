"""Outcome resolver — closes flywheel axis 1→2 (capture → outcome).

Runs hourly. For every CaptureRecord with ``status='pending_outcome'``
whose evaluation window has elapsed, this job:

  1. Loads OHLCV for (symbol, timeframe) from data_cache
  2. Derives entry_price from the bar at/after captured_at_ms
  3. Applies engine.patterns.outcome_policy.decide_outcome to the
     forward close series inside the evaluation window
  4. Creates a PatternOutcome, saves it, appends LEDGER:outcome
  5. Updates the capture: status='outcome_ready', outcome_id set
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from capture.store import CaptureStore, now_ms
from capture.types import CaptureRecord
from ledger.store import LEDGER_RECORD_STORE, LedgerRecordStore, LedgerStore, get_ledger_store
from ledger.types import PatternOutcome
from patterns.definition_refs import build_definition_ref, definition_id_from_ref
from patterns.outcome_policy import (
    DEFAULT_EVAL_WINDOW_HOURS,
    OutcomeDecision,
    OutcomePolicy,
    decide_outcome,
    policy_for,
)

log = logging.getLogger("engine.scanner.jobs.outcome_resolver")


def _entry_and_forward_closes(
    *,
    klines,
    captured_at: datetime,
    window_hours: float,
) -> tuple[float | None, list[float]]:
    """Return (entry_price, forward_closes) inside the evaluation window.

    entry_price = close of first bar at/after captured_at. forward_closes
    includes the entry bar (index 0) plus all subsequent bars inside the
    window. Returns (None, []) when no bar sits in range.
    """
    if klines is None or klines.empty:
        return None, []
    index = klines.index
    tz = getattr(index, "tz", None)
    if tz is not None and captured_at.tzinfo is None:
        captured_at = captured_at.replace(tzinfo=timezone.utc)
    elif tz is None and captured_at.tzinfo is not None:
        captured_at = captured_at.astimezone(timezone.utc).replace(tzinfo=None)

    entry_mask = index >= captured_at
    if not entry_mask.any():
        return None, []
    entry_pos = int(entry_mask.nonzero()[0][0])
    window_close = klines.iloc[entry_pos:]
    limit = window_close.index[0] + timedelta(hours=window_hours)
    window_close = window_close.loc[window_close.index <= limit]
    if window_close.empty or "close" not in window_close.columns:
        return None, []

    closes = [float(x) for x in window_close["close"].tolist()]
    if not closes:
        return None, []
    return closes[0], closes


def _build_pattern_outcome(
    *,
    capture: CaptureRecord,
    decision: OutcomeDecision,
    accumulation_at: datetime,
    window_hours: float,
) -> PatternOutcome:
    definition_ref = capture.definition_ref or build_definition_ref(
        capture.pattern_slug,
        pattern_version=capture.pattern_version,
    )
    return PatternOutcome(
        pattern_slug=capture.pattern_slug or "unknown",
        pattern_version=capture.pattern_version,
        definition_id=capture.definition_id or definition_id_from_ref(definition_ref),
        definition_ref=definition_ref,
        symbol=capture.symbol,
        user_id=capture.user_id,
        accumulation_at=accumulation_at,
        entry_price=decision.entry_price,
        peak_price=decision.peak_price,
        exit_price=decision.exit_price,
        outcome=decision.outcome,
        max_gain_pct=decision.max_gain_pct,
        exit_return_pct=decision.exit_return_pct,
        entry_transition_id=capture.candidate_transition_id,
        entry_scan_id=capture.scan_id,
        entry_block_scores=capture.block_scores or None,
        feature_snapshot=capture.feature_snapshot,
        evaluation_window_hours=window_hours,
    )


def _write_pnl_to_ledger_outcomes(
    *,
    outcome_id: str,
    ohlcv: "pd.DataFrame",
    capture: "CaptureRecord",
    policy: "OutcomePolicy",
) -> None:
    """Compute realized P&L via simulate_trade and update ledger_outcomes row."""
    import pandas as pd
    from pnl.pnl_compute import simulate_trade
    from pnl.cost_model import DEFAULT_TIER
    from ledger.supabase_record_store import _sb

    if ohlcv is None or ohlcv.empty:
        return

    captured_at_ms = capture.captured_at_ms
    cap_dt = pd.Timestamp(captured_at_ms / 1000, unit="s", tz="UTC")

    # Align index timezone
    idx = ohlcv.index
    if idx.tzinfo is None:
        idx = idx.tz_localize("UTC")
        ohlcv = ohlcv.copy()
        ohlcv.index = idx

    mask = idx >= cap_dt
    if not mask.any():
        return
    entry_bar_idx = int(mask.nonzero()[0][0])
    # simulate_trade needs entry_bar_idx+1 to exist
    if entry_bar_idx + 1 >= len(ohlcv):
        return

    # direction: default long (CaptureRecord has no direction field)
    direction: int = 1

    entry_px = float(ohlcv.iloc[entry_bar_idx + 1]["open"])
    stop_px = entry_px * (1.0 - abs(policy.miss_threshold_pct))
    target_px = entry_px * (1.0 + policy.hit_threshold_pct)
    horizon_bars = max(1, int(policy.evaluation_window_hours))

    result = simulate_trade(
        ohlcv=ohlcv,
        entry_bar_idx=entry_bar_idx,
        direction=direction,
        stop_px=stop_px,
        target_px=target_px,
        horizon_bars=horizon_bars,
        cost_tier=DEFAULT_TIER,
    )

    _sb().table("ledger_outcomes").update({
        "entry_side": result.entry_side,
        "exit_reason": result.exit_reason,
        "fee_bps_total": result.fee_bps_total,
        "slippage_bps_total": result.slippage_bps_total,
        "pnl_bps_gross": round(result.pnl_bps_gross, 4),
        "pnl_bps_net": round(result.pnl_bps_net, 4),
        "pnl_pct_net": round(result.pnl_pct_net, 6),
        "holding_bars": result.holding_bars,
        "mfe_bps": round(result.mfe_bps, 4),
        "mae_bps": round(result.mae_bps, 4),
        "pnl_verdict": result.verdict,
    }).eq("id", outcome_id).execute()


def _distinct_windows() -> list[float]:
    """Distinct evaluation windows across registered policies."""
    from patterns.outcome_policy import _PATTERN_POLICIES

    windows = {DEFAULT_EVAL_WINDOW_HOURS}
    for policy in _PATTERN_POLICIES.values():
        windows.add(policy.evaluation_window_hours)
    return sorted(windows)


def resolve_outcomes(
    *,
    now_ms_val: int | None = None,
    limit: int = 500,
    capture_store: CaptureStore | None = None,
    ledger_store: LedgerStore | None = None,
    record_store: LedgerRecordStore | None = None,
    klines_loader=None,
) -> list[PatternOutcome]:
    """Resolve every due pending capture. Returns new PatternOutcomes.

    ``klines_loader`` is injectable for tests. Signature:
    ``(symbol, timeframe, *, offline=True) -> DataFrame``.
    """
    from data_cache.loader import load_klines as default_loader

    captures_store = capture_store or CaptureStore()
    outcomes_store = ledger_store or get_ledger_store()
    records_store = record_store or LEDGER_RECORD_STORE
    loader = klines_loader or default_loader
    ts_now = now_ms_val if now_ms_val is not None else now_ms()

    seen: dict[str, CaptureRecord] = {}
    for window in _distinct_windows():
        for capture in captures_store.list_due_for_outcome(
            now_ms_val=ts_now,
            window_hours=window,
            limit=limit,
        ):
            seen.setdefault(capture.capture_id, capture)

    resolved: list[PatternOutcome] = []
    for capture in seen.values():
        policy = policy_for(capture.pattern_slug)
        due_at_ms = capture.captured_at_ms + int(
            policy.evaluation_window_hours * 3600 * 1000
        )
        if due_at_ms > ts_now:
            continue

        captured_at = datetime.fromtimestamp(
            capture.captured_at_ms / 1000, tz=timezone.utc
        )
        timeframe = capture.timeframe or "1h"
        try:
            klines = loader(capture.symbol, timeframe, offline=True)
        except Exception:
            try:
                klines = loader(capture.symbol, timeframe, offline=False)
                log.debug("outcome_resolver: online fallback succeeded for %s", capture.symbol)
            except Exception as exc:
                log.warning(
                    "outcome_resolver: klines load failed for %s/%s: %s",
                    capture.symbol,
                    capture.capture_id,
                    exc,
                )
                continue

        entry_price, closes = _entry_and_forward_closes(
            klines=klines,
            captured_at=captured_at,
            window_hours=policy.evaluation_window_hours,
        )
        if entry_price is None or len(closes) < 2:
            log.debug(
                "outcome_resolver: insufficient forward data for %s/%s",
                capture.symbol,
                capture.capture_id,
            )
            continue

        decision = decide_outcome(
            entry_price=entry_price,
            forward_closes=closes[1:],
            policy=policy,
        )
        if decision is None:
            continue

        outcome = _build_pattern_outcome(
            capture=capture,
            decision=decision,
            accumulation_at=captured_at,
            window_hours=policy.evaluation_window_hours,
        )
        outcomes_store.save(outcome)
        records_store.append_outcome_record(outcome)
        captures_store.update_status(
            capture.capture_id,
            "outcome_ready",
            outcome_id=outcome.id,
        )
        resolved.append(outcome)

        # W-0365: P&L computation — wire pnl_compute into outcome
        try:
            _write_pnl_to_ledger_outcomes(
                outcome_id=outcome.id + ":outcome",
                ohlcv=klines,
                capture=capture,
                policy=policy,
            )
        except Exception as exc:
            log.warning(
                "outcome_resolver: pnl_compute failed for %s: %s",
                capture.capture_id,
                exc,
            )

        log.info(
            "outcome_resolver: %s/%s → %s (peak=%.2f%%, exit=%.2f%%)",
            capture.symbol,
            capture.capture_id,
            outcome.outcome,
            decision.max_gain_pct * 100.0,
            decision.exit_return_pct * 100.0,
        )

    # W-0377 Break B: eagerly resolve scan_signal_outcomes for any pending rows.
    # scan_signal_events has no FK to CaptureRecord, so we trigger the full
    # verification_loop pass rather than per-capture lookup.
    if resolved:
        try:
            from research.verification_loop import resolve_pending_outcomes as _rpo
            n_signal = _rpo()
            if n_signal:
                log.debug("outcome_resolver: signal_events eager resolve %d row(s)", n_signal)
        except Exception as _vl_exc:
            log.debug("outcome_resolver: signal_events eager resolve skipped: %s", _vl_exc)

    return resolved


async def outcome_resolver_job() -> None:
    """Async entrypoint wired into APScheduler."""
    resolved = resolve_outcomes()
    if resolved:
        log.info("outcome_resolver: resolved %d capture(s)", len(resolved))


__all__ = [
    "OutcomeDecision",
    "OutcomePolicy",
    "outcome_resolver_job",
    "resolve_outcomes",
]


# ── Job Protocol class (W-0386-D) ─────────────────────────────────────────────

from scanner.jobs.protocol import Job, JobContext, JobResult  # noqa: E402


class OutcomeResolverJob:
    """Job Protocol wrapper for outcome resolver (W-0386-D)."""
    name: str = "outcome_resolver_job"
    schedule: str = "0 * * * *"

    async def run(self, ctx: JobContext) -> JobResult:
        try:
            await outcome_resolver_job()
            return JobResult(name=self.name, ok=True)
        except Exception as exc:
            return JobResult(name=self.name, ok=False, error=str(exc))
