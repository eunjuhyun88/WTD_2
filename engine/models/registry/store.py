"""Model store — versioned persistence with manifest tracking.

Wraps the existing pickle-based model storage with a manifest layer.
Each model version gets: {version}.pkl + {version}.manifest.json
A manifest.jsonl file maintains the full history for comparison.
"""
from __future__ import annotations

import json
import logging
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from models.registry.manifest import ModelManifest

log = logging.getLogger("engine.model_registry")

_MODELS_ROOT = Path(__file__).parent.parent.parent / "models" / "lgbm"


class ModelStore:
    """Versioned model storage per user_id."""

    def __init__(self, user_id: str = "global") -> None:
        self.user_id = user_id
        self._dir = _MODELS_ROOT / user_id
        self._dir.mkdir(parents=True, exist_ok=True)

    def save_model(
        self,
        model: Any,
        manifest: ModelManifest,
    ) -> Path:
        """Persist model artifact + manifest. Returns artifact path."""
        version = manifest.version
        artifact_path = self._dir / f"{version}.pkl"
        manifest_path = self._dir / f"{version}.manifest.json"

        with open(artifact_path, "wb") as f:
            pickle.dump(model, f)

        manifest.artifact_path = str(artifact_path)
        with open(manifest_path, "w") as f:
            f.write(manifest.to_json())

        self._append_history(manifest)

        # Update latest symlink (copy, not actual symlink for portability)
        latest_pkl = self._dir / "latest.pkl"
        with open(latest_pkl, "wb") as f:
            pickle.dump({"model": model, "auc": manifest.auc, "version": version}, f)

        log.info("Model %s saved: auc=%.4f samples=%d", version, manifest.auc, manifest.n_samples)
        return artifact_path

    def load_model(self, version: str) -> tuple[Any, Optional[ModelManifest]]:
        """Load a specific model version. Returns (model, manifest)."""
        artifact_path = self._dir / f"{version}.pkl"
        manifest_path = self._dir / f"{version}.manifest.json"

        if not artifact_path.exists():
            raise FileNotFoundError(f"Model {version} not found at {artifact_path}")

        with open(artifact_path, "rb") as f:
            model = pickle.load(f)

        manifest = None
        if manifest_path.exists():
            with open(manifest_path) as f:
                manifest = ModelManifest.from_json(f.read())

        return model, manifest

    def load_latest(self) -> tuple[Any, Optional[ModelManifest]]:
        """Load the latest model (backward-compatible with existing pickle format)."""
        latest_pkl = self._dir / "latest.pkl"
        if not latest_pkl.exists():
            return None, None

        with open(latest_pkl, "rb") as f:
            data = pickle.load(f)

        model = data if not isinstance(data, dict) else data.get("model", data)
        version = data.get("version") if isinstance(data, dict) else None

        manifest = None
        if version:
            manifest_path = self._dir / f"{version}.manifest.json"
            if manifest_path.exists():
                with open(manifest_path) as f:
                    manifest = ModelManifest.from_json(f.read())

        return model, manifest

    def list_versions(self) -> list[ModelManifest]:
        """List all stored model manifests, newest first."""
        history_path = self._dir / "manifest.jsonl"
        if not history_path.exists():
            return []

        manifests = []
        with open(history_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        manifests.append(ModelManifest.from_dict(json.loads(line)))
                    except Exception:
                        continue
        manifests.sort(key=lambda m: m.created_at, reverse=True)
        return manifests

    def compare(self, version_a: str, version_b: str) -> dict:
        """Compare two model versions by their manifest metrics."""
        manifests = {m.version: m for m in self.list_versions()}
        a = manifests.get(version_a)
        b = manifests.get(version_b)
        if not a or not b:
            missing = []
            if not a:
                missing.append(version_a)
            if not b:
                missing.append(version_b)
            raise ValueError(f"Manifest not found for: {missing}")

        return {
            "version_a": version_a,
            "version_b": version_b,
            "auc_diff": a.auc - b.auc,
            "sample_diff": a.n_samples - b.n_samples,
            "feature_set_changed": a.feature_set_fingerprint != b.feature_set_fingerprint,
            "a": a.to_dict(),
            "b": b.to_dict(),
        }

    def _append_history(self, manifest: ModelManifest) -> None:
        history_path = self._dir / "manifest.jsonl"
        with open(history_path, "a") as f:
            f.write(json.dumps(manifest.to_dict(), default=str) + "\n")
