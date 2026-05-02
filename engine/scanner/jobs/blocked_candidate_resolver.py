"""W-0385 PR2: Blocked candidate outcome resolver.

For each blocked_candidates row where any forward_Xh IS NULL AND
blocked_at < NOW() - 2h, fetch OHLCV and fill forward returns.
Runs hourly via APScheduler.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

import pandas as pd
from dateutil.parser import parse as parse_dt

log = logging.getLogger("engine.scanner.jobs.blocked_candidate_resolver")

HORIZONS_H = [1, 4, 24, 72]
BATCH_SIZE = 50
_WAIT_HOURS = 2  # wait before attempting resolve to ensure OHLCV cache is warm


def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def _forward_return_at_horizon(
    klines: pd.DataFrame, ref_ts: datetime, horizon_h: int
) -> float | None:
    """Compute (close_at_horizon / close_at_ref) - 1.0.

    Returns None when OHLCV data is insufficient — caller treats as not-yet-fillable.
    """
    entry_mask = klines.index >= ref_ts
    if not entry_mask.any():
        return None
    entry_close = float(klines.loc[entry_mask, "close"].iloc[0])
    target_ts = ref_ts + timedelta(hours=horizon_h)
    future_mask = klines.index >= target_ts
    if not future_mask.any():
        return None
    future_close = float(klines.loc[future_mask, "close"].iloc[0])
    return (future_close / entry_close) - 1.0


def resolve_batch() -> int:
    """Fill forward_Xh for a batch of unresolved rows. Returns count filled."""
    from data_cache.loader import load_klines

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=_WAIT_HOURS)).isoformat()
    sb = _sb()

    rows = (
        sb.table("blocked_candidates")
        .select("id, symbol, blocked_at, direction, forward_1h, forward_4h, forward_24h, forward_72h")
        .or_(
            "forward_1h.is.null,"
            "forward_4h.is.null,"
            "forward_24h.is.null,"
            "forward_72h.is.null"
        )
        .lt("blocked_at", cutoff)
        .order("blocked_at")
        .limit(BATCH_SIZE)
        .execute()
        .data
    )

    if not rows:
        return 0

    filled = 0
    for row in rows:
        try:
            klines = load_klines(row["symbol"], "1h", lookback_hours=200)
            if klines is None or klines.empty:
                continue

            ref_ts = parse_dt(row["blocked_at"])
            if ref_ts.tzinfo is None:
                ref_ts = ref_ts.replace(tzinfo=timezone.utc)

            # direction sign: short means inverse return
            sign = -1.0 if str(row.get("direction", "")).lower() == "short" else 1.0

            updates: dict = {}
            for h in HORIZONS_H:
                col = f"forward_{h}h"
                if row[col] is None:
                    ret = _forward_return_at_horizon(klines, ref_ts, h)
                    if ret is not None:
                        updates[col] = round(ret * sign, 6)

            if updates:
                sb.table("blocked_candidates").update(updates).eq("id", row["id"]).execute()
                filled += 1

        except Exception as exc:
            log.warning("resolver error for %s (%s): %s", row.get("id"), row.get("symbol"), exc)

    log.info("blocked_candidate_resolver: %d/%d rows filled", filled, len(rows))
    return filled
