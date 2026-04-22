from __future__ import annotations

import json

from worker import cli as worker_cli


def test_worker_cli_pattern_objective_outputs_worker_control_payload(monkeypatch, capsys) -> None:
    class _Objective:
        def to_dict(self) -> dict:
            return {
                "objective_id": "obj-1",
                "pattern_slug": "tradoor-oi-reversal-v1",
                "objective_kind": "dataset_readiness",
            }

    monkeypatch.setattr(worker_cli, "derive_pattern_research_objective", lambda slug: _Objective())

    exit_code = worker_cli.main(["pattern-objective", "--slug", "tradoor-oi-reversal-v1"])

    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is True
    assert payload["runtime_role"] == "worker-control"
    assert payload["command"] == "pattern-objective"
    assert payload["objective"]["objective_id"] == "obj-1"


def test_worker_cli_pattern_refinement_once_outputs_worker_control_payload(monkeypatch, capsys) -> None:
    monkeypatch.setattr(
        worker_cli,
        "run_pattern_refinement_once",
        lambda slug: {
            "objective": {"objective_id": "obj-2"},
            "research_run": {"research_run_id": "run-1"},
        },
    )

    exit_code = worker_cli.main(["pattern-refinement-once", "--slug", "tradoor-oi-reversal-v1"])

    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is True
    assert payload["runtime_role"] == "worker-control"
    assert payload["command"] == "pattern-refinement-once"
    assert payload["research_run"]["research_run_id"] == "run-1"


def test_worker_cli_pattern_search_refinement_once_outputs_worker_control_payload(monkeypatch, capsys) -> None:
    monkeypatch.setattr(
        worker_cli,
        "run_pattern_search_refinement_once",
        lambda slug: {
            "search": {"research_run": {"research_run_id": "search-1"}},
            "refinement": {"research_run": {"research_run_id": "refine-1"}},
        },
    )

    exit_code = worker_cli.main(["pattern-search-refinement-once", "--slug", "tradoor-oi-reversal-v1"])

    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is True
    assert payload["runtime_role"] == "worker-control"
    assert payload["command"] == "pattern-search-refinement-once"
    assert payload["search"]["research_run"]["research_run_id"] == "search-1"
    assert payload["refinement"]["research_run"]["research_run_id"] == "refine-1"
