"""OOS time-split for pattern scan (W-0341).

Splits a time-indexed DataFrame into train (first 70%) and holdout (last 30%)
to prevent in-sample evaluation bias (Bailey & López de Prado 2014).
"""
from __future__ import annotations

import pandas as pd


def train_holdout_split(
    df: pd.DataFrame,
    holdout_frac: float = 0.30,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split time-indexed DataFrame into train and holdout by row count.

    Args:
        df: DataFrame indexed by timestamp (chronologically sorted).
        holdout_frac: Fraction of rows reserved as holdout (last N%).

    Returns:
        (train_df, holdout_df) — train is first (1-holdout_frac), holdout is last.
    """
    if not 0 < holdout_frac < 1:
        raise ValueError(f"holdout_frac must be in (0, 1), got {holdout_frac}")
    n = len(df)
    if n == 0:
        return df.iloc[:0].copy(), df.iloc[:0].copy()
    split = max(1, int(n * (1 - holdout_frac)))
    return df.iloc[:split].copy(), df.iloc[split:].copy()


def holdout_cutoff(df: pd.DataFrame, holdout_frac: float = 0.30) -> "pd.Timestamp | None":
    """Return the first timestamp of the holdout period, or None if df is empty."""
    _, holdout = train_holdout_split(df, holdout_frac)
    if holdout.empty:
        return None
    return holdout.index[0]
