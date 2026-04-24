from __future__ import annotations

import sqlite3
import asyncio

import pandas as pd

from data_cache.loader import CacheMiss
from scanner.jobs.search_corpus import search_corpus_refresh_job
from search.corpus import SearchCorpusStore, build_corpus_windows


def _klines(rows: int = 8) -> pd.DataFrame:
    index = pd.date_range("2026-04-13", periods=rows, freq="h", tz="UTC")
    close = [100.0 + i for i in range(rows)]
    return pd.DataFrame(
        {
            "open": close,
            "high": [value + 1.0 for value in close],
            "low": [value - 1.0 for value in close],
            "close": close,
            "volume": [1_000.0 + (i * 10.0) for i in range(rows)],
        },
        index=index,
    )


def _perp(rows: int = 8) -> pd.DataFrame:
    index = pd.date_range("2026-04-13", periods=rows, freq="h", tz="UTC")
    return pd.DataFrame(
        {
            "funding_rate": [-0.0008 + (i * 0.0002) for i in range(rows)],
            "oi_change_1h": [0.01 + (i * 0.005) for i in range(rows)],
            "oi_change_24h": [0.03 + (i * 0.01) for i in range(rows)],
            "long_short_ratio": [0.92 + (i * 0.03) for i in range(rows)],
        },
        index=index,
    )


def test_build_corpus_windows_creates_stable_compact_signatures() -> None:
    windows = build_corpus_windows(
        "btcusdt",
        "1h",
        _klines(),
        perp=_perp(),
        window_bars=4,
        stride_bars=2,
        generated_at="2026-04-23T00:00:00+00:00",
    )

    assert len(windows) == 3
    assert windows[0].symbol == "BTCUSDT"
    assert windows[0].bars == 4
    assert windows[0].start_ts == "2026-04-13T00:00:00+00:00"
    assert windows[0].end_ts == "2026-04-13T03:00:00+00:00"
    assert windows[0].signature["trend"] == "up"
    assert windows[0].signature["close_return_pct"] > 0
    assert windows[0].signature["funding_rate_mean"] < 0
    assert windows[0].signature["oi_change_1h_max"] > 0.02
    assert windows[0].signature["oi_regime"] == "expanding"
    assert windows[0].window_id == build_corpus_windows(
        "BTCUSDT",
        "1h",
        _klines(),
        perp=_perp(),
        window_bars=4,
        stride_bars=2,
        generated_at="2026-04-23T00:00:00+00:00",
    )[0].window_id


