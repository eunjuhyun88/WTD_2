from __future__ import annotations

from datetime import datetime, timezone

import pytest

from ledger.store import LedgerStore
from ledger.types import PatternOutcome
from research.pattern_refinement import PatternBoundedEvalConfig, run_pattern_bounded_eval
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
            objective_id="obj-test-train",
            n_splits=4,
            min_mean_auc=0.60,
            max_std_auc=0.10,
        ),
        controller=controller,
        ledger_store=ledger_store,
    )

    assert run.status == "completed"
    assert run.completion_disposition == "train_candidate"
    assert run.definition_ref["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert run.handoff_payload["definition_ref"]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert run.handoff_payload["model_key"].startswith("tradoor-oi-reversal-v1:1h:breakout")
    assert run.handoff_payload["mean_auc"] == pytest.approx(0.68)
    decision = state_store.get_selection_decision(run.research_run_id)
    assert decision is not None
    assert decision.decision_kind == "train_candidate"
    assert decision.metrics["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"


def test_pattern_bounded_eval_uses_latest_promoted_family_baseline(tmp_path, monkeypatch) -> None:
    ledger_store = LedgerStore(tmp_path / "ledger_data")
    for idx in range(1, 25):
        ledger_store.save(_outcome(idx, outcome="success" if idx % 3 == 0 else "failure"))

    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    benchmark_run = state_store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="benchmark-search:tradoor-oi-reversal-v1__ptb-tradoor-v1",
        baseline_ref="benchmark-pack:tradoor-oi-reversal-v1__ptb-tradoor-v1",
        search_policy={"mode": "benchmark-pack-search", "n_variants": 11},
        evaluation_protocol={"kind": "replay-benchmark"},
        created_at="2026-04-16T20:00:00+00:00",
        definition_ref={"definition_id": "tradoor-oi-reversal-v1:v1", "pattern_slug": "tradoor-oi-reversal-v1"},
    )
    state_store.complete_run(
        benchmark_run.research_run_id,
        completed_at="2026-04-16T20:05:00+00:00",
        disposition="dead_end",
        winner_variant_ref="tradoor-oi-reversal-v1__arch-soft-real-loose",
        handoff_payload={
            "baseline_family_ref": "family:tradoor-oi-reversal-v1__reset-reclaim-compression",
            "active_family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
        },
    )
    controller = ResearchWorkerController(state_store)

    def _fake_eval(X, y, n_splits):
        assert len(X) == 24
        assert len(y) == 24
        return {
            "n_samples": 24,
            "n_splits": n_splits,
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
            objective_id="obj-test-family-baseline",
            n_splits=4,
            min_mean_auc=0.60,
            max_std_auc=0.10,
        ),
        controller=controller,
        ledger_store=ledger_store,
    )

    assert run.baseline_ref == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"
    assert run.definition_ref["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert run.handoff_payload["baseline_ref"] == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"
    assert run.handoff_payload["baseline_family_ref"] == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"
    decision = state_store.get_selection_decision(run.research_run_id)
    assert decision is not None
    assert decision.baseline_ref == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"


def test_pattern_bounded_eval_prefers_promoted_family_ref_over_legacy_baseline(
    tmp_path, monkeypatch
) -> None:
    """A gate-cleared promotion must override an older legacy baseline_family_ref.

    This closes the core-loop 'Promotion' hop: when a benchmark search clears
    the PromotionReport gate, the downstream refinement baseline should follow
    the promoted family, not a stale legacy baseline from earlier runs.
    """
    ledger_store = LedgerStore(tmp_path / "ledger_data")
    for idx in range(1, 25):
        ledger_store.save(_outcome(idx, outcome="success" if idx % 3 == 0 else "failure"))

    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")

    # older run: legacy baseline_family_ref only (no promotion)
    legacy_run = state_store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="benchmark-search:tradoor-oi-reversal-v1__ptb-tradoor-v1",
        baseline_ref="benchmark-pack:legacy",
        search_policy={"mode": "benchmark-pack-search", "n_variants": 11},
        evaluation_protocol={"kind": "replay-benchmark"},
        created_at="2026-04-15T20:00:00+00:00",
    )
    state_store.complete_run(
        legacy_run.research_run_id,
        completed_at="2026-04-15T20:05:00+00:00",
        disposition="dead_end",
        winner_variant_ref="tradoor-oi-reversal-v1__legacy",
        handoff_payload={
            "baseline_family_ref": "family:tradoor-oi-reversal-v1__legacy",
            "active_family_key": "tradoor-oi-reversal-v1__legacy",
        },
    )

    # newer run: promotion gate cleared, carries promoted_family_ref
    promoted_run = state_store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="benchmark-search:tradoor-oi-reversal-v1__ptb-tradoor-v1",
        baseline_ref="benchmark-pack:promoted",
        search_policy={"mode": "benchmark-pack-search", "n_variants": 11},
        evaluation_protocol={"kind": "replay-benchmark"},
        created_at="2026-04-16T20:00:00+00:00",
    )
    state_store.complete_run(
        promoted_run.research_run_id,
        completed_at="2026-04-16T20:05:00+00:00",
        disposition="no_op",
        winner_variant_ref="tradoor-oi-reversal-v1__promoted-winner",
        handoff_payload={
            "baseline_family_ref": "family:tradoor-oi-reversal-v1__stale-family",
            "promotion_decision": "promote_candidate",
            "promoted_variant_slug": "tradoor-oi-reversal-v1__promoted-winner",
            "promoted_family_ref": "family:tradoor-oi-reversal-v1__promoted-family",
            "active_family_key": "tradoor-oi-reversal-v1__promoted-family",
        },
    )
    controller = ResearchWorkerController(state_store)

    def _fake_eval(X, y, n_splits):
        return {
            "n_samples": 24,
            "n_splits": n_splits,
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
            objective_id="obj-test-promoted-baseline",
            n_splits=4,
            min_mean_auc=0.60,
            max_std_auc=0.10,
        ),
        controller=controller,
        ledger_store=ledger_store,
    )

    # promoted_family_ref must win over both the legacy run's baseline_family_ref
    # and the newer run's stale legacy baseline_family_ref
    assert run.baseline_ref == "family:tradoor-oi-reversal-v1__promoted-family"
    assert run.definition_ref["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert run.handoff_payload["baseline_ref"] == "family:tradoor-oi-reversal-v1__promoted-family"


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
    notes = state_store.list_memory_notes(research_run_id=run.research_run_id)
    assert len(notes) == 1
    assert notes[0].note_kind == "assumption_update"
