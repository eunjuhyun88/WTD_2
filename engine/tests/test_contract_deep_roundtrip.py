from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from api.main import app


def _bars(n: int = 180) -> list[dict]:
    rng = np.random.default_rng(13)
    returns = rng.normal(0.0001, 0.005, size=n)
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


def test_deep_roundtrip_contract() -> None:
    client = TestClient(app)
    payload = {
        "symbol": "BTCUSDT",
        "klines": _bars(),
        "perp": {
            "fr": 0.0,
            "oi_pct": 0.0,
            "ls_ratio": 1.0,
            "taker_ratio": 0.5,
            "price_pct": 0.0,
        },
    }
    r = client.post("/deep", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "symbol" in body
    assert "layers" in body
    assert "verdict" in body

