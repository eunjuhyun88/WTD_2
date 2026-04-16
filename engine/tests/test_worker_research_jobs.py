from __future__ import annotations

from datetime import datetime, timezone

from ledger.store import LedgerStore
from ledger.types import PatternOutcome
from research.state_store import ResearchStateStore
from worker.research_jobs import run_pattern_refinement_once


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
