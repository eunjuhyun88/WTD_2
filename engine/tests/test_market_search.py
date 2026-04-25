from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

from data_cache.market_search import (
    MarketSearchCandidate,
    _clear_search_result_cache,
    refresh_market_search_index,
    ingest_market_query_raw,
    search_market_candidates,
)
from data_cache.raw_store import CanonicalRawStore, MarketSearchIndexRecord
from data_cache.raw_ingest import RawIngestionResult


def test_search_market_candidates_includes_direct_and_dex_candidates(monkeypatch, tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    monkeypatch.setattr("data_cache.market_search.fetch_futures_symbols", lambda: {"INUSDT"})
    monkeypatch.setattr(
        "data_cache.market_search.fetch_dex_search_pairs",
        lambda query, chains=None: [
            {
                "chainId": "ethereum",
                "pairAddress": "0xpair-eth",
                "baseToken": {"symbol": "IN", "address": "0xeth"},
                "quoteToken": {"symbol": "USDT"},
                "liquidity": {"usd": 50_000},
                "volume": {"h24": 75_000},
                "priceChange": {"h24": -2.5},
            },
            {
                "chainId": "bsc",
                "pairAddress": "0xpair-bsc",
                "baseToken": {"symbol": "IN", "address": "0xbsc"},
                "quoteToken": {"symbol": "USDT"},
                "liquidity": {"usd": 250_000},
                "volume": {"h24": 175_000},
                "priceChange": {"h24": 5.0},
            },
        ],
    )
    monkeypatch.setattr("data_cache.market_search.fetch_dex_token_batch", lambda addresses, chain="bsc": [])

    results = search_market_candidates("IN", limit=5, store=store)

    assert results[0].provider == "binance"
    assert results[0].canonical_symbol == "INUSDT"
    assert any(candidate.provider == "dexscreener" and candidate.chain == "bsc" for candidate in results)
    assert any(candidate.watchlist_grade == "A" for candidate in results)


def test_search_market_candidates_uses_local_index_before_live(monkeypatch, tmp_path) -> None:
    _clear_search_result_cache()
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    refreshed_at = datetime(2026, 4, 24, 0, 0, tzinfo=timezone.utc)
    store.replace_market_search_index(
        [
            MarketSearchIndexRecord(
                provider="binance",
                source="direct",
                chain="",
                chain_rank=3,
                source_rank=0,
                stable_quote_rank=0,
                watchlist_rank=2,
                base_symbol="AERO",
                base_name="AERODROME",
                quote_symbol="USDT",
                canonical_symbol="AEROUSDT",
                token_address="",
                pair_address="",
                futures_listed=True,
                watchlist_grade=None,
                note="",
                liquidity_usd=0.0,
                volume_h24=0.0,
                price_change_h24=0.0,
                refreshed_at=refreshed_at,
            )
        ]
    )

    def _should_not_run(*args, **kwargs):
        raise AssertionError("live provider should not be called when index hits")

    shared_writes: list[dict[str, object]] = []

    monkeypatch.setattr(
        "data_cache.market_search.read_shared_search_results",
        lambda **kwargs: (None, None),
    )
    monkeypatch.setattr(
        "data_cache.market_search.write_shared_search_results",
        lambda **kwargs: shared_writes.append(kwargs),
    )
    monkeypatch.setattr("data_cache.market_search.fetch_futures_symbols", _should_not_run)
    monkeypatch.setattr("data_cache.market_search.fetch_dex_search_pairs", _should_not_run)
    monkeypatch.setattr("data_cache.market_search.fetch_dex_token_batch", _should_not_run)

    results = search_market_candidates("AERO", limit=5, store=store)

    assert len(results) == 1
    assert results[0].canonical_symbol == "AEROUSDT"
    assert results[0].provider == "binance"
    assert len(shared_writes) == 1
    assert shared_writes[0]["normalized_query"] == "AERO"


def test_search_market_candidates_uses_shared_cache_before_sqlite(monkeypatch, tmp_path) -> None:
    _clear_search_result_cache()
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")

    def _should_not_run(*args, **kwargs):
        raise AssertionError("SQLite index should not be read when shared cache hits")

    store.search_market_index = _should_not_run  # type: ignore[method-assign]

    monkeypatch.setattr(
        "data_cache.market_search.read_shared_search_results",
        lambda **kwargs: (
            "g-1",
            [
                {
                    "query": "AERO",
                    "provider": "binance",
                    "source": "direct",
                    "chain": "",
                    "base_symbol": "AERO",
                    "base_name": "Aerodrome",
                    "quote_symbol": "USDT",
                    "canonical_symbol": "AEROUSDT",
                    "token_address": "",
                    "pair_address": "",
                    "liquidity_usd": 0.0,
                    "volume_h24": 0.0,
                    "price_change_h24": 0.0,
                    "futures_listed": True,
                    "watchlist_grade": None,
                    "note": "",
                }
            ],
        ),
    )

    results = search_market_candidates("AERO", limit=5, store=store, allow_live_fallback=False)

    assert len(results) == 1
    assert results[0].canonical_symbol == "AEROUSDT"
    assert results[0].provider == "binance"


def test_search_market_candidates_uses_shared_wait_before_sqlite(monkeypatch, tmp_path) -> None:
    _clear_search_result_cache()
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")

    def _should_not_run(*args, **kwargs):
        raise AssertionError("SQLite index should not be read when shared wait returns a result")

    store.search_market_index = _should_not_run  # type: ignore[method-assign]

    monkeypatch.setattr(
        "data_cache.market_search.read_shared_search_results",
        lambda **kwargs: ("g-1", None),
    )
    monkeypatch.setattr(
        "data_cache.market_search.acquire_shared_query_build_lock",
        lambda **kwargs: ("g-1", None),
    )
    monkeypatch.setattr(
        "data_cache.market_search.wait_for_shared_search_results",
        lambda **kwargs: (
            "g-1",
            [
                {
                    "query": "AERO",
                    "provider": "binance",
                    "source": "direct",
                    "chain": "",
                    "base_symbol": "AERO",
                    "base_name": "Aerodrome",
                    "quote_symbol": "USDT",
                    "canonical_symbol": "AEROUSDT",
                    "token_address": "",
                    "pair_address": "",
                    "liquidity_usd": 0.0,
                    "volume_h24": 0.0,
                    "price_change_h24": 0.0,
                    "futures_listed": True,
                    "watchlist_grade": None,
                    "note": "",
                }
            ],
        ),
    )
    monkeypatch.setattr("data_cache.market_search.write_shared_search_results", lambda **kwargs: None)
    monkeypatch.setattr("data_cache.market_search.release_shared_query_build_lock", lambda **kwargs: None)

    results = search_market_candidates("AERO", limit=5, store=store, allow_live_fallback=False)

    assert len(results) == 1
    assert results[0].canonical_symbol == "AEROUSDT"
    assert results[0].provider == "binance"


def test_search_market_candidates_reuses_process_cache_for_index_hits(tmp_path) -> None:
    _clear_search_result_cache()
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    refreshed_at = datetime(2026, 4, 24, 0, 0, tzinfo=timezone.utc)
    store.replace_market_search_index(
        [
            MarketSearchIndexRecord(
                provider="binance",
                source="direct",
                chain="",
                chain_rank=3,
                source_rank=0,
                stable_quote_rank=0,
                watchlist_rank=2,
                base_symbol="AERO",
                base_name="AERODROME",
                quote_symbol="USDT",
                canonical_symbol="AEROUSDT",
                token_address="",
                pair_address="",
                futures_listed=True,
                watchlist_grade=None,
                note="",
                liquidity_usd=0.0,
                volume_h24=0.0,
                price_change_h24=0.0,
                refreshed_at=refreshed_at,
            )
        ]
    )

    call_count = 0
    original_search = store.search_market_index

    def _counted_search(*, normalized_query: str, canonical_query: str, contract_query: str | None, limit: int):
        nonlocal call_count
        call_count += 1
        return original_search(
            normalized_query=normalized_query,
            canonical_query=canonical_query,
            contract_query=contract_query,
            limit=limit,
        )

    store.search_market_index = _counted_search  # type: ignore[method-assign]

    first = search_market_candidates("AERO", limit=5, store=store, allow_live_fallback=False)
    second = search_market_candidates("AERO", limit=5, store=store, allow_live_fallback=False)

    assert len(first) == 1
    assert len(second) == 1
    assert call_count == 1


def test_search_market_candidates_coalesces_local_hot_miss(monkeypatch, tmp_path) -> None:
    _clear_search_result_cache()
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    refreshed_at = datetime(2026, 4, 24, 0, 0, tzinfo=timezone.utc)
    store.replace_market_search_index(
        [
            MarketSearchIndexRecord(
                provider="binance",
                source="direct",
                chain="",
                chain_rank=3,
                source_rank=0,
                stable_quote_rank=0,
                watchlist_rank=2,
                base_symbol="AERO",
                base_name="AERODROME",
                quote_symbol="USDT",
                canonical_symbol="AEROUSDT",
                token_address="",
                pair_address="",
                futures_listed=True,
                watchlist_grade=None,
                note="",
                liquidity_usd=0.0,
                volume_h24=0.0,
                price_change_h24=0.0,
                refreshed_at=refreshed_at,
            )
        ]
    )

    call_count = 0
    original_search = store.search_market_index
    start_barrier = threading.Barrier(3)
    results: list[list[MarketSearchCandidate]] = []
    errors: list[Exception] = []

    def _slow_search(*, normalized_query: str, canonical_query: str, contract_query: str | None, limit: int):
        nonlocal call_count
        call_count += 1
        time.sleep(0.1)
        return original_search(
            normalized_query=normalized_query,
            canonical_query=canonical_query,
            contract_query=contract_query,
            limit=limit,
        )

    def _worker() -> None:
        try:
            start_barrier.wait()
            results.append(search_market_candidates("AERO", limit=5, store=store, allow_live_fallback=False))
        except Exception as exc:  # pragma: no cover - debugging safety
            errors.append(exc)

    store.search_market_index = _slow_search  # type: ignore[method-assign]
    monkeypatch.setattr("data_cache.market_search.read_shared_search_results", lambda **kwargs: (None, None))
    monkeypatch.setattr("data_cache.market_search.acquire_shared_query_build_lock", lambda **kwargs: (None, None))
    monkeypatch.setattr("data_cache.market_search.write_shared_search_results", lambda **kwargs: None)

    first = threading.Thread(target=_worker)
    second = threading.Thread(target=_worker)
    first.start()
    second.start()
    start_barrier.wait()
    first.join()
    second.join()

    assert errors == []
    assert len(results) == 2
    assert all(len(batch) == 1 for batch in results)
    assert call_count == 1


def test_search_market_candidates_contract_query_uses_token_batch(monkeypatch, tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    seen_chains: list[str] = []
    query = "0x1234567890abcdef"

    monkeypatch.setattr("data_cache.market_search.fetch_futures_symbols", lambda: set())
    monkeypatch.setattr("data_cache.market_search.fetch_dex_search_pairs", lambda query, chains=None: [])

    def _fake_batch(addresses: list[str], chain: str = "bsc") -> list[dict]:
        seen_chains.append(chain)
        if chain != "bsc":
            return []
        return [
            {
                "chainId": "bsc",
                "pairAddress": "0xpair-bsc",
                "baseToken": {"symbol": "NIGHT", "address": query},
                "quoteToken": {"symbol": "USDT"},
                "liquidity": {"usd": 325_000},
                "volume": {"h24": 410_000},
                "priceChange": {"h24": 12.0},
            }
        ]

    monkeypatch.setattr("data_cache.market_search.fetch_dex_token_batch", _fake_batch)

    results = search_market_candidates(query, limit=5, store=store)

    assert seen_chains == ["bsc", "ethereum", "base"]
    assert len(results) == 1
    assert results[0].source == "contract"
    assert results[0].canonical_symbol == "NIGHTUSDT"
    assert results[0].token_address == query


def test_ingest_market_query_raw_skips_failed_candidate(monkeypatch) -> None:
    candidates = [
        MarketSearchCandidate(
            query="IN",
            provider="binance",
            source="direct",
            chain="ethereum",
            base_symbol="IN",
            base_name="IN",
            quote_symbol="USDT",
            canonical_symbol="INUSDT",
            token_address="",
            pair_address="",
            liquidity_usd=0.0,
            volume_h24=0.0,
            price_change_h24=0.0,
            futures_listed=False,
            watchlist_grade="A",
            note="",
        ),
        MarketSearchCandidate(
            query="IN",
            provider="dexscreener",
            source="search",
            chain="bsc",
            base_symbol="BTC",
            base_name="BITCOIN",
            quote_symbol="USDT",
            canonical_symbol="BTCUSDT",
            token_address="0xbtc",
            pair_address="0xpair",
            liquidity_usd=100_000.0,
            volume_h24=200_000.0,
            price_change_h24=1.0,
            futures_listed=True,
            watchlist_grade=None,
            note="",
        ),
    ]
    monkeypatch.setattr(
        "data_cache.market_search.search_market_candidates",
        lambda query, limit=10, store=None: candidates,
    )

    def _fake_ingest(symbol: str, *, timeframe: str = "1h", store=None, refresh_cache: bool = True):
        if symbol == "INUSDT":
            raise RuntimeError("spot invalid symbol")
        return RawIngestionResult(
            symbol=symbol,
            timeframe=timeframe,
            venue="binance_spot",
            fallback_state="none",
            market_bars_written=12,
            orderflow_metrics_written=12,
            perp_metrics_written=2,
            liquidation_status="empty",
            liquidation_credential_state="missing",
            liquidation_credential_env=None,
            liquidation_lookback_hours=24,
            liquidation_events_written=0,
            liquidation_windows_written=0,
            liquidation_source_scope="user_data",
            latest_market_bar_ts="2026-04-24T00:00:00+00:00",
            latest_perp_ts="2026-04-24T00:00:00+00:00",
            latest_liquidation_ts=None,
            db_path="/tmp/canonical_raw.sqlite",
            ingested_at="2026-04-24T00:01:00+00:00",
        )

    monkeypatch.setattr("data_cache.market_search.ingest_binance_symbol_raw", _fake_ingest)

    result = ingest_market_query_raw("IN")

    assert result.selected_candidate["canonical_symbol"] == "BTCUSDT"
    assert result.raw_result["symbol"] == "BTCUSDT"
    assert result.failed_candidates == [
        {"canonical_symbol": "INUSDT", "error": "spot invalid symbol"}
    ]


def test_refresh_market_search_index_replaces_index(monkeypatch, tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    bumped: list[str] = []

    monkeypatch.setattr("data_cache.market_search.fetch_futures_symbols", lambda: {"AEROUSDT"})
    monkeypatch.setattr(
        "data_cache.market_search.fetch_dex_latest_profiles",
        lambda chain="bsc": [{"tokenAddress": "0xaaa"}] if chain == "base" else [],
    )
    monkeypatch.setattr("data_cache.market_search.fetch_dex_community_takeovers", lambda chain="bsc": [])
    monkeypatch.setattr("data_cache.market_search.fetch_dex_boosted_tokens", lambda chain="bsc": [])
    monkeypatch.setattr(
        "data_cache.market_search.fetch_dex_token_batch",
        lambda addresses, chain="bsc": [
            {
                "chainId": "base",
                "pairAddress": "0xpair",
                "baseToken": {"symbol": "AERO", "name": "Aerodrome", "address": "0xaaa"},
                "quoteToken": {"symbol": "USDC"},
                "liquidity": {"usd": 100_000},
                "volume": {"h24": 200_000},
                "priceChange": {"h24": 3.5},
            }
        ]
        if chain == "base"
        else [],
    )
    monkeypatch.setattr(
        "data_cache.market_search.bump_shared_search_generation",
        lambda db_path: bumped.append(db_path) or "gen-1",
    )

    result = refresh_market_search_index(store=store)
    rows = search_market_candidates("AERO", limit=5, store=store, allow_live_fallback=False)

    assert result.row_count >= 1
    assert rows[0].canonical_symbol == "AEROUSDT"
    assert rows[0].provider == "binance"
    assert any(candidate.provider == "dexscreener" for candidate in rows)
    assert bumped == [str(store.db_path)]
