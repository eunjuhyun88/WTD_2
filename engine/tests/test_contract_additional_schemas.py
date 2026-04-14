from __future__ import annotations

from datetime import datetime, timezone

from api.schemas import (
    BacktestRequest,
    BacktestResponse,
    ChallengeCreateRequest,
    ChallengeCreateResponse,
    ChallengeScanResponse,
    TrainRequest,
    TrainResponse,
    UniverseResponse,
)


def test_backtest_request_response_schema_contract() -> None:
    req = BacktestRequest.model_validate(
        {
            "blocks": {
                "triggers": ["breakout_above_high"],
                "confirmations": ["volume_dryup"],
                "entries": ["support_bounce"],
                "disqualifiers": ["extreme_volatility"],
            },
            "config": {"stop_loss": 0.02, "take_profit": 0.04, "timeout_bars": 24, "universe": "binance_30"},
        }
    )
    assert req.config.universe == "binance_30"

    res = BacktestResponse.model_validate(
        {
            "metrics": {
                "n_trades": 48,
                "win_rate": 0.56,
                "expectancy": 0.011,
                "profit_factor": 1.34,
                "max_drawdown": 0.12,
                "sortino": 1.1,
                "walk_forward_pass_rate": 0.75,
            },
            "passed": True,
            "gate_failures": [],
        }
    )
    assert res.metrics.n_trades == 48


def test_challenge_schema_contract() -> None:
    req = ChallengeCreateRequest.model_validate(
        {
            "snaps": [
                {"symbol": "BTCUSDT", "timestamp": datetime.now(tz=timezone.utc).isoformat(), "label": "entry"}
            ],
            "user_id": "u-1",
        }
    )
    assert len(req.snaps) == 1

    create_res = ChallengeCreateResponse.model_validate(
        {
            "slug": "btc-entry",
            "strategies": [{"name": "cosine_similarity", "win_rate": 0.58, "match_count": 102, "expectancy": 0.01}],
            "recommended": "cosine_similarity",
            "feature_vector": [0.1, 0.2, 0.3],
        }
    )
    assert create_res.recommended == "cosine_similarity"

    scan_res = ChallengeScanResponse.model_validate(
        {
            "slug": "btc-entry",
            "scanned_at": datetime.now(tz=timezone.utc).isoformat(),
            "matches": [
                {
                    "symbol": "ETHUSDT",
                    "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                    "similarity": 0.83,
                    "p_win": 0.61,
                    "price": 3012.4,
                }
            ],
        }
    )
    assert scan_res.matches[0].symbol == "ETHUSDT"


def test_train_and_universe_schema_contract() -> None:
    train_req = TrainRequest.model_validate(
        {
            "records": [{"snapshot": {"symbol": "BTCUSDT", "price": 100.0}, "outcome": 1}] * 20,
            "user_id": "u-1",
        }
    )
    assert len(train_req.records) == 20

    train_res = TrainResponse.model_validate({"auc": 0.71, "n_samples": 120, "model_version": "2026-04-14-1"})
    assert train_res.n_samples == 120

    universe_res = UniverseResponse.model_validate(
        {
            "total": 1,
            "tokens": [
                {
                    "rank": 1,
                    "symbol": "BTCUSDT",
                    "base": "BTC",
                    "name": "Bitcoin",
                    "sector": "L1",
                    "price": 100000.0,
                    "pct_24h": 1.2,
                    "vol_24h_usd": 1000000000.0,
                    "market_cap": 2000000000000.0,
                    "oi_usd": 35000000000.0,
                    "is_futures": True,
                    "trending_score": 0.99,
                }
            ],
            "updated_at": datetime.now(tz=timezone.utc).isoformat(),
        }
    )
    assert universe_res.tokens[0].symbol == "BTCUSDT"
