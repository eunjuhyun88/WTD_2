from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import patterns as pattern_routes
from api.routes import patterns_thread as ptr
from ledger.types import PatternLedgerFamilyStats, PatternLedgerRecord, PatternOutcome, PatternStats
from patterns.active_variant_registry import ActivePatternVariantEntry


class _RegistryEntry:
    def __init__(
        self,
        *,
        pattern_slug: str,
        model_key: str,
        model_version: str,
        rollout_state: str,
        definition_ref: dict | None = None,
    ) -> None:
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
        self.definition_ref = definition_ref or {
            "definition_id": f"{pattern_slug}:v1",
            "pattern_slug": pattern_slug,
        }
        self.definition_id = self.definition_ref["definition_id"]
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
            "definition_id": self.definition_id,
            "definition_ref": self.definition_ref,
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


def test_similar_live_route_returns_ranked_state_matches(monkeypatch) -> None:
    monkeypatch.setattr(
        pattern_routes,
        "search_pattern_state_similarity",
        lambda *args, **kwargs: [
            type(
                "FakeResult",
                (),
                {
                    "variant_slug": "tradoor-oi-reversal-v1__intraday-dump-cluster__tf-15m",
                    "timeframe": "15m",
                    "to_dict": lambda self: {
                        "symbol": "PTBUSDT",
                        "phase": "ACCUMULATION",
                        "path": "ARCH_ZONE→REAL_DUMP→ACCUMULATION",
                        "observed_phase_path": ["ARCH_ZONE", "REAL_DUMP", "ACCUMULATION"],
                        "similarity_score": 0.88,
                        "phase_depth_progress": 0.72,
                        "phase_fidelity": 0.8,
                        "variant_slug": "tradoor-oi-reversal-v1__intraday-dump-cluster__tf-15m",
                        "timeframe": "15m",
                        "canonical_feature_snapshot": {
                            "oi_raw": 1250.0,
                            "oi_zscore": 2.1,
                            "funding_rate_zscore": 1.3,
                            "funding_flip_flag": True,
                            "volume_percentile": 0.91,
                            "pullback_depth_pct": 0.07,
                            "cvd_price_divergence": 1.0,
                        },
                    },
                },
            )()
        ],
    )
    monkeypatch.setattr(
        pattern_routes,
        "ACTIVE_PATTERN_VARIANT_STORE",
        type(
            "FakeStore",
            (),
            {
                "get": lambda self, slug: ActivePatternVariantEntry(
                    pattern_slug=slug,
                    variant_slug="tradoor-oi-reversal-v1__canonical",
                    timeframe="1h",
                    watch_phases=["ACCUMULATION", "REAL_DUMP"],
                )
            },
        )(),
    )

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get(
        "/patterns/tradoor-oi-reversal-v1/similar-live",
        params={"top_k": 5, "min_similarity_score": 0.3},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert payload["variant_slug"] == "tradoor-oi-reversal-v1__intraday-dump-cluster__tf-15m"
    assert payload["timeframe"] == "15m"
    assert payload["count"] == 1
    assert payload["results"][0]["symbol"] == "PTBUSDT"
    assert payload["results"][0]["similarity_score"] == 0.88
    assert payload["results"][0]["canonical_feature_snapshot"]["funding_flip_flag"] is True


def test_stats_exposes_record_family_metrics(monkeypatch) -> None:
    active_entry = _RegistryEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        model_key="tradoor-oi-reversal-v1:v1:1h:breakout:fs1:lp1",
        model_version="20260416_120000",
        rollout_state="active",
    )
    record_list = (
        [
            PatternLedgerRecord(
                record_type="training_run",
                pattern_slug="tradoor-oi-reversal-v1",
                payload={
                    "model_key": "tradoor-oi-reversal-v1:v1:1h:breakout:fs1:lp1",
                    "definition_ref": {
                        "definition_id": "tradoor-oi-reversal-v1:v1",
                        "pattern_slug": "tradoor-oi-reversal-v1",
                    },
                },
            ),
            PatternLedgerRecord(
                record_type="model",
                pattern_slug="tradoor-oi-reversal-v1",
                payload={
                    "model_key": "tradoor-oi-reversal-v1:v1:1h:breakout:fs1:lp1",
                    "definition_ref": {
                        "definition_id": "tradoor-oi-reversal-v1:v1",
                        "pattern_slug": "tradoor-oi-reversal-v1",
                    },
                },
            ),
        ]
        + [
            PatternLedgerRecord(
                record_type="entry",
                pattern_slug="tradoor-oi-reversal-v1",
                payload={"definition_ref": {"definition_id": "tradoor-oi-reversal-v1:v1", "pattern_slug": "tradoor-oi-reversal-v1"}},
            )
            for _ in range(10)
        ]
        + [
            PatternLedgerRecord(
                record_type="capture",
                pattern_slug="tradoor-oi-reversal-v1",
                payload={"definition_ref": {"definition_id": "tradoor-oi-reversal-v1:v1", "pattern_slug": "tradoor-oi-reversal-v1"}},
            )
            for _ in range(4)
        ]
        + [
            PatternLedgerRecord(
                record_type="score",
                pattern_slug="tradoor-oi-reversal-v1",
                payload={"definition_ref": {"definition_id": "tradoor-oi-reversal-v1:v1", "pattern_slug": "tradoor-oi-reversal-v1"}},
            )
            for _ in range(10)
        ]
        + [
            PatternLedgerRecord(
                record_type="outcome",
                pattern_slug="tradoor-oi-reversal-v1",
                payload={"definition_ref": {"definition_id": "tradoor-oi-reversal-v1:v1", "pattern_slug": "tradoor-oi-reversal-v1"}},
            )
            for _ in range(6)
        ]
        + [
            PatternLedgerRecord(
                record_type="verdict",
                pattern_slug="tradoor-oi-reversal-v1",
                payload={"definition_ref": {"definition_id": "tradoor-oi-reversal-v1:v1", "pattern_slug": "tradoor-oi-reversal-v1"}},
            )
            for _ in range(3)
        ]
        + [PatternLedgerRecord(record_type="training_run", pattern_slug="tradoor-oi-reversal-v1") for _ in range(1)]
    )

    class FakeRecordStore:
        def __init__(self) -> None:
            self.list_calls = 0
            self.summarize_calls = 0

        def list(self, slug, record_type=None, definition_id=None, limit=None):
            self.list_calls += 1
            records = record_list
            if record_type is not None:
                records = [record for record in records if record.record_type == record_type]
            if definition_id is not None:
                records = [
                    record
                    for record in records
                    if record.payload.get("definition_ref", {}).get("definition_id") == definition_id
                ]
            return records[:limit] if limit is not None else records

        def summarize_family(self, slug):
            self.summarize_calls += 1
            return (
                PatternLedgerFamilyStats(
                    pattern_slug=slug,
                    entry_count=10,
                    capture_count=4,
                    score_count=10,
                    outcome_count=6,
                    verdict_count=3,
                    phase_attempt_count=0,
                    training_run_count=2,
                    model_count=1,
                    capture_to_entry_rate=0.4,
                    verdict_to_entry_rate=0.3,
                ),
                record_list[0],
                record_list[1],
            )

    fake_record_store = FakeRecordStore()

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
                "list": lambda self, slug, definition_id=None: [active_entry],
                "get_active": lambda self, slug, definition_id=None: active_entry,
                "get_preferred_scoring_model": lambda self, slug, definition_id=None: active_entry,
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
        fake_record_store,
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
    assert payload["scope"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert payload["scope"]["outcome_metrics"] == "definition_id"
    assert payload["scope"]["record_family"] == "definition_id"
    assert payload["scope"]["model_artifacts"] == "definition_id"
    assert payload["record_family"]["entry_count"] == 10
    assert payload["record_family"]["capture_count"] == 4
    assert payload["record_family"]["training_run_count"] == 1
    assert payload["record_family"]["capture_to_entry_rate"] == 0.4
    assert payload["model_registry"]["entry_count"] == 1
    assert payload["model_registry"]["active_model"]["rollout_state"] == "active"
    assert payload["alert_policy"]["mode"] == "gated"
    assert payload["latest_training_run"]["record_type"] == "training_run"
    assert payload["latest_model"]["record_type"] == "model"
    assert payload["definition_artifacts"]["training_run_count"] == 1
    assert payload["definition_artifacts"]["model_count"] == 1
    assert fake_record_store.summarize_calls == 0
    assert fake_record_store.list_calls == 3


def test_stats_definition_scope_filters_model_artifacts(monkeypatch) -> None:
    v1_entry = _RegistryEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        model_key="tradoor-oi-reversal-v1:v1:1h:breakout:fs1:lp1",
        model_version="20260416_120000",
        rollout_state="active",
    )
    v2_entry = _RegistryEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        model_key="tradoor-oi-reversal-v1:v2:1h:breakout:fs1:lp1",
        model_version="20260417_120000",
        rollout_state="candidate",
        definition_ref={
            "definition_id": "tradoor-oi-reversal-v1:v2",
            "pattern_slug": "tradoor-oi-reversal-v1",
        },
    )
    record_list = [
        PatternLedgerRecord(
            record_type="training_run",
            pattern_slug="tradoor-oi-reversal-v1",
            payload={
                "model_key": "tradoor-oi-reversal-v1:v1:1h:breakout:fs1:lp1",
                "definition_ref": {"definition_id": "tradoor-oi-reversal-v1:v1", "pattern_slug": "tradoor-oi-reversal-v1"},
            },
        ),
        PatternLedgerRecord(
            record_type="model",
            pattern_slug="tradoor-oi-reversal-v1",
            payload={
                "model_version": "20260416_120000",
                "definition_ref": {"definition_id": "tradoor-oi-reversal-v1:v1", "pattern_slug": "tradoor-oi-reversal-v1"},
            },
        ),
        PatternLedgerRecord(
            record_type="training_run",
            pattern_slug="tradoor-oi-reversal-v1",
            payload={
                "model_key": "tradoor-oi-reversal-v1:v2:1h:breakout:fs1:lp1",
                "definition_ref": {"definition_id": "tradoor-oi-reversal-v1:v2", "pattern_slug": "tradoor-oi-reversal-v1"},
            },
        ),
        PatternLedgerRecord(
            record_type="model",
            pattern_slug="tradoor-oi-reversal-v1",
            payload={
                "model_version": "20260417_120000",
                "definition_ref": {"definition_id": "tradoor-oi-reversal-v1:v2", "pattern_slug": "tradoor-oi-reversal-v1"},
            },
        ),
    ]

    class FakeRecordStore:
        def list(self, slug, record_type=None, definition_id=None, limit=None):
            records = record_list
            if record_type is not None:
                records = [record for record in records if record.record_type == record_type]
            if definition_id is not None:
                records = [
                    record
                    for record in records
                    if record.payload.get("definition_ref", {}).get("definition_id") == definition_id
                ]
            return records[:limit] if limit is not None else records

        def summarize_family(self, slug):
            return (
                PatternLedgerFamilyStats(
                    pattern_slug=slug,
                    entry_count=10,
                    capture_count=4,
                    score_count=10,
                    outcome_count=6,
                    verdict_count=3,
                    phase_attempt_count=0,
                    training_run_count=2,
                    model_count=2,
                    capture_to_entry_rate=0.4,
                    verdict_to_entry_rate=0.3,
                ),
                record_list[0],
                record_list[1],
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
                    total_instances=3,
                    pending_count=1,
                    success_count=1,
                    failure_count=1,
                    success_rate=0.5,
                    avg_gain_pct=0.2,
                    avg_loss_pct=-0.1,
                    expected_value=0.05,
                    avg_duration_hours=12.0,
                    recent_30d_count=3,
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
                "list": lambda self, slug, definition_id=None: [entry for entry in [v1_entry, v2_entry] if definition_id is None or entry.definition_id == definition_id],
                "get_active": lambda self, slug, definition_id=None: next((entry for entry in [v1_entry, v2_entry] if entry.rollout_state == "active" and (definition_id is None or entry.definition_id == definition_id)), None),
                "get_preferred_scoring_model": lambda self, slug, definition_id=None: next((entry for entry in [v1_entry, v2_entry] if definition_id is None or entry.definition_id == definition_id), None),
            },
        )(),
    )
    monkeypatch.setattr(
        ptr,
        "ALERT_POLICY_STORE",
        type("FakePolicyStore", (), {"load": lambda self, slug: _Policy("gated")})(),
    )
    monkeypatch.setattr(ptr, "LEDGER_RECORD_STORE", FakeRecordStore())
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

    response = client.get("/patterns/tradoor-oi-reversal-v1/stats?definition_id=tradoor-oi-reversal-v1:v2")

    assert response.status_code == 200
    payload = response.json()
    assert payload["scope"]["definition_id"] == "tradoor-oi-reversal-v1:v2"
    assert payload["scope"]["outcome_metrics"] == "definition_id"
    assert payload["scope"]["record_family"] == "definition_id"
    assert payload["record_family"]["training_run_count"] == 1
    assert payload["model_registry"]["entry_count"] == 1
    assert payload["model_registry"]["active_model"] is None
    assert payload["model_registry"]["preferred_scoring_model"]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v2"
    assert payload["latest_training_run"]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v2"
    assert payload["latest_model"]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v2"
    assert payload["definition_artifacts"]["training_run_count"] == 1
    assert payload["definition_artifacts"]["model_count"] == 1
    assert payload["definition_artifacts"]["pattern_latest_training_run"]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v2"


