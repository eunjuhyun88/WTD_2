"""W-0321 통합 검증 — 기능/성능/방법론/아키텍처

FN1-5: 퀀트 트레이딩 시나리오 기능 검증
PERF1-4: A077 4× CI 여유 성능 벤치마크
METH1-4: Bayesian 방법론 정확성
ARCH1-4: 아키텍처 설계 계약
"""
from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import personalization.api as papi
from personalization.affinity_registry import AffinityRegistry
from personalization.coldstart import is_cold, needs_rescue
from personalization.decay import apply_decay
from personalization.exceptions import (
    ColdStartError, PatternNotFoundError, PersonalizationError, StateCorruptedError,
)
from personalization.pattern_state_store import PatternStateStore
from personalization.scheduler import apply_daily_decay_all_users
from personalization.threshold_adapter import ThresholdAdapter
from personalization.types import ALL_VERDICT_LABELS, BetaState, UserPatternState

_NOW = "2026-04-30T00:00:00+00:00"
_SLUG = "btc-hammer"
_GLOBAL_PRIORS = {
    _SLUG: {"near_miss": 0.2, "valid": 0.5, "invalid": 0.15,
             "too_early": 0.1, "too_late": 0.05}
}


# ── Shared fixtures ───────────────────────────────────────────────────────────

@pytest.fixture()
def stores(tmp_path):
    affinity = AffinityRegistry(
        store_path=tmp_path / "affinity",
        audit_log_path=tmp_path / "audit.jsonl",
    )
    store = PatternStateStore(store_path=tmp_path / "states")
    adapter = ThresholdAdapter(global_priors=_GLOBAL_PRIORS)
    return affinity, store, adapter


@pytest.fixture()
def api_client(tmp_path, monkeypatch):
    affinity = AffinityRegistry(
        store_path=tmp_path / "affinity",
        audit_log_path=tmp_path / "audit.jsonl",
    )
    store = PatternStateStore(store_path=tmp_path / "states")
    adapter = ThresholdAdapter(global_priors=_GLOBAL_PRIORS)
    monkeypatch.setattr(papi, "_affinity_registry", affinity)
    monkeypatch.setattr(papi, "_state_store", store)
    monkeypatch.setattr(papi, "_threshold_adapter", adapter)

    app = FastAPI()
    app.include_router(papi.router)
    with patch.object(papi, "_require_self", return_value=None):
        yield TestClient(app)


def _post_verdicts(client, user_id: str, verdicts: list[str]) -> dict:
    resp = None
    for v in verdicts:
        resp = client.post("/verdict", json={
            "user_id": user_id,
            "pattern_slug": _SLUG,
            "verdict": v,
            "captured_at": _NOW,
        })
        assert resp.status_code == 200
    return resp.json()


# ── FN: Functional ────────────────────────────────────────────────────────────

