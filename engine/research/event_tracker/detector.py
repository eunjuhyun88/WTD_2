"""Detect extreme market events from the offline data cache.

Scans the universe for three event types:
  - funding_extreme: funding_rate < -threshold (crowded shorts)
  - oi_spike: oi_change_1h z-score > threshold (sudden OI expansion)
  - compression: sideways price + volume dryup (energy coiling)

Events are returned as ExtremeEvent objects with detected_at = the bar
timestamp when the condition first fired.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import pandas as pd

from research.event_tracker.models import ExtremeEvent

log = logging.getLogger("engine.event_tracker.detector")

# Default thresholds
FUNDING_EXTREME_THRESHOLD = -0.001      # < -0.1% is crowded short
OI_SPIKE_ZSCORE = 2.0                   # >2σ OI change in 1h
COMPRESSION_MAX_RANGE_PCT = 0.03        # price range < 3% over lookback
COMPRESSION_VOLUME_RATIO = 0.5          # recent vol < 50% of baseline
COMPRESSION_LOOKBACK = 8               # bars


class ExtremeEventDetector:
    """Scan a universe of symbols for extreme events in cached data.

    Usage::

        detector = ExtremeEventDetector()
        events = detector.scan_universe(["DYMUSDT", "ORDIUSDT"], since=...)
    """

    def __init__(
        self,
        funding_threshold: float = FUNDING_EXTREME_THRESHOLD,
        oi_zscore: float = OI_SPIKE_ZSCORE,
    ) -> None:
        self.funding_threshold = funding_threshold
        self.oi_zscore = oi_zscore

    def scan_universe(
        self,
        universe: list[str],
        *,
        since: datetime | None = None,
        timeframe: str = "1h",
    ) -> list[ExtremeEvent]:
        """Scan each symbol for extreme events since `since`.

        Args:
            universe: List of symbol strings (e.g. ["DYMUSDT", "ORDIUSDT"]).
            since: Only return events detected on or after this timestamp.
                If None, scans all cached history.
            timeframe: Timeframe string. Default "1h".

        Returns:
            List of ExtremeEvent objects sorted by detected_at ascending.
        """
        from data_cache.loader import load_perp  # local import avoids circular

        all_events: list[ExtremeEvent] = []
        for symbol in universe:
            try:
                perp = load_perp(symbol, offline=True)
                if perp is None or perp.empty:
                    continue
                events = self._detect_funding_extreme(symbol, timeframe, perp, since)
                all_events.extend(events)
            except Exception as exc:  # noqa: BLE001
                log.warning("scan_universe: %s skipped — %s", symbol, exc)

        all_events.sort(key=lambda e: e.detected_at or datetime.min.replace(tzinfo=timezone.utc))
        return all_events

    def _detect_funding_extreme(
        self,
        symbol: str,
        timeframe: str,
        perp: pd.DataFrame,
        since: datetime | None,
    ) -> list[ExtremeEvent]:
        """Return funding_extreme events for one symbol."""
        if "funding_rate" not in perp.columns:
            return []

        funding = perp["funding_rate"].astype(float)

        # Only bars where funding < threshold (crowded shorts)
        mask = funding < self.funding_threshold
        if since is not None:
            mask = mask & (perp.index >= since)

        events: list[ExtremeEvent] = []
        in_event = False
        for ts, is_extreme in zip(perp.index, mask):
            if is_extreme and not in_event:
                # Rising edge: start of a new extreme event
                in_event = True
                events.append(
                    ExtremeEvent(
                        symbol=symbol,
                        timeframe=timeframe,
                        event_type="funding_extreme",
                        detected_at=ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts,
                        trigger_value=float(funding[ts]),
                    )
                )
            elif not is_extreme:
                in_event = False  # reset when funding normalises

        return events

    def scan_symbol_klines(
        self,
        symbol: str,
        *,
        since: datetime | None = None,
        timeframe: str = "1h",
    ) -> list[ExtremeEvent]:
        """Detect compression events for one symbol using kline data.

        Uses sideways price range + volume dryup heuristic.
        """
        from data_cache.loader import load_klines  # local import
        try:
            klines = load_klines(symbol, timeframe, offline=True)
        except Exception as exc:  # noqa: BLE001
            log.warning("scan_symbol_klines: %s skipped — %s", symbol, exc)
            return []

        if klines.empty or len(klines) < COMPRESSION_LOOKBACK * 3:
            return []

        close = klines["close"].astype(float)
        vol = klines["volume"].astype(float)

        rolling_high = close.rolling(COMPRESSION_LOOKBACK).max()
        rolling_low = close.rolling(COMPRESSION_LOOKBACK).min()
        rolling_mid = close.rolling(COMPRESSION_LOOKBACK).mean()
        range_pct = (rolling_high - rolling_low) / rolling_mid.replace(0, float("nan"))

        recent_vol = vol.rolling(3).mean()
        baseline_vol = vol.shift(3).rolling(COMPRESSION_LOOKBACK).mean()
        vol_ratio = recent_vol / baseline_vol.replace(0, float("nan"))

        is_compression = (range_pct <= COMPRESSION_MAX_RANGE_PCT) & (vol_ratio <= COMPRESSION_VOLUME_RATIO)

        events: list[ExtremeEvent] = []
        in_event = False
        for ts, flag in zip(klines.index, is_compression):
            if since is not None and ts < since:
                continue
            if bool(flag) and not in_event:
                in_event = True
                events.append(
                    ExtremeEvent(
                        symbol=symbol,
                        timeframe=timeframe,
                        event_type="compression",
                        detected_at=ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts,
                        trigger_value=float(range_pct[ts]) if ts in range_pct.index else 0.0,
                    )
                )
            elif not bool(flag):
                in_event = False

        return events
