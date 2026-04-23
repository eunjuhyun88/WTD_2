from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import patterns as pattern_routes
from capture.store import CaptureStore
from capture.types import CaptureRecord
import research.capture_benchmark as capture_benchmark_module
from research.capture_benchmark import (
    build_and_run_benchmark_search_from_capture,
    build_benchmark_pack_from_capture,
)
from research.pattern_search import BenchmarkPackStore, NegativeSearchMemoryStore, PatternSearchArtifactStore
from research.state_store import ResearchRun


def _sample_research_context(*, timeframe: str, start_ms: int, end_ms: int) -> dict:
    return {
        "pattern_family": "tradoor_ptb_oi_reversal",
        "phase_annotations": [
            {
                "phase_id": "fake_dump",
                "label": "first warning dump",
                "timeframe": timeframe,
                "start_ts": start_ms - 7_200_000,
                "end_ts": start_ms - 3_600_000,
            },
            {
                "phase_id": "real_dump",
                "label": "real dump",
                "timeframe": timeframe,
                "start_ts": start_ms,
                "end_ts": start_ms + 3_600_000,
            },
            {
                "phase_id": "accumulation_15m",
                "label": "higher lows",
                "timeframe": timeframe,
                "start_ts": start_ms + 3_600_000,
                "end_ts": end_ms,
            },
            {
                "phase_id": "breakout_oi_reexpand",
                "label": "breakout",
                "timeframe": timeframe,
                "start_ts": end_ms,
                "end_ts": end_ms + 3_600_000,
            },
        ],
    }


def test_build_benchmark_pack_from_capture_uses_research_context_and_siblings(tmp_path) -> None:
    capture_store = CaptureStore(tmp_path / "capture.sqlite")
    pack_store = BenchmarkPackStore(tmp_path / "packs")
    source_start_ms = 1_776_100_000_000
    source_end_ms = source_start_ms + 10_800_000

    source = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        phase="ACCUMULATION",
        timeframe="15m",
        captured_at_ms=source_end_ms,
        user_note="PTB seed",
        research_context=_sample_research_context(timeframe="15m", start_ms=source_start_ms, end_ms=source_end_ms),
        status="pending_outcome",
    )
    sibling = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="TRADOORUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        phase="ACCUMULATION",
        timeframe="1h",
        captured_at_ms=source_end_ms + 86_400_000,
        user_note="TRADOOR holdout",
        research_context=_sample_research_context(
            timeframe="1h",
            start_ms=source_start_ms + 86_400_000,
            end_ms=source_end_ms + 86_400_000,
        ),
        status="pending_outcome",
    )
    capture_store.save(source)
    capture_store.save(sibling)

    draft = build_benchmark_pack_from_capture(
        capture_id=source.capture_id,
        capture_store=capture_store,
        pack_store=pack_store,
    )

    assert draft.family_key == "tradoor_ptb_oi_reversal"
    assert draft.sibling_capture_ids == [sibling.capture_id]
    assert draft.pack.pattern_slug == "tradoor-oi-reversal-v1"
    assert draft.pack.candidate_timeframes == ["15m", "1h"]
    assert [case.role for case in draft.pack.cases] == ["reference", "holdout"]
    assert draft.pack.cases[0].expected_phase_path == [
        "fake_dump",
        "real_dump",
        "accumulation_15m",
        "breakout_oi_reexpand",
    ]
    assert draft.pack.cases[0].start_at == datetime.fromtimestamp((source_start_ms - 7_200_000) / 1000, tz=timezone.utc)
    assert pack_store.load(draft.pack.benchmark_pack_id) is not None


