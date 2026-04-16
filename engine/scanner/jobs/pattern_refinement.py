from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from patterns.library import PATTERN_LIBRARY
from research.state_store import ResearchStateStore
from research.train_handoff import execute_train_candidate_handoff
from worker.research_jobs import run_pattern_refinement_once

log = logging.getLogger("engine.scanner.jobs.pattern_refinement")


async def pattern_refinement_job(
    *,
    pattern_slugs: list[str] | None = None,
    auto_train_candidate: bool = False,
    dead_end_pause_threshold: int = 3,
    cooldown_hours: int = 24,
) -> None:
    """Run one bounded refinement cycle per pattern inside worker-control."""
    slugs = pattern_slugs or list(PATTERN_LIBRARY.keys())
    store = ResearchStateStore()
    completed = 0
    train_candidates = 0
    handoffs = 0

    for slug in slugs:
        control_state = store.get_pattern_control_state(slug)
        if not control_state.enabled or control_state.paused_by_policy or control_state.paused_by_operator:
            log.info(
                "Pattern refinement skipped by control state: slug=%s enabled=%s paused_by_policy=%s paused_by_operator=%s",
                slug,
                control_state.enabled,
                control_state.paused_by_policy,
                control_state.paused_by_operator,
            )
            continue
        if _is_cooldown_active(control_state.cooldown_until):
            log.info(
                "Pattern refinement skipped by cooldown: slug=%s cooldown_until=%s",
                slug,
                control_state.cooldown_until,
            )
            continue

        payload = run_pattern_refinement_once(slug, state_store=store)
        completed += 1
        research_run = payload["research_run"]
        _apply_policy_pause_if_needed(
            slug,
            store=store,
            dead_end_pause_threshold=dead_end_pause_threshold,
        )
        if research_run["completion_disposition"] == "train_candidate":
            train_candidates += 1
            control_state = store.get_pattern_control_state(slug)
            if auto_train_candidate and control_state.auto_train_allowed and not control_state.approval_required:
                run_id = research_run["research_run_id"]
                _updated_run, result = execute_train_candidate_handoff(run_id, store=store)
                handoffs += 1
                store.upsert_pattern_control_state(
                    slug,
                    updated_at=_utcnow_iso(),
                    cooldown_until=(datetime.now(timezone.utc) + timedelta(hours=cooldown_hours)).isoformat(),
                    pause_reason=None,
                )
                log.info(
                    "Pattern refinement handoff completed: slug=%s run_id=%s model_key=%s model_version=%s",
                    slug,
                    run_id,
                    result["model_key"],
                    result["model_version"],
                )
            else:
                log.info(
                    "Pattern train-candidate held by control plane: slug=%s auto_train_allowed=%s approval_required=%s",
                    slug,
                    control_state.auto_train_allowed,
                    control_state.approval_required,
                )

    log.info(
        "Pattern refinement job complete: patterns=%d train_candidates=%d handoffs=%d",
        completed,
        train_candidates,
        handoffs,
    )


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_cooldown_active(cooldown_until: str | None) -> bool:
    if not cooldown_until:
        return False
    try:
        return datetime.fromisoformat(cooldown_until) > datetime.now(timezone.utc)
    except ValueError:
        return False


def _apply_policy_pause_if_needed(
    pattern_slug: str,
    *,
    store: ResearchStateStore,
    dead_end_pause_threshold: int,
) -> None:
    recent_runs = store.list_runs(pattern_slug=pattern_slug, limit=dead_end_pause_threshold)
    if len(recent_runs) < dead_end_pause_threshold:
        return
    if all(run.completion_disposition == "dead_end" for run in recent_runs):
        store.upsert_pattern_control_state(
            pattern_slug,
            updated_at=_utcnow_iso(),
            paused_by_policy=True,
            pause_reason=f"recent_dead_end_threshold:{dead_end_pause_threshold}",
        )
