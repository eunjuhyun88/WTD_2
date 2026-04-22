"""Health and readiness helpers."""
from __future__ import annotations

from scanner.scheduler import is_running
from scoring.lightgbm_engine import get_engine


def health_payload(version: str) -> dict:
    return {"status": "ok", "version": version}


def readiness_payload(version: str, *, scheduler_enabled: bool, runtime_role: str) -> dict:
    engine = get_engine()
    return {
        "status": "ready",
        "version": version,
        "runtime_role": runtime_role,
        "scheduler_enabled": scheduler_enabled,
        "scheduler_running": is_running(),
        "model_loaded": engine.is_trained,
        "model_version": engine.model_version,
    }
