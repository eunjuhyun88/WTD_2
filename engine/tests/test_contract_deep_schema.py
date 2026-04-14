from __future__ import annotations

from api.schemas import DeepRequest, DeepResponse


def test_deep_request_accepts_contract_payload() -> None:
    payload = {
        "symbol": "ETHUSDT",
        "klines": [
            {"t": 1710000000000, "o": 3000.0, "h": 3020.0, "l": 2990.0, "c": 3010.0, "v": 900.0, "tbv": 420.0}
        ],
        "perp": {
            "fr": 0.0002,
            "oi_pct": 3.4,
            "ls_ratio": 1.07,
            "taker_ratio": 1.12,
            "price_pct": 0.7,
            "oi_notional": 1_250_000_000.0,
            "vol_24h": 8_900_000_000.0,
            "mark_price": 3012.0,
            "index_price": 3010.5,
            "short_liq_usd": 120_000.0,
            "long_liq_usd": 80_000.0,
        },
    }

    req = DeepRequest.model_validate(payload)
    assert req.symbol == "ETHUSDT"
    assert req.perp.oi_notional == 1_250_000_000.0


def test_deep_response_accepts_contract_payload() -> None:
    payload = {
        "symbol": "ETHUSDT",
        "total_score": 37.5,
        "verdict": "BULLISH",
        "layers": {
            "l1": {"score": 10.0, "sigs": [{"t": "trend", "type": "bull"}], "meta": {"strength": "high"}}
        },
        "atr_levels": {"atr": 12.4, "stop_long": 2988.0, "tp1_long": 3040.0},
        "alpha": {"score": 0.41},
        "hunt_score": 2,
    }

    res = DeepResponse.model_validate(payload)
    assert res.verdict == "BULLISH"
    assert "l1" in res.layers
