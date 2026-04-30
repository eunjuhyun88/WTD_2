"""W-0317: Tests for validate_and_gate() facade and HypothesisRegistryStore.

Tests use monkeypatch to avoid real Supabase and real pipeline calls.
AC1: strict + G1 fail → overall_pass=False
AC2: shadow + G1 fail → overall_pass=True
AC3: facade exception → overall_pass=False, no raise
AC4: registry failure does not block validation result
AC5: per-family n_trials isolation
AC6: VALIDATION_PIPELINE_ENABLED=false → overall_pass=False
AC7: invalid VALIDATION_STAGE → fallback to shadow
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_pack(slug: str = "test-slug"):
    """Minimal ReplayBenchmarkPack stub."""
    pack = MagicMock()
    pack.pattern_slug = slug
    pack.cases = []
    return pack


def _make_gate_result(overall_pass: bool):
    from research.validation.gates import GateV2Result
    r = GateV2Result(existing_pass=True, overall_pass=overall_pass, reason="")
    return r


def _make_report(pass_rate: float = 0.8):
    from research.validation.pipeline import ValidationReport
    r = MagicMock(spec=ValidationReport)
    r.overall_pass_rate = pass_rate
    r.f1_kill = pass_rate == 0.0
    r.fold_pass_count = 3
    r.horizon_reports = []
    return r


# ---------------------------------------------------------------------------
# AC1: strict stage, gate fail → overall_pass=False
# ---------------------------------------------------------------------------

def test_strict_gate_fail_blocks(monkeypatch):
    monkeypatch.setenv("VALIDATION_STAGE", "strict")
    monkeypatch.setenv("VALIDATION_PIPELINE_ENABLED", "true")

    with (
        patch("research.validation.facade.run_validation_pipeline", return_value=_make_report()),
        patch("research.validation.facade.evaluate_gate_v2", return_value=_make_gate_result(False)),
        patch("research.validation.facade.HypothesisRegistryStore") as MockStore,
    ):
        MockStore.return_value.get_n_trials.return_value = 5
        MockStore.return_value.register.return_value = "uuid-123"

        from research.validation.facade import validate_and_gate
        result = validate_and_gate("slug-a", _make_pack(), family="btcusdt_4h")

    assert result.overall_pass is False
    assert result.stage == "strict"
    assert result.error is None


# ---------------------------------------------------------------------------
# AC2: shadow stage, gate fail → overall_pass=True (observe only)
# ---------------------------------------------------------------------------

def test_shadow_gate_fail_passes(monkeypatch):
    monkeypatch.setenv("VALIDATION_STAGE", "shadow")
    monkeypatch.setenv("VALIDATION_PIPELINE_ENABLED", "true")

    with (
        patch("research.validation.facade.run_validation_pipeline", return_value=_make_report(0.0)),
        patch("research.validation.facade.evaluate_gate_v2", return_value=_make_gate_result(False)),
        patch("research.validation.facade.HypothesisRegistryStore") as MockStore,
    ):
        MockStore.return_value.get_n_trials.return_value = 0
        MockStore.return_value.register.return_value = "uuid-shadow"

        from research.validation.facade import validate_and_gate
        result = validate_and_gate("slug-b", _make_pack(), family="ethusdt_1d")

    assert result.overall_pass is True
    assert result.stage == "shadow"


# ---------------------------------------------------------------------------
# AC3: pipeline exception → overall_pass=False, no raise
# ---------------------------------------------------------------------------

def test_pipeline_exception_fail_closed(monkeypatch):
    monkeypatch.setenv("VALIDATION_STAGE", "strict")
    monkeypatch.setenv("VALIDATION_PIPELINE_ENABLED", "true")

    with patch("research.validation.facade.run_validation_pipeline", side_effect=RuntimeError("boom")):
        from research.validation.facade import validate_and_gate
        result = validate_and_gate("slug-crash", _make_pack())

    assert result.overall_pass is False
    assert result.error is not None
    assert "boom" in result.error


# ---------------------------------------------------------------------------
# AC4: registry failure does NOT block validation result
# ---------------------------------------------------------------------------

def test_registry_failure_does_not_block(monkeypatch):
    monkeypatch.setenv("VALIDATION_STAGE", "strict")
    monkeypatch.setenv("VALIDATION_PIPELINE_ENABLED", "true")

    with (
        patch("research.validation.facade.run_validation_pipeline", return_value=_make_report()),
        patch("research.validation.facade.evaluate_gate_v2", return_value=_make_gate_result(True)),
        patch("research.validation.facade.HypothesisRegistryStore") as MockStore,
    ):
        MockStore.return_value.get_n_trials.side_effect = Exception("DB down")
        MockStore.return_value.register.side_effect = Exception("DB down")

        from research.validation.facade import validate_and_gate
        result = validate_and_gate("slug-db-fail", _make_pack())

    assert result.overall_pass is True  # gate passed, registry failure ignored
    assert result.hypothesis_id is None  # not registered but no crash


# ---------------------------------------------------------------------------
# AC5: VALIDATION_PIPELINE_ENABLED=false → overall_pass=False
# ---------------------------------------------------------------------------

def test_disabled_flag(monkeypatch):
    monkeypatch.setenv("VALIDATION_PIPELINE_ENABLED", "false")
    monkeypatch.setenv("VALIDATION_STAGE", "strict")

    from research.validation.facade import validate_and_gate
    result = validate_and_gate("slug-disabled", _make_pack())

    assert result.overall_pass is False
    assert result.error == "VALIDATION_PIPELINE_ENABLED=false"


# ---------------------------------------------------------------------------
# AC6: invalid VALIDATION_STAGE → fallback to shadow behaviour
# ---------------------------------------------------------------------------

def test_invalid_stage_fallback(monkeypatch):
    monkeypatch.setenv("VALIDATION_STAGE", "garbage_value")
    monkeypatch.setenv("VALIDATION_PIPELINE_ENABLED", "true")

    with (
        patch("research.validation.facade.run_validation_pipeline", return_value=_make_report()),
        patch("research.validation.facade.evaluate_gate_v2", return_value=_make_gate_result(False)),
        patch("research.validation.facade.HypothesisRegistryStore") as MockStore,
    ):
        MockStore.return_value.get_n_trials.return_value = 0
        MockStore.return_value.register.return_value = "x"

        from research.validation.facade import validate_and_gate
        result = validate_and_gate("slug-inv", _make_pack())

    assert result.stage == "shadow"
    assert result.overall_pass is True  # shadow pass-through


# ---------------------------------------------------------------------------
# AC7: soft stage, gate fail → overall_pass=True (warn but don't block)
# ---------------------------------------------------------------------------

def test_soft_gate_fail_passes(monkeypatch):
    monkeypatch.setenv("VALIDATION_STAGE", "soft")
    monkeypatch.setenv("VALIDATION_PIPELINE_ENABLED", "true")

    with (
        patch("research.validation.facade.run_validation_pipeline", return_value=_make_report()),
        patch("research.validation.facade.evaluate_gate_v2", return_value=_make_gate_result(False)),
        patch("research.validation.facade.HypothesisRegistryStore") as MockStore,
    ):
        MockStore.return_value.get_n_trials.return_value = 2
        MockStore.return_value.register.return_value = "uuid-soft"

        from research.validation.facade import validate_and_gate
        result = validate_and_gate("slug-soft", _make_pack())

    assert result.overall_pass is True
    assert result.stage == "soft"


# ---------------------------------------------------------------------------
# AC8: GatedValidationResult.to_dict() schema
# ---------------------------------------------------------------------------

def test_result_to_dict_fields(monkeypatch):
    monkeypatch.setenv("VALIDATION_STAGE", "shadow")
    monkeypatch.setenv("VALIDATION_PIPELINE_ENABLED", "true")

    with (
        patch("research.validation.facade.run_validation_pipeline", return_value=_make_report()),
        patch("research.validation.facade.evaluate_gate_v2", return_value=_make_gate_result(True)),
        patch("research.validation.facade.HypothesisRegistryStore") as MockStore,
    ):
        MockStore.return_value.get_n_trials.return_value = 7
        MockStore.return_value.register.return_value = "uuid-dict"

        from research.validation.facade import validate_and_gate
        result = validate_and_gate("slug-dict", _make_pack(), family="solusdt_4h")

    d = result.to_dict()
    assert d["slug"] == "slug-dict"
    assert d["family"] == "solusdt_4h"
    assert d["dsr_n_trials"] == 7
    assert "computed_at" in d
    assert "overall_pass" in d
    assert "stage" in d


# ---------------------------------------------------------------------------
# Hypothesis registry store unit tests (mock Supabase client)
# ---------------------------------------------------------------------------

def _mock_sb(count: int = 3, inserted_id: str = "uuid-reg"):
    sb = MagicMock()
    # INSERT mock
    insert_resp = MagicMock()
    insert_resp.data = [{"id": inserted_id}]
    sb.table.return_value.insert.return_value.execute.return_value = insert_resp
    # COUNT mock
    count_resp = MagicMock()
    count_resp.count = count
    (sb.table.return_value
       .select.return_value
       .eq.return_value
       .gt.return_value
       .execute.return_value) = count_resp
    # DELETE mock
    delete_resp = MagicMock()
    delete_resp.data = [{"id": "x"}] * count
    sb.table.return_value.delete.return_value.lt.return_value.execute.return_value = delete_resp
    return sb


def test_registry_register_returns_id():
    from research.validation.hypothesis_registry_store import HypothesisRegistryStore
    store = HypothesisRegistryStore()
    with patch("research.validation.hypothesis_registry_store._client", return_value=_mock_sb(inserted_id="abc-123")):
        hid = store.register("slug-x", "btcusdt_4h", True, "shadow")
    assert hid == "abc-123"


def test_registry_get_n_trials():
    from research.validation.hypothesis_registry_store import HypothesisRegistryStore
    store = HypothesisRegistryStore()
    with patch("research.validation.hypothesis_registry_store._client", return_value=_mock_sb(count=12)):
        n = store.get_n_trials("btcusdt_4h")
    assert n == 12


def test_registry_purge_returns_count():
    from research.validation.hypothesis_registry_store import HypothesisRegistryStore
    store = HypothesisRegistryStore()
    with patch("research.validation.hypothesis_registry_store._client", return_value=_mock_sb(count=5)):
        deleted = store.purge_expired()
    assert deleted == 5
