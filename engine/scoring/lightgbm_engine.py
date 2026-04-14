"""LightGBM P(win) scoring engine — L2 of the 5-layer architecture.

Design principles:
  - Same input → same output. 100% reproducible. LLM never judges.
  - Returns None until trained (graceful degradation: UI shows "학습 전").
  - Per-user models identified by user_id (None = global fallback model).
  - Models persisted to disk under models/lgbm/{user_id or "global"}/latest.pkl
  - Walk-forward validation required before a new model replaces the current one.
  - SHAP feature importance exposed for explainability.

Training trigger: 20+ trade records → train() → AUC reported.
Replacement gate:  new AUC > current AUC - 0.02 (allow slight regression on
                   small samples, prevent catastrophic drops).
"""
from __future__ import annotations

import logging
import os
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional

import numpy as np
import pandas as pd

from models.signal import SignalSnapshot
from scoring.feature_matrix import (
    FEATURE_NAMES,
    N_FEATURES,
    encode_features_df,
    snapshot_to_vector,
)
from scoring.feature_analysis import approximate_feature_contribution

log = logging.getLogger("engine.lgbm")

# Where models are stored relative to the engine root.
_MODELS_DIR = Path(__file__).parent.parent / "models" / "lgbm"

# Minimum trade records before we attempt a training run.
MIN_TRAIN_RECORDS = 20

# AUC must not drop more than this vs the incumbent model.
_AUC_REGRESSION_TOLERANCE = 0.02


