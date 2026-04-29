"""Health and readiness helpers."""
from __future__ import annotations

from scanner.scheduler import is_running
from scoring.lightgbm_engine import get_engine


def health_payload(version: str) -> dict:
    return {"status": "ok", "version": version}


def readiness_payload(version: str, *, scheduler_enabled: bool, runtime_role: str) -> dict:
    """A7: Tri-state readiness — ok / degraded / fail.

    fail (HTTP 503):
      - scheduler enabled but not running (scheduler crash)

    degraded (HTTP 200 with warnings):
      - LightGBM model not yet trained (normal for beta)

    ok (HTTP 200):
      - everything healthy
    """
    engine = get_engine()
    warnings: list[str] = []
    status = "ok"

    if scheduler_enabled and not is_running():
        status = "fail"
        warnings.append("scheduler_not_running")

    if not engine.is_trained:
        if status == "ok":
            status = "degraded"
        warnings.append("lightgbm_untrained")

    return {
        "status": status,
        "version": version,
        "runtime_role": runtime_role,
        "scheduler_enabled": scheduler_enabled,
        "scheduler_running": is_running(),
        "model_loaded": engine.is_trained,
        "model_version": engine.model_version,
        "warnings": warnings,
    }
