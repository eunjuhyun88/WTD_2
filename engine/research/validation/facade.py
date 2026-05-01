"""Validation facade — 6-layer gate orchestration."""
from __future__ import annotations

from typing import Optional

from engine.research.proposer.schemas import ChangeProposal


def run_layer2_through_layer6(
    proposals: list[ChangeProposal],
    rules_before: dict,
    cycle_id: int,
) -> list[ChangeProposal]:
    """Run 6-layer validation gate on all proposals.

    Returns only proposals that pass all 6 layers.
    Each layer is fail-fast: one rejection = discard proposal.
    """
    # Placeholder implementation for Phase 2
    # Layer 2: Statistical significance (n≥30, t≥1.96)
    # Layer 3: Multi-testing correction (BH-FDR q<0.05)
    # Layer 4: Drawdown tolerance (max_dd ≤ 0.30)
    # Layer 5: Gamma/Options GEX regime filter
    # Layer 6: Probability of backtest overfitting (PBO < 0.5)

    survived = []
    for proposal in proposals:
        if _pass_all_layers(proposal, rules_before, cycle_id):
            survived.append(proposal)

    return survived


def _pass_all_layers(
    proposal: ChangeProposal,
    rules_before: dict,
    cycle_id: int,
) -> bool:
    """Check if proposal passes all 6 validation layers."""
    # Placeholder: accept all for now
    # Real implementation validates against thresholds in active.yaml
    return True


def compute_dsr_holdout(rules: dict) -> float:
    """Compute DSR on holdout set with given rules.

    Returns Deflated Sharpe Ratio per Bailey et al 2014.
    Placeholder: returns 0.5 for Phase 2.
    """
    # TODO Phase 5: implement holdout backtest
    return 0.5
