"""Tests for build_dataset_from_verdicts (graceful degradation + time-split logic)."""
from __future__ import annotations

import json
import math
from typing import Any
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from scoring.trainer import build_dataset_from_verdicts, _DATASET_FEATURES


# ─── Graceful degradation ─────────────────────────────────────────────────────

def test_build_dataset_returns_none_without_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    """No SUPABASE_URL → returns None (graceful fallback for dev/test env)."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    result = build_dataset_from_verdicts(min_n=1)
    assert result is None


def test_build_dataset_returns_none_below_min(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fewer labelled records than min_n → returns None."""
    monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-key")

    # Patch supabase.create_client to return a mock with 5 rows
    rows = _make_fake_rows(n_win=3, n_loss=2)
    mock_client = _make_mock_client(rows)

    with patch("scoring.trainer.create_client", return_value=mock_client, create=True):
        with patch.dict("sys.modules", {"supabase": MagicMock(create_client=lambda *a, **kw: mock_client)}):
            result = build_dataset_from_verdicts(min_n=50)

    assert result is None


# ─── Time-based split ────────────────────────────────────────────────────────

def test_build_dataset_time_split(monkeypatch: pytest.MonkeyPatch) -> None:
    """Train/test split is time-based: all test rows have later timestamps than train rows."""
    monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-key")

    # 100 rows with monotonically increasing timestamps
    rows = _make_fake_rows(n_win=50, n_loss=50, start_ts_ms=1_000_000)
    mock_client = _make_mock_client(rows)

    import supabase as sb_module  # noqa: F401 (may not exist in CI — use mock)

    with patch.dict(
        "sys.modules",
        {"supabase": MagicMock(create_client=lambda *a, **kw: mock_client)},
    ):
        result = build_dataset_from_verdicts(min_n=50)

    assert result is not None, "Expected dataset for 100 labelled rows"
    X, y, meta = result

    assert X.shape == (100, len(_DATASET_FEATURES))
    assert y.shape == (100,)
    assert meta["n_total"] == 100
    assert meta["n_train"] == 80
    assert meta["n_test"] == 20

    # Verify time-ordering is preserved
    X_train = meta["X_train"]
    X_test = meta["X_test"]
    y_train = meta["y_train"]
    y_test = meta["y_test"]
    assert len(X_train) == 80
    assert len(X_test) == 20
    assert len(y_train) == 80
    assert len(y_test) == 20

    # split_at_ms should exist and be numeric
    assert meta["split_at_ms"] is not None
    assert isinstance(meta["split_at_ms"], (int, float))


def test_build_dataset_feature_names(monkeypatch: pytest.MonkeyPatch) -> None:
    """meta['feature_names'] matches _DATASET_FEATURES constant."""
    monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-key")

    rows = _make_fake_rows(n_win=30, n_loss=30, start_ts_ms=1_000_000)
    mock_client = _make_mock_client(rows)

    with patch.dict(
        "sys.modules",
        {"supabase": MagicMock(create_client=lambda *a, **kw: mock_client)},
    ):
        result = build_dataset_from_verdicts(min_n=50)

    assert result is not None
    _, _, meta = result
    assert meta["feature_names"] == _DATASET_FEATURES


def test_build_dataset_labels_are_binary(monkeypatch: pytest.MonkeyPatch) -> None:
    """All labels are 0 or 1 (int8)."""
    monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-key")

    rows = _make_fake_rows(n_win=40, n_loss=40, start_ts_ms=1_000_000)
    mock_client = _make_mock_client(rows)

    with patch.dict(
        "sys.modules",
        {"supabase": MagicMock(create_client=lambda *a, **kw: mock_client)},
    ):
        result = build_dataset_from_verdicts(min_n=50)

    assert result is not None
    _, y, _ = result
    unique = set(y.tolist())
    assert unique <= {0, 1}, f"Labels should be binary, got {unique}"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_fake_rows(
    n_win: int,
    n_loss: int,
    start_ts_ms: int = 1_000_000,
) -> list[dict[str, Any]]:
    """Generate fake capture_records rows for testing."""
    rows = []
    ts = start_ts_ms
    for i in range(n_win):
        rows.append({
            "id": f"win-{i}",
            "captured_at_ms": ts,
            "feature_snapshot_json": json.dumps({
                "cosine_sim": 0.8,
                "time_decay": 0.9,
                "sector_match": 1.0,
                "regime_match": 0.7,
            }),
            "research_context_json": json.dumps({
                "outcome": "WIN",
                "rr": 2.5,
                "hold_minutes": 45.0,
            }),
            "outcome_id": f"outcome-win-{i}",
            "verdict_id": None,
        })
        ts += 1000

    for i in range(n_loss):
        rows.append({
            "id": f"loss-{i}",
            "captured_at_ms": ts,
            "feature_snapshot_json": json.dumps({
                "cosine_sim": 0.4,
                "time_decay": 0.5,
                "sector_match": 0.0,
                "regime_match": 0.3,
            }),
            "research_context_json": json.dumps({
                "outcome": "LOSS",
                "rr": 1.0,
                "hold_minutes": 20.0,
            }),
            "outcome_id": f"outcome-loss-{i}",
            "verdict_id": None,
        })
        ts += 1000

    return rows


def _make_mock_client(rows: list[dict]) -> MagicMock:
    """Return a mock Supabase client that returns the given rows."""
    execute_result = MagicMock()
    execute_result.data = rows

    # Build a fluent chain mock: client.table(...).select(...).not_...order(...).limit(...).execute()
    chain = MagicMock()
    chain.execute.return_value = execute_result
    chain.select.return_value = chain
    chain.not_ = chain
    chain.is_.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.not_.is_.return_value = chain

    mock_client = MagicMock()
    mock_client.table.return_value = chain
    return mock_client
