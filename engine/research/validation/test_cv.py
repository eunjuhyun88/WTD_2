"""Unit tests for V-01 (W-0217) PurgedKFold + Embargo cross-validation.

W-0217 §5 acceptance: ``>= 10`` cases including edge cases (small n,
horizon > fold_size, duplicate timestamps, etc.).
"""

from __future__ import annotations

import time
import warnings

import numpy as np
import pandas as pd
import pytest

from research.validation.cv import PurgedKFold, PurgedKFoldConfig


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------


def _hourly_index(n: int, start: str = "2025-01-01") -> pd.DatetimeIndex:
    """Build a strictly monotonic hourly DatetimeIndex of length ``n``."""
    return pd.date_range(start=start, periods=n, freq="h")


# ---------------------------------------------------------------------------
# config validation -- frozen dataclass guards
# ---------------------------------------------------------------------------


def test_config_defaults_match_lopez_de_prado() -> None:
    """W-0217 §7.1 — default n_splits=5, embargo_floor=0.005."""
    config = PurgedKFoldConfig()
    assert config.n_splits == 5
    assert config.label_horizon_hours == 4
    assert config.embargo_floor_pct == 0.005
    assert config.bars_per_hour == 1
    assert config.label_horizon_bars == 4


def test_config_rejects_invalid_n_splits() -> None:
    with pytest.raises(ValueError, match="n_splits"):
        PurgedKFoldConfig(n_splits=1)


def test_config_rejects_negative_horizon() -> None:
    with pytest.raises(ValueError, match="label_horizon_hours"):
        PurgedKFoldConfig(label_horizon_hours=-1)


def test_config_rejects_embargo_out_of_range() -> None:
    with pytest.raises(ValueError, match="embargo_floor_pct"):
        PurgedKFoldConfig(embargo_floor_pct=1.5)


def test_config_is_frozen() -> None:
    config = PurgedKFoldConfig()
    with pytest.raises((AttributeError, TypeError)):
        config.n_splits = 10  # type: ignore[misc]


def test_config_label_horizon_bars_scales_with_bars_per_hour() -> None:
    """4h horizon * 4 bars/hour (15-min bars) -> 16 bars."""
    config = PurgedKFoldConfig(label_horizon_hours=4, bars_per_hour=4)
    assert config.label_horizon_bars == 16


# ---------------------------------------------------------------------------
# split() — happy path & invariants
# ---------------------------------------------------------------------------


def test_split_yields_n_splits_folds_for_clean_input() -> None:
    """100 hourly samples / 5 splits -> 5 folds."""
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5, label_horizon_hours=4))
    folds = list(cv.split(_hourly_index(100)))
    assert len(folds) == 5


def test_split_test_folds_partition_the_index() -> None:
    """Union of test slices == full index, no overlap."""
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5, label_horizon_hours=4))
    folds = list(cv.split(_hourly_index(100)))
    test_idx_concat = np.concatenate([test for _, test in folds])
    assert np.array_equal(np.sort(test_idx_concat), np.arange(100))
    # No overlap: count of unique == total
    assert test_idx_concat.size == np.unique(test_idx_concat).size


def test_split_last_fold_absorbs_remainder() -> None:
    """101 samples / 5 splits -> last fold gets the extra row."""
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5, label_horizon_hours=0))
    folds = list(cv.split(_hourly_index(101)))
    fold_sizes = [test.size for _, test in folds]
    # 4 folds of 20 + 1 fold of 21
    assert fold_sizes == [20, 20, 20, 20, 21]


def test_split_train_excludes_test_indices() -> None:
    """Train and test sets share no positional indices in any fold."""
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5, label_horizon_hours=4))
    for train_idx, test_idx in cv.split(_hourly_index(100)):
        assert np.intersect1d(train_idx, test_idx).size == 0


# ---------------------------------------------------------------------------
# purge logic — labels overlapping test fold are excluded
# ---------------------------------------------------------------------------


def test_purge_drops_label_horizon_before_test() -> None:
    """The ``label_horizon_bars`` train rows immediately before each test
    fold (after fold 0) must be excluded."""
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5, label_horizon_hours=4))
    folds = list(cv.split(_hourly_index(100)))
    # Fold 1 starts at index 20 -> purge [16, 20) from train.
    train_idx, test_idx = folds[1]
    assert test_idx[0] == 20
    for purged in range(16, 20):
        assert purged not in train_idx, (
            f"index {purged} should be purged before fold 1"
        )


def test_purge_handles_first_fold_no_underflow() -> None:
    """Fold 0 starts at index 0 so the purge window is empty
    (``max(0, 0 - horizon)``)."""
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5, label_horizon_hours=4))
    folds = list(cv.split(_hourly_index(100)))
    train_idx, test_idx = folds[0]
    assert test_idx[0] == 0
    # Train should still cover indices >= test_end + embargo
    assert train_idx.min() >= test_idx[-1] + 1


# ---------------------------------------------------------------------------
# embargo logic — Lopez de Prado formula
# ---------------------------------------------------------------------------


