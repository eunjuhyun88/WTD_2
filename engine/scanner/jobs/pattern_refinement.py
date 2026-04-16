from __future__ import annotations

import logging

from patterns.library import PATTERN_LIBRARY
from research.train_handoff import execute_train_candidate_handoff
from worker.research_jobs import run_pattern_refinement_once

log = logging.getLogger("engine.scanner.jobs.pattern_refinement")


async def pattern_refinement_job(
    *,
    pattern_slugs: list[str] | None = None,
    auto_train_candidate: bool = False,
) -> None:
    """Run one bounded refinement cycle per pattern inside worker-control."""
    slugs = pattern_slugs or list(PATTERN_LIBRARY.keys())
    completed = 0
    train_candidates = 0
    handoffs = 0

    for slug in slugs:
        payload = run_pattern_refinement_once(slug)
        completed += 1
        research_run = payload["research_run"]
        if research_run["completion_disposition"] == "train_candidate":
            train_candidates += 1
            if auto_train_candidate:
                run_id = research_run["research_run_id"]
                _updated_run, result = execute_train_candidate_handoff(run_id)
                handoffs += 1
                log.info(
                    "Pattern refinement handoff completed: slug=%s run_id=%s model_key=%s model_version=%s",
                    slug,
                    run_id,
                    result["model_key"],
                    result["model_version"],
                )

    log.info(
        "Pattern refinement job complete: patterns=%d train_candidates=%d handoffs=%d",
        completed,
        train_candidates,
        handoffs,
    )