def test_patterns_route_creates_benchmark_pack_draft(tmp_path, monkeypatch) -> None:
    capture_store = CaptureStore(tmp_path / "capture.sqlite")
    pack_store = BenchmarkPackStore(tmp_path / "packs")
    start_ms = 1_776_100_000_000
    end_ms = start_ms + 10_800_000

    source = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        phase="ACCUMULATION",
        timeframe="15m",
        captured_at_ms=end_ms,
        user_note="PTB seed",
        research_context=_sample_research_context(timeframe="15m", start_ms=start_ms, end_ms=end_ms),
        status="pending_outcome",
    )
    capture_store.save(source)
    monkeypatch.setattr(pattern_routes, "_capture_store", capture_store)
    monkeypatch.setattr(pattern_routes, "_benchmark_pack_store", pack_store)

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.post(
        "/patterns/tradoor-oi-reversal-v1/benchmark-pack-draft",
        json={"capture_id": source.capture_id, "max_holdouts": 0},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["source_capture_id"] == source.capture_id
    assert payload["pack"]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert payload["pack"]["candidate_timeframes"] == ["15m"]
    assert len(payload["pack"]["cases"]) == 1
    saved = pack_store.load(payload["pack"]["benchmark_pack_id"])
    assert saved is not None


def test_build_and_run_benchmark_search_from_capture_uses_saved_pack(tmp_path, monkeypatch) -> None:
    capture_store = CaptureStore(tmp_path / "capture.sqlite")
    pack_store = BenchmarkPackStore(tmp_path / "packs")
    artifact_store = PatternSearchArtifactStore(tmp_path / "search-runs")
    negative_store = NegativeSearchMemoryStore(tmp_path / "negative-memory")
    start_ms = 1_776_100_000_000
    end_ms = start_ms + 10_800_000

    source = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        phase="ACCUMULATION",
        timeframe="15m",
        captured_at_ms=end_ms,
        user_note="PTB seed",
        research_context=_sample_research_context(timeframe="15m", start_ms=start_ms, end_ms=end_ms),
        status="pending_outcome",
    )
    capture_store.save(source)

    observed: dict = {}

    def _fake_run(config, *, controller=None, pack_store=None, artifact_store=None, negative_memory_store=None):
        observed["benchmark_pack_id"] = config.benchmark_pack_id
        observed["pack_present"] = pack_store.load(config.benchmark_pack_id) is not None
        return ResearchRun(
            research_run_id="run-123",
            pattern_slug=config.pattern_slug,
            objective_id=f"benchmark-search:{config.benchmark_pack_id}",
            baseline_ref=f"benchmark-pack:{config.benchmark_pack_id}",
            search_policy={},
            evaluation_protocol={},
            status="completed",
            completion_disposition="no_op",
            winner_variant_ref="tradoor-oi-reversal-v1__test",
            handoff_payload={},
            created_at="2026-04-23T00:00:00+00:00",
            updated_at="2026-04-23T00:00:00+00:00",
            started_at="2026-04-23T00:00:00+00:00",
            completed_at="2026-04-23T00:00:01+00:00",
        )

    def _fake_payload(run, *, controller=None, artifact_store=None, negative_memory_store=None):
        return {
            "research_run": {"research_run_id": run.research_run_id},
            "artifact": {
                "benchmark_pack_id": observed["benchmark_pack_id"],
                "winner_variant_slug": run.winner_variant_ref,
            },
        }

    monkeypatch.setattr(capture_benchmark_module, "run_pattern_benchmark_search", _fake_run)
    monkeypatch.setattr(capture_benchmark_module, "pattern_benchmark_search_payload", _fake_payload)

    result = build_and_run_benchmark_search_from_capture(
        capture_id=source.capture_id,
        capture_store=capture_store,
        pack_store=pack_store,
        artifact_store=artifact_store,
        negative_memory_store=negative_store,
    )

    assert observed["pack_present"] is True
    assert result.benchmark_draft.pack.benchmark_pack_id == observed["benchmark_pack_id"]
    assert result.search_run["artifact"]["winner_variant_slug"] == "tradoor-oi-reversal-v1__test"


def test_patterns_route_runs_benchmark_search_from_capture(tmp_path, monkeypatch) -> None:
    capture_store = CaptureStore(tmp_path / "capture.sqlite")
    pack_store = BenchmarkPackStore(tmp_path / "packs")
    artifact_store = PatternSearchArtifactStore(tmp_path / "search-runs")
    negative_store = NegativeSearchMemoryStore(tmp_path / "negative-memory")
    start_ms = 1_776_100_000_000
    end_ms = start_ms + 10_800_000

    source = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        phase="ACCUMULATION",
        timeframe="15m",
        captured_at_ms=end_ms,
        user_note="PTB seed",
        research_context=_sample_research_context(timeframe="15m", start_ms=start_ms, end_ms=end_ms),
        status="pending_outcome",
    )
    capture_store.save(source)
    monkeypatch.setattr(pattern_routes, "_capture_store", capture_store)
    monkeypatch.setattr(pattern_routes, "_benchmark_pack_store", pack_store)
    monkeypatch.setattr(pattern_routes, "_pattern_search_artifact_store", artifact_store)
    monkeypatch.setattr(pattern_routes, "_negative_search_memory_store", negative_store)

    observed: dict = {}

    def _fake_run(config, *, controller=None, pack_store=None, artifact_store=None, negative_memory_store=None):
        observed["benchmark_pack_id"] = config.benchmark_pack_id
        return ResearchRun(
            research_run_id="run-456",
            pattern_slug=config.pattern_slug,
            objective_id=f"benchmark-search:{config.benchmark_pack_id}",
            baseline_ref=f"benchmark-pack:{config.benchmark_pack_id}",
            search_policy={},
            evaluation_protocol={},
            status="completed",
            completion_disposition="no_op",
            winner_variant_ref="tradoor-oi-reversal-v1__route-test",
            handoff_payload={},
            created_at="2026-04-23T00:00:00+00:00",
            updated_at="2026-04-23T00:00:00+00:00",
            started_at="2026-04-23T00:00:00+00:00",
            completed_at="2026-04-23T00:00:01+00:00",
        )

    def _fake_payload(run, *, controller=None, artifact_store=None, negative_memory_store=None):
        return {
            "research_run": {"research_run_id": run.research_run_id},
            "artifact": {
                "benchmark_pack_id": observed["benchmark_pack_id"],
                "winner_variant_slug": run.winner_variant_ref,
            },
        }

    monkeypatch.setattr(capture_benchmark_module, "run_pattern_benchmark_search", _fake_run)
    monkeypatch.setattr(capture_benchmark_module, "pattern_benchmark_search_payload", _fake_payload)

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.post(
        "/patterns/tradoor-oi-reversal-v1/benchmark-search-from-capture",
        json={"capture_id": source.capture_id, "max_holdouts": 0},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["benchmark_draft"]["source_capture_id"] == source.capture_id
    assert payload["search_run"]["artifact"]["winner_variant_slug"] == "tradoor-oi-reversal-v1__route-test"
    assert pack_store.load(payload["benchmark_draft"]["pack"]["benchmark_pack_id"]) is not None