class LightGBMEngine:
    """Wrapper around a trained lgb.Booster with load/save and SHAP support."""

    def __init__(self, user_id: Optional[str] = None) -> None:
        self.user_id = user_id or "global"
        self._model = None          # lgb.Booster | None
        self._model_version: Optional[str] = None
        self._auc: Optional[float] = None
        self._model_dir = _MODELS_DIR / self.user_id
        self._load_latest()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def predict_one(self, snap: SignalSnapshot) -> Optional[float]:
        """Return P(win) ∈ [0, 1] or None if model not trained yet.

        Uses predict_proba()[:, 1] — NOT predict() — because LGBMClassifier.predict()
        returns class labels (0 or 1), making any threshold between 0 and 1 meaningless.
        """
        if self._model is None:
            return None
        vec = snapshot_to_vector(snap).reshape(1, -1)
        return float(self._model.predict_proba(vec)[0, 1])

    def predict_feature_row(self, row: Mapping[str, Any]) -> Optional[float]:
        """Score one canonical feature row.

        This is the preferred path for persisted `feature_snapshot` data coming
        from the pattern engine because it avoids rebuilding a partial
        `SignalSnapshot` by hand.
        """
        if self._model is None:
            return None
        X = encode_features_df(pd.DataFrame([dict(row)]))
        return float(self._model.predict_proba(X)[0, 1])

    def predict_batch(self, X: np.ndarray) -> Optional[np.ndarray]:
        """Score a 2-D feature matrix with probabilities. Returns None if untrained."""
        if self._model is None:
            return None
        return self._model.predict_proba(X)[:, 1]

    def train(
        self,
        X: np.ndarray,       # shape (N, N_FEATURES)
        y: np.ndarray,       # shape (N,) — 1 = win, 0 = loss
        *,
        n_splits: int = 5,
    ) -> dict:
        """Train a new model with walk-forward CV. Returns metrics dict.

        If the new model's AUC beats the incumbent (within tolerance), it
        replaces it and is saved to disk.
        """
        try:
            import lightgbm as lgb
            from sklearn.metrics import roc_auc_score
        except ImportError as exc:
            raise RuntimeError(
                "lightgbm / scikit-learn not installed. "
                "Run: uv add lightgbm scikit-learn"
            ) from exc

        if len(X) < MIN_TRAIN_RECORDS:
            raise ValueError(
                f"Need ≥{MIN_TRAIN_RECORDS} records to train "
                f"(got {len(X)})"
            )

        params = {
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

        # True expanding-window walk-forward CV — no temporal leakage.
        # Fold i trains on rows [0, (i+1)*split_size) and validates on the
        # NEXT split_size rows (always in the future relative to train).
        # StratifiedKFold(shuffle=False) is intentionally NOT used here
        # because it interleaves train/val rows temporally.
        n = len(X)
        split_size = max(1, n // (n_splits + 1))
        fold_aucs: list[float] = []

        for i in range(n_splits):
            train_end = (i + 1) * split_size
            val_start = train_end
            val_end = min(val_start + split_size, n)
            if val_end <= val_start:
                break
            X_tr, X_val = X[:train_end], X[val_start:val_end]
            y_tr, y_val = y[:train_end], y[val_start:val_end]
            # Skip folds with single-class labels (AUC undefined)
            if len(np.unique(y_tr)) < 2 or len(np.unique(y_val)) < 2:
                continue
            m = lgb.LGBMClassifier(**params)
            m.fit(
                X_tr, y_tr,
                eval_set=[(X_val, y_val)],
                callbacks=[lgb.early_stopping(30, verbose=False)],
            )
            preds = m.predict_proba(X_val)[:, 1]
            fold_aucs.append(roc_auc_score(y_val, preds))

        # Refuse to replace if no valid fold completed (class imbalance / too few records).
        if not fold_aucs:
            raise ValueError(
                "All CV folds had single-class labels — cannot compute AUC. "
                "Need both wins and losses in training data."
            )

        new_auc = float(np.mean(fold_aucs))

        # Train final model on full data.
        final_model = lgb.LGBMClassifier(**params)
        final_model.fit(X, y)

        # Replace only if better (or no incumbent).
        incumbent_auc = self._auc or 0.0
        replaced = new_auc >= incumbent_auc - _AUC_REGRESSION_TOLERANCE

        if replaced:
            self._model = final_model
            self._auc = new_auc
            self._model_version = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
            self._save(final_model)
            log.info(
                "LightGBM model updated: user=%s auc=%.4f version=%s",
                self.user_id, new_auc, self._model_version,
            )
        else:
            log.warning(
                "New model (auc=%.4f) did not beat incumbent (auc=%.4f) — keeping old.",
                new_auc, incumbent_auc,
            )

        return {
            "auc": new_auc,
            "fold_aucs": fold_aucs,
            "n_samples": len(X),
            "replaced": replaced,
            "model_version": self._model_version,
        }

    def feature_importance(self) -> Optional[dict[str, float]]:
        """Return feature name → importance dict (gain). None if untrained."""
        if self._model is None:
            return None
        importances = self._model.booster_.feature_importance(importance_type="gain")
        return dict(zip(FEATURE_NAMES, importances.tolist()))

    def feature_importance_report(self, top_k: int = 20) -> Optional[dict]:
        """Return ranked feature importance report for API consumers."""
        importance = self.feature_importance()
        if importance is None:
            return None
        ranked = sorted(importance.items(), key=lambda kv: kv[1], reverse=True)
        return {
            "model_version": self._model_version,
            "auc": self._auc,
            "total_features": len(FEATURE_NAMES),
            "top_features": ranked[:top_k],
            "bottom_features": ranked[-top_k:],
            "zero_importance_count": sum(1 for _, v in ranked if v == 0),
        }

    def feature_contribution(self, snap: SignalSnapshot, top_k: int = 20) -> Optional[list[dict]]:
        """Approximate per-feature contribution for one prediction."""
        if self._model is None:
            return None
        contribs = approximate_feature_contribution(self._model, snap)
        ranked = sorted(contribs, key=lambda c: abs(c.contribution), reverse=True)
        return [
            {"name": c.name, "value": c.value, "contribution": c.contribution}
            for c in ranked[:top_k]
        ]

    @property
    def is_trained(self) -> bool:
        return self._model is not None

    @property
    def auc(self) -> Optional[float]:
        return self._auc

    @property
    def model_version(self) -> Optional[str]:
        return self._model_version

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _model_path(self) -> Path:
        return self._model_dir / "latest.pkl"

    def _save(self, model) -> None:
        self._model_dir.mkdir(parents=True, exist_ok=True)
        path = self._model_path()
        with open(path, "wb") as f:
            pickle.dump({"model": model, "auc": self._auc, "version": self._model_version}, f)
        log.debug("Model saved to %s", path)

    def _load_latest(self) -> None:
        path = self._model_path()
        if not path.exists():
            log.debug("No trained model found at %s — starting cold.", path)
            return
        try:
            with open(path, "rb") as f:
                data = pickle.load(f)
            self._model = data["model"]
            self._auc = data.get("auc")
            self._model_version = data.get("version")
            log.info(
                "Loaded LightGBM model: user=%s auc=%s version=%s",
                self.user_id, self._auc, self._model_version,
            )
        except Exception as exc:
            log.warning("Failed to load model from %s: %s", path, exc)


# ---------------------------------------------------------------------------
# Module-level singleton (global model, no user_id)
# ---------------------------------------------------------------------------

_global_engine: Optional[LightGBMEngine] = None


def get_engine(user_id: Optional[str] = None) -> LightGBMEngine:
    """Return the LightGBMEngine for a given user (or the global fallback).

    Engines are cached in-process. For multi-user production, replace this
    with an LRU cache keyed by user_id.
    """
    global _global_engine
    if user_id is None:
        if _global_engine is None:
            _global_engine = LightGBMEngine(user_id=None)
        return _global_engine
    # Per-user: simple in-process dict (upgrade to LRU for scale).
    if not hasattr(get_engine, "_user_cache"):
        get_engine._user_cache = {}
    if user_id not in get_engine._user_cache:
        get_engine._user_cache[user_id] = LightGBMEngine(user_id=user_id)
    return get_engine._user_cache[user_id]
