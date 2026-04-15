from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import patterns as pattern_routes
from ledger.types import PatternLedgerRecord, PatternOutcome, PatternStats


def test_all_candidates_exposes_legacy_and_rich_records(monkeypatch) -> None:
    monkeypatch.setattr(
        pattern_routes,
        "get_entry_candidates_all",
        lambda: {"tradoor-oi-reversal-v1": ["PTBUSDT"]},
    )
    monkeypatch.setattr(
        pattern_routes,
        "get_entry_candidate_records",
        lambda pattern_slug=None: {
            "tradoor-oi-reversal-v1": [
                {
                    "symbol": "PTBUSDT",
                    "pattern_slug": "tradoor-oi-reversal-v1",
                    "phase": "ACCUMULATION",
                    "transition_id": "transition-1",
                    "candidate_transition_id": "transition-1",
                }
            ]
        },
    )
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get("/patterns/candidates")

    assert response.status_code == 200
    payload = response.json()
    assert payload["entry_candidates"] == {"tradoor-oi-reversal-v1": ["PTBUSDT"]}
    assert payload["total_count"] == 1
    assert payload["candidate_records"][0]["transition_id"] == "transition-1"
    assert (
        payload["candidate_records_by_pattern"]["tradoor-oi-reversal-v1"][0][
            "candidate_transition_id"
        ]
        == "transition-1"
    )


def test_stats_exposes_record_family_metrics(monkeypatch) -> None:
    monkeypatch.setattr(
        pattern_routes,
        "_ledger",
        type(
            "FakeLedger",
            (),
            {
                "compute_stats": lambda self, slug: PatternStats(
                    pattern_slug=slug,
                    total_instances=2,
                    pending_count=0,
                    success_count=1,
                    failure_count=1,
                    success_rate=0.5,
                    avg_gain_pct=0.2,
                    avg_loss_pct=-0.1,
                    expected_value=0.05,
                    avg_duration_hours=12.0,
                    recent_30d_count=2,
                    recent_30d_success_rate=0.5,
                    btc_bullish_rate=None,
                    btc_bearish_rate=None,
                    btc_sideways_rate=None,
                    decay_direction="stable",
                ),
                "list_all": lambda self, slug: [],
            },
        )(),
    )
    monkeypatch.setattr(
        pattern_routes,
        "LEDGER_RECORD_STORE",
        type(
            "FakeRecordStore",
            (),
            {
                "compute_family_stats": lambda self, slug: type(
                    "Stats",
                    (),
                    {
                        "entry_count": 10,
                        "capture_count": 4,
                        "score_count": 10,
                        "outcome_count": 6,
                        "verdict_count": 3,
                        "model_count": 0,
                        "capture_to_entry_rate": 0.4,
                        "verdict_to_entry_rate": 0.3,
                    },
                )(),
                "list": lambda self, slug, record_type=None, limit=None: [
                    PatternLedgerRecord(
                        record_type="model",
                        pattern_slug=slug,
                        payload={"model_key": "tradoor-oi-reversal-v1:1h:breakout:fs1:lp1"},
                    )
                ] if record_type == "model" else [],
            },
        )(),
    )
    monkeypatch.setattr(
        pattern_routes,
        "summarize_pattern_dataset",
        lambda outcomes: type(
            "Summary",
            (),
            {
                "total_entries": 0,
                "decided_entries": 0,
                "state_counts": {},
                "scored_entries": 0,
                "scored_decided_entries": 0,
                "score_coverage": None,
                "avg_p_win": None,
                "threshold_pass_count": 0,
                "threshold_pass_rate": None,
                "above_threshold_success_rate": None,
                "below_threshold_success_rate": None,
                "training_usable_count": 0,
                "training_win_count": 0,
                "training_loss_count": 0,
                "ready_to_train": False,
                "readiness_reason": "n/a",
                "last_model_version": None,
            },
        )(),
    )
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get("/patterns/tradoor-oi-reversal-v1/stats")

    assert response.status_code == 200
    payload = response.json()
    assert payload["record_family"]["entry_count"] == 10
    assert payload["record_family"]["capture_count"] == 4
    assert payload["record_family"]["capture_to_entry_rate"] == 0.4
    assert payload["latest_model"]["record_type"] == "model"


def test_set_user_verdict_appends_verdict_record(monkeypatch) -> None:
    saved = []
    appended = []

    class FakeLedger:
        def list_pending(self, slug):
            return []

        def list_all(self, slug):
            return []

        def save(self, outcome):
            saved.append(outcome)
            return None

    class FakeRecordStore:
        def append_verdict_record(self, outcome):
            appended.append(outcome)
            return None

    monkeypatch.setattr(pattern_routes, "_ledger", FakeLedger())
    monkeypatch.setattr(pattern_routes, "LEDGER_RECORD_STORE", FakeRecordStore())
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.post(
        "/patterns/tradoor-oi-reversal-v1/verdict",
        json={"symbol": "PTBUSDT", "verdict": "valid"},
    )

    assert response.status_code == 200
    assert response.json()["created"] is True
    assert len(saved) == 1
    assert saved[0].user_verdict == "valid"
    assert len(appended) == 1


def test_train_pattern_model_appends_model_record(monkeypatch) -> None:
    outcomes = [
        PatternOutcome(
            pattern_slug="tradoor-oi-reversal-v1",
            symbol=f"SYM{idx}USDT",
            accumulation_at=datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc),
            entry_price=100.0 + idx,
            outcome="success" if idx % 2 == 0 else "failure",  # type: ignore[arg-type]
            feature_snapshot={
                "ema_alignment": "bullish" if idx % 2 == 0 else "bearish",
                "htf_structure": "uptrend" if idx % 2 == 0 else "downtrend",
                "cvd_state": "buying" if idx % 2 == 0 else "selling",
                "regime": "risk_on" if idx % 2 == 0 else "risk_off",
                "ema20_slope": 0.1 * idx,
                "price": 100.0 + idx,
            },
        )
        for idx in range(1, 25)
    ]
    appended = []

    class FakeLedger:
        def list_all(self, slug):
            return outcomes

    class FakeRecordStore:
        def append_model_record(self, *, pattern_slug, model_version, user_id=None, payload=None):
            appended.append(
                {
                    "pattern_slug": pattern_slug,
                    "model_version": model_version,
                    "user_id": user_id,
                    "payload": payload or {},
                }
            )
            return None

    class FakeEngine:
        def train(self, X, y):
            assert len(X) == 24
            assert len(y) == 24
            return {
                "auc": 0.71,
                "fold_aucs": [0.69, 0.72],
                "n_samples": 24,
                "replaced": True,
                "model_version": "20260416_120000",
            }

    monkeypatch.setattr(pattern_routes, "_ledger", FakeLedger())
    monkeypatch.setattr(pattern_routes, "LEDGER_RECORD_STORE", FakeRecordStore())
    monkeypatch.setattr(pattern_routes, "get_engine", lambda model_key: FakeEngine())
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.post(
        "/patterns/tradoor-oi-reversal-v1/train-model",
        json={
            "target_name": "breakout_24h",
            "feature_schema_version": 1,
            "label_policy_version": 1,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["model_key"] == "tradoor-oi-reversal-v1:1h:breakout_24h:fs1:lp1"
    assert payload["model_version"] == "20260416_120000"
    assert payload["replaced"] is True
    assert len(appended) == 1
    assert appended[0]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert appended[0]["payload"]["n_records"] == 24
    assert appended[0]["payload"]["rollout_state"] == "candidate"
