"""W-0400 Phase 2A: tests for GET /indicators/catalog and /indicators/series.

Uses a minimal FastAPI app containing only the indicators router — no JWT
middleware, no Redis/Supabase needed.
"""
from __future__ import annotations

import asyncio
import time
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address


# ---------------------------------------------------------------------------
# Fake OHLCV data helper
# ---------------------------------------------------------------------------

def _fake_df(n: int = 1500) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    idx = pd.date_range("2024-01-01", periods=n, freq="15min", tz="UTC")
    close = pd.Series(rng.standard_normal(n).cumsum() + 50_000, index=idx)
    return pd.DataFrame({
        "open": close * 0.999,
        "high": close * 1.001,
        "low": close * 0.998,
        "close": close,
        "volume": rng.uniform(100, 1000, n),
    })


FAKE_DF_1500 = _fake_df(1500)


# ---------------------------------------------------------------------------
# Minimal app fixture — indicators router only, no auth middleware
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    """Minimal FastAPI app with just the indicators router."""
    from api.routes.indicators import router
    _app = FastAPI()
    # Wire up the same limiter the router uses
    from api.limiter import limiter
    _app.state.limiter = limiter
    _app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    _app.include_router(router, prefix="/indicators")
    with TestClient(_app, raise_server_exceptions=True) as c:
        yield c


# ---------------------------------------------------------------------------
# Catalog tests
# ---------------------------------------------------------------------------

class TestCatalog:
    def test_catalog_200(self, client):
        r = client.get("/indicators/catalog")
        assert r.status_code == 200

    def test_catalog_count_ge_100(self, client):
        r = client.get("/indicators/catalog")
        data = r.json()
        assert data["count"] >= 100
        assert len(data["indicators"]) >= 100

    def test_catalog_has_required_fields(self, client):
        r = client.get("/indicators/catalog")
        indicators = r.json()["indicators"]
        for ind in indicators[:5]:
            assert "id" in ind
            assert "label" in ind
            assert "family" in ind
            assert "outputs" in ind


# ---------------------------------------------------------------------------
# Series tests
# ---------------------------------------------------------------------------

