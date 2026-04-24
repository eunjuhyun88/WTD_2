from __future__ import annotations

from datetime import datetime, timezone

from data_cache.raw_store import (
    CanonicalRawStore,
    MarketSearchIndexRecord,
    MarketLiquidationWindowRecord,
    RawLiquidationEventRecord,
    RawMarketBarRecord,
    RawOrderflowMetricRecord,
    RawPerpMetricRecord,
)


def _dt(hour: int) -> datetime:
    return datetime(2026, 4, 24, hour, 0, tzinfo=timezone.utc)


def test_raw_store_upserts_and_counts_rows(tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    ingested_at = _dt(12)

    market_rows = [
        RawMarketBarRecord(
            provider="binance",
            venue="binance_spot",
            symbol="BTCUSDT",
            timeframe="1h",
            ts=_dt(10),
            source_ts=_dt(10),
            ingested_at=ingested_at,
            freshness_ms=7_200_000,
            quality_state="complete",
            fallback_state="none",
            open=100.0,
            high=102.0,
            low=99.0,
            close=101.0,
            volume=1500.0,
            quote_volume=151_000.0,
            trade_count=321,
            taker_buy_base_volume=800.0,
            taker_buy_quote_volume=80_100.0,
        )
    ]
    orderflow_rows = [
        RawOrderflowMetricRecord(
            provider="binance",
            venue="binance_spot",
            symbol="BTCUSDT",
            timeframe="1h",
            ts=_dt(10),
            source_ts=_dt(10),
            ingested_at=ingested_at,
            freshness_ms=7_200_000,
            quality_state="complete",
            fallback_state="none",
            taker_buy_volume=800.0,
            taker_sell_volume=700.0,
            buy_sell_delta=100.0,
            taker_buy_quote_volume=80_100.0,
            taker_sell_quote_volume=70_900.0,
            taker_buy_ratio=800.0 / 1500.0,
            trade_count=321,
        )
    ]
    perp_rows = [
        RawPerpMetricRecord(
            provider="binance",
            venue="binance_futures",
            symbol="BTCUSDT",
            timeframe="1h",
            ts=_dt(10),
            source_ts=_dt(10),
            ingested_at=ingested_at,
            freshness_ms=7_200_000,
            quality_state="partial",
            fallback_state="none",
            funding_rate=-0.0005,
            open_interest=12_000.0,
            oi_change_1h=0.03,
            oi_change_24h=0.14,
            long_short_ratio=None,
        )
    ]

    assert store.upsert_market_bars(market_rows) == 1
    assert store.upsert_orderflow_metrics(orderflow_rows) == 1
    assert store.upsert_perp_metrics(perp_rows) == 1

    assert store.count_rows("raw_market_bars", symbol="BTCUSDT", timeframe="1h") == 1
    assert store.count_rows("raw_orderflow_metrics", symbol="BTCUSDT", timeframe="1h") == 1
    assert store.count_rows("raw_perp_metrics", symbol="BTCUSDT", timeframe="1h") == 1
    assert store.latest_timestamp("raw_market_bars", symbol="BTCUSDT", timeframe="1h") == _dt(10)


def test_raw_store_upserts_liquidation_events_and_tracks_latest(tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    ingested_at = _dt(12)

    rows = [
        RawLiquidationEventRecord(
            provider="binance",
            venue="binance_futures",
            symbol="BTCUSDT",
            ts=_dt(9),
            source_ts=_dt(9),
            ingested_at=ingested_at,
            freshness_ms=10_800_000,
            quality_state="complete",
            fallback_state="none",
            event_id="liq-1",
            side="BUY",
            order_price=90_000.0,
            average_price=89_950.0,
            quantity=10.0,
            executed_quantity=10.0,
            quote_quantity=899_500.0,
            notional_usd=899_500.0,
            order_type="LIMIT",
            time_in_force="IOC",
            status="FILLED",
        ),
        RawLiquidationEventRecord(
            provider="binance",
            venue="binance_futures",
            symbol="BTCUSDT",
            ts=_dt(11),
            source_ts=_dt(11),
            ingested_at=ingested_at,
            freshness_ms=3_600_000,
            quality_state="complete",
            fallback_state="none",
            event_id="liq-2",
            side="SELL",
            order_price=88_000.0,
            average_price=87_950.0,
            quantity=12.0,
            executed_quantity=12.0,
            quote_quantity=1_055_400.0,
            notional_usd=1_055_400.0,
            order_type="MARKET",
            time_in_force="IOC",
            status="FILLED",
        ),
    ]

    assert store.upsert_liquidation_events(rows) == 2
    assert store.count_rows("raw_liquidation_events", symbol="BTCUSDT") == 2
    assert store.latest_timestamp("raw_liquidation_events", symbol="BTCUSDT") == _dt(11)


def test_raw_store_upserts_liquidation_windows(tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    ingested_at = _dt(12)

    windows = [
        MarketLiquidationWindowRecord(
            provider="binance",
            venue="binance_futures",
            symbol="BTCUSDT",
            timeframe="1h",
            window_start_ts=_dt(10),
            window_end_ts=_dt(11),
            source_start_ts=_dt(10),
            source_end_ts=_dt(10),
            ingested_at=ingested_at,
            freshness_ms=7_200_000,
            quality_state="complete",
            fallback_state="none",
            event_count=2,
            short_event_count=1,
            long_event_count=1,
            short_liq_usd=500.0,
            long_liq_usd=300.0,
            total_liq_usd=800.0,
            net_liq_usd=200.0,
            dominant_side="short_liq",
            dominance_share=0.625,
            imbalance_ratio=0.25,
            largest_event_usd=500.0,
            largest_event_side="BUY",
        )
    ]

    assert store.upsert_liquidation_windows(windows) == 1
    assert store.count_rows("market_liquidation_windows", symbol="BTCUSDT", timeframe="1h") == 1


def test_raw_store_upsert_replaces_existing_row(tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    first_ingest = _dt(12)
    second_ingest = _dt(13)

    initial = RawMarketBarRecord(
        provider="binance",
        venue="binance_spot",
        symbol="ETHUSDT",
        timeframe="1h",
        ts=_dt(11),
        source_ts=_dt(11),
        ingested_at=first_ingest,
        freshness_ms=3_600_000,
        quality_state="complete",
        fallback_state="none",
        open=200.0,
        high=202.0,
        low=198.0,
        close=201.0,
        volume=900.0,
        quote_volume=180_000.0,
        trade_count=100,
        taker_buy_base_volume=450.0,
        taker_buy_quote_volume=90_000.0,
    )
    updated = RawMarketBarRecord(
        provider="binance",
        venue="binance_spot",
        symbol="ETHUSDT",
        timeframe="1h",
        ts=_dt(11),
        source_ts=_dt(11),
        ingested_at=second_ingest,
        freshness_ms=7_200_000,
        quality_state="complete",
        fallback_state="none",
        open=200.0,
        high=203.0,
        low=197.5,
        close=202.0,
        volume=950.0,
        quote_volume=191_000.0,
        trade_count=101,
        taker_buy_base_volume=500.0,
        taker_buy_quote_volume=100_500.0,
    )

    store.upsert_market_bars([initial])
    store.upsert_market_bars([updated])

    assert store.count_rows("raw_market_bars", symbol="ETHUSDT", timeframe="1h") == 1
    assert store.latest_timestamp("raw_market_bars", symbol="ETHUSDT", timeframe="1h") == _dt(11)


def test_market_search_index_replace_and_lookup(tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    refreshed_at = _dt(14)
    rows = [
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
        ),
        MarketSearchIndexRecord(
            provider="dexscreener",
            source="discovery",
            chain="base",
            chain_rank=2,
            source_rank=1,
            stable_quote_rank=0,
            watchlist_rank=2,
            base_symbol="AERO",
            base_name="AERODROMEFINANCE",
            quote_symbol="USDC",
            canonical_symbol="AEROUSDT",
            token_address="0xabc",
            pair_address="0xpair",
            futures_listed=True,
            watchlist_grade=None,
            note="",
            liquidity_usd=500_000.0,
            volume_h24=900_000.0,
            price_change_h24=4.2,
            refreshed_at=refreshed_at,
        ),
    ]

    assert store.replace_market_search_index(rows) == 2
    count, latest_refresh = store.market_search_index_status()

    assert count == 2
    assert latest_refresh == refreshed_at

    exact = store.search_market_index(
        normalized_query="AERO",
        canonical_query="AEROUSDT",
        contract_query=None,
        limit=5,
    )
    assert len(exact) == 2
    assert exact[0]["provider"] == "binance"

    contract = store.search_market_index(
        normalized_query="",
        canonical_query="",
        contract_query="0xabc",
        limit=5,
    )
    assert len(contract) == 1
    assert contract[0]["pair_address"] == "0xpair"
