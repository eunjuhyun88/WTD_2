"""Tests for engine/research/validation/actuator.py."""
import pytest
from pathlib import Path
from research.validation.actuator import GateV2DecisionStore, apply_gate_v2_decision


def test_save_and_load(tmp_path):
    store = GateV2DecisionStore(store_dir=tmp_path)
    store.save("run-123", overall_pass=True)
    assert store.load("run-123") is True


def test_save_false(tmp_path):
    store = GateV2DecisionStore(store_dir=tmp_path)
    store.save("run-456", overall_pass=False)
    assert store.load("run-456") is False


def test_load_missing_returns_none(tmp_path):
    store = GateV2DecisionStore(store_dir=tmp_path)
    assert store.load("nonexistent") is None


def test_apply_gate_v2_decision(tmp_path, monkeypatch):
    monkeypatch.setenv("GATE_V2_DECISION_DIR", str(tmp_path))
    apply_gate_v2_decision("run-789", overall_pass=True)
    store = GateV2DecisionStore(store_dir=tmp_path)
    assert store.load("run-789") is True