class TestFunctional:

    def test_fn1_cold_to_warm_transition_at_n10(self, api_client):
        """9 verdicts → cold_start; 10th → personalized."""
        for i in range(9):
            r = api_client.post("/verdict", json={
                "user_id": "fn1-user", "pattern_slug": _SLUG,
                "verdict": "near_miss", "captured_at": _NOW,
            })
            assert r.json()["mode"] == "cold_start", f"n={i+1} should be cold"

        r10 = api_client.post("/verdict", json={
            "user_id": "fn1-user", "pattern_slug": _SLUG,
            "verdict": "near_miss", "captured_at": _NOW,
        })
        assert r10.json()["mode"] == "personalized"
        assert r10.json()["delta"] is not None

    def test_fn2_near_miss_trader_loosens_stop(self, stores):
        """near_miss 70% (21/30) → stop_mul_delta > 0, within ±0.3."""
        _, _, adapter = stores
        state = ThresholdAdapter.initial_state("fn2-user", _SLUG)
        for _ in range(21):
            state = adapter.update_on_verdict(state, "near_miss", _NOW)
        for _ in range(9):
            state = adapter.update_on_verdict(state, "invalid", _NOW)
        assert state.n_total == 30

        delta = adapter.compute_delta(state, _SLUG)
        assert delta.stop_mul_delta > 0, "near_miss dominant → stop should be loosened"
        assert abs(delta.stop_mul_delta) <= 0.3
        assert delta.shrinkage_factor == pytest.approx(1.0)

    def test_fn3_too_early_trader_tightens_entry(self, stores):
        """too_early 70% (21/30) → entry_strict_delta > 0."""
        _, _, adapter = stores
        state = ThresholdAdapter.initial_state("fn3-user", _SLUG)
        for _ in range(21):
            state = adapter.update_on_verdict(state, "too_early", _NOW)
        for _ in range(9):
            state = adapter.update_on_verdict(state, "valid", _NOW)
        assert state.n_total == 30

        delta = adapter.compute_delta(state, _SLUG)
        assert delta.entry_strict_delta > 0, "too_early dominant → entry should be tightened"
        assert abs(delta.entry_strict_delta) <= 0.3

    def test_fn4_rescue_endpoint(self, api_client):
        """30 invalid → rescue=True; 5valid+25invalid → rescue=False."""
        # Always-invalid: rescue should trigger
        _post_verdicts(api_client, "fn4-rescue", ["invalid"] * 30)
        r = api_client.post(f"/user/fn4-rescue/rescue/{_SLUG}")
        assert r.status_code == 200
        data = r.json()
        assert data["rescued"] is True
        assert 0.4 <= data["new_score"] <= 0.6  # reset to ~0.5

        # Acceptable valid rate: no rescue
        _post_verdicts(api_client, "fn4-ok", ["valid"] * 5 + ["invalid"] * 25)
        r2 = api_client.post(f"/user/fn4-ok/rescue/{_SLUG}")
        assert r2.status_code == 200
        assert r2.json()["rescued"] is False

    def test_fn5_affinity_ranking_consistency(self, api_client):
        """20 valid for pat-A, 2 valid for pat-B → GET affinity: A score > B score."""
        for _ in range(20):
            api_client.post("/verdict", json={
                "user_id": "fn5-user", "pattern_slug": "pat-A",
                "verdict": "valid", "captured_at": _NOW,
            })
        for _ in range(2):
            api_client.post("/verdict", json={
                "user_id": "fn5-user", "pattern_slug": "pat-B",
                "verdict": "valid", "captured_at": _NOW,
            })

        r = api_client.get("/user/fn5-user/affinity?top_k=5")
        patterns = {p["pattern_slug"]: p["score"] for p in r.json()["patterns"]}
        assert patterns["pat-A"] > patterns["pat-B"], \
            f"pat-A {patterns['pat-A']:.3f} should > pat-B {patterns['pat-B']:.3f}"


# ── PERF: Performance (A077 4× CI headroom) ──────────────────────────────────

