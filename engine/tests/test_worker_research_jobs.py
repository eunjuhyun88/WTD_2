from __future__ import annotations

from datetime import datetime, timezone

from ledger.store import LedgerStore
from ledger.types import PatternOutcome
from research.state_store import ResearchStateStore
from worker.research_jobs import run_pattern_refinement_once, run_pattern_search_refinement_once


def _outcome(idx: int, *, outcome: str) -> PatternOutcome:
    return PatternOutcome(
        pattern_slug="tradoor-oi-reversal-v1",
        symbol=f"SYM{idx}USDT",
        accumulation_at=datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc),
        entry_price=100.0 + idx,
        outcome=outcome,  # type: ignore[arg-type]
        feature_snapshot={
            "price": 100.0 + idx,
            "ema20_slope": 0.1 * idx,
            "timestamp": datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc).isoformat(),
        },
    )


def test_run_pattern_refinement_once_derives_objective_and_records_run(tmp_path, monkeypatch) -> None:
    ledger = LedgerStore(tmp_path / "ledger_data")
    for idx in range(1, 8):
        ledger.save(_outcome(idx, outcome="success" if idx % 2 == 0 else "failure"))

    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    monkeypatch.setattr("worker.research_jobs.ResearchStateStore", lambda: state_store)
    def _derive(slug, state_store=None):
        return __import__(
            "research.objectives", fromlist=["derive_pattern_research_objective"]
        ).derive_pattern_research_objective(
            slug,
            ledger_store=ledger,
            state_store=state_store or __import__("research.state_store", fromlist=["ResearchStateStore"]).ResearchStateStore(tmp_path / "research_runtime.sqlite"),
        )

    monkeypatch.setattr("worker.research_jobs.derive_pattern_research_objective", _derive)
    monkeypatch.setattr("research.pattern_refinement.LedgerStore", lambda: ledger)
    monkeypatch.setattr(
        "worker.research_jobs.write_refinement_report",
        lambda run, objective, store: tmp_path / f"{run.research_run_id}.md",
    )

    payload = run_pattern_refinement_once("tradoor-oi-reversal-v1")

    assert payload["objective"]["objective_kind"] == "dataset_readiness"
    assert payload["objective"]["recommended_search_policy"]["policy"] == "readiness_accumulation"
    assert payload["research_run"]["completion_disposition"] == "no_op"
    assert payload["research_run"]["search_policy"]["policy"] == "readiness_accumulation"
    assert payload["research_run"]["search_policy"]["mode"] == "readiness-check"
    assert payload["report_path"].endswith(".md")
    assert payload["research_run"]["handoff_payload"]["report_path"].endswith(".md")


