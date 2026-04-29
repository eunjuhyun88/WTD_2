"""W-0312 개인화 엔진 — 설계 목표 검증 테스트

검증 항목:
  D1. Bayesian 수렴: valid 비율 ↑ → affinity score ↑ (단조)
  D2. 개인화 트리거: n_total ≥ 10 → warm path (personalized mode)
  D3. 콜드스타트: n_total < 10 → global fallback 강제
  D4. 쉬링크리지: n=30 → shrinkage_factor == 1.0
  D5. 델타 방향성: near_miss 우세 → stop_mul_delta > 0 (손절 완화)
  D6. 델타 방향성: too_early 우세 → entry_strict_delta > 0 (진입 엄격)
  D7. 델타 상한 준수: 어떤 조합이든 |delta| ≤ 0.3
  D8. 구조 레스큐: valid_rate < 5% (n≥30) → needs_rescue=True
  D9. 어피니티 랭킹: valid 많은 패턴이 invalid 많은 패턴보다 score 높음
  D10. 전체 파이프라인: verdict 10개 학습 후 delta 비영(non-zero) 출력
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from pathlib import Path

import pytest

from personalization.affinity_registry import AffinityRegistry
from personalization.coldstart import is_cold, needs_rescue, COLD_START_THRESHOLD
from personalization.decay import apply_decay, HALF_LIFE_DAYS
from personalization.threshold_adapter import ThresholdAdapter
from personalization.types import BetaState, UserPatternState, ALL_VERDICT_LABELS

_SLUG = "test-pattern-v1"
_GLOBAL_PRIORS = {_SLUG: {"near_miss": 0.2, "valid": 0.5, "invalid": 0.15,
                           "too_early": 0.1, "too_late": 0.05}}


def _build_state(
    user_id: str = "u",
    pattern_slug: str = _SLUG,
    near_miss: int = 0,
    valid: int = 0,
    invalid: int = 0,
    too_early: int = 0,
    too_late: int = 0,
) -> UserPatternState:
    n = near_miss + valid + invalid + too_early + too_late
    counts = {"near_miss": near_miss, "valid": valid, "invalid": invalid,
               "too_early": too_early, "too_late": too_late}
    states = {
        label: BetaState(alpha=1.0 + counts[label], beta=1.0 + (n - counts[label]))
        for label in ALL_VERDICT_LABELS
    }
    return UserPatternState(
        user_id=user_id, pattern_slug=pattern_slug,
        states=states, n_total=n,
        last_verdict_at=None, decay_applied_at=None,
    )


# ── D1: Bayesian 수렴 단조성 ────────────────────────────────────────────────
def test_d1_bayesian_affinity_monotone_with_valid_rate(tmp_path):
    """valid 비율 0.2 → 0.5 → 0.8 순으로 affinity score 단조 증가."""
    reg = AffinityRegistry(store_path=tmp_path / "affinity")
    scores = []
    for n_valid, n_invalid in [(2, 8), (5, 5), (8, 2)]:
        uid = f"u_{n_valid}"
        for _ in range(n_valid):
            reg.update(uid, _SLUG, "valid")
        for _ in range(n_invalid):
            reg.update(uid, _SLUG, "invalid")
        scores.append(reg.get_score(uid, _SLUG))

    assert scores[0] < scores[1] < scores[2], (
        f"점수 단조성 위반: {scores}"
    )


# ── D2: n ≥ 10 → warm path ─────────────────────────────────────────────────
def test_d2_warm_path_triggers_at_threshold():
    """n_total == COLD_START_THRESHOLD 경계: 10에서 warm, 9에서 cold."""
    state_9  = _build_state(valid=4, invalid=3, near_miss=2)  # n=9
    state_10 = _build_state(valid=4, invalid=3, near_miss=3)  # n=10

    assert is_cold(state_9), "n=9 → cold_start 이어야 함"
    assert not is_cold(state_10), "n=10 → warm path 이어야 함"


# ── D3: n < 10 → global fallback ───────────────────────────────────────────
def test_d3_cold_state_produces_global_fallback():
    """n < COLD_START_THRESHOLD → is_cold=True."""
    for n in range(0, COLD_START_THRESHOLD):
        state = _build_state(valid=n)
        assert is_cold(state), f"n={n} → should be cold"


# ── D4: 쉬링크리지 n=30 → 1.0 ────────────────────────────────────────────
def test_d4_shrinkage_reaches_one_at_n30():
    """n=30 → shrinkage_factor == 1.0 정확히."""
    adapter = ThresholdAdapter(_GLOBAL_PRIORS)
    state = _build_state(near_miss=6, valid=12, invalid=6, too_early=3, too_late=3)  # n=30
    assert state.n_total == 30

    delta = adapter.compute_delta(state, _SLUG)
    assert delta.shrinkage_factor == 1.0, f"n=30 shrinkage={delta.shrinkage_factor}"


# ── D5: near_miss 우세 → stop_mul_delta > 0 ────────────────────────────────
def test_d5_near_miss_dominant_loosens_stop():
    """near_miss 15 / 30 verdicts → stop_mul_delta > 0 (손절 완화)."""
    adapter = ThresholdAdapter(_GLOBAL_PRIORS)
    # near_miss rate = 0.5 vs global 0.2 → delta = 0.6*(0.5-0.2)*shrinkage > 0
    state = _build_state(near_miss=15, valid=5, invalid=5, too_early=3, too_late=2)  # n=30
    delta = adapter.compute_delta(state, _SLUG)
    assert delta.stop_mul_delta > 0, (
        f"near_miss 우세 시 stop_mul_delta>0 이어야 함, got {delta.stop_mul_delta}"
    )


# ── D6: too_early 우세 → entry_strict_delta > 0 ────────────────────────────
def test_d6_too_early_dominant_tightens_entry():
    """too_early 20 / 30 verdicts → entry_strict_delta > 0 (진입 조건 강화)."""
    adapter = ThresholdAdapter(_GLOBAL_PRIORS)
    state = _build_state(too_early=20, valid=4, invalid=3, near_miss=2, too_late=1)  # n=30
    delta = adapter.compute_delta(state, _SLUG)
    assert delta.entry_strict_delta > 0, (
        f"too_early 우세 시 entry_strict_delta>0 이어야 함, got {delta.entry_strict_delta}"
    )


# ── D7: 델타 상한 ≤ 0.3 ────────────────────────────────────────────────────
def test_d7_delta_never_exceeds_max():
    """극단적 verdict 분포에서도 |delta| ≤ 0.3."""
    adapter = ThresholdAdapter(_GLOBAL_PRIORS)
    # 100% near_miss (극단)
    state = _build_state(near_miss=30)
    delta = adapter.compute_delta(state, _SLUG)
    assert abs(delta.stop_mul_delta) <= 0.3
    assert abs(delta.entry_strict_delta) <= 0.3
    assert abs(delta.target_mul_delta) <= 0.3

    # 100% invalid (반대 극단)
    state2 = _build_state(invalid=30)
    delta2 = adapter.compute_delta(state2, _SLUG)
    assert abs(delta2.stop_mul_delta) <= 0.3
    assert abs(delta2.entry_strict_delta) <= 0.3
    assert abs(delta2.target_mul_delta) <= 0.3


# ── D8: 레스큐 트리거 (valid_rate < 5%, n ≥ 30) ─────────────────────────────
def test_d8_rescue_triggers_when_always_invalid():
    """30 verdicts + valid 0개 → valid_rate=0 < 5% → needs_rescue=True."""
    state = _build_state(invalid=30)  # n=30, valid=0
    assert needs_rescue(state), "항상 invalid → rescue 필요"


def test_d8_no_rescue_when_valid_rate_acceptable():
    """10 valid + 20 invalid → valid_rate=10/30 > 5% → needs_rescue=False."""
    state = _build_state(valid=10, invalid=20)
    assert not needs_rescue(state), "valid_rate 충분 → rescue 불필요"


# ── D9: 어피니티 랭킹 정확성 ──────────────────────────────────────────────
def test_d9_affinity_ranking_correctness(tmp_path):
    """valid 9개 패턴이 valid 1개 패턴보다 높은 score."""
    reg = AffinityRegistry(store_path=tmp_path / "affinity")
    uid = "ranking-user"

    for _ in range(9):
        reg.update(uid, "high-pattern", "valid")
    reg.update(uid, "high-pattern", "invalid")

    reg.update(uid, "low-pattern", "valid")
    for _ in range(9):
        reg.update(uid, "low-pattern", "invalid")

    high = reg.get_score(uid, "high-pattern")
    low  = reg.get_score(uid, "low-pattern")
    assert high > low, f"high={high:.3f} 이어야 low={low:.3f}보다 높음"


# ── D10: 전체 파이프라인 — verdict 학습 후 delta 비영(non-zero) ────────────
def test_d10_full_pipeline_produces_nonzero_delta(tmp_path):
    """10 verdicts (near_miss 위주) → compute_delta → stop_mul_delta ≠ 0."""
    adapter = ThresholdAdapter(_GLOBAL_PRIORS)
    state = ThresholdAdapter.initial_state("user-1", _SLUG, {})

    for label in ["near_miss"] * 7 + ["valid"] * 2 + ["invalid"] * 1:
        state = adapter.update_on_verdict(
            state, label, datetime.now(timezone.utc).isoformat()
        )

    assert state.n_total == 10, f"n_total={state.n_total}"
    delta = adapter.compute_delta(state, _SLUG)
    assert delta.n_used == 10
    assert delta.shrinkage_factor == pytest.approx(10 / 30, rel=0.01)
    # near_miss 비율 0.7 >> global 0.2 → stop_mul_delta > 0
    assert delta.stop_mul_delta > 0, f"got {delta.stop_mul_delta}"


# ── D11: 90일 감쇠 후 effective_n 절반 ────────────────────────────────────
def test_d11_decay_halves_effective_count_at_90d():
    """90일 경과 후 (α-1) + (β-1) 합이 절반으로 감소."""
    from datetime import timedelta

    t0 = "2026-01-01T00:00:00+00:00"
    t1 = (datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=90)).isoformat()

    # state with known prior+counts
    state = UserPatternState(
        user_id="u", pattern_slug=_SLUG,
        states={
            "valid": BetaState(alpha=11.0, beta=1.0),   # 10 effective
            "invalid": BetaState(alpha=1.0, beta=6.0),  # 5 effective (beta side)
            "near_miss": BetaState(alpha=1.0, beta=1.0),
            "too_early": BetaState(alpha=1.0, beta=1.0),
            "too_late": BetaState(alpha=1.0, beta=1.0),
        },
        n_total=15,
        last_verdict_at=t0,
        decay_applied_at=t0,
    )

    decayed = apply_decay(state, t1)

    alpha_valid = decayed.states["valid"].alpha
    effective_after = alpha_valid - 1.0  # subtract prior
    # Expected: 10 * decay_factor = 10 * 0.5 = 5.0 (±0.5)
    assert 4.0 <= effective_after <= 6.0, (
        f"90일 후 effective α-1 ≈ 5.0 이어야 함, got {effective_after:.3f}"
    )
