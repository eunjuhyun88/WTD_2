"""W-0379 — 6-Layer autoresearch orchestrator.

Single entry point for all ensemble strategies.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Literal, Optional

from research.discovery.proposer.llm_proposer import LLMProposer
from research.validation.ratchet import Ratchet, CycleResult
from research.validation.facade import (
    run_layer2_through_layer6,
    compute_dsr_holdout,
)
from research.artifacts.autoresearch_ledger_store import (
    AutoresearchLedgerStore,
    LedgerEntry,
)

EnsembleStrategy = Literal[
    "single",
    "parallel-vote",
    "rank-fusion",
    "moe-regime",
    "judge-arbitrate",
    "role-pipeline",
    "tournament",
    "self-refine",
    "debate",
    "moa",
]


@dataclass(frozen=True)
class CycleConfig:
    """Configuration for a single autoresearch cycle."""

    cycle_id: int
    strategy: EnsembleStrategy
    budget_seconds: int = 360
    cost_cap_usd: float = 0.50
    max_candidates: int = 100
    sandbox: bool = True
    debate_max_rounds: int = 2
    moa_n_layers: int = 2


async def run_cycle(config: CycleConfig, client=None) -> CycleResult:
    """Run one full autoresearch cycle. Atomic — git or rollback."""
    ratchet = Ratchet(cycle_id=config.cycle_id, sandbox=config.sandbox)
    ledger_store = AutoresearchLedgerStore(client=client)

    try:
        # Checkout cycle branch
        ratchet.checkout_cycle_branch()

        # Read baseline rules and DSR
        rules_before = ratchet.read_rules()
        dsr_before = compute_dsr_holdout(rules_before)

        # L1: Propose candidates
        proposer = LLMProposer()
        hint_context = _build_hint_context(config.cycle_id)
        proposals = await asyncio.wait_for(
            proposer.propose_all_tracks(rules_before, hint_context),
            timeout=config.budget_seconds,
        )

        if not proposals:
            result = ratchet.reject(reason="no-proposals")
            await _save_cycle_to_ledger(
                result, config, ledger_store, len(proposals) if proposals else 0, 0
            )
            return result

        # L2-L6: Validate gates
        survived = run_layer2_through_layer6(
            proposals=proposals,
            rules_before=rules_before,
            cycle_id=config.cycle_id,
        )

        if not survived:
            result = ratchet.reject(reason="all-gates-rejected")
            await _save_cycle_to_ledger(
                result, config, ledger_store, len(proposals), len(survived)
            )
            return result

        # Select best by DSR delta
        for proposal in survived:
            proposal.dsr_delta = proposal.expected_dsr_delta

        best = max(survived, key=lambda p: p.dsr_delta or 0.0)
        if (best.dsr_delta or 0.0) < 0.05:
            result = ratchet.reject(reason="dsr-delta-too-small")
            await _save_cycle_to_ledger(
                result, config, ledger_store, len(proposals), len(survived)
            )
            return result

        # Atomic commit
        best.diff_summary = f"Filter/threshold optimization: {best.rationale}"
        ratchet.write_rules(best.rules_after.dict())
        commit_sha = ratchet.commit(diff_summary=best.diff_summary)

        result = ratchet.success(
            best_proposal=best,
            commit_sha=commit_sha,
            candidates_after_l2=len(survived),
        )
        await _save_cycle_to_ledger(
            result,
            config,
            ledger_store,
            len(proposals),
            len(survived),
            best_proposal_ratio=best.proposer_track,
            rules_snapshot=best.rules_after.dict(),
            commit_sha=commit_sha,
        )
        return result

    except asyncio.TimeoutError:
        result = ratchet.reject(reason="timeout")
        await _save_cycle_to_ledger(result, config, ledger_store, 0, 0)
        return result
    except Exception as exc:
        result = ratchet.error(exception=exc)
        await _save_cycle_to_ledger(result, config, ledger_store, 0, 0)
        return result


async def _save_cycle_to_ledger(
    result: CycleResult,
    config: CycleConfig,
    ledger_store: AutoresearchLedgerStore,
    candidates_proposed: int,
    candidates_after_l2: int,
    best_proposal_ratio: str = None,
    rules_snapshot: dict = None,
    commit_sha: str = None,
) -> None:
    """Helper to persist cycle result to ledger."""
    entry = LedgerEntry(
        cycle_id=result.cycle_id,
        status=result.status,
        strategy=config.strategy,
        candidates_proposed=candidates_proposed,
        candidates_after_l2=candidates_after_l2,
        best_proposal_ratio=best_proposal_ratio,
        rejected_reason=result.reject_reason,
        dsr_delta=result.dsr_delta,
        latency_sec=result.latency_sec,
        cost_usd=result.cost_usd,
        budget_seconds=config.budget_seconds,
        commit_sha=commit_sha,
        rules_snapshot_json=rules_snapshot,
        sandbox_mode=config.sandbox,
    )
    await ledger_store.save_cycle_result(entry)


def _build_hint_context(cycle_id: int) -> str:
    """Build hint context from alpha_quality and worst filters.

    TODO: integrate with alpha_quality.aggregate().
    """
    return f"""Cycle {cycle_id} hint context:
- Last 30 days alpha quality metrics (placeholder)
- Top 5 worst-performing filters (placeholder)
- Explore threshold adjustments and filter combinations
"""
