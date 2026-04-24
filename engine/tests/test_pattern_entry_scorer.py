from __future__ import annotations

from patterns import entry_scorer


class _RegistryEntry:
    def __init__(self, *, model_key: str, model_version: str, rollout_state: str) -> None:
        self.pattern_slug = "tradoor-oi-reversal-v1"
        self.model_key = model_key
        self.model_version = model_version
        self.timeframe = "1h"
        self.target_name = "breakout_24h"
        self.feature_schema_version = 1
        self.label_policy_version = 1
        self.threshold_policy_version = 1
        self.rollout_state = rollout_state
        self.definition_id = "tradoor-oi-reversal-v1:v1"
        self.definition_ref = {
            "definition_id": self.definition_id,
            "pattern_slug": self.pattern_slug,
        }


def test_score_entry_feature_snapshot_prefers_current_definition(monkeypatch) -> None:
    calls: list[tuple[str, str | None]] = []

    class FakeRegistryStore:
        def get_preferred_scoring_model(self, slug, definition_id=None):
            calls.append((slug, definition_id))
            if definition_id == "tradoor-oi-reversal-v1:v1":
                return _RegistryEntry(
                    model_key="tradoor-oi-reversal-v1:v1:1h:breakout_24h:fs1:lp1",
                    model_version="20260418_120000",
                    rollout_state="active",
                )
            return None

    class FakeEngine:
        is_trained = True
        model_version = "20260418_120000"

        def predict_feature_row(self, row):
            assert row["price"] == 101.0
            return 0.73

    monkeypatch.setattr(entry_scorer, "MODEL_REGISTRY_STORE", FakeRegistryStore())
    monkeypatch.setattr(entry_scorer, "get_engine", lambda model_key: FakeEngine())

    score = entry_scorer.score_entry_feature_snapshot(
        {"price": 101.0},
        pattern_slug="tradoor-oi-reversal-v1",
    )

    assert calls == [("tradoor-oi-reversal-v1", "tradoor-oi-reversal-v1:v1")]
    assert score.state == "scored"
    assert score.model_key == "tradoor-oi-reversal-v1:v1:1h:breakout_24h:fs1:lp1"
    assert score.model_version == "20260418_120000"
    assert score.rollout_state == "active"
    assert score.threshold_passed is True


def test_score_entry_feature_snapshot_falls_back_to_legacy_slug_lookup(monkeypatch) -> None:
    calls: list[tuple[str, str | None]] = []

    class FakeRegistryStore:
        def get_preferred_scoring_model(self, slug, definition_id=None):
            calls.append((slug, definition_id))
            if definition_id is None:
                return _RegistryEntry(
                    model_key="tradoor-oi-reversal-v1:1h:breakout_24h:fs1:lp1",
                    model_version="20260417_120000",
                    rollout_state="candidate",
                )
            return None

    class FakeEngine:
        is_trained = True
        model_version = "20260417_120000"

        def predict_feature_row(self, row):
            return 0.61

    monkeypatch.setattr(entry_scorer, "MODEL_REGISTRY_STORE", FakeRegistryStore())
    monkeypatch.setattr(entry_scorer, "get_engine", lambda model_key: FakeEngine())

    score = entry_scorer.score_entry_feature_snapshot(
        {"price": 99.0},
        pattern_slug="tradoor-oi-reversal-v1",
    )

    assert calls == [
        ("tradoor-oi-reversal-v1", "tradoor-oi-reversal-v1:v1"),
        ("tradoor-oi-reversal-v1", None),
    ]
    assert score.state == "scored"
    assert score.model_key == "tradoor-oi-reversal-v1:1h:breakout_24h:fs1:lp1"
    assert score.model_version == "20260417_120000"
    assert score.rollout_state == "candidate"
    assert score.threshold_passed is True
