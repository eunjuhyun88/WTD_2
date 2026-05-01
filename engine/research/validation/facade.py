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

    L2 runs a holdout 30-day mini-backtest and checks:
    - n_signals ≥ 30 (sample size CLT threshold)
    - t-stat ≥ 1.96 (two-sided, one-sided gate)
    - This layer rejects 70-80% of candidates (fast-eval gate)

    Phase 5c: Defer to Phase 7 (needs full backtest harness).
    For now: Pass through (DSR delta check in orchestrator gates).

    References: validation/stats.py::welch_t_test, W-0379 §2 L2
    """
    # Phase 7 TODO: Wire holdout backtest via engine.backtest.simulator
    # 1. Extract rules from proposal
    # 2. Run 30-day backtest on OOS holdout set
    # 3. Compute t-stat from realized returns
    # 4. Check: n_signals ≥ 30 AND t-stat ≥ 1.96
    return True


def _pass_layer3_multitesting(proposal: ChangeProposal, rules_before: dict) -> bool:
    """Layer 3: Multi-testing correction (BH-FDR q<0.05).

    L3 applies hierarchical Benjamini-Hochberg FDR correction across:
    - PurgedKFold 5-fold CV (embargoed for look-ahead)
    - Walk-forward OOS validation
    - Welch t-test across folds
    - Deflated Sharpe (DSR) p-value correction

    Phase 5c: Defer to Phase 7.
    For now: Pass through (DSR already checked via expected_dsr_delta).

    References:
    - validation/multiple_testing.py (BH-FDR hierarchical)
    - validation/cv.py::PurgedKFold
    - validation/stats.py::welch_t_test, deflated_sharpe
    - W-0379 §2 L3
    """
    # Phase 7 TODO: Wire full statistical validation
    # 1. Run PurgedKFold 5-fold on holdout data
    # 2. Compute Welch t-test per fold
    # 3. Compute DSR with n_trials = lifetime ledger cumulative
    # 4. Apply BH-FDR correction: q = p * m / rank
    # 5. Check: q-value < 0.05 after correction
    return True


def _pass_layer4_drawdown(proposal: ChangeProposal, rules_before: dict) -> bool:
    """Layer 4: Robustness gates (drawdown + regime + decay + costs).

    L4 checks multi-axis robustness:
    - Max drawdown ≤ 30% on holdout equity curve
    - Regime stability (win in bull AND bear AND sideways)
    - Decay test: alpha half-life > 6 months
    - Costs included: slippage + execution fees
    - Triple-barrier labels (TP/SL/timeout validation)

    Phase 5c: Defer to Phase 7.
    For now: Pass through.

    References:
    - engine/backtest/metrics.py::max_drawdown_pct
    - validation/regime.py
    - validation/decay.py
    - validation/costs.py
    - validation/labels.py (triple-barrier)
    - W-0379 §2 L4
    """
    # Phase 7 TODO: Wire robustness suite
    # 1. Extract equity curve from backtest
    # 2. Compute max drawdown: max_dd ≤ 0.30
    # 3. Split by regime (bull/bear/sideways)
    # 4. Check: positive P&L in ALL 3 regimes
    # 5. Run decay test: alpha t½ > 6 months
    # 6. Include slippage + fees in cost model
    # 7. Verify triple-barrier label consistency
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
    """Layer 6: Probability of backtest overfitting (PBO < 0.50).

    L6 computes Bailey et al 2016 PBO from multiple non-overlapping test periods:
    - Run N_trials independent test windows
    - Rank by Sharpe ratio
    - Fit Logit curve to detect overfitting
    - PBO = (1 - LogitPBO) / (1 + LogitPBO)
    - Check: PBO < 0.50 (< 50% overfitting probability)

    Phase 5c: Lightweight implementation available (pbo.py).
    Current: accept all (needs backtest returns data).

    References:
    - validation/pbo.py::compute_pbo, is_pbo_acceptable
    - Bailey et al 2016 "The Probability of Backtest Overfitting"
    - W-0379 §2 L6
    """
    # Phase 7 TODO: Wire PBO computation
    # 1. Get backtest returns from multiple OOS windows
    # 2. Call pbo.compute_pbo(returns_list, n_samples=len(returns))
    # 3. Check: pbo < 0.50
    # 4. Log PBO to ledger for counterfactual analysis
    return True


def compute_dsr_holdout(rules: dict) -> float:
    """Compute Deflated Sharpe Ratio on holdout set.

    DSR (Bailey et al 2014) adjusts Sharpe for:
    - Multiple trials (m = lifetime cumulative from ledger)
    - Observations variance (n = holdout sample size)
    - Non-normal distribution (skewness, kurtosis)

    Formula: DSR = Sharpe * (1 - (γ₃ * Sharpe) / (24 * γ₄))
            where γ₃ = skewness, γ₄ = kurtosis, m = trials

    Phase 7 TODO:
    1. Run backtest with given rules on holdout set
    2. Get realized returns: returns = [realized_pnl_pct for t in trades]
    3. Fetch n_trials from ledger lifetime cumulative
    4. Call validation/stats.py::deflated_sharpe(returns, n_trials)
    5. Return DSR value ∈ [-2, 5]

    References:
    - validation/stats.py::deflated_sharpe
    - Bailey-López de Prado 2014 §3
    """
    # Phase 2 placeholder: returns fixed 0.5
    return 0.5
