from __future__ import annotations

import asyncio

from scanner.jobs.pattern_refinement import pattern_refinement_job


def test_pattern_refinement_job_runs_patterns_and_optional_handoff(monkeypatch) -> None:
    seen = []
    handoffs = []

    def _run_once(slug: str) -> dict:
        seen.append(slug)
        disposition = "train_candidate" if slug == "tradoor-oi-reversal-v1" else "no_op"
        return {
            "research_run": {
                "research_run_id": f"run-{slug}",
                "completion_disposition": disposition,
            }
        }

    def _handoff(run_id: str):
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
    assert handoffs == ["run-tradoor-oi-reversal-v1"]
