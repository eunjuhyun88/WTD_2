"""Layer C auto-training trigger with debounce + mutex."""
from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional


_LAYER_C_LOCK = threading.Lock()
_currently_training: bool = False
_last_train_at: Optional[datetime] = None


@dataclass(frozen=True)
class TrainingResult:
    triggered: bool
    n_verdicts: int
    n_positive: int
    auc: Optional[float]
    auc_replaced: bool
    ece_before: Optional[float]
    ece_after: Optional[float]
    brier_before: Optional[float]
    brier_after: Optional[float]
    skip_reason: Optional[str]  # 'insufficient_verdicts'|'class_imbalance'|'debounce'|'auc_regression'|None


def maybe_trigger(n_verdicts: int, *, _debounce_hours: float = 1.0) -> bool:
    """Check debounce conditions only — does NOT train. Returns True if eligible."""
    global _currently_training, _last_train_at
    if n_verdicts < 50:
        return False
    if n_verdicts % 10 != 0:
        return False
    if _currently_training:
        return False
    if _last_train_at is not None:
        elapsed = (datetime.now(timezone.utc) - _last_train_at).total_seconds() / 3600
        if elapsed < _debounce_hours:
            return False
    return True


def train_layer_c(
    engine,         # LightGBMEngine
    records: list,  # list[dict] with 'feature_vector', 'label' keys
    *,
    calibrator_path=None,
) -> TrainingResult:
    """Synchronous train + calibrate. Thread target wraps this."""
    global _currently_training, _last_train_at

    import numpy as np
    from scoring.calibration import IsotonicCalibrator

    n = len(records)
    if n < 50:
        return TrainingResult(
            triggered=False, n_verdicts=n, n_positive=0,
            auc=None, auc_replaced=False,
            ece_before=None, ece_after=None, brier_before=None, brier_after=None,
            skip_reason="insufficient_verdicts",
        )

    X = np.asarray([r["feature_vector"] for r in records], dtype=float)
    y = np.asarray([r["label"] for r in records], dtype=float)
    n_pos = int(y.sum())

    if n_pos / n < 0.10:
        return TrainingResult(
            triggered=False, n_verdicts=n, n_positive=n_pos,
            auc=None, auc_replaced=False,
            ece_before=None, ece_after=None, brier_before=None, brier_after=None,
            skip_reason="class_imbalance",
        )

    with _LAYER_C_LOCK:
        _currently_training = True
        try:
            result = engine.train(X, y)
            auc = result.get("auc")
            replaced = result.get("replaced", False)

            # Calibrate on last fold's held-out set if replaced
            ece_before = ece_after = brier_before = brier_after = None
            if replaced and calibrator_path is not None:
                # Use last 30% as calibration set
                cal_start = max(0, len(X) - len(X) // 3)
                X_cal, y_cal = X[cal_start:], y[cal_start:]
                if len(X_cal) >= 30:
                    raw = engine._model.predict_proba(X_cal)[:, 1]
                    cal = IsotonicCalibrator()
                    cal.fit(raw, y_cal)
                    cal.save(calibrator_path)
                    engine._calibrator = cal
                    ece_before = cal.ece_before
                    ece_after = cal.ece_after
                    brier_before = cal.brier_before
                    brier_after = cal.brier_after

            _last_train_at = datetime.now(timezone.utc)
            return TrainingResult(
                triggered=True, n_verdicts=n, n_positive=n_pos,
                auc=auc, auc_replaced=replaced,
                ece_before=ece_before, ece_after=ece_after,
                brier_before=brier_before, brier_after=brier_after,
                skip_reason=None,
            )
        finally:
            _currently_training = False


def reset_trigger_state() -> None:
    """Test fixture only."""
    global _currently_training, _last_train_at
    _currently_training = False
    _last_train_at = None