class TestPerformance:

    def test_perf1_state_store_1000_sequential_writes(self, tmp_path):
        """1000 sequential puts to 1 user file ≤ 2000ms."""
        store = PatternStateStore(tmp_path / "states")
        adapter = ThresholdAdapter({})
        state = ThresholdAdapter.initial_state("perf-user", _SLUG)

        t0 = time.perf_counter()
        for i in range(1000):
            state = adapter.update_on_verdict(
                state, "valid" if i % 3 == 0 else "near_miss", _NOW
            )
            store.put(state)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        assert elapsed_ms < 2000, f"1000 seq writes: {elapsed_ms:.0f}ms > 2000ms"

    def test_perf2_state_store_50_users_20_patterns(self, tmp_path):
        """50 users × 20 patterns = 1000 puts ≤ 5000ms."""
        store = PatternStateStore(tmp_path / "states")
        adapter = ThresholdAdapter({})
        users = [f"u{i}" for i in range(50)]
        patterns = [f"pat-{j}" for j in range(20)]
        verdicts = ["valid", "near_miss", "invalid", "too_early", "too_late"]

        t0 = time.perf_counter()
        for i, uid in enumerate(users):
            for j, slug in enumerate(patterns):
                state = ThresholdAdapter.initial_state(uid, slug)
                state = adapter.update_on_verdict(
                    state, verdicts[(i + j) % 5], _NOW
                )
                store.put(state)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        assert elapsed_ms < 5000, f"50u×20p writes: {elapsed_ms:.0f}ms > 5000ms"

    def test_perf3_scheduler_100_users_5_patterns(self, tmp_path):
        """scheduler decay 100u × 5p = 500 states ≤ 2000ms."""
        store = PatternStateStore(tmp_path / "states")
        affinity = AffinityRegistry(store_path=tmp_path / "affinity")
        adapter = ThresholdAdapter({})
        T0 = "2025-10-01T00:00:00+00:00"

        for i in range(100):
            uid = f"sched-u{i}"
            for j in range(5):
                slug = f"sched-p{j}"
                state = ThresholdAdapter.initial_state(uid, slug)
                for _ in range(5):
                    state = adapter.update_on_verdict(state, "valid", T0)
                state = UserPatternState(
                    user_id=uid, pattern_slug=slug, states=state.states,
                    n_total=state.n_total, last_verdict_at=T0, decay_applied_at=T0,
                )
                store.put(state)

        t0 = time.perf_counter()
        result = apply_daily_decay_all_users(store, affinity, "2026-01-01T00:00:00+00:00")
        elapsed_ms = (time.perf_counter() - t0) * 1000

        assert result["users_processed"] == 100
        assert elapsed_ms < 2000, f"scheduler 500 states: {elapsed_ms:.0f}ms > 2000ms"
        print(f"\n  ⏱ scheduler 500 states: {elapsed_ms:.0f}ms")

    def test_perf4_api_100_verdict_posts(self, api_client):
        """100 sequential POST /verdict ≤ 4000ms (4× CI variance headroom)."""
        verdicts = (["near_miss"] * 5 + ["valid"] * 3 + ["invalid"] * 2) * 10

        t0 = time.perf_counter()
        for v in verdicts:
            r = api_client.post("/verdict", json={
                "user_id": "perf4-user", "pattern_slug": _SLUG,
                "verdict": v, "captured_at": _NOW,
            })
            assert r.status_code == 200
        elapsed_ms = (time.perf_counter() - t0) * 1000

        assert elapsed_ms < 4000, f"100 POST /verdict: {elapsed_ms:.0f}ms > 4000ms"
        print(f"\n  ⏱ 100 POST /verdict: {elapsed_ms:.0f}ms")


# ── METH: Methodology (Bayesian correctness) ─────────────────────────────────