class TestSeries:
    def _get_series(self, client, indicator: str, params: str | None = None, limit: int = 1500):
        url = f"/indicators/series?symbol=BTCUSDT&timeframe=15m&indicator={indicator}&limit={limit}"
        if params:
            url += f"&params={params}"
        with patch("data_cache.loader.load_klines", return_value=FAKE_DF_1500.copy()):
            return client.get(url)

    def test_sma_1500_bars_returns_1481_points(self, client):
        """AC2A-1: SMA(20) on 1500 bars → 1481 non-NaN points."""
        r = self._get_series(client, "sma_20", params="length:20", limit=1500)
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 1481  # 1500 - 20 + 1

    def test_unknown_indicator_404(self, client):
        r = self._get_series(client, "not_real_indicator_xyz")
        assert r.status_code == 404

    def test_bad_param_key_400(self, client):
        r = self._get_series(client, "sma_20", params="nonexistent_param:5")
        assert r.status_code == 400

    def test_bad_param_value_type_400(self, client):
        r = self._get_series(client, "sma_20", params="length:not_a_number")
        assert r.status_code == 400

    def test_rsi_values_0_to_100(self, client):
        r = self._get_series(client, "rsi_14", limit=1500)
        assert r.status_code == 200
        points = r.json()["points"]
        assert len(points) > 0
        for p in points:
            assert 0 <= p["v"] <= 100, f"RSI out of range: {p['v']}"

    def test_macd_has_required_outputs(self, client):
        r = self._get_series(client, "macd_12_26_9", limit=1500)
        assert r.status_code == 200
        data = r.json()
        assert "outputs" in data
        assert "macd" in data["outputs"]
        assert "signal" in data["outputs"]
        assert "hist" in data["outputs"]

    def test_bb_has_upper_mid_lower(self, client):
        r = self._get_series(client, "bb_20_2", limit=1500)
        assert r.status_code == 200
        data = r.json()
        assert "outputs" in data
        assert "upper" in data["outputs"]
        assert "mid" in data["outputs"]
        assert "lower" in data["outputs"]

    def test_stoch_has_k_d(self, client):
        r = self._get_series(client, "stoch_14_3", limit=1500)
        assert r.status_code == 200
        data = r.json()
        assert "outputs" in data
        assert "k" in data["outputs"]
        assert "d" in data["outputs"]

    def test_vwap_values_positive(self, client):
        r = self._get_series(client, "vwap", limit=1500)
        assert r.status_code == 200
        points = r.json()["points"]
        assert len(points) > 0
        for p in points:
            assert p["v"] > 0, f"VWAP must be positive: {p['v']}"

    def test_atr_values_non_negative(self, client):
        r = self._get_series(client, "atr_14", limit=1500)
        assert r.status_code == 200
        points = r.json()["points"]
        assert len(points) > 0
        for p in points:
            assert p["v"] >= 0, f"ATR must be non-negative: {p['v']}"

    def test_obv_returns_floats(self, client):
        r = self._get_series(client, "obv", limit=1500)
        assert r.status_code == 200
        points = r.json()["points"]
        assert len(points) > 0
        for p in points:
            assert isinstance(p["v"], (int, float))

    def test_small_limit_returns_at_least_1_point(self, client):
        r = self._get_series(client, "sma_5", params="length:5", limit=10)
        assert r.status_code == 200
        data = r.json()
        assert data["count"] >= 1

    def test_no_params_uses_defaults(self, client):
        """No params query → indicator uses its default params → returns 200."""
        r = self._get_series(client, "sma_20", limit=200)
        assert r.status_code == 200
        data = r.json()
        assert data["count"] > 0

    def test_symbol_and_timeframe_in_response(self, client):
        r = self._get_series(client, "ema_20", limit=100)
        assert r.status_code == 200
        data = r.json()
        assert data["symbol"] == "BTCUSDT"
        assert data["timeframe"] == "15m"
        assert data["indicator"] == "ema_20"


# ---------------------------------------------------------------------------
# Cache tests
# ---------------------------------------------------------------------------

class TestTTLCache:
    def test_set_then_get_returns_same_value(self):
        from indicators.cache import TTLCache
        c = TTLCache(max_size=10, ttl=60.0)
        c.set("key1", {"data": 42})
        assert c.get("key1") == {"data": 42}

    def test_expired_entry_returns_none(self):
        from indicators.cache import TTLCache
        c = TTLCache(max_size=10, ttl=0.01)  # 10ms TTL
        c.set("key2", "value")
        time.sleep(0.05)
        assert c.get("key2") is None

    def test_lru_eviction_on_max_size(self):
        from indicators.cache import TTLCache
        c = TTLCache(max_size=3, ttl=60.0)
        c.set("a", 1)
        c.set("b", 2)
        c.set("c", 3)
        c.set("d", 4)  # "a" should be evicted
        assert c.get("a") is None
        assert c.get("b") == 2


# ---------------------------------------------------------------------------
# Singleflight concurrency test
# ---------------------------------------------------------------------------

class TestSingleflight:
    def test_concurrent_same_key_no_deadlock(self):
        """5 concurrent requests for same key should all get the same result."""
        from indicators.cache import Singleflight

        call_count = 0

        async def _run():
            nonlocal call_count
            sf = Singleflight()
            results = []
            events = []

            async def compute_fn():
                nonlocal call_count
                call_count += 1
                await asyncio.sleep(0.05)
                return "result_value"

            async def caller():
                val = await sf.call("shared_key", compute_fn)
                results.append(val)

            await asyncio.gather(*[caller() for _ in range(5)])
            return results

        results = asyncio.run(_run())
        assert len(results) == 5
        assert all(r == "result_value" for r in results)
        # Only one actual compute should have run (singleflight dedup)
        assert call_count == 1
