from __future__ import annotations

import logging

log = logging.getLogger("engine.scanner.jobs")


async def auto_evaluate_job() -> None:
    """Auto-evaluate pending ledger outcomes past their evaluation window."""
    from ledger.store import LedgerStore
    from patterns.library import PATTERN_LIBRARY

    store = LedgerStore()
    total_evaluated = 0
    for slug in PATTERN_LIBRARY:
        evaluated = store.auto_evaluate_pending(slug)
        total_evaluated += len(evaluated)

    if total_evaluated > 0:
        log.info("Auto-evaluate: %d outcomes evaluated across all patterns", total_evaluated)
