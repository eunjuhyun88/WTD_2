from __future__ import annotations

import sqlite3
import asyncio

import pandas as pd

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


def test_build_corpus_windows_creates_stable_compact_signatures() -> None:
    windows = build_corpus_windows(
        "btcusdt",
        "1h",
        _klines(),
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
    assert windows[0].window_id == build_corpus_windows(
        "BTCUSDT",
        "1h",
        _klines(),
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


def test_search_corpus_refresh_job_uses_offline_cache_and_persists_windows(tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    calls: list[tuple[str, str, bool]] = []

    async def fake_load_universe(name: str) -> list[str]:
        assert name == "test-universe"
        return ["btcusdt", "ethusdt"]

    def fake_load_klines(symbol: str, timeframe: str, *, offline: bool = False) -> pd.DataFrame:
        calls.append((symbol, timeframe, offline))
        return _klines(10)

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
        )
    )

    assert result["ok"] is True
    assert result["plane"] == "search"
    assert result["status"] == "live"
    assert result["windows_upserted"] == 2
    assert result["symbols"] == ["BTCUSDT"]
    assert calls == [("BTCUSDT", "1h", True)]
    assert store.count_windows() == 2
