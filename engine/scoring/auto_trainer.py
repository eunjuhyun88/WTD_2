"""W-0394: Auto-train orchestrator for LightGBM Layer C.

Pipeline:
    1. evaluate_trigger(n) — debounce check (doubling schedule: 50/100/200/400/...)
    2. train_and_register() — build dataset, train LightGBM, upload GCS, register
    3. shadow_eval(version_id, meta) — NDCG@5 paired bootstrap CI vs rule-based baseline
    4. promote_if_eligible(version_id) — promote when CI lower bound > PROMOTE_CI_LOWER_THRESHOLD

Thread safety: single _TRAIN_LOCK prevents concurrent training runs.
GCS upload: requires LGBM_MODEL_GCS_BUCKET env var; skipped in dev mode.
"""
from __future__ import annotations

import io
import logging
import os
import pickle
import threading
from datetime import datetime, timezone
from typing import Optional

import numpy as np

log = logging.getLogger("engine.scoring.auto_trainer")

_TRAIN_LOCK = threading.Lock()
_PROMOTE_CI_LOWER_THRESHOLD = 0.05  # CI lower bound must exceed this to promote

# Doubling schedule: first trigger at 50, then 100→200→400→800...
_TRIGGER_THRESHOLDS = {50, 100, 200, 400, 800, 1600, 3200, 6400}


def evaluate_trigger(n_verdicts: int) -> bool:
    """Return True if training should fire for this verdict count.

    Fires at the doubling thresholds (50, 100, 200, 400...).
    Does not fire if training is already in progress.
    """
    if n_verdicts not in _TRIGGER_THRESHOLDS:
        return False
    if _TRAIN_LOCK.locked():
        log.debug("evaluate_trigger: training in progress, skip n=%d", n_verdicts)
        return False
    return True


def count_labelled_verdicts() -> int:
    """Return count of capture_records with WIN/LOSS outcome from Supabase.

    Returns 0 if Supabase is not configured or query fails.
    """
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not (url and key):
        return 0
    try:
        from supabase import create_client  # type: ignore
        client = create_client(url, key)
        resp = (
            client.table("capture_records")
            .select("id", count="exact")
            .not_.is_("outcome_id", "null")
            .execute()
        )
        return resp.count or 0
    except Exception:
        log.exception("count_labelled_verdicts: failed")
        return 0


def _upload_to_gcs(model_bytes: bytes, version: str) -> Optional[str]:
    """Upload pickled model to GCS. Returns gs:// path or None if GCS not configured."""
    bucket_name = os.environ.get("LGBM_MODEL_GCS_BUCKET", "")
    if not bucket_name:
        log.debug("_upload_to_gcs: LGBM_MODEL_GCS_BUCKET not set, skipping GCS upload")
        return None
    try:
        from google.cloud import storage as gcs  # type: ignore
        client = gcs.Client()
        bucket = client.bucket(bucket_name)
        blob_path = f"models/layer_c/{version}.pkl"
        blob = bucket.blob(blob_path)
        blob.upload_from_file(io.BytesIO(model_bytes), content_type="application/octet-stream")
        gcs_path = f"gs://{bucket_name}/{blob_path}"
        log.info("Uploaded Layer C model to %s", gcs_path)
        return gcs_path
    except Exception:
        log.exception("_upload_to_gcs: failed — continuing without GCS path")
        return None


def train_and_register() -> Optional[tuple[str, dict]]:
    """Full training pipeline: dataset → LightGBM → GCS → registry.

    Returns (version_id, meta) or None if training was skipped/failed.
    Thread-safe: returns None immediately if lock is held.
    """
    if not _TRAIN_LOCK.acquire(blocking=False):
        log.info("train_and_register: training already in progress, skipping")
        return None

    try:
        from scoring.trainer import build_dataset_from_verdicts, train, _DEFAULT_PARAMS
        from scoring.registry import ModelRegistry

        dataset = build_dataset_from_verdicts(min_n=50)
        if dataset is None:
            log.info("train_and_register: insufficient data, skipping")
            return None

        X, y, meta = dataset

        # Train on the full training split
        X_train, y_train = meta["X_train"], meta["y_train"]
        if len(X_train) < 50:
            log.info("train_and_register: train split too small (%d), skipping", len(X_train))
            return None

        import lightgbm as lgb
        params = {**_DEFAULT_PARAMS, "verbose": -1}
        model = lgb.LGBMClassifier(**params)
        model.fit(X_train, y_train)

        # Serialize for GCS upload
        model_bytes = pickle.dumps(model)

        # Register in model_versions table
        registry = ModelRegistry()
        version = registry.get_next_version("search_layer_c")

        # Upload to GCS (non-fatal if unavailable)
        gcs_path = _upload_to_gcs(model_bytes, version)

        version_id = registry.register(
            model_type="search_layer_c",
            version=version,
            training_size=meta["n_total"],
            gcs_path=gcs_path,
        )

        # Cache the trained model in memory for immediate shadow eval
        meta["_trained_model"] = model

        log.info(
            "train_and_register: trained %s n_total=%d gcs=%s version_id=%s",
            version,
            meta["n_total"],
            gcs_path or "(local-only)",
            version_id,
        )
        return version_id, meta

    except Exception:
        log.exception("train_and_register: unexpected failure")
        return None
    finally:
        _TRAIN_LOCK.release()


