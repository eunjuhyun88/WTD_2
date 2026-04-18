"""Flywheel axis 4 — data-driven refinement trigger (Phase D).

Daily job that checks each pattern's verdict accumulation and fires
pattern_refinement only when two gates clear:
  1. verdict_count_since_last_run >= MIN_VERDICTS_SINCE_LAST_RUN  (default 10)
  2. days_since_last_training_run  >= MIN_DAYS_SINCE_LAST_RUN     (default 7)

Pure function `check_refinement_gates()` is injectable for unit tests.
Async `refinement_trigger_job()` is the scheduler entry point.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime

from ledger.store import LEDGER_RECORD_STORE, LedgerRecordStore
from patterns.library import PATTERN_LIBRARY
from scanner.jobs.pattern_refinement import pattern_refinement_job

log = logging.getLogger("engine.scanner.jobs.refinement_trigger")

MIN_VERDICTS_SINCE_LAST_RUN: int = int(os.environ.get("REFINEMENT_MIN_VERDICTS", "10"))
MIN_DAYS_SINCE_LAST_RUN: float = float(os.environ.get("REFINEMENT_MIN_DAYS", "7.0"))


def check_refinement_gates(
    *,
    now: datetime | None = None,
    ledger_store: LedgerRecordStore | None = None,
    pattern_slugs: list[str] | None = None,
    min_verdicts: int = MIN_VERDICTS_SINCE_LAST_RUN,
    min_days: float = MIN_DAYS_SINCE_LAST_RUN,
) -> list[str]:
    """Return pattern slugs whose refinement gates have cleared.

    Gate 1: days elapsed since last training_run >= min_days
            (if no prior run, this gate always passes)
    Gate 2: verdict records created AFTER the last training_run >= min_verdicts
    """
    _now = now or datetime.now()
    store = ledger_store or LEDGER_RECORD_STORE
    slugs = pattern_slugs or list(PATTERN_LIBRARY.keys())
    eligible: list[str] = []

    for slug in slugs:
        training_runs = store.list(slug, record_type="training_run")
        last_run = training_runs[0] if training_runs else None  # newest-first

        if last_run is not None:
            days_since = (_now - last_run.created_at).total_seconds() / 86400
            if days_since < min_days:
                log.debug(
                    "Refinement gate 1 blocked: slug=%s days_since=%.1f < %.1f",
                    slug, days_since, min_days,
                )
                continue
            verdict_cutoff = last_run.created_at
        else:
            verdict_cutoff = datetime.min

        verdicts = store.list(slug, record_type="verdict")
        new_verdicts = [v for v in verdicts if v.created_at > verdict_cutoff]

        if len(new_verdicts) < min_verdicts:
            log.debug(
                "Refinement gate 2 blocked: slug=%s new_verdicts=%d < %d",
                slug, len(new_verdicts), min_verdicts,
            )
            continue

        log.info(
            "Refinement gates cleared: slug=%s new_verdicts=%d last_run=%s",
            slug, len(new_verdicts),
            last_run.created_at.isoformat() if last_run else "never",
        )
        eligible.append(slug)

    return eligible


async def refinement_trigger_job(
    *,
    now: datetime | None = None,
    ledger_store: LedgerRecordStore | None = None,
) -> list[str]:
    """Daily scheduler entry point for data-driven pattern refinement.

    Checks gates for all patterns; fires pattern_refinement_job with
    auto_train_candidate=True for any that clear.

    Returns the list of slugs that were triggered (empty if none).
    """
    eligible = check_refinement_gates(now=now, ledger_store=ledger_store)
    if not eligible:
        log.info("Refinement trigger: no patterns cleared the gate (verdicts or recency)")
        return []

    log.info(
        "Refinement trigger: %d pattern(s) eligible → firing refinement: %s",
        len(eligible), eligible,
    )
    await pattern_refinement_job(pattern_slugs=eligible, auto_train_candidate=True)
    return eligible
