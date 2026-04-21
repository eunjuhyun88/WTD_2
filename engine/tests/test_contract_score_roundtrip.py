from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from api.main import app


def _bars(n: int = 520) -> list[dict]:
    rng = np.random.default_rng(7)
    returns = rng.normal(0.0002, 0.004, size=n)
    close = 100 * np.exp(np.cumsum(returns))
    high = close * (1 + np.abs(rng.normal(0, 0.0015, size=n)))
    low = close * (1 - np.abs(rng.normal(0, 0.0015, size=n)))
    open_ = np.concatenate([[close[0]], close[:-1]])
    vol = rng.uniform(1000, 5000, size=n)
    tbv = vol * rng.uniform(0.3, 0.7, size=n)
    idx = pd.date_range("2025-01-01", periods=n, freq="1h", tz="UTC").astype("int64") // 10**6
    return [
        {"t": int(idx[i]), "o": float(open_[i]), "h": float(high[i]), "l": float(low[i]), "c": float(close[i]), "v": float(vol[i]), "tbv": float(tbv[i])}
        for i in range(n)
    ]


def test_score_roundtrip_contract(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_INTERNAL_SECRET", "test-secret")
    client = TestClient(app, base_url="http://localhost")
    payload = {
        "symbol": "BTCUSDT",
        "klines": _bars(),
        "perp": {
            "funding_rate": 0.0,
            "oi_change_1h": 0.0,
            "oi_change_24h": 0.0,
            "long_short_ratio": 1.0,
        },
    }
    r = client.post(
        "/score",
        json=payload,
        headers={"x-engine-internal-secret": "test-secret"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "snapshot" in body
    assert "p_win" in body
    assert "blocks_triggered" in body
