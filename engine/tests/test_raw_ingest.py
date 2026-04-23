from __future__ import annotations

import sqlite3

import pandas as pd

from data_cache.raw_ingest import ingest_binance_symbol_raw
from data_cache.raw_store import CanonicalRawStore


def _market_df() -> pd.DataFrame:
    index = pd.date_range("2026-04-24T00:00:00Z", periods=2, freq="1h", tz="UTC")
    return pd.DataFrame(
        {
            "open": [100.0, 101.0],
            "high": [102.0, 103.0],
            "low": [99.0, 100.0],
            "close": [101.0, 102.0],
            "volume": [1000.0, 1200.0],
            "quote_volume": [101_000.0, 122_400.0],
            "trade_count": [200, 240],
            "taker_buy_base_volume": [600.0, 500.0],
            "taker_buy_quote_volume": [60_600.0, 51_000.0],
        },
        index=index,
    )


def _perp_df() -> pd.DataFrame:
    index = pd.to_datetime(
        [
            "2026-04-24T00:00:00Z",
            "2026-04-24T08:00:00Z",
            "2026-04-24T08:00:00.004Z",
        ],
        utc=True,
        format="mixed",
    )
    return pd.DataFrame(
        {
            "funding_rate": [-0.001, None, 0.002],
            "oi_raw": [1000.0, 1250.0, None],
            "oi_change_1h": [0.01, 0.05, None],
            "oi_change_24h": [0.09, 0.18, None],
            "long_short_ratio": [1.1, None, None],
        },
        index=index,
    )


def test_ingest_binance_symbol_raw_writes_market_orderflow_and_perp(monkeypatch, tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")

    monkeypatch.setattr("data_cache.raw_ingest.fetch_klines_max", lambda symbol, timeframe: _market_df())
    monkeypatch.setattr("data_cache.raw_ingest.fetch_perp_raw", lambda symbol: _perp_df())

    result = ingest_binance_symbol_raw(
        "BTCUSDT",
        timeframe="1h",
        store=store,
        refresh_cache=False,
    )

    assert result.venue == "binance_spot"
    assert result.fallback_state == "none"
    assert result.market_bars_written == 2
    assert result.orderflow_metrics_written == 2
    assert result.perp_metrics_written == 2

    conn = sqlite3.connect(store.db_path)
    conn.row_factory = sqlite3.Row
    try:
        orderflow = conn.execute(
            "SELECT taker_buy_volume, taker_sell_volume, buy_sell_delta, taker_buy_ratio "
            "FROM raw_orderflow_metrics WHERE symbol = ? ORDER BY ts ASC",
            ("BTCUSDT",),
        ).fetchone()
        assert orderflow is not None
        assert orderflow["taker_buy_volume"] == 600.0
        assert orderflow["taker_sell_volume"] == 400.0
        assert orderflow["buy_sell_delta"] == 200.0
        assert orderflow["taker_buy_ratio"] == 0.6

        perp = conn.execute(
            "SELECT ts, quality_state, long_short_ratio, funding_rate "
            "FROM raw_perp_metrics WHERE symbol = ? ORDER BY ts DESC",
            ("BTCUSDT",),
        ).fetchone()
        assert perp is not None
        assert perp["quality_state"] == "partial"
        assert perp["long_short_ratio"] is None
        assert perp["funding_rate"] == 0.002
    finally:
        conn.close()


def test_ingest_binance_symbol_raw_falls_back_to_futures(monkeypatch, tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")

    def _raise_invalid(symbol: str, timeframe: str) -> pd.DataFrame:
        raise RuntimeError('HTTP 400 for PTBUSDT: {"code":-1121,"msg":"Invalid symbol."}')

    monkeypatch.setattr("data_cache.raw_ingest.fetch_klines_max", _raise_invalid)
    monkeypatch.setattr("data_cache.raw_ingest.fetch_futures_klines_max", lambda symbol, timeframe: _market_df())
    monkeypatch.setattr("data_cache.raw_ingest.fetch_perp_raw", lambda symbol: _perp_df())

    result = ingest_binance_symbol_raw(
        "PTBUSDT",
        timeframe="1h",
        store=store,
        refresh_cache=False,
    )

    assert result.venue == "binance_futures"
    assert result.fallback_state == "spot_invalid_symbol_futures"
    assert store.count_rows("raw_market_bars", symbol="PTBUSDT", timeframe="1h") == 2


def test_ingest_binance_symbol_raw_replaces_existing_symbol_slice(monkeypatch, tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")
    first_market = _market_df()
    second_market = _market_df().iloc[-1:].copy()
    second_market.index = pd.date_range("2026-04-24T02:00:00Z", periods=1, freq="1h", tz="UTC")
    second_market.loc[:, "close"] = 103.0
    second_perp = _perp_df().iloc[-1:].copy()

    monkeypatch.setattr("data_cache.raw_ingest.fetch_klines_max", lambda symbol, timeframe: first_market)
    monkeypatch.setattr("data_cache.raw_ingest.fetch_perp_raw", lambda symbol: _perp_df())
    ingest_binance_symbol_raw("BTCUSDT", timeframe="1h", store=store, refresh_cache=False)

    monkeypatch.setattr("data_cache.raw_ingest.fetch_klines_max", lambda symbol, timeframe: second_market)
    monkeypatch.setattr("data_cache.raw_ingest.fetch_perp_raw", lambda symbol: second_perp)
    result = ingest_binance_symbol_raw("BTCUSDT", timeframe="1h", store=store, refresh_cache=False)

    assert result.market_bars_written == 1
    assert result.perp_metrics_written == 1
    assert store.count_rows("raw_market_bars", symbol="BTCUSDT", timeframe="1h") == 1
    assert store.count_rows("raw_perp_metrics", symbol="BTCUSDT", timeframe="1h") == 1