def shadow_eval(version_id: str, meta: dict) -> Optional[dict]:
    """NDCG@5 + MAP@10 + paired bootstrap CI on the held-out test split.

    Uses rule-based baseline (constant score = 0.5) as comparison point.
    Stores results in model_versions table via ModelRegistry.

    Returns {"ndcg_at_5": float, "map_at_10": float, "ci_lower": float} or None.
    """
    from scoring.eval.ndcg import ndcg_at_k, map_at_k, paired_bootstrap_ci
    from scoring.registry import ModelRegistry

    X_test = meta.get("X_test")
    y_test = meta.get("y_test")
    model = meta.get("_trained_model")

    if X_test is None or y_test is None or model is None:
        log.warning("shadow_eval: missing X_test/y_test/model in meta")
        return None

    if len(X_test) < 10:
        log.info("shadow_eval: test set too small (%d), skipping eval", len(X_test))
        return None

    try:
        # Model predictions
        pred_probs = model.predict_proba(X_test)[:, 1]

        # Rule-based baseline: constant score (no discrimination)
        baseline_scores = np.full(len(y_test), 0.5)

        # NDCG@5 for model
        model_ndcg = ndcg_at_k(y_test.tolist(), pred_probs.tolist(), k=5)
        # MAP@10 for model
        model_map = map_at_k(y_test.tolist(), pred_probs.tolist(), k=10)

        # Paired bootstrap CI: model NDCG@5 vs baseline NDCG@5
        # We compare per-sample NDCG deltas (treat each test sample as its own "query")
        model_ndcg_per = np.array([
            ndcg_at_k([float(y_test[i])], [float(pred_probs[i])], k=1)
            for i in range(len(y_test))
        ])
        baseline_ndcg_per = np.array([
            ndcg_at_k([float(y_test[i])], [float(baseline_scores[i])], k=1)
            for i in range(len(y_test))
        ])
        _, ci_lower, ci_upper = paired_bootstrap_ci(
            baseline_ndcg_per.tolist(),
            model_ndcg_per.tolist(),
            n_resamples=1000,
        )

        eval_result = {
            "ndcg_at_5": float(model_ndcg),
            "map_at_10": float(model_map),
            "ci_lower": float(ci_lower),
        }

        # Persist to registry
        registry = ModelRegistry()
        registry.update_eval(
            version_id,
            ndcg_at_5=eval_result["ndcg_at_5"],
            map_at_10=eval_result["map_at_10"],
            ci_lower=eval_result["ci_lower"],
        )

        log.info(
            "shadow_eval: version_id=%s ndcg@5=%.4f map@10=%.4f ci_lower=%.4f",
            version_id,
            eval_result["ndcg_at_5"],
            eval_result["map_at_10"],
            eval_result["ci_lower"],
        )
        return eval_result

    except Exception:
        log.exception("shadow_eval: failed for version_id=%s", version_id)
        return None


def promote_if_eligible(version_id: str, eval_result: dict) -> bool:
    """Promote model to active if CI lower bound exceeds threshold.

    Condition: eval_result["ci_lower"] > PROMOTE_CI_LOWER_THRESHOLD (0.05)

    On promotion, sets LGBM_CONTEXT_SCORE_WEIGHT env var to "0.25"
    so similarity_ranker picks up the new blend weight immediately.

    Returns True if promoted.
    """
    from scoring.registry import ModelRegistry

    ci_lower = eval_result.get("ci_lower", 0.0)
    if ci_lower <= _PROMOTE_CI_LOWER_THRESHOLD:
        log.info(
            "promote_if_eligible: ci_lower=%.4f ≤ threshold=%.4f — staying in shadow",
            ci_lower,
            _PROMOTE_CI_LOWER_THRESHOLD,
        )
        return False

    try:
        registry = ModelRegistry()
        registry.promote(version_id)
        # Signal similarity_ranker to blend in Layer C
        os.environ["LGBM_CONTEXT_SCORE_WEIGHT"] = "0.25"
        log.info(
            "promote_if_eligible: PROMOTED version_id=%s ci_lower=%.4f LGBM_CONTEXT_SCORE_WEIGHT=0.25",
            version_id,
            ci_lower,
        )
        return True
    except Exception:
        log.exception("promote_if_eligible: failed to promote version_id=%s", version_id)
        return False


def _sentry_breadcrumb(message: str, data: Optional[dict] = None) -> None:
    """Add a Sentry breadcrumb (no-op if sentry_sdk not installed)."""
    try:
        import sentry_sdk  # type: ignore

        sentry_sdk.add_breadcrumb(
            category="layer_c_train",
            message=message,
            data=data or {},
            level="info",
        )
    except Exception:
        pass


