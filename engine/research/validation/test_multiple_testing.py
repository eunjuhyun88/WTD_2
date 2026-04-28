"""Tests for multiple_testing.py (W-0290 Phase 3)."""
from __future__ import annotations

import pytest
from pathlib import Path

from research.validation.multiple_testing import (
    HypothesisRegistry,
    RegisteredHypothesis,
    hierarchical_bh_correct,
    make_hypothesis_id,
)


# ---------------------------------------------------------------------------
# make_hypothesis_id
# ---------------------------------------------------------------------------


class TestMakeHypothesisId:
    def test_stable(self):
        a = make_hypothesis_id("breakout", 4, "mean > 0")
        b = make_hypothesis_id("breakout", 4, "mean > 0")
        assert a == b

    def test_different_inputs_different_ids(self):
        a = make_hypothesis_id("breakout", 4, "mean > 0")
        b = make_hypothesis_id("breakout", 8, "mean > 0")
        c = make_hypothesis_id("retest", 4, "mean > 0")
        assert len({a, b, c}) == 3

    def test_id_is_12_chars(self):
        h_id = make_hypothesis_id("breakout", 4, "mean > 0")
        assert len(h_id) == 12


# ---------------------------------------------------------------------------
# RegisteredHypothesis serialization
# ---------------------------------------------------------------------------


class TestRegisteredHypothesisSerialization:
    def _make(self) -> RegisteredHypothesis:
        return RegisteredHypothesis(
            hypothesis_id="abc123def456",
            pattern_slug="breakout",
            horizon_hours=4,
            label="mean_net_bps > 0",
            alpha=0.05,
            family="breakout",
            filed_at="2026-01-01T00:00:00+00:00",
            is_primary=True,
            p_raw=0.03,
            p_bh=0.045,
            status="rejected",
            n_samples=50,
            tested_at="2026-01-02T00:00:00+00:00",
        )

    def test_round_trip(self):
        h = self._make()
        d = h.to_dict()
        h2 = RegisteredHypothesis.from_dict(d)
        assert h2.hypothesis_id == h.hypothesis_id
        assert h2.p_raw == h.p_raw
        assert h2.status == h.status
        assert h2.n_samples == h.n_samples

    def test_to_dict_has_all_keys(self):
        h = self._make()
        d = h.to_dict()
        for key in ("hypothesis_id", "pattern_slug", "horizon_hours", "label",
                     "alpha", "family", "filed_at", "is_primary",
                     "p_raw", "p_bh", "status", "n_samples", "tested_at"):
            assert key in d


# ---------------------------------------------------------------------------
# HypothesisRegistry — registration
# ---------------------------------------------------------------------------


class TestHypothesisRegistryRegister:
    def test_register_creates_entry(self):
        reg = HypothesisRegistry()
        h = reg.register("breakout", 4, "mean > 0")
        assert h.hypothesis_id is not None
        assert h.status == "pending"

    def test_register_idempotent(self):
        reg = HypothesisRegistry()
        h1 = reg.register("breakout", 4, "mean > 0")
        h2 = reg.register("breakout", 4, "mean > 0")
        assert h1.hypothesis_id == h2.hypothesis_id
        assert len(reg.entries) == 1

    def test_family_defaults_to_pattern_slug(self):
        reg = HypothesisRegistry()
        h = reg.register("my_pattern", 4, "mean > 0")
        assert h.family == "my_pattern"

    def test_family_explicit(self):
        reg = HypothesisRegistry()
        h = reg.register("my_pattern", 4, "mean > 0", family="group_A")
        assert h.family == "group_A"

    def test_is_primary_default_true(self):
        reg = HypothesisRegistry()
        h = reg.register("breakout", 4, "mean > 0")
        assert h.is_primary is True

    def test_secondary_hypothesis(self):
        reg = HypothesisRegistry()
        h = reg.register("breakout", 4, "robustness: first_half", is_primary=False)
        assert h.is_primary is False


# ---------------------------------------------------------------------------
# HypothesisRegistry — record_result
# ---------------------------------------------------------------------------


