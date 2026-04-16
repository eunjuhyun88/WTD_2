"""Internal pattern training service shared by routes and worker-control."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ledger.dataset import build_pattern_training_records
from ledger.store import LEDGER_RECORD_STORE, LedgerRecordStore, LedgerStore
from patterns.library import get_pattern
from patterns.model_key import make_pattern_model_key
from patterns.model_registry import MODEL_REGISTRY_STORE, PatternModelRegistryStore
from scoring.feature_matrix import encode_features_df
from scoring.lightgbm_engine import MIN_TRAIN_RECORDS, get_engine


def train_pattern_model_from_ledger(
    pattern_slug: str,
    *,
    user_id: str | None = None,
    target_name: str = "breakout",
    feature_schema_version: int = 1,
    label_policy_version: int = 1,
    threshold_policy_version: int = 1,
    min_records: int | None = None,
    ledger: LedgerStore | None = None,
    record_store: LedgerRecordStore | None = None,
    registry_store: PatternModelRegistryStore | None = None,
    get_engine_fn=get_engine,
) -> dict:
    """Train a pattern-scoped model from ledger evidence and record artifacts."""
    pattern = get_pattern(pattern_slug)
    ledger = ledger or LedgerStore()
    record_store = record_store or LEDGER_RECORD_STORE
    registry_store = registry_store or MODEL_REGISTRY_STORE

    outcomes = ledger.list_all(pattern_slug)
    records = build_pattern_training_records(outcomes)
    required_records = max(MIN_TRAIN_RECORDS, min_records or MIN_TRAIN_RECORDS)
    if len(records) < required_records:
        raise ValueError(f"Need ≥{required_records} training records (got {len(records)})")

    X, y = _pattern_training_matrix(records)
    if len(set(y.tolist())) < 2:
        raise ValueError("Need at least one success and one failure outcome")

    model_key = make_pattern_model_key(
        pattern_slug,
        pattern.timeframe,
        target_name,
        feature_schema_version,
        label_policy_version,
    )
    engine = get_engine_fn(model_key)
    result = engine.train(X, y)

    model_version = (
        result["model_version"]
        if result["replaced"] and result["model_version"]
        else ("not_replaced" if not result["replaced"] else "untrained")
    )
    payload = {
        "model_key": model_key,
        "timeframe": pattern.timeframe,
        "target_name": target_name,
        "feature_schema_version": feature_schema_version,
        "label_policy_version": label_policy_version,
        "threshold_policy_version": threshold_policy_version,
        "requested_by_user_id": user_id,
        "n_records": len(records),
        "n_wins": int((y == 1).sum()),
        "n_losses": int((y == 0).sum()),
        "auc": result["auc"],
        "replaced": result["replaced"],
        "rollout_state": "candidate" if result["replaced"] else "shadow",
        "fold_aucs": result["fold_aucs"],
    }
    record_store.append_training_run_record(
        pattern_slug=pattern_slug,
        model_key=model_key,
        user_id=user_id,
        payload=payload,
    )

    if result["replaced"]:
        registry_entry = registry_store.upsert_candidate(
            pattern_slug=pattern_slug,
            model_key=model_key,
            model_version=model_version,
            timeframe=pattern.timeframe,
            target_name=target_name,
            feature_schema_version=feature_schema_version,
            label_policy_version=label_policy_version,
            threshold_policy_version=threshold_policy_version,
            requested_by_user_id=user_id,
        )
        record_store.append_model_record(
            pattern_slug=pattern_slug,
            model_version=model_version,
            user_id=user_id,
            payload={
                **payload,
                "rollout_state": registry_entry.rollout_state,
            },
        )

    return {
        "ok": True,
        "pattern_slug": pattern_slug,
        "model_key": model_key,
        "model_version": model_version,
        "rollout_state": payload["rollout_state"],
        "replaced": result["replaced"],
        "training_run_recorded": True,
        "model_recorded": bool(result["replaced"]),
        "auc": result["auc"],
        "n_records": len(records),
        "n_wins": payload["n_wins"],
        "n_losses": payload["n_losses"],
    }


def _pattern_training_matrix(records: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    snapshots = [record["snapshot"] for record in records]
    labels = np.array([int(record["outcome"]) for record in records], dtype=int)
    X = encode_features_df(pd.DataFrame(snapshots))
    return X, labels
