from __future__ import annotations

from api.schemas import ScoreRequest, ScoreResponse


def test_score_request_accepts_contract_payload() -> None:
    payload = {
        "symbol": "BTCUSDT",
        "klines": [
            {"t": 1710000000000, "o": 100.0, "h": 102.0, "l": 99.5, "c": 101.0, "v": 1500.0, "tbv": 700.0},
            {"t": 1710000060000, "o": 101.0, "h": 103.0, "l": 100.0, "c": 102.5, "v": 1400.0, "tbv": 600.0},
        ],
        "perp": {
            "funding_rate": 0.0001,
            "oi_change_1h": 2.3,
            "oi_change_24h": 5.1,
            "long_short_ratio": 1.05,
            "taker_buy_ratio": 1.2,
        },
    }

    req = ScoreRequest.model_validate(payload)
    assert req.symbol == "BTCUSDT"
    assert len(req.klines) == 2
    assert req.perp.long_short_ratio == 1.05


def test_score_response_accepts_contract_payload() -> None:
    payload = {
        "snapshot": {"schema_version": 1, "symbol": "BTCUSDT", "price": 102.5},
        "p_win": 0.64,
        "blocks_triggered": ["breakout_above_high", "volume_spike"],
        "ensemble": {
            "direction": "long",
            "ensemble_score": 0.71,
            "ml_contribution": 0.42,
            "block_contribution": 0.18,
            "regime_contribution": 0.11,
            "confidence": "high",
            "reason": "momentum + confirmations aligned",
            "block_analysis": {"entries": ["breakout_above_high"]},
        },
        "ensemble_triggered": True,
    }

    res = ScoreResponse.model_validate(payload)
    assert res.p_win == 0.64
    assert res.snapshot["schema_version"] == 1
    assert res.ensemble is not None
    assert res.ensemble.direction == "long"
