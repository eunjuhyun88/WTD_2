"""W-0379 — 6-Layer autoresearch orchestrator.

Single entry point for all ensemble strategies.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Literal, Optional

from engine.research.proposer.llm_proposer import LLMProposer
from engine.research.ratchet import Ratchet, CycleResult
from engine.research.validation.facade import (
    run_layer2_through_layer6,
    compute_dsr_holdout,
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


async def run_cycle(config: CycleConfig) -> CycleResult:
    """Run one full autoresearch cycle. Atomic — git or rollback."""
    ratchet = Ratchet(cycle_id=config.cycle_id, sandbox=config.sandbox)

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
            return ratchet.reject(reason="no-proposals")

        # L2-L6: Validate gates
        survived = run_layer2_through_layer6(
            proposals=proposals,
            rules_before=rules_before,
            cycle_id=config.cycle_id,
        )

        if not survived:
            return ratchet.reject(reason="all-gates-rejected")

        # Select best by DSR delta
        for proposal in survived:
            proposal.dsr_delta = proposal.expected_dsr_delta

        best = max(survived, key=lambda p: p.dsr_delta or 0.0)
        if (best.dsr_delta or 0.0) < 0.05:
            return ratchet.reject(reason="dsr-delta-too-small")

        # Atomic commit
        best.diff_summary = f"Filter/threshold optimization: {best.rationale}"
        ratchet.write_rules(best.rules_after.dict())
        commit_sha = ratchet.commit(diff_summary=best.diff_summary)

        return ratchet.success(
            best_proposal=best,
            commit_sha=commit_sha,
            candidates_after_l2=len(survived),
        )

    except asyncio.TimeoutError:
        return ratchet.reject(reason="timeout")
    except Exception as exc:
        return ratchet.error(exception=exc)


def _build_hint_context(cycle_id: int) -> str:
    """Build hint context from alpha_quality and worst filters.

    TODO: integrate with alpha_quality.aggregate().
    """
    return f"""Cycle {cycle_id} hint context:
- Last 30 days alpha quality metrics (placeholder)
- Top 5 worst-performing filters (placeholder)
- Explore threshold adjustments and filter combinations
"""
