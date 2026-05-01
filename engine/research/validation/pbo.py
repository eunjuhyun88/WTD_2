"""Probability of Backtest Overfitting (PBO) — Bailey et al 2016.

Estimates the probability that a backtest result is due to luck rather than
skill. Uses the Logit curve:

    PBO = (1 - LogitPBO) / (1 + LogitPBO)

where LogitPBO = (m* - m) / (1.96 × sqrt(m × (1 - m) / n))

    m = fraction of non-overlapping sub-period trials out-of-sample rank ≤ median
    m* = best rank position (optimistic bias)
    n = number of independent trials

References:
    Bailey, D. H., Borwein, J. M., Lopez de Prado, M., & ZLiberman, J. (2016).
    "The Probability of Backtest Overfitting."
    SSRN Electronic Journal.
"""
from __future__ import annotations

import numpy as np
from typing import Optional


def compute_pbo(
    returns_list: list[np.ndarray],
    n_samples: int = 100,
) -> float:
    """Compute PBO from in-sample and out-of-sample return sets.

    Args:
        returns_list: List of return arrays (each row is a trial, each column a sample)
        n_samples: Number of independent samples

    Returns:
        PBO score in [0, 1]. High PBO = likely overfitted, low PBO = robust.

    Raises:
        ValueError: if inputs invalid
    """
    if not returns_list or len(returns_list) < 2:
        raise ValueError("Need at least 2 return sets (in-sample, out-of-sample)")

    if n_samples < 2:
        raise ValueError("Need at least 2 samples")

    # Compute Sharpe for each trial
    sharpes = []
    for returns in returns_list:
        if len(returns) < 2:
            continue
        mean_ret = np.mean(returns)
        std_ret = np.std(returns, ddof=1)
        if std_ret > 1e-8:
            sharpe = (mean_ret * np.sqrt(252)) / std_ret
            sharpes.append(sharpe)
        else:
            sharpes.append(0.0)

    if len(sharpes) < 2:
        return 0.5  # Default to neutral if can't compute

    sharpes = np.array(sharpes)

    # Rank all trials
    ranks = np.argsort(np.argsort(-sharpes)) + 1  # Descending order, 1-indexed

    # Fraction of trials with rank ≤ median
    median_rank = (len(sharpes) + 1) / 2
    m = np.sum(ranks <= median_rank) / len(sharpes)

    # Best rank position (most optimistic)
    m_star = 1.0 / len(sharpes)

    # Logit curve
    if m >= 1.0 or m <= 0.0:
        return 0.5

    logit_numerator = m_star - m
    logit_denominator = 1.96 * np.sqrt(m * (1.0 - m) / n_samples)

    if logit_denominator < 1e-8:
        return 0.5

    logit_pbo = logit_numerator / logit_denominator

    # Inverse logit to get PBO
    try:
        pbo = (1.0 - logit_pbo) / (1.0 + logit_pbo)
        return float(np.clip(pbo, 0.0, 1.0))
    except (OverflowError, ZeroDivisionError):
        return 0.5


def is_pbo_acceptable(pbo: float, threshold: float = 0.5) -> bool:
    """Check if PBO is below threshold (non-overfitted).

    Args:
        pbo: PBO score (0-1)
        threshold: Maximum acceptable PBO (default 0.5 = 50% overfitting risk)

    Returns:
        True if PBO < threshold (acceptable), False otherwise.
    """
    return pbo < threshold


def pbo_filter_proposal(
    proposal,
    returns_list: list[np.ndarray],
    pbo_threshold: float = 0.50,
) -> tuple[bool, float]:
    """Layer 6 gate: reject proposal if PBO indicates significant overfitting.

    Args:
        proposal: ChangeProposal object
        returns_list: List of return arrays from multiple test periods
        pbo_threshold: Maximum acceptable PBO (default 0.50)

    Returns:
        (accepted: bool, pbo_score: float)
    """
    try:
        pbo = compute_pbo(returns_list, n_samples=len(returns_list[0]))
        accepted = is_pbo_acceptable(pbo, pbo_threshold)
        return (accepted, pbo)
    except Exception:
        # On error, accept conservatively
        return (True, 0.5)
