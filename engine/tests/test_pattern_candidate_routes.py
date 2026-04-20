from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import patterns as pattern_routes
from api.routes import patterns_thread as ptr
from ledger.types import PatternLedgerRecord, PatternOutcome, PatternStats


class _RegistryEntry:
    def __init__(self, *, pattern_slug: str, model_key: str, model_version: str, rollout_state: str) -> None:
        self.pattern_slug = pattern_slug
        self.model_key = model_key
        self.model_version = model_version
        self.timeframe = "1h"
        self.target_name = "breakout_24h"
        self.feature_schema_version = 1
        self.label_policy_version = 1
        self.threshold_policy_version = 1
        self.rollout_state = rollout_state
        self.requested_by_user_id = None
        self.trained_at = datetime(2026, 4, 16, 12, 0, tzinfo=timezone.utc)
        self.promoted_at = None
        self.updated_at = self.trained_at

    def to_dict(self) -> dict:
        return {
            "pattern_slug": self.pattern_slug,
            "model_key": self.model_key,
            "model_version": self.model_version,
            "timeframe": self.timeframe,
            "target_name": self.target_name,
            "feature_schema_version": self.feature_schema_version,
            "label_policy_version": self.label_policy_version,
            "threshold_policy_version": self.threshold_policy_version,
            "rollout_state": self.rollout_state,
            "requested_by_user_id": self.requested_by_user_id,
            "trained_at": self.trained_at.isoformat(),
            "promoted_at": self.promoted_at.isoformat() if self.promoted_at else None,
            "updated_at": self.updated_at.isoformat(),
        }


class _Policy:
    def __init__(self, mode: str) -> None:
        self.mode = mode

    def to_dict(self) -> dict:
        return {"pattern_slug": "tradoor-oi-reversal-v1", "mode": self.mode, "updated_at": datetime(2026, 4, 16, 12, 0, tzinfo=timezone.utc).isoformat()}


