"""Worker-control orchestration helpers for refinement methodology runs."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable

from research.artifacts.state_store import (
    ResearchDisposition,
    ResearchMemoryKind,
    ResearchRun,
    ResearchStateStore,
    SelectionDecisionKind,
)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class ResearchJobSpec:
    pattern_slug: str
    objective_id: str
    baseline_ref: str
    search_policy: dict
    evaluation_protocol: dict
    definition_ref: dict = field(default_factory=dict)


@dataclass(frozen=True)
class SelectionDecisionInput:
    decision_kind: SelectionDecisionKind
    rationale: str
    baseline_ref: str
    selected_variant_ref: str | None = None
    metrics: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ResearchMemoryInput:
    note_kind: ResearchMemoryKind
    summary: str
    detail: str | None = None
    tags: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ResearchJobResult:
    disposition: ResearchDisposition
    winner_variant_ref: str | None = None
    handoff_payload: dict = field(default_factory=dict)
    selection_decision: SelectionDecisionInput | None = None
    memory_notes: list[ResearchMemoryInput] = field(default_factory=list)


ResearchJobExecutor = Callable[[ResearchRun], ResearchJobResult]


class ResearchWorkerController:
    """Runs one bounded methodology job and durably records its lifecycle."""

    def __init__(self, store: ResearchStateStore | None = None):
        self.store = store or ResearchStateStore()

    def run_bounded_job(
        self,
        spec: ResearchJobSpec,
        *,
        execute: ResearchJobExecutor,
        now: Callable[[], str] = _utcnow_iso,
    ) -> ResearchRun:
        created_at = now()
        run = self.store.create_run(
            pattern_slug=spec.pattern_slug,
            objective_id=spec.objective_id,
            baseline_ref=spec.baseline_ref,
            search_policy=spec.search_policy,
            evaluation_protocol=spec.evaluation_protocol,
            created_at=created_at,
            definition_ref=spec.definition_ref,
        )
        started = self.store.start_run(run.research_run_id, started_at=now())

        try:
            result = execute(started)
        except Exception as exc:
            self.store.fail_run(started.research_run_id, completed_at=now(), error=str(exc))
            raise

        decided_at = now()
        if result.selection_decision is not None:
            self.store.record_selection_decision(
                research_run_id=started.research_run_id,
                selected_variant_ref=result.selection_decision.selected_variant_ref,
                decision_kind=result.selection_decision.decision_kind,
                rationale=result.selection_decision.rationale,
                baseline_ref=result.selection_decision.baseline_ref,
                metrics=result.selection_decision.metrics,
                decided_at=decided_at,
            )

        for note in result.memory_notes:
            self.store.append_memory_note(
                research_run_id=started.research_run_id,
                pattern_slug=spec.pattern_slug,
                note_kind=note.note_kind,
                summary=note.summary,
                detail=note.detail,
                tags=note.tags,
                created_at=decided_at,
            )

        return self.store.complete_run(
            started.research_run_id,
            completed_at=now(),
            disposition=result.disposition,
            winner_variant_ref=result.winner_variant_ref,
            handoff_payload=result.handoff_payload,
        )
