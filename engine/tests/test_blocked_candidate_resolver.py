"""W-0385 PR2: Tests for blocked_candidate_resolver."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from scanner.jobs.blocked_candidate_resolver import (
    _forward_return_at_horizon,
    resolve_batch,
)


def _klines(start: datetime, closes: list[float]) -> pd.DataFrame:
    idx = pd.date_range(start, periods=len(closes), freq="1h", tz="UTC")
    return pd.DataFrame({"close": closes, "open": closes, "high": closes, "low": closes, "volume": [1.0] * len(closes)}, index=idx)


class TestForwardReturn:
    def test_long_positive(self):
        ref = datetime(2026, 1, 1, 0, tzinfo=timezone.utc)
        klines = _klines(ref, [100.0, 101.0, 102.0, 103.0, 104.0])
        ret = _forward_return_at_horizon(klines, ref, 1)
        assert ret == pytest.approx(0.01, rel=1e-4)

    def test_horizon_not_reached_returns_none(self):
        ref = datetime(2026, 1, 1, 0, tzinfo=timezone.utc)
        klines = _klines(ref, [100.0, 101.0])  # only 2 candles, horizon 24h missing
        ret = _forward_return_at_horizon(klines, ref, 24)
        assert ret is None

    def test_no_entry_candle_returns_none(self):
        ref = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        # klines before ref
        start = datetime(2026, 1, 1, 0, tzinfo=timezone.utc)
        klines = _klines(start, [100.0, 99.0])  # ends at 01:00, ref is 12:00
        ret = _forward_return_at_horizon(klines, ref, 1)
        assert ret is None


class TestResolveBatch:
    def _sb_mock(self, rows: list[dict]):
        sb = MagicMock()
        sb.table.return_value.select.return_value.or_.return_value.lt.return_value.order.return_value.limit.return_value.execute.return_value.data = rows
        sb.table.return_value.update.return_value.eq.return_value.execute.return_value = None
        return sb

    def test_long_direction_fills_positive(self):
        ref = datetime(2026, 1, 1, 0, tzinfo=timezone.utc)
        klines = _klines(ref, [100.0] + [101.0] * 25 + [102.0] * 50)
        rows = [{
            "id": "abc", "symbol": "BTCUSDT", "direction": "long",
            "blocked_at": ref.isoformat(),
            "forward_1h": None, "forward_4h": None, "forward_24h": None, "forward_72h": None,
        }]
        with patch("scanner.jobs.blocked_candidate_resolver._sb", return_value=self._sb_mock(rows)), \
             patch("data_cache.loader.load_klines", return_value=klines):
            filled = resolve_batch()
        assert filled == 1

    def test_short_direction_inverts_sign(self):
        ref = datetime(2026, 1, 1, 0, tzinfo=timezone.utc)
        # price goes up — short should show negative forward return
        klines = _klines(ref, [100.0, 110.0] + [110.0] * 75)
        rows = [{
            "id": "xyz", "symbol": "ETHUSDT", "direction": "short",
            "blocked_at": ref.isoformat(),
            "forward_1h": None, "forward_4h": None, "forward_24h": None, "forward_72h": None,
        }]
        sb_mock = self._sb_mock(rows)
        with patch("scanner.jobs.blocked_candidate_resolver._sb", return_value=sb_mock), \
             patch("data_cache.loader.load_klines", return_value=klines):
            resolve_batch()

        update_call = sb_mock.table.return_value.update.call_args
        updates = update_call[0][0]
        assert updates.get("forward_1h", 0) < 0  # price rose → short lost

    def test_empty_klines_skipped(self):
        ref = datetime(2026, 1, 1, 0, tzinfo=timezone.utc)
        rows = [{
            "id": "zzz", "symbol": "SOLUSDT", "direction": "long",
            "blocked_at": ref.isoformat(),
            "forward_1h": None, "forward_4h": None, "forward_24h": None, "forward_72h": None,
        }]
        sb_mock = self._sb_mock(rows)
        with patch("scanner.jobs.blocked_candidate_resolver._sb", return_value=sb_mock), \
             patch("data_cache.loader.load_klines", return_value=pd.DataFrame()):
            filled = resolve_batch()
        assert filled == 0
        sb_mock.table.return_value.update.assert_not_called()