def test_stats_definition_scope_all_definitions_aggregates_artifacts(monkeypatch) -> None:
    v1_ref = {
        "definition_id": "tradoor-oi-reversal-v1:v1",
        "pattern_slug": "tradoor-oi-reversal-v1",
    }
    v2_ref = {
        "definition_id": "tradoor-oi-reversal-v1:v2",
        "pattern_slug": "tradoor-oi-reversal-v1",
    }
    v1_entry = _RegistryEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        model_key="tradoor-oi-reversal-v1:v1:1h:breakout:fs1:lp1",
        model_version="20260416_120000",
        rollout_state="active",
    )
    v2_entry = _RegistryEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        model_key="tradoor-oi-reversal-v1:v2:1h:breakout:fs1:lp1",
        model_version="20260417_120000",
        rollout_state="candidate",
        definition_ref=v2_ref,
    )
    outcomes = [
        PatternOutcome(
            pattern_slug="tradoor-oi-reversal-v1",
            definition_id=v1_ref["definition_id"],
            definition_ref=v1_ref,
            symbol="PTB1",
            outcome="success",
            max_gain_pct=0.12,
            exit_return_pct=0.06,
        ),
        PatternOutcome(
            pattern_slug="tradoor-oi-reversal-v1",
            definition_id=v2_ref["definition_id"],
            definition_ref=v2_ref,
            symbol="PTB2",
            outcome="failure",
            exit_return_pct=-0.04,
        ),
    ]
    record_list = [
        PatternLedgerRecord(
            record_type="training_run",
            pattern_slug="tradoor-oi-reversal-v1",
            payload={
                "model_key": "tradoor-oi-reversal-v1:v1:1h:breakout:fs1:lp1",
                "definition_ref": v1_ref,
            },
        ),
        PatternLedgerRecord(
            record_type="model",
            pattern_slug="tradoor-oi-reversal-v1",
            payload={
                "model_version": "20260416_120000",
                "definition_ref": v1_ref,
            },
        ),
        PatternLedgerRecord(
            record_type="training_run",
            pattern_slug="tradoor-oi-reversal-v1",
            payload={
                "model_key": "tradoor-oi-reversal-v1:v2:1h:breakout:fs1:lp1",
                "definition_ref": v2_ref,
            },
        ),
        PatternLedgerRecord(
            record_type="model",
            pattern_slug="tradoor-oi-reversal-v1",
            payload={
                "model_version": "20260417_120000",
                "definition_ref": v2_ref,
            },
        ),
        PatternLedgerRecord(record_type="entry", pattern_slug="tradoor-oi-reversal-v1", payload={"definition_ref": v1_ref}),
        PatternLedgerRecord(record_type="entry", pattern_slug="tradoor-oi-reversal-v1", payload={"definition_ref": v2_ref}),
        PatternLedgerRecord(record_type="capture", pattern_slug="tradoor-oi-reversal-v1", payload={"definition_ref": v1_ref}),
        PatternLedgerRecord(record_type="capture", pattern_slug="tradoor-oi-reversal-v1", payload={"definition_ref": v2_ref}),
        PatternLedgerRecord(record_type="outcome", pattern_slug="tradoor-oi-reversal-v1", payload={"definition_ref": v1_ref}),
        PatternLedgerRecord(record_type="outcome", pattern_slug="tradoor-oi-reversal-v1", payload={"definition_ref": v2_ref}),
        PatternLedgerRecord(record_type="verdict", pattern_slug="tradoor-oi-reversal-v1", payload={"definition_ref": v2_ref}),
        PatternLedgerRecord(record_type="score", pattern_slug="tradoor-oi-reversal-v1", payload={"definition_ref": v2_ref}),
    ]

    class FakeRecordStore:
        def list(self, slug, record_type=None, definition_id=None, limit=None):
            records = record_list
            if record_type is not None:
                records = [record for record in records if record.record_type == record_type]
            if definition_id is not None:
                records = [
                    record
                    for record in records
                    if record.payload.get("definition_ref", {}).get("definition_id") == definition_id
                ]
            return records[:limit] if limit is not None else records

    monkeypatch.setattr(
        pattern_routes,
        "_ledger",
        type(
            "FakeLedger",
            (),
            {
                "list_all": lambda self, slug, definition_id=None: [
                    outcome
                    for outcome in outcomes
                    if definition_id is None or outcome.definition_id == definition_id
                ],
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
                "list": lambda self, slug, definition_id=None: [entry for entry in [v1_entry, v2_entry] if definition_id is None or entry.definition_id == definition_id],
                "get_active": lambda self, slug, definition_id=None: next((entry for entry in [v1_entry, v2_entry] if entry.rollout_state == "active" and (definition_id is None or entry.definition_id == definition_id)), None),
                "get_preferred_scoring_model": lambda self, slug, definition_id=None: next((entry for entry in [v1_entry, v2_entry] if definition_id is None or entry.definition_id == definition_id), None),
            },
        )(),
    )
    monkeypatch.setattr(
        ptr,
        "ALERT_POLICY_STORE",
        type("FakePolicyStore", (), {"load": lambda self, slug: _Policy("gated")})(),
    )
    monkeypatch.setattr(ptr, "LEDGER_RECORD_STORE", FakeRecordStore())
    monkeypatch.setattr(
        ptr,
        "summarize_pattern_dataset",
        lambda scoped_outcomes: type(
            "Summary",
            (),
            {
                "total_entries": len(scoped_outcomes),
                "decided_entries": len(scoped_outcomes),
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

    response = client.get("/patterns/tradoor-oi-reversal-v1/stats?definition_scope=all_definitions")

    assert response.status_code == 200
    payload = response.json()
    assert payload["definition_ref"] is None
    assert payload["scope"]["definition_scope"] == "all_definitions"
    assert payload["scope"]["definition_id"] is None
    assert payload["scope"]["outcome_metrics"] == "all_definitions"
    assert payload["scope"]["record_family"] == "all_definitions"
    assert payload["scope"]["model_artifacts"] == "all_definitions"
    assert payload["total"] == 2
    assert payload["success"] == 1
    assert payload["failure"] == 1
    assert payload["record_family"]["entry_count"] == 2
    assert payload["record_family"]["capture_count"] == 2
    assert payload["record_family"]["training_run_count"] == 2
    assert payload["record_family"]["model_count"] == 2
    assert payload["model_registry"]["entry_count"] == 2
    assert payload["definition_artifacts"]["definition_id"] is None
    assert payload["definition_artifacts"]["training_run_count"] == 2
    assert payload["definition_artifacts"]["model_count"] == 2
    assert payload["ml_shadow"]["total_entries"] == 2


def test_stats_rejects_invalid_definition_id(monkeypatch) -> None:
    monkeypatch.setattr(
        pattern_routes,
        "_ledger",
        type("FakeLedger", (), {"compute_stats": lambda self, slug: None, "list_all": lambda self, slug: []})(),
    )
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get("/patterns/tradoor-oi-reversal-v1/stats?definition_id=bad-definition")

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "pattern_definition_id_invalid"


def test_stats_rejects_invalid_definition_scope() -> None:
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get("/patterns/tradoor-oi-reversal-v1/stats?definition_scope=bad-scope")

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "pattern_definition_scope_invalid"


def test_stats_rejects_conflicting_definition_scope() -> None:
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get(
        "/patterns/tradoor-oi-reversal-v1/stats?definition_id=tradoor-oi-reversal-v1:v1&definition_scope=all_definitions"
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "pattern_definition_scope_conflict"


def test_all_stats_definition_scope_passthrough(monkeypatch) -> None:
    called = {}

    def fake_get_all_stats_sync(ledger, *, definition_scope="current_definition"):
        called["definition_scope"] = definition_scope
        return {
            "patterns": {
                "tradoor-oi-reversal-v1": {
                    "scope": {"definition_scope": definition_scope},
                }
            },
            "count": 1,
        }

    monkeypatch.setattr(ptr, "get_all_stats_sync", fake_get_all_stats_sync)
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get("/patterns/stats/all?definition_scope=all_definitions")

    assert response.status_code == 200
    assert called["definition_scope"] == "all_definitions"
    assert (
        response.json()["patterns"]["tradoor-oi-reversal-v1"]["scope"]["definition_scope"]
        == "all_definitions"
    )


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
                pattern_version=1,
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
        def append_training_run_record(
            self,
            *,
            pattern_slug,
            model_key,
            user_id=None,
            definition_ref=None,
            payload=None,
        ):
            training_runs.append(
                {
                    "pattern_slug": pattern_slug,
                    "model_key": model_key,
                    "user_id": user_id,
                    "definition_ref": definition_ref or {},
                    "payload": payload or {},
                }
            )
            return None

        def append_model_record(
            self,
            *,
            pattern_slug,
            model_version,
            user_id=None,
            definition_ref=None,
            payload=None,
        ):
            model_records.append(
                {
                    "pattern_slug": pattern_slug,
                    "model_version": model_version,
                    "user_id": user_id,
                    "definition_ref": definition_ref or {},
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
    assert payload["model_key"] == "tradoor-oi-reversal-v1:v1:1h:breakout_24h:fs1:lp1"
    assert payload["training_run_recorded"] is True
    assert payload["model_recorded"] is True
    assert payload["model_version"] == "20260416_120000"
    assert payload["replaced"] is True
    assert len(training_runs) == 1
    assert len(registry_candidates) == 1
    assert registry_candidates[0]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert registry_candidates[0]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert training_runs[0]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert training_runs[0]["model_key"] == "tradoor-oi-reversal-v1:v1:1h:breakout_24h:fs1:lp1"
    assert training_runs[0]["definition_ref"]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert training_runs[0]["payload"]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert training_runs[0]["payload"]["n_records"] == 24
    assert training_runs[0]["payload"]["rollout_state"] == "candidate"
    assert len(model_records) == 1
    assert model_records[0]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert model_records[0]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert model_records[0]["payload"]["definition_ref"]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert model_records[0]["payload"]["n_records"] == 24
    assert model_records[0]["payload"]["rollout_state"] == "candidate"


def test_train_pattern_model_skips_model_record_when_not_replaced(monkeypatch) -> None:
    outcomes = [
            PatternOutcome(
                pattern_slug="tradoor-oi-reversal-v1",
                pattern_version=1,
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
        def append_training_run_record(
            self,
            *,
            pattern_slug,
            model_key,
            user_id=None,
            definition_ref=None,
            payload=None,
        ):
            training_runs.append(
                {
                    "pattern_slug": pattern_slug,
                    "model_key": model_key,
                    "user_id": user_id,
                    "definition_ref": definition_ref or {},
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
    assert training_runs[0]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert training_runs[0]["payload"]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert training_runs[0]["payload"]["rollout_state"] == "shadow"
    assert len(registry_candidates) == 0
    assert len(model_records) == 0


def test_get_model_registry_and_promote_model(monkeypatch) -> None:
    candidate_entry = _RegistryEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        model_key="tradoor-oi-reversal-v1:v1:1h:breakout_24h:fs1:lp1",
        model_version="20260416_120000",
        rollout_state="candidate",
    )
    alternate_entry = _RegistryEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        model_key="tradoor-oi-reversal-v1:v2:1h:breakout_48h:fs1:lp1",
        model_version="20260416_130000",
        rollout_state="candidate",
        definition_ref={
            "definition_id": "tradoor-oi-reversal-v1:v2",
            "pattern_slug": "tradoor-oi-reversal-v1",
        },
    )
    active_entry = _RegistryEntry(
        pattern_slug="tradoor-oi-reversal-v1",
        model_key="tradoor-oi-reversal-v1:v1:1h:breakout_24h:fs1:lp1",
        model_version="20260416_120000",
        rollout_state="active",
    )
    model_records = []

    class FakeRegistryStore:
        def list(self, slug, definition_id=None):
            entries = [candidate_entry, alternate_entry]
            if definition_id is not None:
                entries = [entry for entry in entries if entry.definition_id == definition_id]
            return entries

        def get_active(self, slug, definition_id=None):
            if definition_id == candidate_entry.definition_id:
                return None
            return None

        def get_preferred_scoring_model(self, slug, definition_id=None):
            if definition_id == alternate_entry.definition_id:
                return alternate_entry
            return candidate_entry

        def promote(self, *, pattern_slug, model_key, model_version, threshold_policy_version=None, definition_id=None):
            assert pattern_slug == "tradoor-oi-reversal-v1"
            assert model_key == candidate_entry.model_key
            assert model_version == candidate_entry.model_version
            assert threshold_policy_version == 3
            assert definition_id == "tradoor-oi-reversal-v1:v1"
            active_entry.threshold_policy_version = threshold_policy_version or 1
            return active_entry

    class FakeRecordStore:
        def append_model_record(
            self,
            *,
            pattern_slug,
            model_version,
            user_id=None,
            definition_ref=None,
            payload=None,
        ):
            model_records.append(
                {
                    "pattern_slug": pattern_slug,
                    "model_version": model_version,
                    "definition_ref": definition_ref or {},
                    "payload": payload or {},
                }
            )
            return None

    monkeypatch.setattr(ptr, "MODEL_REGISTRY_STORE", FakeRegistryStore())
    monkeypatch.setattr(ptr, "LEDGER_RECORD_STORE", FakeRecordStore())
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    registry_response = client.get(
        "/patterns/tradoor-oi-reversal-v1/model-registry?definition_id=tradoor-oi-reversal-v1:v1"
    )
    assert registry_response.status_code == 200
    registry_payload = registry_response.json()
    assert registry_payload["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert len(registry_payload["entries"]) == 1
    assert registry_payload["entries"][0]["rollout_state"] == "candidate"
    assert registry_payload["entries"][0]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert registry_payload["preferred_scoring_model"]["rollout_state"] == "candidate"
    assert registry_payload["preferred_scoring_model"]["definition_ref"]["pattern_slug"] == "tradoor-oi-reversal-v1"

    mismatch = client.get(
        "/patterns/funding-flip-reversal-v1/model-registry?definition_id=tradoor-oi-reversal-v1:v1"
    )
    assert mismatch.status_code == 400
    assert mismatch.json()["detail"]["code"] == "pattern_definition_slug_mismatch"

    promote_response = client.post(
        "/patterns/tradoor-oi-reversal-v1/promote-model",
        json={
            "definition_id": "tradoor-oi-reversal-v1:v1",
            "model_key": candidate_entry.model_key,
            "model_version": candidate_entry.model_version,
            "threshold_policy_version": 3,
        },
    )
    assert promote_response.status_code == 200
    promote_payload = promote_response.json()
    assert promote_payload["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert promote_payload["active_model"]["rollout_state"] == "active"
    assert promote_payload["active_model"]["threshold_policy_version"] == 3
    assert len(model_records) == 1
    assert model_records[0]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert model_records[0]["payload"]["definition_ref"]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert model_records[0]["payload"]["promotion_event"] == "promote_to_active"


def test_get_model_history_filters_by_definition_id_and_record_type(monkeypatch) -> None:
    training_record = PatternLedgerRecord(
        record_type="training_run",
        pattern_slug="tradoor-oi-reversal-v1",
        payload={
            "model_key": "tradoor-oi-reversal-v1:v1:1h:breakout_24h:fs1:lp1",
            "definition_ref": {
                "definition_id": "tradoor-oi-reversal-v1:v1",
                "pattern_slug": "tradoor-oi-reversal-v1",
            },
        },
    )
    model_record = PatternLedgerRecord(
        record_type="model",
        pattern_slug="tradoor-oi-reversal-v1",
        payload={
            "model_version": "20260416_120000",
            "definition_ref": {
                "definition_id": "tradoor-oi-reversal-v1:v1",
                "pattern_slug": "tradoor-oi-reversal-v1",
            },
        },
    )
    alternate_model_record = PatternLedgerRecord(
        record_type="model",
        pattern_slug="tradoor-oi-reversal-v1",
        payload={
            "model_version": "20260416_130000",
            "definition_ref": {
                "definition_id": "tradoor-oi-reversal-v1:v2",
                "pattern_slug": "tradoor-oi-reversal-v1",
            },
        },
    )

    class FakeRecordStore:
        def list(self, slug, record_type=None, definition_id=None, limit=None):
            records = [training_record, model_record, alternate_model_record]
            if record_type is not None:
                records = [record for record in records if record.record_type == record_type]
            if definition_id is not None:
                records = [
                    record
                    for record in records
                    if record.payload.get("definition_ref", {}).get("definition_id") == definition_id
                ]
            return records[:limit] if limit is not None else records

    monkeypatch.setattr(ptr, "LEDGER_RECORD_STORE", FakeRecordStore())
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get(
        "/patterns/tradoor-oi-reversal-v1/model-history"
        "?definition_id=tradoor-oi-reversal-v1:v1&record_type=model&limit=10"
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert payload["count"] == 1
    assert payload["records"][0]["record_type"] == "model"
    assert payload["records"][0]["definition_ref"]["pattern_slug"] == "tradoor-oi-reversal-v1"


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


def test_active_variants_route_returns_registry_entries(monkeypatch) -> None:
    monkeypatch.setattr(
        pattern_routes,
        "ACTIVE_PATTERN_VARIANT_STORE",
        type(
            "FakeActiveVariantStore",
            (),
            {
                "list_effective": lambda self: [
                    ActivePatternVariantEntry(
                        pattern_slug="tradoor-oi-reversal-v1",
                        variant_slug="tradoor-oi-reversal-v1__canonical",
                        timeframe="1h",
                        watch_phases=["ACCUMULATION", "REAL_DUMP"],
                        source_kind="seed",
                    )
                ],
            },
        )(),
    )

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get("/patterns/active-variants")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["count"] == 1
    assert payload["entries"][0]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert payload["entries"][0]["variant_slug"] == "tradoor-oi-reversal-v1__canonical"
