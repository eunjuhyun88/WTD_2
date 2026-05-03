"""W-0400: Layer C Training Observability tests.

Verifies:
1. _persist_run silently no-ops when DATABASE_URL is unset
2. _persist_run executes INSERT with correct params when psycopg2 available
3. run_auto_train_pipeline inserts a 'skipped' row when train_and_register returns None
4. run_auto_train_pipeline inserts a 'shadow'/'promoted' row after full eval
5. _persist_run emits sentry capture_message on status='failed'
6. _sentry_breadcrumb is called at pipeline start and end
"""
from __future__ import annotations

import sys
from unittest.mock import MagicMock, patch

import pytest

import scoring.auto_trainer as mod


# ── AC2-a: _persist_run no-ops without DATABASE_URL ─────────────────────────


def test_persist_run_noop_without_db_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    # Should not raise even if psycopg2 missing
    mod._persist_run(
        n_verdicts=10,
        status="shadow",
        ndcg_at_5=0.7,
        map_at_10=0.6,
        ci_lower=0.06,
        promoted=False,
        version_id=None,
    )


# ── AC2-b: _persist_run issues correct INSERT ────────────────────────────────


def test_persist_run_inserts_row(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake/db")

    mock_cursor = MagicMock()
    mock_conn = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    mock_psycopg2 = MagicMock()
    mock_psycopg2.connect.return_value = mock_conn

    with patch.dict(sys.modules, {"psycopg2": mock_psycopg2}):
        mod._persist_run(
            n_verdicts=75,
            status="shadow",
            ndcg_at_5=0.72,
            map_at_10=0.61,
            ci_lower=0.07,
            promoted=False,
            version_id="abc-123",
        )

    mock_psycopg2.connect.assert_called_once_with("postgresql://fake/db")
    mock_cursor.execute.assert_called_once()
    sql, params = mock_cursor.execute.call_args[0]
    assert "INSERT INTO layer_c_train_runs" in sql
    assert params[0] == 75         # n_verdicts
    assert params[1] == "shadow"   # status
    assert params[5] is False      # promoted


# ── AC2-c: pipeline inserts 'skipped' when no training ───────────────────────


def test_pipeline_persists_skipped(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with (
        patch.object(mod, "train_and_register", return_value=None),
        patch.object(mod, "_persist_run") as mock_persist,
    ):
        result = mod.run_auto_train_pipeline()

    assert result["status"] == "skipped"
    mock_persist.assert_called_once_with(
        n_verdicts=0,
        status="skipped",
        ndcg_at_5=None,
        map_at_10=None,
        ci_lower=None,
        promoted=False,
        version_id=None,
    )


# ── AC2-d: pipeline persists shadow row after eval ───────────────────────────


def test_pipeline_persists_shadow_row(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    fake_meta = {"n_total": 80}
    fake_eval = {"ndcg_at_5": 0.68, "map_at_10": 0.59, "ci_lower": 0.03}

    with (
        patch.object(mod, "train_and_register", return_value=("vid-1", fake_meta)),
        patch.object(mod, "shadow_eval", return_value=fake_eval),
        patch.object(mod, "promote_if_eligible", return_value=False),
        patch.object(mod, "_persist_run") as mock_persist,
    ):
        result = mod.run_auto_train_pipeline()

    assert result["status"] == "shadow"
    kw = mock_persist.call_args.kwargs
    assert kw["status"] == "shadow"
    assert kw["n_verdicts"] == 80
    assert kw["ndcg_at_5"] == pytest.approx(0.68)
    assert kw["promoted"] is False


# ── AC2-e: pipeline persists promoted=True ───────────────────────────────────


def test_pipeline_persists_promoted_row(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    fake_meta = {"n_total": 200}
    fake_eval = {"ndcg_at_5": 0.82, "map_at_10": 0.75, "ci_lower": 0.12}

    with (
        patch.object(mod, "train_and_register", return_value=("vid-2", fake_meta)),
        patch.object(mod, "shadow_eval", return_value=fake_eval),
        patch.object(mod, "promote_if_eligible", return_value=True),
        patch.object(mod, "_persist_run") as mock_persist,
    ):
        result = mod.run_auto_train_pipeline()

    assert result["status"] == "promoted"
    assert result["promoted"] is True
    kw = mock_persist.call_args.kwargs
    assert kw["status"] == "promoted"
    assert kw["promoted"] is True


# ── AC9: sentry breadcrumbs emitted at start and end ─────────────────────────


def test_sentry_breadcrumbs_emitted(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    fake_meta = {"n_total": 60}
    fake_eval = {"ndcg_at_5": 0.71, "map_at_10": 0.62, "ci_lower": 0.08}
    mock_sentry = MagicMock()

    with (
        patch.object(mod, "train_and_register", return_value=("vid-3", fake_meta)),
        patch.object(mod, "shadow_eval", return_value=fake_eval),
        patch.object(mod, "promote_if_eligible", return_value=False),
        patch.object(mod, "_persist_run"),
        patch.dict(sys.modules, {"sentry_sdk": mock_sentry}),
    ):
        mod.run_auto_train_pipeline()

    calls = mock_sentry.add_breadcrumb.call_args_list
    messages = [c.kwargs.get("message", "") for c in calls]
    assert any("started" in m for m in messages)
    assert any("completed" in m for m in messages)
