from __future__ import annotations

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.middleware.tier_gate import TierInfo, tier_gate
from api.routes import search
from api.schemas_pattern_draft import PatternDraftBody
from capture.store import CaptureStore
from patterns.definitions import PatternDefinitionService
from patterns.library import PATTERN_LIBRARY
from patterns.registry import PatternRegistryStore
from search.corpus import SearchCorpusStore, build_corpus_windows

_TEST_TIER = TierInfo(user_id="test", tier="pro", source="bypass")


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(search.router, prefix="/search")
    app.dependency_overrides[tier_gate] = lambda: _TEST_TIER
    return TestClient(app)


def _klines() -> pd.DataFrame:
    index = pd.date_range("2026-04-13", periods=8, freq="h", tz="UTC")
    close = [100.0 + i for i in range(8)]
    return pd.DataFrame(
        {
            "open": close,
            "high": [value + 1.0 for value in close],
            "low": [value - 1.0 for value in close],
            "close": close,
            "volume": [1_000.0] * 8,
        },
        index=index,
    )


def _definition_service(tmp_path) -> PatternDefinitionService:
    registry_store = PatternRegistryStore(tmp_path / "pattern_registry")
    registry_store.seed_from_library(PATTERN_LIBRARY)
    capture_store = CaptureStore(tmp_path / "captures.sqlite")
    return PatternDefinitionService(
        capture_store=capture_store,
        registry_store=registry_store,
    )


def _pattern_draft_payload() -> dict:
    return {
        "schema_version": 1,
        "pattern_family": "tradoor_ptb_oi_reversal",
        "pattern_label": "OI spike then higher lows",
        "source_type": "manual_note",
        "source_text": "OI spike after second dump then higher lows",
        "timeframe": "15m",
        "symbol_candidates": ["TRADOORUSDT"],
        "phases": [
            {
                "phase_id": "real_dump",
                "label": "Real Dump",
                "sequence_order": 1,
                "signals_required": ["oi_spike"],
            },
            {
                "phase_id": "accumulation",
                "label": "Accumulation",
                "sequence_order": 2,
                "signals_required": ["higher_lows_sequence"],
            },
        ],
        "search_hints": {
            "preferred_timeframes": ["15m", "1h"],
            "similarity_focus": ["phase_path"],
        },
    }


def test_pattern_draft_schema_roundtrips_engine_contract() -> None:
    draft = PatternDraftBody.model_validate(_pattern_draft_payload())
    payload = draft.model_dump(mode="json")

    assert payload["schema_version"] == 1
    assert payload["pattern_family"] == "tradoor_ptb_oi_reversal"
    assert payload["phases"][0]["phase_id"] == "real_dump"
    assert payload["search_hints"]["preferred_timeframes"] == ["15m", "1h"]


