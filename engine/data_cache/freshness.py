"""Data freshness tracking for Alpha Universe observation runs.

Records when each data source was last successfully fetched for a symbol.
Written into pattern_states.data_quality_json by the observation engine.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def _mtime_utc(path: str | Path) -> Optional[datetime]:
    """Return mtime as UTC datetime, or None if file does not exist."""
    try:
        ts = os.path.getmtime(path)
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    except OSError:
        return None


def _age_hours(dt: Optional[datetime]) -> float:
    """Hours since dt; returns inf if dt is None."""
    if dt is None:
        return float("inf")
    now = datetime.now(tz=timezone.utc)
    return (now - dt).total_seconds() / 3600.0


@dataclass
class DataFreshness:
    """Freshness summary for one symbol at one observation tick.

    Thresholds (configurable via class attributes):
        klines/perp: expected hourly — fresh if < 2h old
        dex cache:   expected 4h — fresh if < 5h old
        chain cache: expected 4h — fresh if < 5h old
    """

    symbol: str
    klines_last_ts: Optional[datetime] = None
    perp_last_ts: Optional[datetime] = None
    dex_cache_mtime: Optional[datetime] = None
    chain_cache_mtime: Optional[datetime] = None

    # Computed on post_init
    klines_age_hours: float = field(init=False)
    perp_age_hours: float = field(init=False)
    dex_age_hours: float = field(init=False)
    chain_age_hours: float = field(init=False)
    is_fresh: bool = field(init=False)

    # Staleness thresholds
    KLINES_MAX_AGE_H: float = 2.0
    PERP_MAX_AGE_H: float = 2.0
    DEX_MAX_AGE_H: float = 5.0
    CHAIN_MAX_AGE_H: float = 5.0

    def __post_init__(self) -> None:
        self.klines_age_hours = _age_hours(self.klines_last_ts)
        self.perp_age_hours = _age_hours(self.perp_last_ts)
        self.dex_age_hours = _age_hours(self.dex_cache_mtime)
        self.chain_age_hours = _age_hours(self.chain_cache_mtime)
        self.is_fresh = (
            self.klines_age_hours <= self.KLINES_MAX_AGE_H
            and self.dex_age_hours <= self.DEX_MAX_AGE_H
        )

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "klines_age_h": round(self.klines_age_hours, 2),
            "perp_age_h": round(self.perp_age_hours, 2),
            "dex_age_h": round(self.dex_age_hours, 2),
            "chain_age_h": round(self.chain_age_hours, 2),
            "is_fresh": self.is_fresh,
        }


def check_freshness(
    symbol: str,
    klines_df=None,
    dex_cache_path: Optional[str | Path] = None,
    chain_cache_path: Optional[str | Path] = None,
) -> DataFreshness:
    """Build a DataFreshness from available data objects / cache paths."""
    klines_last_ts: Optional[datetime] = None
    if klines_df is not None and len(klines_df) > 0:
        last_idx = klines_df.index[-1]
        if hasattr(last_idx, "to_pydatetime"):
            klines_last_ts = last_idx.to_pydatetime()
            if klines_last_ts.tzinfo is None:
                klines_last_ts = klines_last_ts.replace(tzinfo=timezone.utc)
        else:
            from datetime import datetime as _dt
            klines_last_ts = _dt.fromtimestamp(float(last_idx), tz=timezone.utc)

    return DataFreshness(
        symbol=symbol,
        klines_last_ts=klines_last_ts,
        dex_cache_mtime=_mtime_utc(dex_cache_path) if dex_cache_path else None,
        chain_cache_mtime=_mtime_utc(chain_cache_path) if chain_cache_path else None,
    )