class TestMethodology:

    def test_meth1_shrinkage_linearity(self, stores):
        """shrinkage = n/30 exactly at n=10,20,30; delta magnitude proportional.

        Uses 40% near_miss (below clamp threshold) so all 3 values are below 0.3.
        Clamp kicks in at near_miss≈77%: 0.6*(0.77-0.2)*1.0=0.342>0.3.
        At 40%: 0.6*(0.4-0.2)*1.0=0.12, safe from clamp at all shrinkages.
        """
        _, _, adapter = stores

        deltas = []
        for n in (10, 20, 30):
            n_nm = int(n * 0.4)    # 40% near_miss
            n_other = n - n_nm
            state = ThresholdAdapter.initial_state("meth1-u", _SLUG)
            for _ in range(n_nm):
                state = adapter.update_on_verdict(state, "near_miss", _NOW)
            for _ in range(n_other):
                state = adapter.update_on_verdict(state, "valid", _NOW)
            d = adapter.compute_delta(state, _SLUG)
            assert d.shrinkage_factor == pytest.approx(n / 30, rel=0.01), \
                f"n={n} shrinkage={d.shrinkage_factor}, expected {n/30:.3f}"
            assert not d.clamped, f"n={n} delta should not be clamped at 40% near_miss"
            deltas.append(abs(d.stop_mul_delta))

        # delta magnitude must increase strictly with n (more data → more shrinkage weight)
        assert deltas[0] < deltas[1] < deltas[2], \
            f"delta magnitude not monotone with n=10/20/30: {deltas}"

    def test_meth2_informed_prior_vs_uniform(self, stores):
        """pseudo_count=5 with near_miss=0.3 starts closer to global prior."""
        _, _, adapter = stores

        # Cold start state — uniform prior
        state_uniform = ThresholdAdapter.initial_state("meth2-u", _SLUG)
        # Informed prior: near_miss global=0.3 > default 0.2
        state_informed = ThresholdAdapter.initial_state(
            "meth2-u", _SLUG,
            global_priors={"near_miss": 0.3, "valid": 0.4, "invalid": 0.15,
                            "too_early": 0.1, "too_late": 0.05},
            pseudo_count=5.0,
        )

        # Informed prior: near_miss alpha should be > uniform (1.0)
        nm_uniform = state_uniform.states["near_miss"].alpha
        nm_informed = state_informed.states["near_miss"].alpha
        assert nm_informed > nm_uniform, \
            f"informed prior α={nm_informed:.2f} should > uniform {nm_uniform:.2f}"

        # After 5 verdicts, informed state should have more confident estimate
        for _ in range(5):
            state_uniform = adapter.update_on_verdict(state_uniform, "near_miss", _NOW)
            state_informed = adapter.update_on_verdict(state_informed, "near_miss", _NOW)

        # Both now have n=5 observations. Informed should have higher posterior mean.
        n_uniform = state_uniform.states["near_miss"].alpha - 1.0
        n_informed = state_informed.states["near_miss"].alpha - 1.0
        assert n_informed >= n_uniform, \
            f"informed n_eff={n_informed:.1f} should >= uniform {n_uniform:.1f}"

    def test_meth3_decay_halves_at_90d_quarters_at_180d(self):
        """90d decay → α-1 halved; 180d decay → α-1 quartered."""
        T0 = "2026-01-01T00:00:00+00:00"
        T90 = "2026-04-01T00:00:00+00:00"   # ~90 days
        T180 = "2026-07-01T00:00:00+00:00"  # ~180 days

        state = UserPatternState(
            user_id="meth3-u", pattern_slug=_SLUG,
            states={
                label: BetaState(alpha=11.0 if label == "valid" else 1.0, beta=1.0)
                for label in ALL_VERDICT_LABELS
            },
            n_total=10, last_verdict_at=T0, decay_applied_at=T0,
        )
        orig_effective = state.states["valid"].alpha - 1.0  # = 10.0

        d90 = apply_decay(state, T90)
        eff_90 = d90.states["valid"].alpha - 1.0
        assert 4.0 <= eff_90 <= 6.0, f"90d decay: {eff_90:.2f} not ≈ 5.0"

        d180 = apply_decay(d90, T180)
        eff_180 = d180.states["valid"].alpha - 1.0
        assert 1.5 <= eff_180 <= 3.5, f"180d decay: {eff_180:.2f} not ≈ 2.5"

        assert eff_180 < eff_90 < orig_effective

    def test_meth4_regime_change_decay_reduces_delta(self, stores):
        """Phase 1 near_miss → high delta. 90d decay → lower effective shrinkage → smaller delta."""
        _, _, adapter = stores
        T_OLD = "2025-10-01T00:00:00+00:00"
        T_NEW = "2026-01-01T00:00:00+00:00"  # ~92 days later

        # Phase 1: 30 near_miss verdicts
        state = ThresholdAdapter.initial_state("meth4-u", _SLUG)
        for _ in range(30):
            state = adapter.update_on_verdict(state, "near_miss", T_OLD)

        # Record Phase 1 delta at shrinkage=1.0
        delta1 = adapter.compute_delta(state, _SLUG)
        assert delta1.shrinkage_factor == pytest.approx(1.0)

        # Apply 90-day decay
        state_with_timestamps = UserPatternState(
            user_id=state.user_id, pattern_slug=state.pattern_slug,
            states=state.states, n_total=state.n_total,
            last_verdict_at=T_OLD, decay_applied_at=T_OLD,
        )
        decayed = apply_decay(state_with_timestamps, T_NEW)

        # Effective n after decay: n_total doesn't change but effective counts reduced
        # shrinkage still uses n_total → but in practice, further verdicts after decay
        # carry more weight. The key check: α_eff reduced.
        alpha_before = state.states["near_miss"].alpha
        alpha_after = decayed.states["near_miss"].alpha
        assert alpha_after < alpha_before, \
            f"decay should reduce near_miss α: {alpha_after:.2f} < {alpha_before:.2f}"

        # Phase 2: Add 10 invalid verdicts after decay
        for _ in range(10):
            decayed = adapter.update_on_verdict(decayed, "invalid", T_NEW)

        delta2 = adapter.compute_delta(decayed, _SLUG)
        # After decay + new invalid verdicts, near_miss dominance should be weaker
        # stop_mul_delta should be lower than phase 1 (near_miss diluted)
        assert delta2.stop_mul_delta < delta1.stop_mul_delta, (
            f"post-decay delta {delta2.stop_mul_delta:.4f} should < "
            f"pre-decay {delta1.stop_mul_delta:.4f}"
        )


