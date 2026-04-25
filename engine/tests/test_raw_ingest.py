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


def _liquidation_df() -> pd.DataFrame:
    index = pd.to_datetime(
        [
            "2026-04-24T00:15:00Z",
            "2026-04-24T00:45:00Z",
        ],
        utc=True,
    )
    return pd.DataFrame(
        {
            "event_id": ["liq-a", "liq-b"],
            "side": ["BUY", "SELL"],
            "order_price": [100.5, 99.0],
            "average_price": [100.4, 98.9],
            "quantity": [5.0, 8.0],
            "executed_quantity": [5.0, 8.0],
            "quote_quantity": [502.0, 791.2],
            "notional_usd": [502.0, 791.2],
            "order_type": ["LIMIT", "MARKET"],
            "time_in_force": ["IOC", "IOC"],
            "status": ["FILLED", "FILLED"],
        },
        index=index,
    )


def test_ingest_binance_symbol_raw_writes_market_orderflow_and_perp(monkeypatch, tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")

    monkeypatch.setattr(
        "data_cache.raw_ingest.resolve_binance_api_key",
        lambda: type("R", (), {"state": "configured", "env_var": "BINANCE_API_KEY"})(),
    )
    monkeypatch.setattr("data_cache.raw_ingest.fetch_klines_max", lambda symbol, timeframe: _market_df())
    monkeypatch.setattr("data_cache.raw_ingest.fetch_perp_raw", lambda symbol: _perp_df())
    monkeypatch.setattr(
        "data_cache.raw_ingest.fetch_force_orders_range",
        lambda symbol, lookback_hours: _liquidation_df(),
    )

    result = ingest_binance_symbol_raw(
        "BTCUSDT",
        timeframe="1h",
        store=store,
        refresh_cache=False,
        include_liquidations=True,
    )

    assert result.venue == "binance_spot"
    assert result.fallback_state == "none"
    assert result.market_bars_written == 2
    assert result.orderflow_metrics_written == 2
    assert result.perp_metrics_written == 2
    assert result.liquidation_status == "ok"
    assert result.liquidation_credential_state == "configured"
    assert result.liquidation_credential_env == "BINANCE_API_KEY"
    assert result.liquidation_events_written == 2
    assert result.liquidation_windows_written == 2

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

        liq = conn.execute(
            "SELECT event_id, side, notional_usd, status "
            "FROM raw_liquidation_events WHERE symbol = ? ORDER BY ts ASC",
            ("BTCUSDT",),
        ).fetchone()
        assert liq is not None
        assert liq["event_id"] == "liq-a"
        assert liq["side"] == "BUY"
        assert liq["notional_usd"] == 502.0
        assert liq["status"] == "FILLED"

        liq_window = conn.execute(
            "SELECT timeframe, event_count, short_liq_usd, long_liq_usd, dominant_side "
            "FROM market_liquidation_windows WHERE symbol = ? AND timeframe = ?",
            ("BTCUSDT", "1h"),
        ).fetchone()
        assert liq_window is not None
        assert liq_window["event_count"] == 2
        assert liq_window["short_liq_usd"] == 502.0
        assert liq_window["long_liq_usd"] == 791.2
        assert liq_window["dominant_side"] == "long_liq"
    finally:
        conn.close()


def test_ingest_binance_symbol_raw_falls_back_to_futures(monkeypatch, tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")

    def _raise_invalid(symbol: str, timeframe: str) -> pd.DataFrame:
        raise RuntimeError('HTTP 400 for PTBUSDT: {"code":-1121,"msg":"Invalid symbol."}')

    monkeypatch.setattr(
        "data_cache.raw_ingest.resolve_binance_api_key",
        lambda: type("R", (), {"state": "configured", "env_var": "BINANCE_API_KEY"})(),
    )
    monkeypatch.setattr("data_cache.raw_ingest.fetch_klines_max", _raise_invalid)
    monkeypatch.setattr("data_cache.raw_ingest.fetch_futures_klines_max", lambda symbol, timeframe: _market_df())
    monkeypatch.setattr("data_cache.raw_ingest.fetch_perp_raw", lambda symbol: _perp_df())
    monkeypatch.setattr(
        "data_cache.raw_ingest.fetch_force_orders_range",
        lambda symbol, lookback_hours: _liquidation_df(),
    )

    result = ingest_binance_symbol_raw(
        "PTBUSDT",
        timeframe="1h",
        store=store,
        refresh_cache=False,
        include_liquidations=True,
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

    monkeypatch.setattr(
        "data_cache.raw_ingest.resolve_binance_api_key",
        lambda: type("R", (), {"state": "configured", "env_var": "BINANCE_API_KEY"})(),
    )
    monkeypatch.setattr("data_cache.raw_ingest.fetch_klines_max", lambda symbol, timeframe: first_market)
    monkeypatch.setattr("data_cache.raw_ingest.fetch_perp_raw", lambda symbol: _perp_df())
    monkeypatch.setattr(
        "data_cache.raw_ingest.fetch_force_orders_range",
        lambda symbol, lookback_hours: _liquidation_df(),
    )
    ingest_binance_symbol_raw(
        "BTCUSDT",
        timeframe="1h",
        store=store,
        refresh_cache=False,
        include_liquidations=True,
    )

    monkeypatch.setattr("data_cache.raw_ingest.fetch_klines_max", lambda symbol, timeframe: second_market)
    monkeypatch.setattr("data_cache.raw_ingest.fetch_perp_raw", lambda symbol: second_perp)
    result = ingest_binance_symbol_raw(
        "BTCUSDT",
        timeframe="1h",
        store=store,
        refresh_cache=False,
        include_liquidations=True,
    )

    assert result.market_bars_written == 1
    assert result.perp_metrics_written == 1
    assert store.count_rows("raw_market_bars", symbol="BTCUSDT", timeframe="1h") == 1
    assert store.count_rows("raw_perp_metrics", symbol="BTCUSDT", timeframe="1h") == 1
    assert store.count_rows("raw_liquidation_events", symbol="BTCUSDT") == 2
    assert store.count_rows("market_liquidation_windows", symbol="BTCUSDT", timeframe="1h") == 1


def test_ingest_binance_symbol_raw_soft_handles_unavailable_liquidations(monkeypatch, tmp_path) -> None:
    store = CanonicalRawStore(tmp_path / "canonical_raw.sqlite")

    monkeypatch.setattr(
        "data_cache.raw_ingest.resolve_binance_api_key",
        lambda: type("R", (), {"state": "missing", "env_var": None})(),
    )
    monkeypatch.setattr("data_cache.raw_ingest.fetch_klines_max", lambda symbol, timeframe: _market_df())
    monkeypatch.setattr("data_cache.raw_ingest.fetch_perp_raw", lambda symbol: _perp_df())

    def _raise_invalid(symbol: str, lookback_hours: int) -> pd.DataFrame:
        raise RuntimeError('HTTP 401 for /fapi/v1/forceOrders?symbol=TEST: {"code":-2014,"msg":"API-key format invalid."}')

    monkeypatch.setattr("data_cache.raw_ingest.fetch_force_orders_range", _raise_invalid)

    result = ingest_binance_symbol_raw(
        "TESTUSDT",
        timeframe="1h",
        store=store,
        refresh_cache=False,
        include_liquidations=True,
    )

    assert result.liquidation_status == "unavailable"
    assert result.liquidation_credential_state == "missing"
    assert result.liquidation_credential_env is None
    assert result.liquidation_events_written == 0
    assert result.liquidation_windows_written == 0
    assert store.count_rows("raw_liquidation_events", symbol="TESTUSDT") == 0
    assert store.count_rows("market_liquidation_windows", symbol="TESTUSDT", timeframe="1h") == 0
