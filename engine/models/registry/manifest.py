"""Model manifest — metadata for each trained model version."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


@dataclass
class ModelManifest:
    """Immutable record of a trained model's provenance and performance."""
    version: str
    user_id: str
    created_at: str
    model_type: str = "lightgbm"

    n_samples: int = 0
    n_features: int = 0
    feature_set_fingerprint: str = ""
    dataset_hash: str = ""

    auc: float = 0.0
    fold_aucs: list[float] = field(default_factory=list)
    precision_at_50: Optional[float] = None
    recall_at_50: Optional[float] = None

    parent_version: Optional[str] = None
    replaced_incumbent: bool = False
    training_params: dict = field(default_factory=dict)
    notes: str = ""

    artifact_path: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, default=str)

    @classmethod
    def from_dict(cls, d: dict) -> ModelManifest:
        known_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in d.items() if k in known_fields}
        return cls(**filtered)

    @classmethod
    def from_json(cls, s: str) -> ModelManifest:
        return cls.from_dict(json.loads(s))

    @staticmethod
    def compute_dataset_hash(X, y) -> str:
        """Deterministic hash of training data for reproducibility tracking."""
        import numpy as np
        h = hashlib.sha256()
        h.update(np.ascontiguousarray(X).tobytes())
        h.update(np.ascontiguousarray(y).tobytes())
        return h.hexdigest()[:16]