def test_run_pattern_search_refinement_once_bridges_search_baseline_into_refinement(tmp_path, monkeypatch) -> None:
    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    monkeypatch.setattr("worker.research_jobs.ResearchStateStore", lambda: state_store)

    def _fake_search(config, *, controller=None):
        controller = controller or __import__(
            "research.worker_control", fromlist=["ResearchWorkerController"]
        ).ResearchWorkerController(state_store)
        return controller.store.complete_run(
            controller.store.create_run(
                pattern_slug=config.pattern_slug,
                objective_id="benchmark-search:tradoor-oi-reversal-v1__ptb-tradoor-v1",
                baseline_ref="benchmark-pack:tradoor-oi-reversal-v1__ptb-tradoor-v1",
                search_policy={"mode": "benchmark-pack-search", "n_variants": 11},
                evaluation_protocol={"kind": "replay-benchmark"},
                created_at="2026-04-17T00:00:00+00:00",
            ).research_run_id,
            completed_at="2026-04-17T00:05:00+00:00",
            disposition="dead_end",
            winner_variant_ref="tradoor-oi-reversal-v1__arch-soft-real-loose",
            handoff_payload={
                "baseline_family_ref": "family:tradoor-oi-reversal-v1__reset-reclaim-compression",
                "active_family_key": "tradoor-oi-reversal-v1__reset-reclaim-compression",
            },
        )

    def _fake_search_payload(run, *, controller=None, artifact_store=None, negative_memory_store=None):
        return {
            "research_run": {"research_run_id": run.research_run_id},
            "selection_decision": {"decision_kind": "dead_end"},
        }

    class _Objective:
        objective_id = "obj-search-refine"

        recommended_search_policy = {"mode": "bounded-walk-forward-eval"}
        recommended_evaluation_protocol = {"n_splits": 4, "min_mean_auc": 0.55, "max_std_auc": 0.12}

        def to_dict(self):
            return {
                "objective_id": self.objective_id,
                "recommended_search_policy": self.recommended_search_policy,
                "recommended_evaluation_protocol": self.recommended_evaluation_protocol,
            }

    def _fake_refinement(config, *, controller=None, ledger_store=None, objective=None):
        assert config.baseline_ref == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"
        controller = controller or __import__(
            "research.worker_control", fromlist=["ResearchWorkerController"]
        ).ResearchWorkerController(state_store)
        run = controller.store.create_run(
            pattern_slug=config.pattern_slug,
            objective_id=config.objective_id or "obj-search-refine",
            baseline_ref=config.baseline_ref or "pattern-shadow:rule-first",
            search_policy={"mode": config.search_mode},
            evaluation_protocol={"n_splits": config.n_splits},
            created_at="2026-04-17T00:06:00+00:00",
        )
        return controller.store.complete_run(
            run.research_run_id,
            completed_at="2026-04-17T00:07:00+00:00",
            disposition="train_candidate",
            winner_variant_ref="pattern-model:tradoor-oi-reversal-v1:1h:breakout",
            handoff_payload={
                "baseline_ref": config.baseline_ref,
                "baseline_family_ref": config.baseline_ref,
            },
        )

    def _fake_train_handoff(research_run_id, *, store=None):
        store = store or state_store
        run = store.get_run(research_run_id)
        assert run is not None
        updated = store.update_handoff_payload(
            research_run_id,
            payload={
                "training_result": {
                    "model_key": "tradoor-oi-reversal-v1:1h:breakout",
                    "model_version": "2026-04-17T00-08-00Z",
                    "rollout_state": "shadow",
                    "auc": 0.67,
                    "n_records": 42,
                    "baseline_ref": run.baseline_ref,
                    "baseline_family_ref": run.handoff_payload.get("baseline_family_ref"),
                }
            },
            updated_at="2026-04-17T00:08:00+00:00",
        )
        return updated, {
            "model_key": "tradoor-oi-reversal-v1:1h:breakout",
            "model_version": "2026-04-17T00-08-00Z",
            "rollout_state": "shadow",
            "auc": 0.67,
            "n_records": 42,
        }

    monkeypatch.setattr("worker.research_jobs.run_pattern_benchmark_search", _fake_search)
    monkeypatch.setattr("worker.research_jobs.pattern_benchmark_search_payload", _fake_search_payload)
    monkeypatch.setattr("worker.research_jobs.derive_pattern_research_objective", lambda slug, state_store=None: _Objective())
    monkeypatch.setattr("worker.research_jobs.run_pattern_bounded_eval", _fake_refinement)
    monkeypatch.setattr("worker.research_jobs.execute_train_candidate_handoff", _fake_train_handoff)
    monkeypatch.setattr(
        "worker.research_jobs.write_refinement_report",
        lambda run, objective, store: tmp_path / f"{run.research_run_id}.md",
    )

    payload = run_pattern_search_refinement_once("tradoor-oi-reversal-v1")

    assert payload["search"]["selection_decision"]["decision_kind"] == "dead_end"
    assert payload["refinement"]["research_run"]["baseline_ref"] == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"
    assert payload["refinement"]["research_run"]["handoff_payload"]["baseline_family_ref"] == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"
    assert payload["refinement"]["research_run"]["handoff_payload"]["upstream_search_baseline_family_ref"] == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"
    assert payload["refinement"]["research_run"]["handoff_payload"]["upstream_search_winner_variant_ref"] == "tradoor-oi-reversal-v1__arch-soft-real-loose"
    assert payload["refinement"]["research_run"]["handoff_payload"]["training_result"]["baseline_family_ref"] == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"
    assert payload["training_handoff"]["model_key"] == "tradoor-oi-reversal-v1:1h:breakout"
    assert payload["report_path"].endswith(".md")
