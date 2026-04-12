"""Generate binary classification labels from forward price action.

Two labelling schemes are provided:

  make_labels()           — simple forward-return binary (fast, noisy)
  make_triple_barrier()   — triple-barrier method (cleaner signal, fewer labels)

Triple-barrier rationale:
    The simple scheme labels every bar, including ambiguous "drift" bars where
    price neither clearly rose nor fell in the horizon. Triple-barrier instead
    asks "does price hit the target first, or the stop first?" Bars where
    neither barrier is reached (timeout) are dropped as uninformative — this
    reduces label noise at the cost of fewer training samples (~30-50% fewer).

Both return (valid_index, y) so callers can do:
    features_df.loc[valid_index]  →  exact feature matrix matching y.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


# ─── Simple binary label ──────────────────────────────────────────────────────

def make_labels(
    klines: pd.DataFrame,
    features_index: pd.DatetimeIndex,
    *,
    horizon_bars: int = 12,
    win_threshold: float = 0.0,
    direction: str = "long",
) -> tuple[pd.DatetimeIndex, np.ndarray]:
    """Build simple binary labels from forward close-to-close return.

    y[T] = 1  if direction=="long"  and  close[T+H]/close[T]-1 > threshold
    y[T] = 1  if direction=="short" and  close[T+H]/close[T]-1 < -threshold
    y[T] = 0  otherwise

    The last `horizon_bars` rows are dropped (no future close available).

    Args:
        klines: OHLCV DataFrame with 'close', UTC DatetimeIndex.
        features_index: index of compute_features_table() output.
        horizon_bars: bars forward to measure return (12 = 12h on 1h bars).
        win_threshold: minimum absolute return fraction to label as 1.
        direction: "long" or "short".

    Returns:
        (valid_index, y): int8 ndarray (0/1) aligned to valid_index.
    """
    if direction not in ("long", "short"):
        raise ValueError(f"direction must be 'long' or 'short', got {direction!r}")
    if horizon_bars < 1:
        raise ValueError(f"horizon_bars must be >= 1, got {horizon_bars}")

    close = klines["close"].astype(float).reindex(features_index)
    ret = (close.shift(-horizon_bars) - close) / close.replace(0, np.nan)

    raw = (ret > win_threshold if direction == "long" else ret < -win_threshold).astype("Int8")
    valid = raw.dropna()
    return pd.DatetimeIndex(valid.index), valid.to_numpy(dtype=np.int8)


# ─── Triple-barrier label ────────────────────────────────────────────────────

def make_triple_barrier(
    klines: pd.DataFrame,
    features_index: pd.DatetimeIndex,
    *,
    horizon_bars: int = 24,
    target_pct: float = 0.02,
    stop_pct: float = 0.01,
    direction: str = "long",
    drop_timeout: bool = True,
) -> tuple[pd.DatetimeIndex, np.ndarray]:
    """Triple-barrier labels: target first → 1, stop first → 0, timeout → drop.

    For each bar T, entry price = close[T]. Then for bars T+1 … T+H:
      - If high[t] >= entry * (1+target_pct)  →  y[T] = 1  (target hit)
      - If low[t]  <= entry * (1-stop_pct)    →  y[T] = 0  (stop hit)
      - If neither within H bars              →  drop (ambiguous)  OR  y[T] = 0

    For "short" direction the logic is mirrored: target = price * (1-target_pct),
    stop = price * (1+stop_pct).

    Args:
        klines: OHLCV DataFrame with 'close', 'high', 'low', UTC index.
        features_index: index of compute_features_table() output.
        horizon_bars: maximum bars to hold before declaring timeout.
        target_pct: target distance as a fraction of entry price (e.g. 0.02 = 2%).
        stop_pct: stop distance as a fraction of entry price (e.g. 0.01 = 1%).
        direction: "long" or "short".
        drop_timeout: if True (default), timeout bars are excluded from the
            returned index. If False, timeouts are labelled 0 (treated as loss).

    Returns:
        (valid_index, y): int8 ndarray (0/1) aligned to valid_index.
    """
    if direction not in ("long", "short"):
        raise ValueError(f"direction must be 'long' or 'short', got {direction!r}")
    if target_pct <= 0 or stop_pct <= 0:
        raise ValueError("target_pct and stop_pct must be > 0")

    close = klines["close"].astype(float)
    high = klines["high"].astype(float)
    low = klines["low"].astype(float)

    # Align to features_index (features start after warmup)
    close_a = close.reindex(features_index).to_numpy(dtype=np.float64)
    high_a = high.reindex(features_index).to_numpy(dtype=np.float64)
    low_a = low.reindex(features_index).to_numpy(dtype=np.float64)
    n = len(features_index)

    labels = np.full(n, -1, dtype=np.int8)   # -1 = timeout / unknown

    for i in range(n - horizon_bars):
        entry = close_a[i]
        if entry == 0 or np.isnan(entry):
            continue
        if direction == "long":
            tgt = entry * (1.0 + target_pct)
            stp = entry * (1.0 - stop_pct)
            for j in range(i + 1, i + 1 + horizon_bars):
                if high_a[j] >= tgt:
                    labels[i] = 1
                    break
                if low_a[j] <= stp:
                    labels[i] = 0
                    break
        else:  # short
            tgt = entry * (1.0 - target_pct)
            stp = entry * (1.0 + stop_pct)
            for j in range(i + 1, i + 1 + horizon_bars):
                if low_a[j] <= tgt:
                    labels[i] = 1
                    break
                if high_a[j] >= stp:
                    labels[i] = 0
                    break

    if drop_timeout:
        mask = labels >= 0
    else:
        # Treat timeout as 0 (loss — no edge found)
        labels = np.where(labels == -1, 0, labels).astype(np.int8)
        mask = np.ones(n, dtype=bool)
        mask[-horizon_bars:] = False  # last H bars have no future

    valid_index = features_index[mask]
    return pd.DatetimeIndex(valid_index), labels[mask].astype(np.int8)


# ─── Helper ──────────────────────────────────────────────────────────────────

def compute_forward_returns(
    klines: pd.DataFrame,
    features_index: pd.DatetimeIndex,
    horizon_bars: int = 12,
) -> pd.Series:
    """Raw forward return series (float). Useful for inspecting distribution."""
    close = klines["close"].astype(float).reindex(features_index)
    fwd = close.shift(-horizon_bars)
    return ((fwd - close) / close.replace(0, np.nan)).dropna()