def test_embargo_uses_max_horizon_or_floor() -> None:
    """``embargo_bars = max(label_horizon_bars, floor(n * embargo_floor_pct))``."""
    # n=1000, horizon=4, floor=0.005 -> floor=5, horizon=4 -> embargo=5
    cv = PurgedKFold(
        PurgedKFoldConfig(
            n_splits=5, label_horizon_hours=4, embargo_floor_pct=0.005
        )
    )
    assert cv._embargo_bars(1000) == 5
    # n=1000, horizon=10, floor=0.005 -> floor=5, horizon=10 -> embargo=10
    cv2 = PurgedKFold(
        PurgedKFoldConfig(
            n_splits=5, label_horizon_hours=10, embargo_floor_pct=0.005
        )
    )
    assert cv2._embargo_bars(1000) == 10


def test_embargo_blocks_train_after_test() -> None:
    """Indices immediately following test_end are excluded from train."""
    cv = PurgedKFold(
        PurgedKFoldConfig(
            n_splits=5, label_horizon_hours=4, embargo_floor_pct=0.005
        )
    )
    n = 1000
    folds = list(cv.split(_hourly_index(n)))
    embargo = cv._embargo_bars(n)
    # Fold 0 test = [0, 200). Embargo = [200, 200 + embargo).
    train_idx, test_idx = folds[0]
    for embargoed in range(test_idx[-1] + 1, test_idx[-1] + 1 + embargo):
        assert embargoed not in train_idx, (
            f"index {embargoed} should be embargoed after fold 0"
        )


# ---------------------------------------------------------------------------
# edge cases — W-0217 §6.3
# ---------------------------------------------------------------------------


def test_raises_when_too_few_samples() -> None:
    """``n < n_splits * 2`` -> ValueError."""
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5))
    with pytest.raises(ValueError, match="Not enough samples"):
        list(cv.split(_hourly_index(9)))  # 9 < 10


def test_non_monotonic_index_is_sorted_with_warning() -> None:
    """W-0217 §6.3 — non-monotonic input is sorted, warning emitted."""
    idx = _hourly_index(100)
    shuffled = idx[np.random.RandomState(0).permutation(100)]
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5, label_horizon_hours=4))
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        folds = list(cv.split(shuffled))
    # At least one DeprecationWarning about sorting
    assert any(
        issubclass(w.category, DeprecationWarning) and "sorting" in str(w.message)
        for w in caught
    )
    # Splits still produce the expected count and partition
    assert len(folds) == 5


def test_duplicate_timestamps_warn_but_split_runs() -> None:
    """W-0217 §6.3 — duplicates allowed with DeprecationWarning."""
    base = _hourly_index(50)
    dup_idx = base.append(base[:50])  # 100 entries with all duplicates
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5, label_horizon_hours=4))
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        folds = list(cv.split(dup_idx))
    assert any(
        issubclass(w.category, DeprecationWarning) and "duplicate" in str(w.message)
        for w in caught
    )
    assert len(folds) == 5


def test_split_skips_fold_when_train_fully_consumed() -> None:
    """horizon + embargo >= n -> all train slots dropped, fold skipped with
    RuntimeWarning."""
    # n=10, n_splits=2 -> fold_size=5. horizon=20 > 10 -> first fold purges
    # everything before test, embargo blocks everything after.
    cv = PurgedKFold(
        PurgedKFoldConfig(
            n_splits=2,
            label_horizon_hours=20,  # 20 bars
            embargo_floor_pct=1.0,  # embargo = entire span
        )
    )
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        folds = list(cv.split(_hourly_index(10)))
    # Both folds should be skipped (empty train) -> two RuntimeWarnings
    skip_warnings = [
        w for w in caught
        if issubclass(w.category, RuntimeWarning) and "empty train" in str(w.message)
    ]
    assert len(skip_warnings) >= 1
    assert len(folds) == 0


def test_split_dataframe_yields_dataframes() -> None:
    """Convenience wrapper returns DataFrame slices preserving the index."""
    df = pd.DataFrame(
        {"x": np.arange(100, dtype=float)},
        index=_hourly_index(100),
    )
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5, label_horizon_hours=4))
    folds = list(cv.split_dataframe(df))
    assert len(folds) == 5
    train_df, test_df = folds[0]
    assert isinstance(train_df, pd.DataFrame)
    assert isinstance(test_df, pd.DataFrame)
    # Test fold 0 should hold the first 20 rows.
    assert test_df.index[0] == df.index[0]
    assert len(test_df) == 20


def test_split_dataframe_rejects_non_datetime_index() -> None:
    df = pd.DataFrame({"x": np.arange(50)}, index=np.arange(50))
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5))
    with pytest.raises(TypeError, match="DatetimeIndex"):
        list(cv.split_dataframe(df))


def test_split_rejects_non_datetime_index() -> None:
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5))
    with pytest.raises(TypeError, match="DatetimeIndex"):
        list(cv.split(np.arange(50)))  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# performance budget — W-0217 §8.3
# ---------------------------------------------------------------------------


def test_performance_under_100ms_for_split_logic() -> None:
    """W-0217 §8.3 — split logic alone is <100ms for 100K rows.

    PRD targets <5s/fold for the full evaluation pipeline; pure split
    is allotted <100ms total. We measure the full 5-fold sweep.
    """
    cv = PurgedKFold(PurgedKFoldConfig(n_splits=5, label_horizon_hours=4))
    idx = _hourly_index(100_000)
    start = time.perf_counter()
    folds = list(cv.split(idx))
    elapsed_ms = (time.perf_counter() - start) * 1000
    assert len(folds) == 5
    assert elapsed_ms < 100, f"split exceeded budget: {elapsed_ms:.1f}ms"
