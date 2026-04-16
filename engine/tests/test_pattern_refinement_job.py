from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from scanner.jobs.pattern_refinement import pattern_refinement_job
from research.state_store import ResearchStateStore


def test_pattern_refinement_job_runs_patterns_and_optional_handoff(monkeypatch) -> None:
    seen = []
    handoffs = []

    def _run_once(slug: str, state_store=None) -> dict:
        seen.append(slug)
        disposition = "train_candidate" if slug == "tradoor-oi-reversal-v1" else "no_op"
        return {
            "research_run": {
                "research_run_id": f"run-{slug}",
                "completion_disposition": disposition,
            }
        }

    def _handoff(run_id: str, store=None):
        handoffs.append(run_id)
        return (None, {"model_key": "m1", "model_version": "v1"})

    monkeypatch.setattr("scanner.jobs.pattern_refinement.run_pattern_refinement_once", _run_once)
    monkeypatch.setattr("scanner.jobs.pattern_refinement.execute_train_candidate_handoff", _handoff)

    asyncio.run(
        pattern_refinement_job(
            pattern_slugs=["tradoor-oi-reversal-v1", "other-pattern"],
            auto_train_candidate=True,
        )
    )

    assert seen == ["tradoor-oi-reversal-v1", "other-pattern"]
    assert handoffs == []


def test_pattern_refinement_job_honors_auto_train_allowlist(monkeypatch, tmp_path) -> None:
    handoffs = []
    store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    store.upsert_pattern_control_state(
        "tradoor-oi-reversal-v1",
        updated_at="2026-04-16T18:00:00+00:00",
        approval_required=False,
        auto_train_allowed=True,
    )

    def _run_once(slug: str, state_store=None) -> dict:
        return {
            "research_run": {
                "research_run_id": f"run-{slug}",
                "completion_disposition": "train_candidate",
            }
        }

    def _handoff(run_id: str, store=None):
        handoffs.append(run_id)
        return (None, {"model_key": "m1", "model_version": "v1"})

    monkeypatch.setattr("scanner.jobs.pattern_refinement.ResearchStateStore", lambda: store)
    monkeypatch.setattr("scanner.jobs.pattern_refinement.run_pattern_refinement_once", _run_once)
    monkeypatch.setattr("scanner.jobs.pattern_refinement.execute_train_candidate_handoff", _handoff)

    asyncio.run(
        pattern_refinement_job(
            pattern_slugs=["tradoor-oi-reversal-v1"],
            auto_train_candidate=True,
        )
    )

    assert handoffs == ["run-tradoor-oi-reversal-v1"]
    updated = store.get_pattern_control_state("tradoor-oi-reversal-v1")
    assert updated.cooldown_until is not None


def test_pattern_refinement_job_skips_paused_or_cooldown_patterns(monkeypatch, tmp_path) -> None:
    seen = []
    store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    store.upsert_pattern_control_state(
        "paused-pattern",
        updated_at="2026-04-16T18:00:00+00:00",
        paused_by_operator=True,
    )
    store.upsert_pattern_control_state(
        "cooldown-pattern",
        updated_at="2026-04-16T18:00:00+00:00",
        cooldown_until=(datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    )

    def _run_once(slug: str, state_store=None) -> dict:
        seen.append(slug)
        return {
            "research_run": {
                "research_run_id": f"run-{slug}",
                "completion_disposition": "no_op",
            }
        }

    monkeypatch.setattr("scanner.jobs.pattern_refinement.ResearchStateStore", lambda: store)
    monkeypatch.setattr("scanner.jobs.pattern_refinement.run_pattern_refinement_once", _run_once)

    asyncio.run(
        pattern_refinement_job(
            pattern_slugs=["paused-pattern", "cooldown-pattern", "active-pattern"],
            auto_train_candidate=False,
        )
    )

    assert seen == ["active-pattern"]


def test_pattern_refinement_job_applies_policy_pause_after_repeated_dead_ends(monkeypatch, tmp_path) -> None:
    store = ResearchStateStore(tmp_path / "research_runtime.sqlite")

    def _run_once(slug: str, state_store=None) -> dict:
        run = store.create_run(
            pattern_slug=slug,
            objective_id="obj-dead-end",
            baseline_ref="pattern-shadow:rule-first",
            search_policy={"mode": "bounded-walk-forward-eval"},
            evaluation_protocol={"kind": "walk-forward"},
            created_at=f"2026-04-16T18:00:0{len(store.list_runs(pattern_slug=slug, limit=10))}+00:00",
        )
        store.complete_run(
            run.research_run_id,
            completed_at="2026-04-16T18:10:00+00:00",
            disposition="dead_end",
        )
        return {
            "research_run": {
                "research_run_id": run.research_run_id,
                "completion_disposition": "dead_end",
            }
        }

    monkeypatch.setattr("scanner.jobs.pattern_refinement.ResearchStateStore", lambda: store)
    monkeypatch.setattr("scanner.jobs.pattern_refinement.run_pattern_refinement_once", _run_once)

    asyncio.run(
        pattern_refinement_job(
            pattern_slugs=["tradoor-oi-reversal-v1"],
            auto_train_candidate=False,
            dead_end_pause_threshold=1,
        )
    )

    control = store.get_pattern_control_state("tradoor-oi-reversal-v1")
    assert control.paused_by_policy is True
    assert control.pause_reason == "recent_dead_end_threshold:1"
