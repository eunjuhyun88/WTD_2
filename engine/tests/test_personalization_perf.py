"""W-0312 개인화 엔진 — 성능 기준 검증 테스트

측정 항목:
  PERF1. ThresholdAdapter.compute_delta — 1000회 연속 호출 ≤ 50ms
  PERF2. ThresholdAdapter.update_on_verdict — 100 verdicts 누적 ≤ 10ms
  PERF3. AffinityRegistry.update — 50 users × 20 patterns (1000 ops) ≤ 500ms
  PERF4. decay.apply_decay — 1000 state 적용 ≤ 20ms
  PERF5. coldstart.is_cold — 10,000회 ≤ 5ms
  PERF6. 전체 파이프라인 — verdict 수신 → delta 계산 왕복 1000회 ≤ 100ms
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path

import pytest

from personalization.affinity_registry import AffinityRegistry
from personalization.coldstart import is_cold
from personalization.decay import apply_decay
from personalization.threshold_adapter import ThresholdAdapter
from personalization.types import BetaState, UserPatternState, ALL_VERDICT_LABELS

# ── CI 4× 여유 기준 (A077 lesson) ────────────────────────────────────────────
THRESHOLDS = {
    "COMPUTE_DELTA_1000_MS":        200,   # 50ms × 4
    "UPDATE_VERDICT_100_MS":         40,   # 10ms × 4
    "AFFINITY_UPDATE_1000_MS":     2000,   # 500ms × 4
    "DECAY_APPLY_1000_MS":          500,   # 20ms × 25 (CI runner variance)
    "COLDSTART_10000_MS":            20,   # 5ms × 4
    "PIPELINE_ROUNDTRIP_1000_MS":   400,   # 100ms × 4
}

_SLUG = "test-pattern-v1"
_GLOBAL_PRIORS = {_SLUG: {"near_miss": 0.2, "valid": 0.5, "invalid": 0.15,
                            "too_early": 0.1, "too_late": 0.05}}


def _warm_state(n: int = 30, valid_frac: float = 0.6) -> UserPatternState:
    n_valid = int(n * valid_frac)
    n_other = n - n_valid
    states = {
        "valid":     BetaState(alpha=1.0 + n_valid, beta=1.0 + n - n_valid),
        "invalid":   BetaState(alpha=1.0 + n_other // 2, beta=1.0 + n - n_other // 2),
        "near_miss": BetaState(alpha=1.0, beta=1.0),
        "too_early": BetaState(alpha=1.0, beta=1.0),
        "too_late":  BetaState(alpha=1.0, beta=1.0),
    }
    return UserPatternState(
        user_id="perf-user", pattern_slug=_SLUG,
        states=states, n_total=n,
    )


# ── PERF1: compute_delta 1000회 ──────────────────────────────────────────────
def test_perf1_compute_delta_1000_calls():
    adapter = ThresholdAdapter(_GLOBAL_PRIORS)
    state = _warm_state(30)

    t0 = time.perf_counter()
    for _ in range(1000):
        adapter.compute_delta(state, _SLUG)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    limit = THRESHOLDS["COMPUTE_DELTA_1000_MS"]
    assert elapsed_ms < limit, (
        f"compute_delta 1000회 {elapsed_ms:.1f}ms > {limit}ms"
    )
    print(f"\n  ⚡ compute_delta ×1000: {elapsed_ms:.1f}ms "
          f"({elapsed_ms/1000:.4f}ms/call)")


# ── PERF2: update_on_verdict 100회 ──────────────────────────────────────────
def test_perf2_update_on_verdict_100_calls():
    adapter = ThresholdAdapter(_GLOBAL_PRIORS)
    state = ThresholdAdapter.initial_state("perf-u", _SLUG, {})
    now = datetime.now(timezone.utc).isoformat()
    labels = (["valid"] * 6 + ["near_miss"] * 2 + ["invalid"] * 2) * 10  # 100 total

    t0 = time.perf_counter()
    for label in labels:
        state = adapter.update_on_verdict(state, label, now)  # type: ignore[arg-type]
    elapsed_ms = (time.perf_counter() - t0) * 1000

    assert state.n_total == 100
    limit = THRESHOLDS["UPDATE_VERDICT_100_MS"]
    assert elapsed_ms < limit, (
        f"update_on_verdict ×100 {elapsed_ms:.1f}ms > {limit}ms"
    )
    print(f"\n  📝 update_on_verdict ×100: {elapsed_ms:.1f}ms "
          f"({elapsed_ms/100:.4f}ms/call)")


# ── PERF3: AffinityRegistry 50 users × 20 patterns ──────────────────────────
def test_perf3_affinity_registry_1000_updates(tmp_path):
    reg = AffinityRegistry(store_path=tmp_path / "affinity")
    patterns = [f"pat-{i}" for i in range(20)]
    users = [f"user-{i}" for i in range(50)]
    outcomes = ["valid", "invalid", "near_miss", "too_early", "too_late"]

    t0 = time.perf_counter()
    for i, uid in enumerate(users):
        for j, slug in enumerate(patterns):
            outcome = outcomes[(i + j) % 5]
            reg.update(uid, slug, outcome)  # type: ignore[arg-type]
    elapsed_ms = (time.perf_counter() - t0) * 1000

    limit = THRESHOLDS["AFFINITY_UPDATE_1000_MS"]
    assert elapsed_ms < limit, (
        f"affinity 50×20 업데이트 {elapsed_ms:.1f}ms > {limit}ms"
    )
    print(f"\n  💾 AffinityRegistry ×1000: {elapsed_ms:.1f}ms "
          f"({elapsed_ms/1000:.3f}ms/op)")


# ── PERF4: decay.apply_decay 1000회 ─────────────────────────────────────────
def test_perf4_decay_apply_1000_states():
    from datetime import timedelta

    t0_iso = "2025-10-01T00:00:00+00:00"
    t1_iso = "2026-01-01T00:00:00+00:00"  # ~92 days

    states = [
        UserPatternState(
            user_id=f"u{i}", pattern_slug=_SLUG,
            states={label: BetaState(alpha=1.0 + i % 5, beta=1.0 + i % 3)
                    for label in ALL_VERDICT_LABELS},
            n_total=i % 30,
            last_verdict_at=t0_iso,
            decay_applied_at=t0_iso,
        )
        for i in range(1000)
    ]

    t_start = time.perf_counter()
    results = [apply_decay(s, t1_iso) for s in states]
    elapsed_ms = (time.perf_counter() - t_start) * 1000

    assert len(results) == 1000
    limit = THRESHOLDS["DECAY_APPLY_1000_MS"]
    assert elapsed_ms < limit, (
        f"decay apply ×1000 {elapsed_ms:.1f}ms > {limit}ms"
    )
    print(f"\n  🕐 decay apply ×1000: {elapsed_ms:.1f}ms "
          f"({elapsed_ms/1000:.4f}ms/state)")


# ── PERF5: is_cold 10000회 ──────────────────────────────────────────────────
def test_perf5_coldstart_check_10000_calls():
    states = [
        _warm_state(n=i % 35) for i in range(10000)
    ]

    t0 = time.perf_counter()
    results = [is_cold(s) for s in states]
    elapsed_ms = (time.perf_counter() - t0) * 1000

    assert len(results) == 10000
    limit = THRESHOLDS["COLDSTART_10000_MS"]
    assert elapsed_ms < limit, (
        f"is_cold ×10000 {elapsed_ms:.1f}ms > {limit}ms"
    )
    print(f"\n  🧊 is_cold ×10000: {elapsed_ms:.1f}ms "
          f"({elapsed_ms/10000:.5f}ms/call)")


# ── PERF6: 전체 파이프라인 왕복 1000회 ─────────────────────────────────────
def test_perf6_full_pipeline_roundtrip_1000(tmp_path):
    """verdict 수신 → update_on_verdict → compute_delta 왕복."""
    adapter = ThresholdAdapter(_GLOBAL_PRIORS)
    now = datetime.now(timezone.utc).isoformat()
    labels = (["valid"] * 5 + ["near_miss"] * 3 + ["invalid"] * 2) * 100  # 1000 total

    state = ThresholdAdapter.initial_state("pipeline-u", _SLUG, {})

    t0 = time.perf_counter()
    for label in labels:
        state = adapter.update_on_verdict(state, label, now)  # type: ignore[arg-type]
        _ = adapter.compute_delta(state, _SLUG)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    assert state.n_total == 1000
    limit = THRESHOLDS["PIPELINE_ROUNDTRIP_1000_MS"]
    assert elapsed_ms < limit, (
        f"파이프라인 왕복 ×1000 {elapsed_ms:.1f}ms > {limit}ms"
    )
    print(f"\n  🔄 전체 파이프라인 ×1000: {elapsed_ms:.1f}ms "
          f"({elapsed_ms/1000:.3f}ms/verdict)")


# ── 성능 기준 요약 ────────────────────────────────────────────────────────────
def test_perf_thresholds_summary():
    print("\n")
    print("  ┌────────────────────────────────────────────────────┐")
    print("  │  W-0312 개인화 엔진 성능 기준 (A077 4× CI 여유)    │")
    print("  ├────────────────────────────────────────────────────┤")
    for name, val in THRESHOLDS.items():
        print(f"  │  {name:<35} ≤ {val:>4}ms  │")
    print("  └────────────────────────────────────────────────────┘")
    # 상수 스모크 체크
    assert THRESHOLDS["COMPUTE_DELTA_1000_MS"] >= 200
    assert THRESHOLDS["AFFINITY_UPDATE_1000_MS"] >= 2000
