"""Standardized evaluation protocol for model comparison.

Provides walk-forward evaluation, feature importance analysis, and
metric collection in a reproducible format. Results are suitable for
logging via ExperimentTracker.
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np

log = logging.getLogger("engine.research.eval")


def walk_forward_eval(
    X: np.ndarray,
    y: np.ndarray,
    n_splits: int = 5,
    params: Optional[dict] = None,
) -> dict:
    """Walk-forward cross-validation with expanding window. Returns metrics dict."""
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.metrics import roc_auc_score, precision_score, recall_score
    try:
        import lightgbm as lgb
        model_cls = lgb.LGBMClassifier
        model_kwargs = {"callbacks": [lgb.early_stopping(30, verbose=False)]}
    except Exception:
        # Fallback when LightGBM native library is unavailable (e.g. missing libomp).
        model_cls = GradientBoostingClassifier
        model_kwargs = {}

    default_params = {
        "objective": "binary",
        "metric": "auc",
        "num_leaves": 31,
        "learning_rate": 0.05,
        "n_estimators": 300,
        "min_child_samples": 5,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "verbose": -1,
        "random_state": 42,
    }
    params = params or default_params

    n = len(X)
    split_size = max(1, n // (n_splits + 1))
    fold_results = []

    for i in range(n_splits):
        train_end = (i + 1) * split_size
        val_start = train_end
        val_end = min(val_start + split_size, n)
        if val_end <= val_start:
            break

        X_tr, X_val = X[:train_end], X[val_start:val_end]
        y_tr, y_val = y[:train_end], y[val_start:val_end]

        if len(np.unique(y_tr)) < 2 or len(np.unique(y_val)) < 2:
            continue

        safe_params = {k: v for k, v in params.items() if k in model_cls().get_params()}
        if model_cls.__name__ == "GradientBoostingClassifier":
            safe_params.pop("verbose", None)
        m = model_cls(**safe_params)
        if model_kwargs:
            m.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], **model_kwargs)
        else:
            m.fit(X_tr, y_tr)
        preds = m.predict_proba(X_val)[:, 1]
        pred_labels = (preds >= 0.5).astype(int)

        fold_results.append({
            "fold": i,
            "train_size": len(X_tr),
            "val_size": len(X_val),
            "auc": float(roc_auc_score(y_val, preds)),
            "precision_50": float(precision_score(y_val, pred_labels, zero_division=0)),
            "recall_50": float(recall_score(y_val, pred_labels, zero_division=0)),
        })

    if not fold_results:
        return {"error": "No valid folds", "n_samples": n}

    aucs = [f["auc"] for f in fold_results]
    return {
        "n_samples": n,
        "n_splits": n_splits,
        "mean_auc": float(np.mean(aucs)),
        "std_auc": float(np.std(aucs)),
        "min_auc": float(np.min(aucs)),
        "max_auc": float(np.max(aucs)),
        "folds": fold_results,
    }


def feature_importance_report(
    X: np.ndarray,
    y: np.ndarray,
    feature_names: list[str],
    params: Optional[dict] = None,
) -> dict:
    """Train a model on full data and return feature importance ranking."""
    from sklearn.ensemble import GradientBoostingClassifier
    try:
        import lightgbm as lgb
        model_cls = lgb.LGBMClassifier
    except Exception:
        model_cls = GradientBoostingClassifier

    default_params = {
        "objective": "binary",
        "num_leaves": 31,
        "learning_rate": 0.05,
        "n_estimators": 300,
        "verbose": -1,
        "random_state": 42,
    }
    params = params or default_params

    safe_params = {k: v for k, v in params.items() if k in model_cls().get_params()}
    if model_cls.__name__ == "GradientBoostingClassifier":
        safe_params.pop("verbose", None)
    m = model_cls(**safe_params)
    m.fit(X, y)
    if hasattr(m, "booster_"):
        importances = m.booster_.feature_importance(importance_type="gain")
    else:
        importances = getattr(m, "feature_importances_", np.zeros(len(feature_names)))
    importance_dict = dict(zip(feature_names, np.asarray(importances).tolist()))

    ranked = sorted(importance_dict.items(), key=lambda x: x[1], reverse=True)

    return {
        "feature_importance": importance_dict,
        "top_20": ranked[:20],
        "bottom_20": ranked[-20:],
        "zero_importance_count": sum(1 for v in importances if v == 0),
        "total_features": len(feature_names),
    }