def test_search_query_spec_transform_route_returns_deterministic_spec() -> None:
    response = _client().post(
        "/search/query-spec/transform",
        json={
            "pattern_draft": _pattern_draft_payload(),
            "parser_meta": {
                "parser_role": "pattern_seed_parser",
                "parser_model": "heuristic-v1",
                "parser_prompt_version": "pattern-seed-heuristic-v1",
                "pattern_draft_schema_version": 1,
                "signal_vocab_version": "signal-vocab-v1",
                "confidence": 0.82,
                "ambiguity_count": 0,
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    spec = payload["search_query_spec"]
    assert payload["status"] == "transformed"
    assert payload["owner"] == "engine"
    assert payload["plane"] == "search"
    assert payload["transformer_meta"]["transformer_version"] == "query-transformer-v1"
    assert payload["parser_meta"]["parser_role"] == "pattern_seed_parser"
    assert spec["phase_path"] == ["real_dump", "accumulation"]
    assert spec["reference_timeframe"] == "15m"
    assert spec["must_have_signals"] == ["oi_spike", "higher_lows_sequence"]
    assert spec["phase_queries"][0]["required_numeric"]["oi_zscore"]["min"] == 1.5
    assert spec["phase_queries"][1]["required_boolean"]["higher_lows_sequence"] is True


def test_search_query_spec_transform_route_rejects_invalid_draft() -> None:
    payload = _pattern_draft_payload()
    payload["phases"] = []

    response = _client().post(
        "/search/query-spec/transform",
        json={"pattern_draft": payload},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "pattern_draft_invalid"


def test_similar_route_reports_pipeline_metadata(monkeypatch) -> None:
    def fake_run_similar_search(_request: dict) -> dict:
        return {
            "run_id": "sim-1",
            "request": {"mode": "3layer"},
            "status": "live",
            "updated_at": "2026-04-25T00:00:00+00:00",
            "candidates": [
                {
                    "candidate_id": "cand-1",
                    "window_id": "window-1",
                    "symbol": "TRADOORUSDT",
                    "timeframe": "15m",
                    "start_ts": "2026-04-24T00:00:00+00:00",
                    "end_ts": "2026-04-24T01:00:00+00:00",
                    "bars": 4,
                    "final_score": 0.91,
                    "layer_a_score": 0.88,
                    "layer_b_score": 0.82,
                    "layer_c_score": None,
                    "candidate_phase_path": ["real_dump", "accumulation"],
                    "signature": {"close_return_pct": 4.2},
                    "close_return_pct": 4.2,
                }
            ],
            "active_layers": {"layer_a": True, "layer_b": True, "layer_c": False},
            "stage_counts": {
                "corpus_windows": 5,
                "ranked_candidates": 1,
                "returned_candidates": 1,
            },
            "degraded_reason": None,
        }

    monkeypatch.setattr(search, "run_similar_search", fake_run_similar_search)

    response = _client().post(
        "/search/similar",
        json={
            "pattern_draft": {},
            "observed_phase_paths": ["real_dump", "accumulation"],
            "timeframe": "15m",
            "top_k": 1,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == "sim-1"
    assert payload["active_layers"] == {"layer_a": True, "layer_b": True, "layer_c": False}
    assert payload["scoring_layers"] == payload["active_layers"]
    assert payload["stage_counts"]["corpus_windows"] == 5
    assert payload["stage_counts"]["returned_candidates"] == 1
    assert payload["degraded_reason"] is None


def test_search_catalog_route_returns_corpus_inventory(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    store.upsert_windows(
        build_corpus_windows("BTCUSDT", "1h", _klines(), window_bars=4, stride_bars=2)
    )
    monkeypatch.setattr(search, "SearchCorpusStore", lambda: store)

    response = _client().get("/search/catalog", params={"symbol": "BTCUSDT", "timeframe": "1h", "limit": 2})

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["owner"] == "engine"
    assert payload["plane"] == "search"
    assert payload["status"] == "live"
    assert payload["total_windows"] == 3
    assert len(payload["windows"]) == 2
    assert payload["windows"][0]["symbol"] == "BTCUSDT"
    assert payload["windows"][0]["signature"]["trend"] == "up"


def test_search_catalog_route_reports_empty_catalog(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    monkeypatch.setattr(search, "SearchCorpusStore", lambda: store)

    response = _client().get("/search/catalog")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "empty"
    assert payload["total_windows"] == 0
    assert payload["windows"] == []


def test_seed_search_route_persists_corpus_only_run(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    windows = build_corpus_windows("BTCUSDT", "1h", _klines(), window_bars=4, stride_bars=2)
    store.upsert_windows(windows)
    monkeypatch.setattr("search.runtime.SearchCorpusStore", lambda: store)
    monkeypatch.setattr(search, "_definition_service", _definition_service(tmp_path))

    response = _client().post(
        "/search/seed",
        json={
            "definition_id": "tradoor-oi-reversal-v1:v1",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "signature": windows[0].signature,
            "limit": 2,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["plane"] == "search"
    assert payload["status"] == "corpus_only"
    assert payload["request"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert payload["request"]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert len(payload["candidates"]) == 2
    assert payload["candidates"][0]["definition_ref"]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert payload["candidates"][0]["payload"]["definition_ref"]["pattern_family"] == "tradoor_oi_reversal_v1"

    followup = _client().get(f"/search/seed/{payload['run_id']}")
    assert followup.status_code == 200
    assert followup.json()["run_id"] == payload["run_id"]
    assert followup.json()["candidates"][0]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"


def test_scan_route_persists_corpus_only_scan(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    store.upsert_windows(build_corpus_windows("SOLUSDT", "4h", _klines(), window_bars=4, stride_bars=2))
    monkeypatch.setattr("search.runtime.SearchCorpusStore", lambda: store)
    monkeypatch.setattr(search, "_definition_service", _definition_service(tmp_path))

    response = _client().post(
        "/search/scan",
        json={
            "definition_id": "funding-flip-reversal-v1:v1",
            "symbol": "SOLUSDT",
            "timeframe": "4h",
            "limit": 3,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "corpus_only"
    assert payload["candidates"][0]["symbol"] == "SOLUSDT"
    assert payload["request"]["definition_ref"]["pattern_slug"] == "funding-flip-reversal-v1"
    assert payload["candidates"][0]["definition_ref"]["definition_id"] == "funding-flip-reversal-v1:v1"

    followup = _client().get(f"/search/scan/{payload['scan_id']}")
    assert followup.status_code == 200
    assert followup.json()["scan_id"] == payload["scan_id"]


def test_search_result_routes_return_404_for_missing_runs(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    monkeypatch.setattr("search.runtime.SearchCorpusStore", lambda: store)
    monkeypatch.setattr(search, "_definition_service", _definition_service(tmp_path))

    response = _client().get("/search/seed/missing")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "seed_run_not_found"

    response = _client().get("/search/scan/missing")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "scan_not_found"


def test_search_routes_reject_invalid_definition_ids(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    monkeypatch.setattr("search.runtime.SearchCorpusStore", lambda: store)
    monkeypatch.setattr(search, "_definition_service", _definition_service(tmp_path))

    invalid = _client().post("/search/seed", json={"definition_id": "bad-definition"})
    assert invalid.status_code == 400
    assert invalid.json()["detail"]["code"] == "search_definition_id_invalid"

    missing = _client().post("/search/scan", json={"definition_id": "missing-pattern:v1"})
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "search_definition_not_found"
