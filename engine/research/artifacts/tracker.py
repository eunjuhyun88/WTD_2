"""JSONL-based experiment tracker — lightweight, no external dependencies.

Each experiment run produces a directory under the configured output root:
    {output_root}/{timestamp}-{name}/
        params.json   — hyperparameters, feature set, dataset info
        metrics.json  — evaluation metrics (AUC, fold scores, etc.)
        artifacts/    — model files, plots, etc. (optional)
        notes.md      — freeform notes (optional)

A global experiment log is appended to {output_root}/experiment_log.jsonl
for easy querying across all experiments.
"""
from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

log = logging.getLogger("engine.research.tracker")

_DEFAULT_OUTPUT_ROOT = Path(__file__).parent.parent.parent / "research" / "experiments"


class ExperimentTracker:
    """Append-only JSONL tracker for experiment runs."""

    def __init__(self, output_root: Optional[Path] = None) -> None:
        self.output_root = output_root or _DEFAULT_OUTPUT_ROOT
        self.output_root.mkdir(parents=True, exist_ok=True)

    def log_experiment(
        self,
        name: str,
        params: dict,
        metrics: dict,
        artifacts: Optional[dict[str, Path]] = None,
        notes: str = "",
    ) -> Path:
        """Record a completed experiment. Returns the experiment directory."""
        ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
        slug = name.replace(" ", "-").lower()[:40]
        exp_dir = self.output_root / f"{ts}-{slug}"
        exp_dir.mkdir(parents=True, exist_ok=True)

        with open(exp_dir / "params.json", "w") as f:
            json.dump(params, f, indent=2, default=str)

        with open(exp_dir / "metrics.json", "w") as f:
            json.dump(metrics, f, indent=2, default=str)

        if artifacts:
            art_dir = exp_dir / "artifacts"
            art_dir.mkdir(exist_ok=True)
            for label, src_path in artifacts.items():
                if src_path.exists():
                    dest = art_dir / f"{label}{src_path.suffix}"
                    shutil.copy2(src_path, dest)

        if notes:
            with open(exp_dir / "notes.md", "w") as f:
                f.write(notes)

        entry = {
            "timestamp": ts,
            "name": name,
            "params": params,
            "metrics": metrics,
            "artifacts": list(artifacts.keys()) if artifacts else [],
            "dir": str(exp_dir),
        }
        log_path = self.output_root / "experiment_log.jsonl"
        with open(log_path, "a") as f:
            f.write(json.dumps(entry, default=str) + "\n")

        log.info("Experiment logged: %s -> %s", name, exp_dir)
        return exp_dir

    def list_experiments(self, limit: int = 20) -> list[dict]:
        """Read recent experiments from the log. Returns newest first."""
        log_path = self.output_root / "experiment_log.jsonl"
        if not log_path.exists():
            return []

        entries = []
        with open(log_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

        entries.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
        return entries[:limit]

    def get_experiment(self, dir_name: str) -> Optional[dict]:
        """Load params + metrics for a specific experiment directory."""
        exp_dir = self.output_root / dir_name
        if not exp_dir.is_dir():
            return None

        result: dict[str, Any] = {"dir": str(exp_dir)}
        for fname in ("params.json", "metrics.json"):
            fpath = exp_dir / fname
            if fpath.exists():
                with open(fpath) as f:
                    result[fname.replace(".json", "")] = json.load(f)

        notes_path = exp_dir / "notes.md"
        if notes_path.exists():
            result["notes"] = notes_path.read_text()

        return result