class TestHypothesisRegistryRecordResult:
    def test_record_sets_p_raw(self):
        reg = HypothesisRegistry()
        h = reg.register("breakout", 4, "mean > 0")
        reg.record_result(h.hypothesis_id, p_raw=0.03, n_samples=50)
        updated = reg.get(h.hypothesis_id)
        assert updated is not None
        assert updated.p_raw == 0.03
        assert updated.n_samples == 50

    def test_insufficient_when_below_min_n(self):
        reg = HypothesisRegistry()
        h = reg.register("breakout", 4, "mean > 0")
        reg.record_result(h.hypothesis_id, p_raw=0.01, n_samples=5, min_n=30)
        updated = reg.get(h.hypothesis_id)
        assert updated is not None
        assert updated.status == "insufficient"

    def test_sufficient_stays_pending(self):
        reg = HypothesisRegistry()
        h = reg.register("breakout", 4, "mean > 0")
        reg.record_result(h.hypothesis_id, p_raw=0.01, n_samples=50, min_n=30)
        updated = reg.get(h.hypothesis_id)
        assert updated is not None
        assert updated.status == "pending"

    def test_unknown_id_raises(self):
        reg = HypothesisRegistry()
        with pytest.raises(KeyError):
            reg.record_result("nonexistent_id", p_raw=0.05, n_samples=50)


# ---------------------------------------------------------------------------
# HypothesisRegistry — run_correction
# ---------------------------------------------------------------------------


class TestHypothesisRegistryRunCorrection:
    def test_low_p_becomes_rejected(self):
        reg = HypothesisRegistry()
        h = reg.register("breakout", 4, "mean > 0")
        reg.record_result(h.hypothesis_id, p_raw=0.001, n_samples=50)
        reg.run_correction()
        updated = reg.get(h.hypothesis_id)
        assert updated is not None
        assert updated.status == "rejected"

    def test_high_p_becomes_not_rejected(self):
        reg = HypothesisRegistry()
        h = reg.register("weak_pat", 4, "mean > 0")
        reg.record_result(h.hypothesis_id, p_raw=0.8, n_samples=50)
        reg.run_correction()
        updated = reg.get(h.hypothesis_id)
        assert updated is not None
        assert updated.status == "not_rejected"

    def test_insufficient_stays_insufficient(self):
        reg = HypothesisRegistry()
        h = reg.register("breakout", 4, "mean > 0")
        reg.record_result(h.hypothesis_id, p_raw=0.001, n_samples=5, min_n=30)
        reg.run_correction()
        updated = reg.get(h.hypothesis_id)
        assert updated is not None
        assert updated.status == "insufficient"

    def test_summary_counts_correct(self):
        reg = HypothesisRegistry()
        h1 = reg.register("p1", 4, "mean > 0")
        h2 = reg.register("p2", 4, "mean > 0")
        reg.record_result(h1.hypothesis_id, p_raw=0.001, n_samples=50)
        reg.record_result(h2.hypothesis_id, p_raw=0.5, n_samples=3, min_n=30)
        reg.run_correction()
        s = reg.summary()
        assert s["total"] == 2
        assert s["insufficient"] == 1


# ---------------------------------------------------------------------------
# YAML persistence
# ---------------------------------------------------------------------------


class TestYamlPersistence:
    def test_save_and_load(self, tmp_path: Path):
        path = tmp_path / "hypotheses.yaml"
        reg = HypothesisRegistry(path)
        h = reg.register("breakout", 4, "mean > 0")
        reg.record_result(h.hypothesis_id, p_raw=0.02, n_samples=50)
        reg.run_correction()
        reg.save()

        reg2 = HypothesisRegistry.load(path)
        assert len(reg2.entries) == 1
        h2 = reg2.get(h.hypothesis_id)
        assert h2 is not None
        assert h2.p_raw == pytest.approx(0.02)
        assert h2.status in ("rejected", "not_rejected")

    def test_save_without_path_raises(self):
        reg = HypothesisRegistry()
        with pytest.raises(RuntimeError):
            reg.save()

    def test_load_nonexistent_file_returns_empty(self, tmp_path: Path):
        path = tmp_path / "missing.yaml"
        reg = HypothesisRegistry(path)
        assert reg.entries == []


# ---------------------------------------------------------------------------
# hierarchical_bh_correct (standalone)
# ---------------------------------------------------------------------------


def _make_h(
    slug: str,
    horizon: int,
    label: str,
    p_raw: float,
    is_primary: bool = True,
    family: str | None = None,
) -> RegisteredHypothesis:
    h_id = make_hypothesis_id(slug, horizon, label)
    return RegisteredHypothesis(
        hypothesis_id=h_id,
        pattern_slug=slug,
        horizon_hours=horizon,
        label=label,
        alpha=0.05,
        family=family or slug,
        filed_at="2026-01-01T00:00:00+00:00",
        is_primary=is_primary,
        p_raw=p_raw,
        status="pending",
        n_samples=50,
    )


