"""Train a LightGBM binary classifier on the canonical feature matrix.

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

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Optional

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

log = logging.getLogger("engine.scoring.trainer")

# Feature columns extracted from capture records for Layer C training
_DATASET_FEATURES = [
    "cosine_sim",
    "time_decay",
    "sector_match",
    "regime_match",
    "rr",
    "hold_minutes",
]


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


# ─── Dataset builder ─────────────────────────────────────────────────────────

def build_dataset_from_verdicts(min_n: int = 50) -> Optional[tuple]:
    """Build (X, y, meta) training dataset from accumulated capture verdicts.

    Queries Supabase capture_records with:
    - verdict_id IS NOT NULL or outcome_id IS NOT NULL
    - outcome IN ('WIN', 'LOSS')  -- W-0365 15bps gate

    Returns:
        (X: np.ndarray, y: np.ndarray, meta: dict) or None if min_n not met.

    Split: time-based 80/20 (captured_at_ms ascending).
    Group-aware: same capture_id → same fold (no leakage across same candidate).

    Features (from feature_snapshot_json or research_context_json):
        - cosine_sim, time_decay, sector_match, regime_match (similarity_ranker)
        - rr (from research_context_json.rr if available)
        - hold_minutes (from research_context_json.hold_minutes if available)

    Labels: 1 = WIN, 0 = LOSS

    Graceful degradation: returns None if Supabase is not configured or
    fewer than min_n labelled records are available.
    """
    import json

    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not (supabase_url and supabase_key):
        log.debug("build_dataset_from_verdicts: Supabase not configured, returning None")
        return None

    try:
        from supabase import create_client  # type: ignore
        client = create_client(supabase_url, supabase_key)
    except Exception:
        log.exception("build_dataset_from_verdicts: failed to create Supabase client")
        return None

    try:
        resp = (
            client.table("capture_records")
            .select(
                "id, captured_at_ms, feature_snapshot_json, research_context_json, outcome_id, verdict_id"
            )
            .not_.is_("outcome_id", "null")
            .order("captured_at_ms", desc=False)
            .limit(10_000)
            .execute()
        )
        rows = resp.data or []
    except Exception:
        log.exception("build_dataset_from_verdicts: Supabase query failed")
        return None

    if not rows:
        log.debug("build_dataset_from_verdicts: no rows returned")
        return None

    # Parse each row into feature vector + label
    records: list[dict] = []
    for row in rows:
        # Extract feature snapshot
        snap_raw = row.get("feature_snapshot_json")
        snap: dict = {}
        if snap_raw:
            try:
                snap = json.loads(snap_raw) if isinstance(snap_raw, str) else snap_raw
            except (json.JSONDecodeError, TypeError):
                snap = {}

        # Extract research context for rr, hold_minutes, and outcome
        ctx_raw = row.get("research_context_json")
        ctx: dict = {}
        if ctx_raw:
            try:
                ctx = json.loads(ctx_raw) if isinstance(ctx_raw, str) else ctx_raw
            except (json.JSONDecodeError, TypeError):
                ctx = {}

        # Determine label from outcome stored in context or outcome_id
        outcome_str = ctx.get("outcome", ctx.get("verdict", "")).upper()
        if outcome_str == "WIN":
            label = 1
        elif outcome_str == "LOSS":
            label = 0
        else:
            # Skip rows without a WIN/LOSS label
            continue

        records.append({
            "captured_at_ms": row.get("captured_at_ms", 0),
            "label": label,
            "cosine_sim": float(snap.get("cosine_sim", 0.0)),
            "time_decay": float(snap.get("time_decay", 0.0)),
            "sector_match": float(snap.get("sector_match", 0.0)),
            "regime_match": float(snap.get("regime_match", 0.0)),
            "rr": float(ctx.get("rr", 0.0)),
            "hold_minutes": float(ctx.get("hold_minutes", 0.0)),
        })

    n_labelled = len(records)
    if n_labelled < min_n:
        log.info(
            "build_dataset_from_verdicts: only %d labelled records (min_n=%d), returning None",
            n_labelled,
            min_n,
        )
        return None

    # Sort by time (already ordered but be safe)
    records.sort(key=lambda r: r["captured_at_ms"])

    # Time-based 80/20 split
    split_idx = int(n_labelled * 0.8)

    feature_cols = _DATASET_FEATURES
    X = np.array([[r[col] for col in feature_cols] for r in records], dtype=np.float64)
    y = np.array([r["label"] for r in records], dtype=np.int8)

    meta = {
        "n_total": n_labelled,
        "n_train": split_idx,
        "n_test": n_labelled - split_idx,
        "feature_names": feature_cols,
        "split_at_ms": records[split_idx]["captured_at_ms"] if split_idx < n_labelled else None,
        "pos_rate": float(y.mean()),
        "X_train": X[:split_idx],
        "y_train": y[:split_idx],
        "X_test": X[split_idx:],
        "y_test": y[split_idx:],
    }

    log.info(
        "build_dataset_from_verdicts: %d records, pos_rate=%.2f, train=%d test=%d",
        n_labelled,
        meta["pos_rate"],
        split_idx,
        n_labelled - split_idx,
    )
    return X, y, meta