def test_search_corpus_store_upserts_windows_and_initializes_search_tables(tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    windows = build_corpus_windows("ETHUSDT", "1h", _klines(), window_bars=4, stride_bars=2)

    assert store.upsert_windows(windows) == 3
    assert store.upsert_windows(windows) == 3
    assert store.count_windows() == 3

    loaded = store.list_windows(symbol="ETHUSDT", timeframe="1h", limit=2)
    assert len(loaded) == 2
    assert loaded[0].end_ts > loaded[1].end_ts
    assert loaded[0].signature["last_close"] == 107.0

    with sqlite3.connect(tmp_path / "search.sqlite") as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
    assert {
        "search_corpus_windows",
        "search_seed_runs",
        "search_seed_candidates",
        "search_scan_runs",
        "search_scan_candidates",
    }.issubset(tables)


def test_search_corpus_store_persists_seed_and_scan_runs(tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    windows = build_corpus_windows("ETHUSDT", "1h", _klines(), window_bars=4, stride_bars=2)
    store.upsert_windows(windows)
    candidate = {
        "window_id": windows[0].window_id,
        "symbol": "ETHUSDT",
        "timeframe": "1h",
        "score": 0.75,
        "payload": {"window_id": windows[0].window_id, "symbol": "ETHUSDT", "timeframe": "1h"},
    }

    seed = store.create_seed_run(request={"symbol": "ETHUSDT"}, candidates=[candidate])
    scan = store.create_scan_run(request={"symbol": "ETHUSDT"}, candidates=[candidate])

    loaded_seed = store.get_seed_run(seed["run_id"])
    loaded_scan = store.get_scan_run(scan["scan_id"])

    assert loaded_seed is not None
    assert loaded_seed["status"] == "completed"
    assert loaded_seed["candidates"][0]["window_id"] == windows[0].window_id
    assert loaded_scan is not None
    assert loaded_scan["candidates"][0]["symbol"] == "ETHUSDT"
    assert loaded_scan["candidates"][0]["payload"]["window_id"] == windows[0].window_id


def test_search_corpus_refresh_job_uses_offline_cache_and_persists_windows(tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    calls: list[tuple[str, str, bool]] = []
    perp_calls: list[tuple[str, bool]] = []

    async def fake_load_universe(name: str) -> list[str]:
        assert name == "test-universe"
        return ["btcusdt", "ethusdt"]

    def fake_load_klines(symbol: str, timeframe: str, *, offline: bool = False) -> pd.DataFrame:
        calls.append((symbol, timeframe, offline))
        return _klines(10)

    def fake_load_perp(symbol: str, *, offline: bool = False) -> pd.DataFrame:
        perp_calls.append((symbol, offline))
        return _perp(10)

    result = asyncio.run(
        search_corpus_refresh_job(
            universe_name="test-universe",
            timeframes=["1h"],
            window_bars=4,
            stride_bars=3,
            max_symbols=1,
            max_windows_per_series=2,
            store=store,
            load_universe=fake_load_universe,
            load_kline_frame=fake_load_klines,
            load_perp_frame=fake_load_perp,
        )
    )

    assert result["ok"] is True
    assert result["plane"] == "search"
    assert result["status"] == "live"
    assert result["windows_upserted"] == 2
    assert result["symbols"] == ["BTCUSDT"]
    assert calls == [("BTCUSDT", "1h", True)]
    assert perp_calls == [("BTCUSDT", True)]
    assert store.count_windows() == 2
    windows = store.list_windows(symbol="BTCUSDT", timeframe="1h", limit=1)
    assert windows[0].signature["oi_change_1h_max"] > 0.0
    assert windows[0].signature["funding_rate_mean"] != 0.0


def test_search_corpus_refresh_job_defaults_include_15m_lane(tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    calls: list[tuple[str, str, bool]] = []

    async def fake_load_universe(name: str) -> list[str]:
        return ["btcusdt"]

    def fake_load_klines(symbol: str, timeframe: str, *, offline: bool = False) -> pd.DataFrame:
        calls.append((symbol, timeframe, offline))
        return _klines(10)

    asyncio.run(
        search_corpus_refresh_job(
            universe_name="test-universe",
            max_symbols=1,
            max_windows_per_series=1,
            window_bars=4,
            stride_bars=2,
            store=store,
            load_universe=fake_load_universe,
            load_kline_frame=fake_load_klines,
            load_perp_frame=lambda symbol, offline=True: _perp(10),
        )
    )

    assert calls == [
        ("BTCUSDT", "15m", True),
        ("BTCUSDT", "1h", True),
        ("BTCUSDT", "4h", True),
    ]


def test_search_corpus_refresh_job_warms_15m_cache_on_miss(tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    calls: list[tuple[str, str, bool]] = []

    async def fake_load_universe(name: str) -> list[str]:
        return ["btcusdt"]

    def fake_load_klines(symbol: str, timeframe: str, *, offline: bool = False) -> pd.DataFrame:
        calls.append((symbol, timeframe, offline))
        if timeframe == "15m" and offline:
            raise CacheMiss("BTCUSDT_15m not cached")
        return _klines(10)

    result = asyncio.run(
        search_corpus_refresh_job(
            universe_name="test-universe",
            timeframes=["15m"],
            max_symbols=1,
            max_windows_per_series=1,
            window_bars=4,
            stride_bars=2,
            store=store,
            load_universe=fake_load_universe,
            load_kline_frame=fake_load_klines,
            load_perp_frame=lambda symbol, offline=True: _perp(10),
        )
    )

    assert result["status"] == "live"
    assert calls == [("BTCUSDT", "15m", True), ("BTCUSDT", "15m", False)]
    assert store.count_windows() == 1