class TestHierarchicalBhCorrect:
    def test_empty_input_returns_empty(self):
        assert hierarchical_bh_correct([]) == []

    def test_single_low_p_rejected(self):
        h = _make_h("pat_a", 4, "mean > 0", p_raw=0.001)
        results = hierarchical_bh_correct([h])
        assert results[0].status == "rejected"
        assert results[0].p_bh is not None

    def test_single_high_p_not_rejected(self):
        h = _make_h("pat_b", 4, "mean > 0", p_raw=0.99)
        results = hierarchical_bh_correct([h])
        assert results[0].status == "not_rejected"

    def test_high_p_family_skips_secondary(self):
        """When family fails Level-1, secondary hypotheses are skipped."""
        primary = _make_h("weak", 4, "mean > 0", p_raw=0.9, is_primary=True)
        secondary = _make_h("weak", 4, "robustness", p_raw=0.001, is_primary=False)
        results = hierarchical_bh_correct([primary, secondary])
        status_map = {r.label: r.status for r in results}
        assert status_map["mean > 0"] == "not_rejected"
        assert status_map["robustness"] == "skipped"

    def test_active_family_includes_secondary(self):
        """When family passes Level-1, secondary hypotheses are BH-corrected."""
        primary = _make_h("strong", 4, "mean > 0", p_raw=0.001, is_primary=True)
        secondary = _make_h("strong", 4, "robustness", p_raw=0.002, is_primary=False)
        results = hierarchical_bh_correct([primary, secondary])
        status_map = {r.label: r.status for r in results}
        assert status_map["mean > 0"] in ("rejected", "not_rejected")
        assert status_map["robustness"] in ("rejected", "not_rejected")
        # Neither should be "skipped" since family was active.
        assert status_map["mean > 0"] != "skipped"
        assert status_map["robustness"] != "skipped"

    def test_two_families_independent(self):
        """Two distinct families do not influence each other's Level-2."""
        h_a = _make_h("fam_a", 4, "mean > 0", p_raw=0.001, family="fam_a")
        h_b = _make_h("fam_b", 4, "mean > 0", p_raw=0.99, family="fam_b")
        results = hierarchical_bh_correct([h_a, h_b])
        status_map = {r.family: r.status for r in results}
        # fam_a should be rejected/not_rejected, fam_b should be not_rejected/skipped
        assert status_map["fam_a"] in ("rejected", "not_rejected")
        # high p → not active → skipped
        assert status_map["fam_b"] in ("not_rejected", "skipped")

    def test_does_not_mutate_input(self):
        """Input objects must not be modified."""
        h = _make_h("pat", 4, "mean > 0", p_raw=0.001)
        original_status = h.status
        hierarchical_bh_correct([h])
        assert h.status == original_status

    def test_p_bh_set_for_active_family(self):
        h = _make_h("strong", 4, "mean > 0", p_raw=0.001)
        results = hierarchical_bh_correct([h])
        assert results[0].p_bh is not None

    def test_insufficient_hypotheses_excluded(self):
        """Hypotheses already marked insufficient are not touched."""
        h = RegisteredHypothesis(
            hypothesis_id=make_hypothesis_id("pat", 4, "test"),
            pattern_slug="pat",
            horizon_hours=4,
            label="test",
            alpha=0.05,
            family="pat",
            filed_at="2026-01-01T00:00:00+00:00",
            is_primary=True,
            p_raw=0.001,
            status="insufficient",
            n_samples=3,
        )
        results = hierarchical_bh_correct([h])
        # insufficient hypothesis is not passed to hierarchical_bh_correct by
        # run_correction — if it somehow arrives, it should stay unchanged.
        assert results[0].status == "insufficient"

    def test_family_with_only_secondary_no_primaries_skipped(self):
        """Family with no primary hypotheses cannot activate."""
        secondary = _make_h(
            "noprimary", 4, "robustness", p_raw=0.001, is_primary=False
        )
        results = hierarchical_bh_correct([secondary])
        # family_rep_p = 1.0 (no primaries) → not active → skipped
        assert results[0].status == "skipped"
