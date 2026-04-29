"""gate_v2 decision persistence (W-0284 Phase 2).

PatternSearchRunArtifact is frozen=True and cannot be augmented.
This module uses a JSON sidecar file keyed by research_run_id to
record gate_v2_validated decisions without touching the frozen artifact.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)

_FALLBACK_STORE_DIR = "/tmp/gate_v2_decisions"


def _default_store_dir() -> Path:
    """Resolve store dir at call time so env-var overrides work in tests."""
    return Path(os.environ.get("GATE_V2_DECISION_DIR", _FALLBACK_STORE_DIR))


class GateV2DecisionStore:
    """Sidecar JSON store for gate_v2 pass/fail decisions.

    Keys: research_run_id → {"gate_v2_validated": bool, "overall_pass": bool, ...}
    Storage: one JSON file per decision in GATE_V2_DECISION_DIR.
    """

    def __init__(self, store_dir: Path | None = None) -> None:
        self._dir = store_dir if store_dir is not None else _default_store_dir()
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, research_run_id: str) -> Path:
        return self._dir / f"{research_run_id}_gate_v2.json"

    def save(self, research_run_id: str, overall_pass: bool) -> None:
        data = {
            "research_run_id": research_run_id,
            "gate_v2_validated": overall_pass,
            "overall_pass": overall_pass,
        }
        try:
            self._path(research_run_id).write_text(json.dumps(data))
            log.debug("gate_v2_decision saved: %s → %s", research_run_id, overall_pass)
        except OSError as exc:
            log.warning("gate_v2_decision save failed: %s — %s", research_run_id, exc)

    def load(self, research_run_id: str) -> bool | None:
        """Return gate_v2_validated value, or None if not found."""
        path = self._path(research_run_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text())
            return data.get("gate_v2_validated")
        except (OSError, json.JSONDecodeError) as exc:
            log.warning("gate_v2_decision load failed: %s — %s", research_run_id, exc)
            return None


def apply_gate_v2_decision(research_run_id: str, overall_pass: bool) -> None:
    """Persist gate_v2 pass/fail for a research run."""
    GateV2DecisionStore().save(research_run_id, overall_pass)