def test_all_candidates_exposes_legacy_and_rich_records(monkeypatch) -> None:
    monkeypatch.setattr(
        ptr,
        "get_entry_candidates_all",
        lambda: {"tradoor-oi-reversal-v1": ["PTBUSDT"]},
    )
    monkeypatch.setattr(
        ptr,
        "get_raw_entry_candidates_all",
        lambda: {"tradoor-oi-reversal-v1": ["PTBUSDT", "ETHUSDT"]},
    )
    monkeypatch.setattr(
        ptr,
        "get_entry_candidate_records",
        lambda pattern_slug=None: {
            "tradoor-oi-reversal-v1": [
                {
                    "symbol": "PTBUSDT",
                    "pattern_slug": "tradoor-oi-reversal-v1",
                    "phase": "ACCUMULATION",
                    "transition_id": "transition-1",
                    "candidate_transition_id": "transition-1",
                    "alert_visible": True,
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
    assert payload["raw_entry_candidates"] == {"tradoor-oi-reversal-v1": ["PTBUSDT", "ETHUSDT"]}
    assert payload["total_count"] == 1
    assert payload["candidate_records"][0]["transition_id"] == "transition-1"
    assert (
        payload["candidate_records_by_pattern"]["tradoor-oi-reversal-v1"][0][
            "candidate_transition_id"
        ]
        == "transition-1"
    )


def test_stats_exposes_record_family_metrics(monkeypatch) -> None:
    active_entry = _RegistryEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        model_key="tradoor-oi-reversal-v1:1h:breakout:fs1:lp1",
        model_version="20260416_120000",
        rollout_state="active",
    )
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
        ptr,
        "MODEL_REGISTRY_STORE",
        type(
            "FakeRegistryStore",
            (),
            {
                "list": lambda self, slug: [active_entry],
                "get_active": lambda self, slug: active_entry,
                "get_preferred_scoring_model": lambda self, slug: active_entry,
            },
        )(),
    )
    monkeypatch.setattr(
        ptr,
        "ALERT_POLICY_STORE",
        type(
            "FakePolicyStore",
            (),
            {
                "load": lambda self, slug: _Policy("gated"),
            },
        )(),
    )
    monkeypatch.setattr(
        ptr,
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
                        "training_run_count": 2,
                        "model_count": 0,
                        "capture_to_entry_rate": 0.4,
                        "verdict_to_entry_rate": 0.3,
                    },
                )(),
                "list": lambda self, slug, record_type=None, limit=None: (
                    [
                        PatternLedgerRecord(
                            record_type="training_run",
                            pattern_slug=slug,
                            payload={"model_key": "tradoor-oi-reversal-v1:1h:breakout:fs1:lp1"},
                        )
                    ]
                    if record_type == "training_run"
                    else [
                        PatternLedgerRecord(
                            record_type="model",
                            pattern_slug=slug,
                            payload={"model_key": "tradoor-oi-reversal-v1:1h:breakout:fs1:lp1"},
                        )
                    ]
                    if record_type == "model"
                    else []
                ),
            },
        )(),
    )
    monkeypatch.setattr(
        ptr,
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
    assert payload["record_family"]["training_run_count"] == 2
    assert payload["record_family"]["capture_to_entry_rate"] == 0.4
    assert payload["model_registry"]["entry_count"] == 1
    assert payload["model_registry"]["active_model"]["rollout_state"] == "active"
    assert payload["alert_policy"]["mode"] == "gated"
    assert payload["latest_training_run"]["record_type"] == "training_run"
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
    training_runs = []
    model_records = []
    registry_candidates = []

    class FakeLedger:
        def list_all(self, slug):
            return outcomes

    class FakeRecordStore:
        def append_training_run_record(self, *, pattern_slug, model_key, user_id=None, payload=None):
            training_runs.append(
                {
                    "pattern_slug": pattern_slug,
                    "model_key": model_key,
                    "user_id": user_id,
                    "payload": payload or {},
                }
            )
            return None

        def append_model_record(self, *, pattern_slug, model_version, user_id=None, payload=None):
            model_records.append(
                {
                    "pattern_slug": pattern_slug,
                    "model_version": model_version,
                    "user_id": user_id,
                    "payload": payload or {},
                }
            )
            return None

    class FakeRegistryStore:
        def upsert_candidate(self, **kwargs):
            registry_candidates.append(kwargs)
            return _RegistryEntry(
                pattern_slug=kwargs["pattern_slug"],
                model_key=kwargs["model_key"],
                model_version=kwargs["model_version"],
                rollout_state="candidate",
            )

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
    monkeypatch.setattr(ptr, "LEDGER_RECORD_STORE", FakeRecordStore())
    monkeypatch.setattr(ptr, "MODEL_REGISTRY_STORE", FakeRegistryStore())
    monkeypatch.setattr(ptr, "get_engine", lambda model_key: FakeEngine())
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
    assert payload["training_run_recorded"] is True
    assert payload["model_recorded"] is True
    assert payload["model_version"] == "20260416_120000"
    assert payload["replaced"] is True
    assert len(training_runs) == 1
    assert len(registry_candidates) == 1
    assert registry_candidates[0]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert training_runs[0]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert training_runs[0]["model_key"] == "tradoor-oi-reversal-v1:1h:breakout_24h:fs1:lp1"
    assert training_runs[0]["payload"]["n_records"] == 24
    assert training_runs[0]["payload"]["rollout_state"] == "candidate"
    assert len(model_records) == 1
    assert model_records[0]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert model_records[0]["payload"]["n_records"] == 24
    assert model_records[0]["payload"]["rollout_state"] == "candidate"


def test_train_pattern_model_skips_model_record_when_not_replaced(monkeypatch) -> None:
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
    training_runs = []
    model_records = []
    registry_candidates = []

    class FakeLedger:
        def list_all(self, slug):
            return outcomes

    class FakeRecordStore:
        def append_training_run_record(self, *, pattern_slug, model_key, user_id=None, payload=None):
            training_runs.append(
                {
                    "pattern_slug": pattern_slug,
                    "model_key": model_key,
                    "user_id": user_id,
                    "payload": payload or {},
                }
            )
            return None

    class FakeRegistryStore:
        def upsert_candidate(self, **kwargs):
            registry_candidates.append(kwargs)
            return _RegistryEntry(
                pattern_slug=kwargs["pattern_slug"],
                model_key=kwargs["model_key"],
                model_version=kwargs["model_version"],
                rollout_state="candidate",
            )

        def append_model_record(self, *, pattern_slug, model_version, user_id=None, payload=None):
            model_records.append(
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
                "auc": 0.61,
                "fold_aucs": [0.59, 0.63],
                "n_samples": 24,
                "replaced": False,
                "model_version": None,
            }

    monkeypatch.setattr(pattern_routes, "_ledger", FakeLedger())
    monkeypatch.setattr(ptr, "LEDGER_RECORD_STORE", FakeRecordStore())
    monkeypatch.setattr(ptr, "MODEL_REGISTRY_STORE", FakeRegistryStore())
    monkeypatch.setattr(ptr, "get_engine", lambda model_key: FakeEngine())
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
    assert payload["training_run_recorded"] is True
    assert payload["model_recorded"] is False
    assert payload["model_version"] == "not_replaced"
    assert payload["replaced"] is False
    assert len(training_runs) == 1
    assert training_runs[0]["payload"]["rollout_state"] == "shadow"
    assert len(registry_candidates) == 0
    assert len(model_records) == 0


def test_get_model_registry_and_promote_model(monkeypatch) -> None:
    candidate_entry = _RegistryEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        model_key="tradoor-oi-reversal-v1:1h:breakout_24h:fs1:lp1",
        model_version="20260416_120000",
        rollout_state="candidate",
    )
    active_entry = _RegistryEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        model_key="tradoor-oi-reversal-v1:1h:breakout_24h:fs1:lp1",
        model_version="20260416_120000",
        rollout_state="active",
    )
    model_records = []

    class FakeRegistryStore:
        def list(self, slug):
            return [candidate_entry]

        def get_active(self, slug):
            return None

        def get_preferred_scoring_model(self, slug):
            return candidate_entry

        def promote(self, *, pattern_slug, model_key, model_version, threshold_policy_version=None):
            assert pattern_slug == "tradoor-oi-reversal-v1"
            assert model_key == candidate_entry.model_key
            assert model_version == candidate_entry.model_version
            assert threshold_policy_version == 3
            active_entry.threshold_policy_version = threshold_policy_version or 1
            return active_entry

    class FakeRecordStore:
        def append_model_record(self, *, pattern_slug, model_version, user_id=None, payload=None):
            model_records.append(
                {
                    "pattern_slug": pattern_slug,
                    "model_version": model_version,
                    "payload": payload or {},
                }
            )
            return None

    monkeypatch.setattr(ptr, "MODEL_REGISTRY_STORE", FakeRegistryStore())
    monkeypatch.setattr(ptr, "LEDGER_RECORD_STORE", FakeRecordStore())
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    registry_response = client.get("/patterns/tradoor-oi-reversal-v1/model-registry")
    assert registry_response.status_code == 200
    registry_payload = registry_response.json()
    assert registry_payload["entries"][0]["rollout_state"] == "candidate"
    assert registry_payload["preferred_scoring_model"]["rollout_state"] == "candidate"

    promote_response = client.post(
        "/patterns/tradoor-oi-reversal-v1/promote-model",
        json={
            "model_key": candidate_entry.model_key,
            "model_version": candidate_entry.model_version,
            "threshold_policy_version": 3,
        },
    )
    assert promote_response.status_code == 200
    promote_payload = promote_response.json()
    assert promote_payload["active_model"]["rollout_state"] == "active"
    assert promote_payload["active_model"]["threshold_policy_version"] == 3
    assert len(model_records) == 1
    assert model_records[0]["payload"]["promotion_event"] == "promote_to_active"


