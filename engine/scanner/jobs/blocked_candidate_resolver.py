"""W-0385: Blocked candidate forward P&L resolver.

Hourly job. For each blocked_candidates row where forward_1h IS NULL
AND blocked_at < NOW() - 2h, fetch OHLCV and fill forward returns at
+1h / +4h / +24h / +72h horizons.

Uses an independent _forward_return_at_horizon() helper rather than
importing the private _entry_and_forward_closes() from outcome_resolver.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

log = logging.getLogger("engine.scanner.jobs.blocked_candidate_resolver")

HORIZONS_H = [1, 4, 24, 72]
BATCH_SIZE = int(os.environ.get("BLOCKED_RESOLVER_BATCH_SIZE", "50"))
BLOCKED_CANDIDATES_TABLE = "blocked_candidates"


def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def _forward_return_at_horizon(
    klines,
    ref_ts: datetime,
    horizon_h: int,
) -> float | None:
    """Return (close at ref_ts + horizon_h) / (close at ref_ts) - 1.0.

    Returns None if insufficient bars or data is missing.
    """
    if klines is None or klines.empty or "close" not in klines.columns:
        return None

    tz = getattr(klines.index, "tz", None)
    if tz is not None and ref_ts.tzinfo is None:
        ref_ts = ref_ts.replace(tzinfo=timezone.utc)
    elif tz is None and ref_ts.tzinfo is not None:
        ref_ts = ref_ts.astimezone(timezone.utc).replace(tzinfo=None)

    entry_mask = klines.index >= ref_ts
    if not entry_mask.any():
        return None
    entry_close = float(klines.loc[entry_mask, "close"].iloc[0])
    if entry_close == 0:
        return None

    target_ts = ref_ts + timedelta(hours=horizon_h)
    future_mask = klines.index >= target_ts
    if not future_mask.any():
        return None
    future_close = float(klines.loc[future_mask, "close"].iloc[0])

    return (future_close / entry_close) - 1.0


def _apply_direction(ret: float | None, direction: str | None) -> float | None:
    """Flip sign for short positions; pass through for long/neutral/None."""
    if ret is None:
        return None
    if direction == "short":
        return -ret
    return ret


def resolve_batch(batch_size: int = BATCH_SIZE) -> int:
    """Fetch unresolved rows and fill forward returns. Returns rows updated."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    sb = _sb()

    rows = (
        sb.table(BLOCKED_CANDIDATES_TABLE)
        .select("id, symbol, timeframe, direction, blocked_at")
        .is_("forward_1h", "null")
        .lt("blocked_at", cutoff)
        .order("blocked_at", desc=False)
        .limit(batch_size)
        .execute()
        .data
    )

    if not rows:
        return 0

    from data_cache.loader import load_klines

    filled = 0
    for row in rows:
        symbol = row.get("symbol") or ""
        timeframe = row.get("timeframe") or "1h"
        direction = row.get("direction")
        blocked_at_raw = row.get("blocked_at")
        if not symbol or not blocked_at_raw:
            continue

        try:
            blocked_at = datetime.fromisoformat(
                blocked_at_raw.replace("Z", "+00:00")
            )
        except ValueError:
            log.debug("blocked_candidate_resolver: bad blocked_at %r for id=%s", blocked_at_raw, row["id"])
            continue

        try:
            klines = load_klines(symbol, timeframe, offline=True)
        except Exception as exc:
            log.debug("blocked_candidate_resolver: klines load failed %s/%s: %s", symbol, timeframe, exc)
            continue

        update: dict = {}
        for h in HORIZONS_H:
            col = f"forward_{h}h"
            ret = _forward_return_at_horizon(klines, blocked_at, h)
            directed = _apply_direction(ret, direction)
            if directed is not None:
                update[col] = round(directed, 6)

        if not update:
            log.debug("blocked_candidate_resolver: no forward data yet for %s id=%s", symbol, row["id"])
            continue

        try:
            sb.table(BLOCKED_CANDIDATES_TABLE).update(update).eq("id", row["id"]).execute()
            filled += 1
        except Exception as exc:
            log.warning("blocked_candidate_resolver: update failed id=%s: %s", row["id"], exc)

    log.info("blocked_candidate_resolver: filled %d / %d rows", filled, len(rows))
    return filled
