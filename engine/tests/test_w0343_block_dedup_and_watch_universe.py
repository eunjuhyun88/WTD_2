"""Tests for W-0343: block dedup + W-0335 PR-1 watch→universe.

Verifies:
1. _BLOCKS has no duplicate names
2. Total block count is 90 (not 96)
3. _load_universe_with_watches unions base + watched symbols
4. Watched symbols outside base universe are still included
5. _load_universe_with_watches is graceful when CaptureStore fails
"""
from __future__ import annotations

from collections import Counter
from unittest.mock import AsyncMock, MagicMock, patch


class TestBlockDedup:
    def test_no_duplicate_block_names(self):
        from scoring.block_evaluator import _BLOCKS
        names = [b[0] for b in _BLOCKS]
        dupes = [n for n, c in Counter(names).items() if c > 1]
        assert dupes == [], f"Duplicate block names: {dupes}"

    def test_block_count_is_90(self):
        from scoring.block_evaluator import _BLOCKS
        assert len(_BLOCKS) == 90, f"Expected 90, got {len(_BLOCKS)}"


class TestWatchUniverse:
    async def test_watched_symbols_unioned_with_base(self, monkeypatch):
        from scanner.scheduler import _load_universe_with_watches

        monkeypatch.setattr(
            "scanner.scheduler.load_universe_async",
            AsyncMock(return_value=["BTCUSDT", "ETHUSDT"]),
        )
        monkeypatch.setattr(
            "scanner.scheduler._watched_symbols",
            lambda: {"SOLUSDT", "BTCUSDT"},  # SOLUSDT is new, BTCUSDT is dupe
        )

        result = await _load_universe_with_watches("binance_dynamic")
        assert "BTCUSDT" in result
        assert "ETHUSDT" in result
        assert "SOLUSDT" in result  # watch-only symbol included

    async def test_watched_symbol_outside_universe_included(self, monkeypatch):
        from scanner.scheduler import _load_universe_with_watches

        monkeypatch.setattr(
            "scanner.scheduler.load_universe_async",
            AsyncMock(return_value=["BTCUSDT", "ETHUSDT"]),
        )
        monkeypatch.setattr(
            "scanner.scheduler._watched_symbols",
            lambda: {"RAREUSDT"},  # completely outside universe
        )

        result = await _load_universe_with_watches("binance_dynamic")
        assert "RAREUSDT" in result
        assert len(result) == 3

    async def test_graceful_when_capture_store_fails(self, monkeypatch):
        from scanner.scheduler import _load_universe_with_watches

        monkeypatch.setattr(
            "scanner.scheduler.load_universe_async",
            AsyncMock(return_value=["BTCUSDT"]),
        )
        monkeypatch.setattr(
            "scanner.scheduler._watched_symbols",
            lambda: set(),  # graceful empty
        )

        result = await _load_universe_with_watches("binance_dynamic")
        assert result == ["BTCUSDT"]

    async def test_no_duplicates_in_result(self, monkeypatch):
        from scanner.scheduler import _load_universe_with_watches

        monkeypatch.setattr(
            "scanner.scheduler.load_universe_async",
            AsyncMock(return_value=["BTCUSDT", "ETHUSDT", "BNBUSDT"]),
        )
        monkeypatch.setattr(
            "scanner.scheduler._watched_symbols",
            lambda: {"BTCUSDT", "NEWUSDT"},  # BTCUSDT already in base
        )

        result = await _load_universe_with_watches("binance_dynamic")
        assert len(result) == len(set(result)), "Result has duplicates"
        assert len(result) == 4  # BTCUSDT, ETHUSDT, BNBUSDT, NEWUSDT

    def test_watched_symbols_graceful_on_store_error(self, monkeypatch):
        from scanner.scheduler import _watched_symbols

        # Simulate CaptureStore raising an exception
        def _bad_import(*args, **kwargs):
            raise RuntimeError("DB unavailable")

        with patch("scanner.scheduler.CaptureStore", side_effect=_bad_import, create=True):
            result = _watched_symbols()
        assert result == set()
