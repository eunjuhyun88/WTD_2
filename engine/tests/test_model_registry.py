"""Tests for models.registry — manifest and versioned store."""
from __future__ import annotations

import json
import numpy as np
import pytest
from pathlib import Path

from models.registry.manifest import ModelManifest
from models.registry.store import ModelStore


class TestModelManifest:
    def test_roundtrip_json(self):
        m = ModelManifest(
            version="20260414_120000",
            user_id="global",
            created_at="2026-04-14T12:00:00Z",
            n_samples=500,
            n_features=103,
            auc=0.72,
            fold_aucs=[0.70, 0.71, 0.73, 0.74, 0.72],
        )
        json_str = m.to_json()
        restored = ModelManifest.from_json(json_str)
        assert restored.version == m.version
        assert restored.auc == m.auc
        assert restored.fold_aucs == m.fold_aucs
        assert restored.n_samples == 500

    def test_dataset_hash_deterministic(self):
        X = np.random.default_rng(42).random((100, 10))
        y = np.random.default_rng(42).integers(0, 2, 100)
        h1 = ModelManifest.compute_dataset_hash(X, y)
        h2 = ModelManifest.compute_dataset_hash(X, y)
        assert h1 == h2
        assert len(h1) == 16

    def test_dataset_hash_changes(self):
        rng = np.random.default_rng(42)
        X = rng.random((100, 10))
        y = rng.integers(0, 2, 100)
        h1 = ModelManifest.compute_dataset_hash(X, y)
        X[0, 0] += 1.0
        h2 = ModelManifest.compute_dataset_hash(X, y)
        assert h1 != h2


class _FakeModel:
    """Picklable stand-in for a trained model."""
    def predict_proba(self, X):
        return np.array([[0.3, 0.7]])


class TestModelStore:
    def test_save_and_load(self, tmp_path, monkeypatch):
        monkeypatch.setattr("models.registry.store._MODELS_ROOT", tmp_path)
        store = ModelStore("test_user")

        manifest = ModelManifest(
            version="v001",
            user_id="test_user",
            created_at="2026-04-14T12:00:00Z",
            n_samples=100,
            auc=0.75,
        )
        path = store.save_model(_FakeModel(), manifest)
        assert path.exists()

        model, loaded_manifest = store.load_model("v001")
        assert model is not None
        assert loaded_manifest is not None
        assert loaded_manifest.auc == 0.75
        assert loaded_manifest.version == "v001"

    def test_list_versions(self, tmp_path, monkeypatch):
        monkeypatch.setattr("models.registry.store._MODELS_ROOT", tmp_path)
        store = ModelStore("test_user")

        for i, auc in enumerate([0.70, 0.72, 0.75]):
            m = ModelManifest(
                version=f"v00{i}",
                user_id="test_user",
                created_at=f"2026-04-{14+i}T12:00:00Z",
                auc=auc,
            )
            store.save_model(_FakeModel(), m)

        versions = store.list_versions()
        assert len(versions) == 3
        assert versions[0].created_at > versions[-1].created_at

    def test_compare(self, tmp_path, monkeypatch):
        monkeypatch.setattr("models.registry.store._MODELS_ROOT", tmp_path)
        store = ModelStore("test_user")

        for v, auc, fp in [("v1", 0.70, "abc"), ("v2", 0.75, "def")]:
            m = ModelManifest(
                version=v, user_id="test_user", created_at="2026-04-14",
                auc=auc, feature_set_fingerprint=fp,
            )
            store.save_model(_FakeModel(), m)

        result = store.compare("v2", "v1")
        assert result["auc_diff"] == pytest.approx(0.05)
        assert result["feature_set_changed"] is True

    def test_load_latest_backward_compat(self, tmp_path, monkeypatch):
        """Existing latest.pkl without manifest should still load."""
        monkeypatch.setattr("models.registry.store._MODELS_ROOT", tmp_path)
        user_dir = tmp_path / "legacy_user"
        user_dir.mkdir()

        import pickle
        with open(user_dir / "latest.pkl", "wb") as f:
            pickle.dump({"model": "fake_model", "auc": 0.65, "version": "old"}, f)

        store = ModelStore("legacy_user")
        model, manifest = store.load_latest()
        assert model == "fake_model"
        assert manifest is None