# ── ARCH: Architecture contracts ─────────────────────────────────────────────

class TestArchitecture:

    def test_arch1_exception_hierarchy(self):
        """All PersonalizationError subclasses catchable as Exception."""
        for cls in (ColdStartError, PatternNotFoundError, StateCorruptedError):
            try:
                raise cls("test")
            except PersonalizationError:
                pass
            except Exception:
                pytest.fail(f"{cls.__name__} not caught as PersonalizationError")

            try:
                raise cls("test")
            except Exception:
                pass  # must also catch as base Exception

    def test_arch2_atomic_write_no_tmp_residue(self, tmp_path):
        """After put(), no .tmp files remain in store directory."""
        store = PatternStateStore(tmp_path / "states")
        adapter = ThresholdAdapter({})
        state = ThresholdAdapter.initial_state("arch2-u", _SLUG)

        for _ in range(10):
            state = adapter.update_on_verdict(state, "valid", _NOW)
            store.put(state)

        tmp_files = list((tmp_path / "states").glob("*.tmp"))
        assert len(tmp_files) == 0, f"Leftover .tmp files: {tmp_files}"

    def test_arch2_concurrent_write_read_consistency(self, tmp_path):
        """Reads during concurrent writes must always return valid JSON state."""
        store = PatternStateStore(tmp_path / "states")
        adapter = ThresholdAdapter({})
        errors = []

        def writer():
            state = ThresholdAdapter.initial_state("arch2-cw", _SLUG)
            for _ in range(50):
                state = adapter.update_on_verdict(state, "valid", _NOW)
                try:
                    store.put(state)
                except Exception as e:
                    errors.append(f"write: {e}")

        def reader():
            for _ in range(50):
                try:
                    result = store.get("arch2-cw", _SLUG)
                    # result can be None (not yet written) or a valid state
                    if result is not None:
                        assert result.n_total >= 0
                except Exception as e:
                    errors.append(f"read: {e}")

        threads = [
            threading.Thread(target=writer),
            threading.Thread(target=reader),
            threading.Thread(target=reader),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"concurrent errors: {errors}"

    def test_arch3_audit_log_none_does_not_raise(self, tmp_path):
        """audit_log_path=None → reset() works without writing."""
        affinity = AffinityRegistry(store_path=tmp_path / "aff")
        for _ in range(30):
            affinity.update("arch3-u", _SLUG, "invalid")

        # Must not raise even with no audit_log_path
        result = affinity.reset("arch3-u", _SLUG, reason="test")
        assert result.n_total == 0
        assert result.is_cold is True
        # No audit file created
        assert not (tmp_path / "aff" / "personalization_rescue.jsonl").exists()

    def test_arch3_audit_log_writes_when_set(self, tmp_path):
        """audit_log_path set → reset() writes JSONL entry."""
        audit = tmp_path / "audit" / "rescue.jsonl"
        affinity = AffinityRegistry(
            store_path=tmp_path / "aff", audit_log_path=audit
        )
        for _ in range(30):
            affinity.update("arch3-wr", _SLUG, "invalid")

        affinity.reset("arch3-wr", _SLUG, reason="arch_test")
        assert audit.exists()
        entry = json.loads(audit.read_text().strip())
        assert entry["user_id"] == "arch3-wr"
        assert entry["reason"] == "arch_test"

    def test_arch4_cold_warm_boundary_invariants(self, stores):
        """n=9 → cold_start; n=10 → warm. n_total never decreases."""
        _, store, adapter = stores
        state = ThresholdAdapter.initial_state("arch4-u", _SLUG)
        prev_n = 0

        for i in range(15):
            state = adapter.update_on_verdict(state, "near_miss", _NOW)
            store.put(state)

            loaded = store.get("arch4-u", _SLUG)
            assert loaded is not None
            assert loaded.n_total >= prev_n, "n_total must not decrease"
            prev_n = loaded.n_total

            if i < 9:
                assert is_cold(state), f"n={state.n_total} should be cold"
            elif i >= 9:
                assert not is_cold(state), f"n={state.n_total} should be warm"
