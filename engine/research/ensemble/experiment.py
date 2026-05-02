"""Experiment context manager — auto-captures params, metrics, and artifacts.

Usage:
    with Experiment("improve-momentum-features") as exp:
        exp.log_params({"feature_set": "v12", "n_splits": 5})
        model = engine.train(X, y)
        exp.log_metrics({"auc": 0.75, "fold_aucs": [0.73, 0.77]})
        exp.log_artifact("model", model_path)
        exp.log_notes("Tried removing RSI7 — no significant change.")
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

from research.artifacts.tracker import ExperimentTracker

log = logging.getLogger("engine.research.experiment")


class Experiment:
    """Context manager for structured experiment tracking."""

    def __init__(
        self,
        name: str,
        tracker: Optional[ExperimentTracker] = None,
    ) -> None:
        self.name = name
        self._tracker = tracker or ExperimentTracker()
        self._params: dict[str, Any] = {}
        self._metrics: dict[str, Any] = {}
        self._artifacts: dict[str, Path] = {}
        self._notes: str = ""
        self._result_dir: Optional[Path] = None

    def __enter__(self) -> Experiment:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type is not None:
            self._metrics["error"] = str(exc_val)
            self._metrics["status"] = "failed"
        else:
            self._metrics.setdefault("status", "completed")

        self._result_dir = self._tracker.log_experiment(
            name=self.name,
            params=self._params,
            metrics=self._metrics,
            artifacts=self._artifacts if self._artifacts else None,
            notes=self._notes,
        )
        log.info("Experiment '%s' saved to %s", self.name, self._result_dir)

    def log_params(self, params: dict[str, Any]) -> None:
        self._params.update(params)

    def log_metrics(self, metrics: dict[str, Any]) -> None:
        self._metrics.update(metrics)

    def log_artifact(self, label: str, path: Path | str) -> None:
        self._artifacts[label] = Path(path)

    def log_notes(self, notes: str) -> None:
        self._notes = notes

    @property
    def result_dir(self) -> Optional[Path]:
        return self._result_dir
