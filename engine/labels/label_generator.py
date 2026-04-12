"""Build (input, output) training examples from a Pattern + market history.

Stage A.4 of the Cogochi LoRA pipeline. Inputs come from Track B (the
swarm) and the cached klines; outputs feed the dataset builder in A.5.

For each (Pattern, symbol) pair the generator produces:
  - **Positives**: snapshots where the pattern matched, labelled with the
    realised mean forward return at those bars and a confidence equal to
    the fraction of past matches that ended positive
  - **Negatives**: random non-matching snapshots, labelled NEUTRAL with
    zero expected return — teaches the LoRA that "no setup" is a valid
    answer instead of always firing LONG

Both halves are stratified by calendar year so the dataset isn't
dominated by whichever year had the most history (BTC's 2018-2024 range
would otherwise drown out a 2-year alt's signal).
"""
from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

from labels.verbalizer import verbalize_snapshot
from models.signal import Pattern


def format_label(
    matched: bool,
    expected_return: float,
    confidence: float,
    forward_bars: int = 10,
    reason: str = "",
) -> str:
    """Render the supervision string for one example.

    Output shape (parseable AND human-readable):

        Signal: LONG | Confidence: 0.67 | Expected 10h return: +0.50%
        Reason: bullish trend with non-overbought momentum

    The two-line form is consistent across all examples; downstream
    tooling can split on `\\n` and parse the first line as KV pairs.
    """
    if not matched:
        line = (
            f"Signal: NEUTRAL | Confidence: 0.00 | "
            f"Expected {forward_bars}h return: +0.00%"
        )
        if reason:
            line += f"\nReason: {reason}"
        return line

    direction = "LONG" if expected_return >= 0 else "SHORT"
    pct = expected_return * 100
    confidence = max(0.0, min(1.0, confidence))
    line = (
        f"Signal: {direction} | Confidence: {confidence:.2f} | "
        f"Expected {forward_bars}h return: {pct:+.2f}%"
    )
    if reason:
        line += f"\nReason: {reason}"
    return line


def _stratified_year_sample(
    candidate_index: pd.DatetimeIndex,
    n_target: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Sample row positions of `candidate_index` evenly across years.

    Returns an integer array of POSITIONS into candidate_index (not
    timestamps). If the candidate pool is smaller than n_target the
    whole pool is returned unshuffled.
    """
    if len(candidate_index) == 0 or n_target <= 0:
        return np.array([], dtype=np.int64)
    if len(candidate_index) <= n_target:
        return np.arange(len(candidate_index), dtype=np.int64)

    years = candidate_index.year.to_numpy()
    unique_years = np.unique(years)
    n_years = len(unique_years)
    per_year = max(1, n_target // n_years)

    chosen: list[int] = []
    for yr in unique_years:
        positions = np.flatnonzero(years == yr)
        take = min(per_year, len(positions))
        if take == 0:
            continue
        picked = rng.choice(positions, size=take, replace=False)
        chosen.extend(picked.tolist())

    # Top up to n_target with random leftovers if year buckets undershot.
    if len(chosen) < n_target:
        chosen_set = set(chosen)
        leftovers = np.array(
            [i for i in range(len(candidate_index)) if i not in chosen_set],
            dtype=np.int64,
        )
        if leftovers.size:
            extra = min(n_target - len(chosen), leftovers.size)
            picked = rng.choice(leftovers, size=extra, replace=False)
            chosen.extend(picked.tolist())

    chosen.sort()
    return np.array(chosen[:n_target], dtype=np.int64)


def generate_examples(
    pattern: Pattern,
    features_df: pd.DataFrame,
    forward_returns: pd.Series,
    forward_bars: int = 10,
    n_positive: int = 100,
    n_negative: int = 100,
    rng: Optional[np.random.Generator] = None,
) -> list[dict]:
    """Build {input, output} training examples for one (pattern, symbol).

    Args:
        pattern: a Track B pattern (typically a high-scoring champion)
        features_df: output of compute_features_table for ONE symbol,
            already truncated to bars where a forward return exists
        forward_returns: pd.Series aligned to features_df.index, where
            each value is close[t + forward_bars] / close[t] - 1
        forward_bars: just for the label string ("Expected 10h return")
        n_positive: target count of positive examples
        n_negative: target count of negative examples
        rng: numpy Generator (defaults to a fresh seeded one)

    Returns:
        A list of dicts, each:
            {"input": <verbalized snapshot>, "output": <signal line>,
             "matched": bool, "year": int}

    Raises:
        ValueError if features_df and forward_returns have different
        indices (the caller is expected to align them up front).
    """
    if rng is None:
        rng = np.random.default_rng()

    if not features_df.index.equals(forward_returns.index):
        raise ValueError("features_df.index and forward_returns.index must match")

    if features_df.empty:
        return []

    mask = pattern.matches_vectorized(features_df).to_numpy()

    positive_idx = features_df.index[mask]
    negative_idx = features_df.index[~mask]

    # Confidence for positives = fraction of historical matches that
    # ended positive on this symbol. Computed once over the full match
    # set so every positive example for this (pattern, symbol) carries
    # the same confidence — the LoRA learns the strength of the rule,
    # not per-bar noise.
    matched_returns = forward_returns.loc[positive_idx].to_numpy()
    if matched_returns.size > 0:
        positive_fraction = float(np.mean(matched_returns > 0))
        mean_match_return = float(np.mean(matched_returns))
    else:
        positive_fraction = 0.0
        mean_match_return = 0.0
    reason = pattern.signature() or pattern.name

    # ---- Positive examples ----
    positive_examples: list[dict] = []
    if positive_idx.size > 0 and n_positive > 0:
        pos_positions = _stratified_year_sample(positive_idx, n_positive, rng)
        for pos in pos_positions:
            ts = positive_idx[int(pos)]
            row = features_df.loc[ts]
            text_in = verbalize_snapshot(row)
            text_out = format_label(
                matched=True,
                expected_return=mean_match_return,
                confidence=positive_fraction,
                forward_bars=forward_bars,
                reason=reason,
            )
            positive_examples.append(
                {
                    "input": text_in,
                    "output": text_out,
                    "matched": True,
                    "year": int(ts.year),
                }
            )

    # ---- Negative examples ----
    negative_examples: list[dict] = []
    if negative_idx.size > 0 and n_negative > 0:
        neg_positions = _stratified_year_sample(negative_idx, n_negative, rng)
        for pos in neg_positions:
            ts = negative_idx[int(pos)]
            row = features_df.loc[ts]
            text_in = verbalize_snapshot(row)
            text_out = format_label(
                matched=False,
                expected_return=0.0,
                confidence=0.0,
                forward_bars=forward_bars,
                reason="no qualifying setup",
            )
            negative_examples.append(
                {
                    "input": text_in,
                    "output": text_out,
                    "matched": False,
                    "year": int(ts.year),
                }
            )

    return positive_examples + negative_examples