def test_get_and_set_alert_policy(monkeypatch) -> None:
    saved = []

    class FakePolicyStore:
        def load(self, slug):
            return _Policy("visible")

        def save(self, policy):
            saved.append(policy)
            return None

    fake_policy = FakePolicyStore()
    monkeypatch.setattr(ptr, "ALERT_POLICY_STORE", fake_policy)
    monkeypatch.setattr(pattern_routes, "ALERT_POLICY_STORE", fake_policy)
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    get_response = client.get("/patterns/tradoor-oi-reversal-v1/alert-policy")
    assert get_response.status_code == 200
    assert get_response.json()["policy"]["mode"] == "visible"

    put_response = client.put(
        "/patterns/tradoor-oi-reversal-v1/alert-policy",
        json={"mode": "gated"},
    )
    assert put_response.status_code == 200
    assert put_response.json()["policy"]["mode"] == "gated"
    assert len(saved) == 1
    assert saved[0].mode == "gated"


def test_record_capture_appends_capture_record(monkeypatch) -> None:
    """POST /{slug}/capture creates CaptureRecord and writes to ledger record store."""
    appended = []

    class FakeRecordStore:
        def append_capture_record(self, capture):
            appended.append(capture)
            return None

    monkeypatch.setattr(pattern_routes, "LEDGER_RECORD_STORE", FakeRecordStore())
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.post(
        "/patterns/tradoor-oi-reversal-v1/capture",
        json={
            "symbol": "BTCUSDT",
            "user_id": "user_123",
            "phase": "ACCUMULATION",
            "timeframe": "1h",
            "capture_kind": "pattern_candidate",
            "candidate_transition_id": "txn-abc-123",
            "scan_id": "scan-xyz-456",
            "user_note": "Strong OI spike into support",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert data["symbol"] == "BTCUSDT"
    assert data["status"] == "pending_outcome"
    assert "capture_id" in data

    assert len(appended) == 1
    record = appended[0]
    assert record.symbol == "BTCUSDT"
    assert record.pattern_slug == "tradoor-oi-reversal-v1"
    assert record.phase == "ACCUMULATION"
    assert record.candidate_transition_id == "txn-abc-123"
    assert record.scan_id == "scan-xyz-456"
    assert record.capture_kind == "pattern_candidate"


def test_record_capture_returns_404_for_unknown_pattern(monkeypatch) -> None:
    """POST /{slug}/capture returns 404 if pattern slug is not registered."""
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.post(
        "/patterns/non-existent-pattern-v1/capture",
        json={"symbol": "BTCUSDT"},
    )
    assert response.status_code == 404
