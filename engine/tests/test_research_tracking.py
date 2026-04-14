from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from research.experiment import Experiment
from research.tracker import ExperimentTracker


def test_tracker_log_and_read(tmp_path: Path) -> None:
    tracker = ExperimentTracker(output_root=tmp_path / "experiments")
    exp_dir = tracker.log_experiment(
        name="test-exp",
        params={"a": 1},
        metrics={"auc": 0.71},
        notes="ok",
    )
    assert exp_dir.exists()
    assert (exp_dir / "params.json").exists()
    assert (exp_dir / "metrics.json").exists()

    rows = tracker.list_experiments(limit=5)
    assert len(rows) == 1
    assert rows[0]["name"] == "test-exp"

    loaded = tracker.get_experiment(exp_dir.name)
    assert loaded is not None
    assert loaded["params"]["a"] == 1
    assert loaded["metrics"]["auc"] == 0.71


def test_experiment_context_manager(tmp_path: Path) -> None:
    tracker = ExperimentTracker(output_root=tmp_path / "experiments")
    with Experiment("ctx-exp", tracker=tracker) as exp:
        exp.log_params({"seed": 42})
        exp.log_metrics({"auc": 0.75})
        exp.log_notes("hello")

    rows = tracker.list_experiments(limit=5)
    assert rows
    assert rows[0]["name"] == "ctx-exp"
    exp_dir = Path(rows[0]["dir"])
    assert (exp_dir / "notes.md").exists()

