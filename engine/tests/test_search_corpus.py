from __future__ import annotations

import sqlite3
import asyncio
from pathlib import Path

import pandas as pd

from scanner.jobs.search_corpus import search_corpus_refresh_job
from search._signals import fetch_feature_signals_batch, weighted_l1_score, SIGNAL_WEIGHTS
from search.corpus import SearchCorpusStore, build_corpus_windows
from search.runtime import run_seed_search


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


# ── W-0145: 40+dim weighted L1 scoring tests ──────────────────────────────────

def test_weighted_l1_score_perfect_match_returns_one() -> None:
    sig = {"oi_zscore": 1.5, "funding_rate": 0.01, "close_return_pct": 2.5}
    assert weighted_l1_score(sig, sig) == 1.0


def test_weighted_l1_score_no_overlap_returns_neutral() -> None:
    candidate = {"oi_zscore": 1.0}
    reference = {"funding_rate": 0.01}  # no shared keys
    assert weighted_l1_score(candidate, reference) == 0.5


def test_weighted_l1_score_prefers_oi_heavy_match() -> None:
    """When distances are equal, higher-weighted signals should dominate.

    oi_zscore weight = 2.0, close_return_pct weight = 1.5.
    With equal absolute miss (distance=1.0 on one signal, 0.0 on the other),
    the candidate that gets OI right should outscore the one that gets return right.
    """
    reference = {"oi_zscore": 1.0, "close_return_pct": 1.0}

    # cand_a: perfect OI match, 1-unit miss on return
    cand_a = {"oi_zscore": 1.0, "close_return_pct": 0.0}
    # cand_b: 1-unit miss on OI, perfect return match
    cand_b = {"oi_zscore": 0.0, "close_return_pct": 1.0}

    score_a = weighted_l1_score(cand_a, reference)
    score_b = weighted_l1_score(cand_b, reference)

    # cand_a misses on lower-weight signal (1.5) → smaller weighted_dist → higher score
    assert score_a > score_b, (
        f"expected OI-matching candidate to score higher: {score_a:.4f} vs {score_b:.4f}"
    )


def test_weighted_l1_score_all_signal_weights_are_positive() -> None:
    for key, weight in SIGNAL_WEIGHTS.items():
        assert weight > 0, f"SIGNAL_WEIGHTS[{key!r}] must be positive, got {weight}"


def test_fetch_feature_signals_batch_returns_empty_when_db_missing(tmp_path) -> None:
    windows = build_corpus_windows("BTCUSDT", "1h", _klines(), window_bars=4, stride_bars=2)
    result = fetch_feature_signals_batch(windows, tmp_path / "nonexistent.sqlite")
    assert result == {}


def test_run_seed_search_uses_weighted_l1_and_ranks_by_score(tmp_path) -> None:
    """seed-search ranks candidates by weighted L1 score against reference signature."""
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    windows = build_corpus_windows("BTCUSDT", "4h", _klines(20), window_bars=4, stride_bars=2)
    store.upsert_windows(windows)

    # Reference: strongly positive return
    reference = {"close_return_pct": 10.0, "realized_volatility_pct": 3.0}

    result = run_seed_search(
        {"symbol": "BTCUSDT", "timeframe": "4h", "signature": reference, "limit": 5},
        store=store,
    )

    assert result["status"] == "corpus_only"
    candidates = result["candidates"]
    assert len(candidates) > 0
    scores = [c["score"] for c in candidates]
    # Verify descending sort
    assert scores == sorted(scores, reverse=True), "candidates must be sorted by score desc"
    # All scores must be in [0, 1]
    for score in scores:
        assert 0.0 <= score <= 1.0


def test_run_seed_search_returns_degraded_when_corpus_empty(tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "empty.sqlite")
    result = run_seed_search(
        {"symbol": "BTCUSDT", "signature": {"close_return_pct": 5.0}},
        store=store,
    )
    assert result["status"] == "degraded"
    assert result["candidates"] == []


def test_run_seed_search_falls_back_to_corpus_sig_when_no_fw_db(tmp_path) -> None:
    """When FeatureWindowStore is absent, scoring degrades to 6-field corpus signature."""
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    windows = build_corpus_windows("ETHUSDT", "1h", _klines(12), window_bars=4, stride_bars=2)
    store.upsert_windows(windows)

    # Reference uses corpus-native fields only
    reference = {"close_return_pct": 3.0, "volume_ratio": 1.1}
    result = run_seed_search(
        {"symbol": "ETHUSDT", "signature": reference, "limit": 3},
        store=store,
    )

    assert result["status"] == "corpus_only"
    assert len(result["candidates"]) > 0
    # Scores should still be valid [0,1] even without FW enrichment
    for c in result["candidates"]:
        assert 0.0 <= c["score"] <= 1.0
