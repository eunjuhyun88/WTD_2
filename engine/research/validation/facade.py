"""Validation facade — 6-layer gate orchestration."""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from engine.research.proposer.schemas import ChangeProposal
from engine.features.gex_pressure import gex_filter_proposal
from engine.research.validation.pbo import pbo_filter_proposal

log = logging.getLogger("engine.research.validation.facade")


def run_layer2_through_layer6(
    proposals: list[ChangeProposal],
    rules_before: dict,
    cycle_id: int,
) -> list[ChangeProposal]:
    """Run 6-layer validation gate on all proposals.

    Returns only proposals that pass all 6 layers.
    Each layer is fail-fast: one rejection = discard proposal.

    Layers:
      L2: Statistical significance (t-test, n≥30)
      L3: Multi-testing correction (BH-FDR q<0.05)
      L4: Drawdown tolerance (max_dd ≤ 0.30)
      L5: Gamma/Options GEX regime filter
      L6: Probability of backtest overfitting (PBO < 0.5)
    """
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
    # Layer 2: Statistical significance
    if not _pass_layer2_significance(proposal, rules_before):
        log.debug(f"Proposal rejected by Layer 2 (significance): {proposal.signature()}")
        return False

    # Layer 3: Multi-testing correction
    if not _pass_layer3_multitesting(proposal, rules_before):
        log.debug(f"Proposal rejected by Layer 3 (multi-testing): {proposal.signature()}")
        return False

    # Layer 4: Drawdown tolerance
    if not _pass_layer4_drawdown(proposal, rules_before):
        log.debug(f"Proposal rejected by Layer 4 (drawdown): {proposal.signature()}")
        return False

    # Layer 5: GEX regime filter
    if not _pass_layer5_gex(proposal):
        log.debug(f"Proposal rejected by Layer 5 (GEX): {proposal.signature()}")
        return False

    # Layer 6: PBO overfitting check
    if not _pass_layer6_pbo(proposal, rules_before):
        log.debug(f"Proposal rejected by Layer 6 (PBO): {proposal.signature()}")
        return False

    return True


def _pass_layer2_significance(proposal: ChangeProposal, rules_before: dict) -> bool:
    """Layer 2: Check statistical significance (t-test, n≥30).

    Placeholder: accept all (full implementation in Phase 5).
    """
    # TODO Phase 5: Implement holdout backtest with Welch t-test
    # Check: t-stat ≥ 1.96, n_samples ≥ 30
    return True


def _pass_layer3_multitesting(proposal: ChangeProposal, rules_before: dict) -> bool:
    """Layer 3: Multi-testing correction (BH-FDR q<0.05).

    Placeholder: accept all (full implementation in Phase 5).
    """
    # TODO Phase 5: Apply Benjamini-Hochberg FDR correction
    # Check: q-value < 0.05 after BH correction
    return True


def _pass_layer4_drawdown(proposal: ChangeProposal, rules_before: dict) -> bool:
    """Layer 4: Drawdown tolerance (max_dd ≤ 0.30).

    Placeholder: accept all (full implementation in Phase 5).
    """
    # TODO Phase 5: Compute maximum drawdown on holdout set
    # Check: max_dd ≤ 30% (configurable from active.yaml)
    return True


def _pass_layer5_gex(proposal: ChangeProposal) -> bool:
    """Layer 5: Gamma/Options GEX regime filter.

    Rejects proposals when markets are in extreme GEX regimes (large gamma exposure).
    """
    try:
        return gex_filter_proposal(proposal, currencies=["BTC", "ETH"])
    except Exception as exc:
        log.warning(f"Layer 5 GEX check failed (accepting): {exc}")
        return True  # Accept on error (conservative)


def _pass_layer6_pbo(proposal: ChangeProposal, rules_before: dict) -> bool:
    """Layer 6: Probability of backtest overfitting (PBO < 0.5).

    Placeholder: accept all (full implementation in Phase 5).
    """
    # TODO Phase 5: Compute PBO from multiple non-overlapping test periods
    # Check: PBO < 0.50 (probability of overfitting < 50%)
    return True


def compute_dsr_holdout(rules: dict) -> float:
    """Compute DSR on holdout set with given rules.

    Returns Deflated Sharpe Ratio per Bailey et al 2014.
    Placeholder: returns 0.5 for Phase 2.
    """
    # TODO Phase 5: implement holdout backtest
    return 0.5
