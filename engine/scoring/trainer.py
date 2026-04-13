"""Train a LightGBM binary classifier on the 39-feature matrix.

Two training modes:

  train()            — Walk-forward CV (TimeSeriesSplit) to estimate OOS AUC,
                       then a single final model on all data. Fast; good for
                       initial research and hyperparameter tuning.

  train_walkforward() — Rolling-window retraining: retrain every `step_bars`
                        bars, score the next window out-of-sample. Returns a
                        combined OOS prob series covering the full dataset.
                        More expensive but mirrors live deployment exactly.

Walk-forward rationale:
    Unlike k-fold, TimeSeriesSplit always trains on earlier data and validates
    on later data. This mirrors live deployment where the model only sees the
    past. Using standard k-fold on time-series data inflates AUC by ~5-15%.

Usage:
    from scoring.feature_matrix import encode_features_df, FEATURE_NAMES
    from scoring.label_maker import make_labels

    valid_idx, y = make_labels(klines, features_df.index, horizon_bars=12)
    X = encode_features_df(features_df.loc[valid_idx])
    model, report = train(X, y, feature_names=list(FEATURE_NAMES))
    print(f"CV AUC: {report.cv_auc_mean:.4f} ± {report.cv_auc_std:.4f}")

    # Walk-forward mode:
    wf = train_walkforward(X, y, features_df.index[valid_idx],
                           feature_names=list(FEATURE_NAMES))
    print(f"WF OOS AUC: {wf.oos_auc:.4f}  periods: {wf.n_periods}")
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

try:
    import lightgbm as lgb
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import TimeSeriesSplit
except ImportError as exc:
    raise ImportError(
        "ML scoring requires lightgbm and scikit-learn.\n"
        "Run: uv add lightgbm scikit-learn"
    ) from exc


# Conservative defaults — prefer stability over raw AUC on 75k bars.
_DEFAULT_PARAMS: dict[str, Any] = {
    "objective": "binary",
    "metric": "auc",
    "num_leaves": 31,          # shallow trees → less overfit
    "learning_rate": 0.05,
    "n_estimators": 300,
    "min_child_samples": 100,  # at least 100 samples per leaf
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_lambda": 1.0,
    "class_weight": "balanced", # handle imbalanced up/down bars
    "random_state": 42,
    "verbose": -1,
    "n_jobs": -1,
}


@dataclass
class TrainReport:
    direction: str
    horizon_bars: int
    n_samples: int
    pos_rate: float                   # fraction of y==1 (label balance check)
    cv_auc_scores: list[float] = field(default_factory=list)
    cv_auc_mean: float = 0.0
    cv_auc_std: float = 0.0
    feature_importance: pd.DataFrame = field(default_factory=pd.DataFrame)

    def __str__(self) -> str:
        lines = [
            f"Direction : {self.direction}",
            f"Horizon   : {self.horizon_bars} bars",
            f"Samples   : {self.n_samples:,}  (pos rate {self.pos_rate:.1%})",
            f"CV AUC    : {self.cv_auc_mean:.4f} ± {self.cv_auc_std:.4f}",
            f"Fold AUCs : {[f'{s:.4f}' for s in self.cv_auc_scores]}",
            "",
            "Top 10 features by gain:",
        ]
        for _, row in self.feature_importance.head(10).iterrows():
            lines.append(f"  {row['feature']:<30} {row['gain']:.0f}")
        return "\n".join(lines)


def train(
    X: np.ndarray,
    y: np.ndarray,
    feature_names: list[str],
    *,
    direction: str = "long",
    horizon_bars: int = 12,
    n_splits: int = 5,
    params: dict[str, Any] | None = None,
) -> tuple[lgb.LGBMClassifier, TrainReport]:
    """Train LightGBM binary classifier with walk-forward cross-validation.

    Args:
        X: float64 matrix, shape (n_samples, n_features).
        y: int8 binary labels (0/1), length n_samples.
        feature_names: list of feature names matching X columns.
        direction: "long" or "short" — stored in the report.
        horizon_bars: forward horizon — stored in the report.
        n_splits: number of TimeSeriesSplit folds.
        params: LightGBM param overrides (merged with defaults).

    Returns:
        (fitted_model, report) — model is trained on the FULL (X, y).
    """
    lgb_params = {**_DEFAULT_PARAMS, **(params or {})}
    n_samples = len(y)
    pos_rate = float(y.mean())

    tscv = TimeSeriesSplit(n_splits=n_splits)
    cv_aucs: list[float] = []

    for fold, (train_idx, val_idx) in enumerate(tscv.split(X), 1):
        # Skip folds with too few positive samples to compute AUC.
        if y[val_idx].sum() < 2 or (1 - y[val_idx]).sum() < 2:
            continue
        fold_model = lgb.LGBMClassifier(**lgb_params)
        fold_model.fit(X[train_idx], y[train_idx], feature_name=feature_names)
        proba = fold_model.predict_proba(X[val_idx])[:, 1]
        auc = float(roc_auc_score(y[val_idx], proba))
        cv_aucs.append(auc)

    # Final model on all data.
    final_model = lgb.LGBMClassifier(**lgb_params)
    final_model.fit(X, y, feature_name=feature_names)

    importance = pd.DataFrame({
        "feature": feature_names,
        "gain": final_model.booster_.feature_importance(importance_type="gain"),
    }).sort_values("gain", ascending=False).reset_index(drop=True)

    report = TrainReport(
        direction=direction,
        horizon_bars=horizon_bars,
        n_samples=n_samples,
        pos_rate=pos_rate,
        cv_auc_scores=cv_aucs,
        cv_auc_mean=float(np.mean(cv_aucs)) if cv_aucs else 0.0,
        cv_auc_std=float(np.std(cv_aucs)) if cv_aucs else 0.0,
        feature_importance=importance,
    )
    return final_model, report


# ─── Walk-forward retraining ─────────────────────────────────────────────────

@dataclass
class WalkForwardResult:
    """Result of rolling-window walk-forward retraining.

    Attributes:
        oos_prob:    pd.Series[float] — OOS predicted probabilities indexed by
                     the same DatetimeIndex as the input (covers all periods
                     after the first training window).
        oos_labels:  np.ndarray int8 — ground-truth labels aligned to oos_prob.
        oos_auc:     float — ROC-AUC over the full OOS window.
        period_aucs: list[float] — per-period OOS AUC (one per retrain event).
        n_periods:   int — number of retrain periods.
        final_model: lgb.LGBMClassifier — model trained on all available data
                     (ready for live scoring).
        feature_importance: pd.DataFrame with columns [feature, gain].
    """
    oos_prob: pd.Series
    oos_labels: np.ndarray
    oos_auc: float
    period_aucs: list[float] = field(default_factory=list)
    n_periods: int = 0
    final_model: "lgb.LGBMClassifier | None" = None
    feature_importance: pd.DataFrame = field(default_factory=pd.DataFrame)

    def __str__(self) -> str:
        lines = [
            f"Walk-forward periods : {self.n_periods}",
            f"OOS AUC              : {self.oos_auc:.4f}",
            f"Per-period AUCs      : {[f'{a:.4f}' for a in self.period_aucs]}",
        ]
        if not self.feature_importance.empty:
            lines += ["", "Top 10 features by gain:"]
            for _, row in self.feature_importance.head(10).iterrows():
                lines.append(f"  {row['feature']:<30} {row['gain']:.0f}")
        return "\n".join(lines)


def train_walkforward(
    X: np.ndarray,
    y: np.ndarray,
    index: pd.DatetimeIndex,
    feature_names: list[str],
    *,
    min_train_bars: int = 4_320,   # ~6 months of hourly bars
    step_bars: int = 2_160,        # retrain every ~3 months
    params: dict[str, Any] | None = None,
) -> WalkForwardResult:
    """Rolling-window walk-forward retraining.

    Divides the labelled dataset into sequential windows:
      - Trains on bars [0 … split)
      - Scores bars [split … split+step) out-of-sample
      - Advances split by step_bars and repeats

    This exactly mirrors live deployment: the model never sees the data it
    is asked to score, and is periodically refreshed to reduce regime drift.

    Args:
        X:              float64 feature matrix, shape (n_samples, n_features).
        y:              int8 binary labels (0/1), length n_samples.
        index:          DatetimeIndex aligned to X / y rows.
        feature_names:  column names for X.
        min_train_bars: minimum number of training bars before first model.
        step_bars:      how many bars each OOS window covers (also the retrain
                        cadence).
        params:         LightGBM param overrides.

    Returns:
        WalkForwardResult with full OOS prob series + final model on all data.
    """
    lgb_params = {**_DEFAULT_PARAMS, **(params or {})}
    n = len(y)

    if n < min_train_bars + step_bars:
        raise ValueError(
            f"Not enough samples ({n}) for walk-forward. "
            f"Need at least {min_train_bars + step_bars}."
        )

    oos_indices: list[int] = []
    oos_probs: list[float] = []
    oos_ys: list[int] = []
    period_aucs: list[float] = []

    split = min_train_bars
    while split < n:
        val_end = min(split + step_bars, n)
        train_idx = np.arange(split)
        val_idx   = np.arange(split, val_end)

        # Skip if validation window too small or lacks both classes.
        if len(val_idx) < 10 or y[val_idx].sum() < 2 or (1 - y[val_idx]).sum() < 2:
            split = val_end
            continue

        period_model = lgb.LGBMClassifier(**lgb_params)
        period_model.fit(X[train_idx], y[train_idx], feature_name=feature_names)
        proba = period_model.predict_proba(X[val_idx])[:, 1]

        auc = float(roc_auc_score(y[val_idx], proba))
        period_aucs.append(auc)

        oos_indices.extend(val_idx.tolist())
        oos_probs.extend(proba.tolist())
        oos_ys.extend(y[val_idx].tolist())

        split = val_end

    oos_prob_series = pd.Series(
        oos_probs, index=index[oos_indices], name="prob_win", dtype=float
    )
    oos_labels_arr = np.array(oos_ys, dtype=np.int8)
    oos_auc = float(roc_auc_score(oos_labels_arr, oos_probs)) if oos_probs else 0.0

    # Final model on all data (for live scoring).
    final_model = lgb.LGBMClassifier(**lgb_params)
    final_model.fit(X, y, feature_name=feature_names)
    importance = pd.DataFrame({
        "feature": feature_names,
        "gain": final_model.booster_.feature_importance(importance_type="gain"),
    }).sort_values("gain", ascending=False).reset_index(drop=True)

    return WalkForwardResult(
        oos_prob=oos_prob_series,
        oos_labels=oos_labels_arr,
        oos_auc=oos_auc,
        period_aucs=period_aucs,
        n_periods=len(period_aucs),
        final_model=final_model,
        feature_importance=importance,
    )
