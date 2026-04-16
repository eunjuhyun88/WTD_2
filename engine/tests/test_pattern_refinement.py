from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from ledger.store import LedgerStore
from ledger.types import PatternOutcome
from research.pattern_refinement import PatternBoundedEvalConfig, run_pattern_bounded_eval
from research.reporting import research_run_report_path
from research.state_store import ResearchStateStore
from research.worker_control import ResearchWorkerController


def _outcome(idx: int, *, outcome: str) -> PatternOutcome:
    return PatternOutcome(
        pattern_slug="tradoor-oi-reversal-v1",
        symbol=f"SYM{idx}USDT",
        accumulation_at=datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc),
        entry_price=100.0 + idx,
        outcome=outcome,  # type: ignore[arg-type]
        feature_snapshot={
            "price": 100.0 + idx,
            "ema20_slope": 0.05 * idx,
            "volume_zscore": 0.1 * idx,
            "symbol": f"SYM{idx}USDT",
            "timestamp": datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc).isoformat(),
        },
    )


def test_pattern_bounded_eval_returns_train_candidate_when_gate_clears(tmp_path, monkeypatch) -> None:
    ledger_store = LedgerStore(tmp_path / "ledger_data")
    for idx in range(1, 25):
        ledger_store.save(_outcome(idx, outcome="success" if idx % 3 == 0 else "failure"))

    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    controller = ResearchWorkerController(state_store)

    def _fake_eval(X, y, n_splits):
        assert len(X) == 24
        assert len(y) == 24
        assert n_splits == 4
        return {
            "n_samples": 24,
            "n_splits": 4,
            "mean_auc": 0.68,
            "std_auc": 0.05,
            "min_auc": 0.61,
            "max_auc": 0.74,
            "folds": [],
        }

    monkeypatch.setattr("research.pattern_refinement.walk_forward_eval", _fake_eval)

    run = run_pattern_bounded_eval(
        PatternBoundedEvalConfig(
            pattern_slug="tradoor-oi-reversal-v1",
            n_splits=4,
            min_mean_auc=0.60,
            max_std_auc=0.10,
        ),
        controller=controller,
        ledger_store=ledger_store,
    )

    assert run.status == "completed"
    assert run.completion_disposition == "train_candidate"
    assert run.search_policy["mode"] == "bounded_walk_forward"
    assert run.handoff_payload["model_key"].startswith("tradoor-oi-reversal-v1:1h:breakout")
    assert run.handoff_payload["mean_auc"] == pytest.approx(0.68)
    decision = state_store.get_selection_decision(run.research_run_id)
    assert decision is not None
    assert decision.decision_kind == "train_candidate"


def test_pattern_bounded_eval_returns_no_op_when_dataset_not_ready(tmp_path) -> None:
    ledger_store = LedgerStore(tmp_path / "ledger_data")
    for idx in range(1, 9):
        ledger_store.save(_outcome(idx, outcome="success" if idx % 2 == 0 else "failure"))

    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    controller = ResearchWorkerController(state_store)

    run = run_pattern_bounded_eval(
        PatternBoundedEvalConfig(pattern_slug="tradoor-oi-reversal-v1"),
        controller=controller,
        ledger_store=ledger_store,
    )

    assert run.status == "completed"
    assert run.completion_disposition == "no_op"
    assert run.handoff_payload == {}
    decision = state_store.get_selection_decision(run.research_run_id)
    assert decision is not None
    assert decision.decision_kind == "reject"
    assert decision.metrics["readiness_plan"]["state"] == "needs_more_records"
    assert decision.metrics["recommended_search_policy"]["mode"] == "readiness_accumulation"
    assert "collect_decided_outcomes" in decision.metrics["readiness_plan"]["next_actions"][0]
    notes = state_store.list_memory_notes(research_run_id=run.research_run_id)
    assert len(notes) == 1
    assert notes[0].note_kind == "assumption_update"
    assert "next_actions" in (notes[0].detail or "")
    report = json.loads(research_run_report_path(state_store, run.research_run_id).read_text())
    assert report["operator_recommendation"]["action"] == "accumulate_evidence"
    assert report["readiness_plan"]["state"] == "needs_more_records"


def test_pattern_bounded_eval_blocks_train_candidate_when_policy_requires_reset(tmp_path, monkeypatch) -> None:
    ledger_store = LedgerStore(tmp_path / "ledger_data")
    for idx in range(1, 25):
        ledger_store.save(_outcome(idx, outcome="success" if idx % 3 == 0 else "failure"))

    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    controller = ResearchWorkerController(state_store)
    for idx in range(3):
        stamp = f"2026-04-16T00:00:0{idx}+00:00"
        past_run = state_store.create_run(
            pattern_slug="tradoor-oi-reversal-v1",
            objective_id=f"past-reset-{idx}",
            baseline_ref="pattern-shadow:rule-first",
            search_policy={"mode": "local_refresh_sweep"},
            evaluation_protocol={"kind": "walk-forward"},
            created_at=stamp,
        )
        state_store.start_run(past_run.research_run_id, started_at=stamp)
        state_store.complete_run(
            past_run.research_run_id,
            completed_at=stamp,
            disposition="dead_end",
        )

    def _raise_if_called(*args, **kwargs):
        raise AssertionError("walk_forward_eval must not run for reset_search policy")

    monkeypatch.setattr("research.pattern_refinement.walk_forward_eval", _raise_if_called)

    run = run_pattern_bounded_eval(
        PatternBoundedEvalConfig(pattern_slug="tradoor-oi-reversal-v1"),
        controller=controller,
        ledger_store=ledger_store,
    )

    assert run.status == "completed"
    assert run.completion_disposition == "dead_end"
    assert run.search_policy["mode"] == "reset_search"
    assert run.handoff_payload == {}
    decision = state_store.get_selection_decision(run.research_run_id)
    assert decision is not None
    assert decision.decision_kind == "dead_end"
    assert decision.metrics["recommended_search_policy"]["allowed_train_handoff"] is False
    assert "not executable by pattern_bounded_eval" in decision.rationale
