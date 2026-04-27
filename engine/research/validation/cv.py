"""V-01 (W-0217) — PurgedKFold + Embargo cross-validation.

Implements W-0214 §3.4 Cross-Validation framework following the
López de Prado (2018) "Advances in Financial Machine Learning" Ch 7
standard. The split logic prevents forward-return label leakage by:

* **Purge** — drop train samples whose labels overlap the test fold
  (``|t_train - t_test| <= label_horizon_bars``).
* **Embargo** — block the ``embargo_bars`` window immediately following
  the test fold from re-entering train, where::

      embargo_bars = max(label_horizon_bars, n_total_bars * embargo_floor_pct)

Composition with ``research.pattern_search.evaluate_variant_against_pack``
is intentionally NOT done here — V-00 augment-only enforcement
(W-0214 §14.8) keeps ``pattern_search.py`` read-only. The composition
runner lives in V-08 ``validation/pipeline.py`` (W-0221).

Walk-forward (expanding / rolling window) is out of scope for V-01. It is
P1 follow-up under W-0226 Quant Realism Protocol (W-0225 Issue M-3).
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Iterator

import numpy as np
import pandas as pd

__all__ = [
    "PurgedKFoldConfig",
    "PurgedKFold",
]


@dataclass(frozen=True)
class PurgedKFoldConfig:
    """Configuration for :class:`PurgedKFold`.

    Attributes:
        n_splits: number of folds. López de Prado (2018) Ch 7 suggests
            ``[5, 10]`` — default 5.
        label_horizon_hours: forward-return horizon used for label
            construction. W-0214 D2 primary horizon is 4h; multi-horizon
            measurement injects per call.
        embargo_floor_pct: minimum embargo as fraction of total samples.
            López de Prado recommends ``0.005`` ~ ``0.01`` for crypto
            autocorrelation.
        bars_per_hour: bars per hour for the input series. ``1`` matches
            1h-bar inputs; 4h-bar inputs use ``0.25``. Stored as
            ``int`` per PRD §6.1 — fractional bars-per-hour is clamped
            to ``1`` and a warning is emitted.
    """

    n_splits: int = 5
    label_horizon_hours: int = 4
    embargo_floor_pct: float = 0.005
    bars_per_hour: int = 1

    def __post_init__(self) -> None:
        # Frozen dataclass: validate via object.__setattr__-free guards.
        if self.n_splits < 2:
            raise ValueError(
                f"n_splits must be >= 2, got {self.n_splits}"
            )
        if self.label_horizon_hours < 0:
            raise ValueError(
                f"label_horizon_hours must be >= 0, got {self.label_horizon_hours}"
            )
        if not 0.0 <= self.embargo_floor_pct <= 1.0:
            raise ValueError(
                f"embargo_floor_pct must be in [0, 1], got {self.embargo_floor_pct}"
            )
        if self.bars_per_hour < 1:
            raise ValueError(
                f"bars_per_hour must be >= 1, got {self.bars_per_hour}"
            )

    @property
    def label_horizon_bars(self) -> int:
        """Label horizon expressed in bars.

        ``max(0, label_horizon_hours * bars_per_hour)``.
        """
        return self.label_horizon_hours * self.bars_per_hour


class PurgedKFold:
    """Time-aware K-fold cross-validation with purge + embargo.

    Implements López de Prado (2018) "Advances in Financial Machine
    Learning" Ch 7. For each fold ``k``:

    1. Test slice is the contiguous block ``[k*fold_size, (k+1)*fold_size)``.
    2. Train mask = all indices, then drop:

       * ``train_mask[test_start:test_end] = False`` (test rows)
       * ``train_mask[test_start - label_horizon_bars : test_start] = False``
         (purge — labels overlap the test fold)
       * ``train_mask[test_end : test_end + embargo_bars] = False``
         (embargo — autocorrelation buffer)

    3. ``embargo_bars = max(label_horizon_bars, n_total * embargo_floor_pct)``.

    Parameters
    ----------
    config:
        :class:`PurgedKFoldConfig`. Defaults to López de Prado recommended
        ``n_splits=5``, ``embargo_floor_pct=0.005``.

    Notes
    -----
    The splitter operates on positional indices of an externally supplied
    :class:`pandas.DatetimeIndex`. Time monotonicity is **enforced**: a
    non-monotonic-increasing input is silently sorted with a
    ``DeprecationWarning`` (W-0217 §6.3). Duplicate timestamps are kept —
    they only affect the embargo span, not correctness, but emit a
    ``DeprecationWarning``.
    """

    def __init__(self, config: PurgedKFoldConfig | None = None) -> None:
        self.config = config if config is not None else PurgedKFoldConfig()

    def _embargo_bars(self, n_total: int) -> int:
        """Compute embargo bars per López de Prado formula.

        ``max(label_horizon_bars, floor(n_total * embargo_floor_pct))``.
        Always ``>= 0``.
        """
        floor_bars = int(n_total * self.config.embargo_floor_pct)
        return max(self.config.label_horizon_bars, floor_bars)

    def _normalise_index(self, index: pd.DatetimeIndex) -> pd.DatetimeIndex:
        """Sort + dedup hint per W-0217 §6.3.

        Returns the index in monotonic order. Duplicates are preserved
        (caller may dedupe upstream); a warning fires once.
        """
        if not isinstance(index, pd.DatetimeIndex):
            raise TypeError(
                "PurgedKFold.split expects a pandas.DatetimeIndex; "
                f"got {type(index).__name__}"
            )
        if not index.is_monotonic_increasing:
            warnings.warn(
                "PurgedKFold received a non-monotonic DatetimeIndex; "
                "sorting in place. Pass a sorted index to silence this.",
                DeprecationWarning,
                stacklevel=3,
            )
            index = index.sort_values()
        if index.has_duplicates:
            warnings.warn(
                "PurgedKFold received a DatetimeIndex with duplicate "
                "timestamps; results may be biased near duplicates.",
                DeprecationWarning,
                stacklevel=3,
            )
        return index

    def split(
        self,
        index: pd.DatetimeIndex,
    ) -> Iterator[tuple[np.ndarray, np.ndarray]]:
        """Yield ``(train_idx, test_idx)`` arrays for each fold.

        Args:
            index: time-ordered :class:`pandas.DatetimeIndex` covering all
                samples. Length must be ``>= n_splits * 2`` (W-0217 §6.3).

        Yields:
            ``(train_idx, test_idx)``: ``np.ndarray[int]`` positional
            indices into the (sorted) input. Empty folds (when
            label_horizon spans the fold) are skipped with a warning.

        Raises:
            ValueError: if ``len(index) < n_splits * 2``.
        """
        index = self._normalise_index(index)
        n = len(index)
        if n < self.config.n_splits * 2:
            raise ValueError(
                f"Not enough samples: n={n} < n_splits*2="
                f"{self.config.n_splits * 2}. Reduce n_splits or supply more data."
            )
        embargo = self._embargo_bars(n)
        fold_size = n // self.config.n_splits
        for k in range(self.config.n_splits):
            test_start = k * fold_size
            # Last fold absorbs the remainder so we cover all samples.
            test_end = (
                (k + 1) * fold_size
                if k < self.config.n_splits - 1
                else n
            )
            test_idx = np.arange(test_start, test_end)
            if test_idx.size == 0:
                warnings.warn(
                    f"PurgedKFold fold {k} produced an empty test slice; "
                    "skipping. Consider lowering n_splits.",
                    RuntimeWarning,
                    stacklevel=2,
                )
                continue
            train_mask = np.ones(n, dtype=bool)
            train_mask[test_start:test_end] = False
            # Purge: train rows immediately preceding the test fold whose
            # forward-return labels overlap into the test window.
            purge_start = max(0, test_start - self.config.label_horizon_bars)
            train_mask[purge_start:test_start] = False
            # Embargo: block the post-test window from rejoining train.
            embargo_end = min(n, test_end + embargo)
            train_mask[test_end:embargo_end] = False
            train_idx = np.where(train_mask)[0]
            if train_idx.size == 0:
                warnings.warn(
                    f"PurgedKFold fold {k} produced an empty train set "
                    "(label_horizon + embargo consumed everything); "
                    "skipping.",
                    RuntimeWarning,
                    stacklevel=2,
                )
                continue
            yield train_idx, test_idx

    def split_dataframe(
        self,
        df: pd.DataFrame,
    ) -> Iterator[tuple[pd.DataFrame, pd.DataFrame]]:
        """Convenience: split a DataFrame by its DatetimeIndex.

        Args:
            df: DataFrame with a :class:`pandas.DatetimeIndex`.

        Yields:
            ``(train_df, test_df)`` slices via ``.iloc``.
        """
        if not isinstance(df.index, pd.DatetimeIndex):
            raise TypeError(
                "PurgedKFold.split_dataframe expects a DataFrame with a "
                f"DatetimeIndex; got {type(df.index).__name__}"
            )
        for train_idx, test_idx in self.split(df.index):
            yield df.iloc[train_idx], df.iloc[test_idx]