def _persist_run(
    *,
    n_verdicts: int,
    status: str,
    ndcg_at_5: Optional[float],
    map_at_10: Optional[float],
    ci_lower: Optional[float],
    promoted: bool,
    version_id: Optional[str],
) -> None:
    """Insert one row into layer_c_train_runs. Fire-and-forget — never raises."""
    try:
        import psycopg2  # type: ignore

        db_url = os.environ.get("DATABASE_URL", "")
        if not db_url:
            log.debug("_persist_run: DATABASE_URL not set, skipping")
            return
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO layer_c_train_runs
                    (n_verdicts, status, ndcg_at_5, map_at_10, ci_lower, promoted, version_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s::uuid)
                """,
                (
                    n_verdicts,
                    status,
                    ndcg_at_5,
                    map_at_10,
                    ci_lower,
                    promoted,
                    version_id,
                ),
            )
        conn.close()
        log.info("_persist_run: inserted run status=%s n_verdicts=%d", status, n_verdicts)
        if status == "failed":
            try:
                import sentry_sdk  # type: ignore

                sentry_sdk.capture_message(
                    "layer_c_train_failed",
                    level="error",
                    extras={"n_verdicts": n_verdicts, "version_id": version_id},
                )
            except Exception:
                pass
    except Exception:
        log.exception("_persist_run: failed (non-fatal)")


def run_auto_train_pipeline() -> dict:
    """Top-level entry point: train → eval → maybe promote.

    Returns a status dict for logging/observability.
    """
    _sentry_breadcrumb("run_auto_train_pipeline: started")
    result = train_and_register()
    if result is None:
        _persist_run(
            n_verdicts=0,
            status="skipped",
            ndcg_at_5=None,
            map_at_10=None,
            ci_lower=None,
            promoted=False,
            version_id=None,
        )
        return {"status": "skipped"}

    version_id, meta = result
    n_verdicts = meta.get("n_total", 0)

    eval_result = shadow_eval(version_id, meta)
    if eval_result is None:
        _persist_run(
            n_verdicts=n_verdicts,
            status="trained_no_eval",
            ndcg_at_5=None,
            map_at_10=None,
            ci_lower=None,
            promoted=False,
            version_id=version_id,
        )
        return {"status": "trained_no_eval", "version_id": version_id}

    promoted = promote_if_eligible(version_id, eval_result)
    _sentry_breadcrumb(
        "run_auto_train_pipeline: completed",
        {"status": "promoted" if promoted else "shadow", "ndcg_at_5": eval_result.get("ndcg_at_5")},
    )
    _persist_run(
        n_verdicts=n_verdicts,
        status="promoted" if promoted else "shadow",
        ndcg_at_5=eval_result.get("ndcg_at_5"),
        map_at_10=eval_result.get("map_at_10"),
        ci_lower=eval_result.get("ci_lower"),
        promoted=promoted,
        version_id=version_id,
    )
    return {
        "status": "promoted" if promoted else "shadow",
        "version_id": version_id,
        "ndcg_at_5": eval_result.get("ndcg_at_5"),
        "ci_lower": eval_result.get("ci_lower"),
        "promoted": promoted,
    }


def evaluate_active_model() -> Optional[dict]:
    """Evaluate the currently active model on fresh data (nightly cron job).

    Re-scores the test split with the active model and logs results.
    Returns eval dict or None if no active model / insufficient data.
    """
    from scoring.registry import ModelRegistry

    registry = ModelRegistry()
    active = registry.get_active("search_layer_c")
    if active is None:
        log.info("evaluate_active_model: no active model found")
        return None

    dataset = build_dataset_from_verdicts_safe()
    if dataset is None:
        return None

    _, _, meta = dataset
    meta["_trained_model"] = _load_model_for_eval(active)
    if meta["_trained_model"] is None:
        log.warning("evaluate_active_model: could not load model for version_id=%s", active.id)
        return None

    return shadow_eval(active.id, meta)


def build_dataset_from_verdicts_safe():
    """Wrapper that swallows import errors in CI (no Supabase)."""
    try:
        from scoring.trainer import build_dataset_from_verdicts
        return build_dataset_from_verdicts(min_n=50)
    except Exception:
        log.exception("build_dataset_from_verdicts_safe: failed")
        return None


def _load_model_for_eval(active_version):
    """Load LightGBM model from GCS or return None (dev mode)."""
    if not active_version.gcs_path:
        return None
    bucket_name = os.environ.get("LGBM_MODEL_GCS_BUCKET", "")
    if not bucket_name:
        return None
    try:
        from google.cloud import storage as gcs  # type: ignore
        client = gcs.Client()
        # Parse gs://bucket/path
        path = active_version.gcs_path.replace(f"gs://{bucket_name}/", "")
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(path)
        model_bytes = blob.download_as_bytes()
        return pickle.loads(model_bytes)  # noqa: S301 — trusted internal GCS artifact
    except Exception:
        log.exception("_load_model_for_eval: failed to load from GCS")
        return None
