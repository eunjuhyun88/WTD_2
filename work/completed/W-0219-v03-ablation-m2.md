# W-0219 — V-03 Signal Ablation (M2)

**Owner:** research
**Status:** Ready (PRD only)
**Type:** New module (`engine/research/validation/ablation.py`)
**Depends on:** V-02 (W-0218), V-06 (W-0220)
**Effort:** 2 day implementation + 1 day test
**Parallel-safe:** ⚠️ V-02 머지 후 (uses phase_eval)

---

## 0. 한 줄 요약

W-0214 §3.2 **M2 Signal Ablation** — leave-one-out으로 phase의 N개 signal 중 i번째를 빼고 phase 정의 후 M1 재측정. **Tishby IB 정당화** 핵심.

## 1. Goal

W-0214 §3.2 M2 + §3.7 G5 (ablation drop ≥ 0.3% / 4h horizon → critical signal):
1. phase k 정의에서 signal i 제거 → phase k' 재계산
2. phase k vs phase k' M1 측정 (V-02)
3. drop = mean(R_with_i) − mean(R_without_i)
4. |drop| ≥ 0.3% → critical signal / drop < 0.1% → marginal (vocabulary trim 후보)

## 2. Owner

research (AI Researcher Tishby IB 정당화 sign-off)

## 3. Scope

| 파일 | 변경 |
|---|---|
| `engine/research/validation/ablation.py` | new |
| `engine/research/validation/test_ablation.py` | new |
| `engine/research/pattern_search.py` | **read-only** |

## 4. Non-Goals

- ❌ pattern_search.py 수정
- ❌ M1/M3/M4 직접 측정 (V-02/V-04/V-05)
- ❌ stats.py 재구현 (V-06 호출)
- ❌ Multi-signal interaction (Shapley) — W-0226+

## 5. Exit Criteria

```
[ ] AblationConfig (signals_to_ablate, horizon, cost_bps)
[ ] AblationResult (signal_id, baseline_mean, ablated_mean, drop, drop_significant)
[ ] run_ablation(pattern, phase, signal_list) → list[AblationResult]
[ ] critical_signals filter (|drop| ≥ 0.3%) + marginal_signals filter (|drop| < 0.1%)
[ ] V-02 phase_eval composition (재구현 X)
[ ] unit test ≥10 case (edge: 1 signal only, all marginal, drop NaN)
[ ] integration test: 1 P0 pattern × 5 signals × 1년 → 5 AblationResult
[ ] performance: <30s per (pattern, phase, n_signals)
```

## 6. CTO 설계

```python
# engine/research/validation/ablation.py
from dataclasses import dataclass

from .phase_eval import measure_phase_conditional_return  # V-02 composition

@dataclass(frozen=True)
class AblationResult:
    signal_id: str
    pattern_slug: str
    phase_name: str
    horizon_hours: int
    baseline_mean_pct: float       # phase k mean (with all signals)
    ablated_mean_pct: float        # phase k' mean (without signal i)
    drop_pct: float                 # baseline - ablated
    n_baseline: int
    n_ablated: int
    is_critical: bool               # |drop| ≥ 0.3%
    is_marginal: bool               # |drop| < 0.1%

def run_ablation(
    pattern, phase, signal_list, *,
    horizon_hours: int = 4,
    cost_bps: float = 15.0,
    critical_threshold_pct: float = 0.3,
    marginal_threshold_pct: float = 0.1,
) -> list[AblationResult]:
    """Leave-one-out ablation. W-0214 §3.2 M2."""
    baseline = measure_phase_conditional_return(...)  # all signals
    results = []
    for sig_id in signal_list:
        # Build modified phase without signal sig_id
        phase_without = _remove_signal(phase, sig_id)
        ablated = measure_phase_conditional_return(...)  # phase_without
        drop = baseline.mean_return_pct - ablated.mean_return_pct
        results.append(AblationResult(
            signal_id=sig_id, pattern_slug=pattern.slug,
            phase_name=phase.name, horizon_hours=horizon_hours,
            baseline_mean_pct=baseline.mean_return_pct,
            ablated_mean_pct=ablated.mean_return_pct,
            drop_pct=drop,
            n_baseline=baseline.n_samples, n_ablated=ablated.n_samples,
            is_critical=abs(drop) >= critical_threshold_pct,
            is_marginal=abs(drop) < marginal_threshold_pct,
        ))
    return results
```

## 7. AI Researcher 설계

### 7.1 Tishby IB 정당화

W-0214 §3.2 M2 명시: "각 signal이 I(T; Y)에 양의 contribution을 준다 (Tishby IB 관점)".

**M2 결과의 IB 해석**:
- `is_critical=True` → I(T; Y) 양의 기여 → 유지
- `is_marginal=True` → I(T; Y) 기여 부족 → vocabulary trim (phase 정의에서 제거)

→ V-13 decay monitoring과 연결: marginal signal이 시간 경과 critical로 변하거나 그 반대 추적.

### 7.2 통계적 유의성 검증

drop 자체는 point estimate. 유의성은 V-06 stats.py:
```python
from .stats import welch_t_test
t = welch_t_test(baseline.samples, ablated.samples)
# critical AND p < 0.05 → 진짜 critical
```

→ V-06 통합 후 추가.

## 8. Quant Trader 설계

### 8.1 Cost 일관성

같은 cost_bps=15 두 측정 모두에 적용 → drop은 cost-net.

### 8.2 N 일관성

baseline n vs ablated n 가능한 동일 horizon. 시계 차이 발생 시 sample size mismatch — log + warn.

## 9. Risk

| Risk | Impact | Mitigation |
|---|---|---|
| Signal removal logic error | 높음 | unit test 5+ case |
| baseline/ablated n 큰 차이 | 중 | warn + skip if ratio < 0.5 |
| M1 cache miss propagation | 중 | try/except + skip |

## 10. Open Questions

- Q1: signal_list 어디서? PatternObject definition 또는 외부 enum?
- Q2: Multi-signal ablation (Shapley)? — W-0226+
- Q3: critical/marginal 임계 (0.3% / 0.1%)는 horizon 별 다름?

## 11. Acceptance Test

```bash
test -f engine/research/validation/ablation.py
cd engine && pytest research/validation/test_ablation.py -v
git diff origin/main -- engine/research/pattern_search.py
# → 0 lines
```

## 12. Cross-references

- W-0214 §3.2 M2 + §3.7 G5
- W-0218 V-02 (composition source)
- W-0220 V-06 (stats integration)
- Tishby & Pereira (1999) Information Bottleneck

## 13. Next

- W-0220 V-06 stats.py 통합 (p-value)
- V-13 decay monitoring (signal critical→marginal trend)

---

*W-0219 v1.0 created 2026-04-27 by Agent A033 — V-03 ablation PRD with 3-perspective sign-off.*

---

## Goal
§1 — Tishby IB ablation, leave-one-out, critical/marginal classification.

## Owner
§2 — research

## Scope
§3 — `validation/ablation.py` 신규 + test.

## Non-Goals
§4 — pattern_search.py X / M1 X / Shapley W-0226+.

## Canonical Files
§3 — `ablation.py`, `test_ablation.py`.

## Facts
§7.1 Tishby IB. §3.2 M2 spec.

## Assumptions
§9 Risk register. signal_list 외부 주입.

## Open Questions
§10 Q1~Q3.

## Decisions
critical 0.3% / marginal 0.1% (W-0214 §3.2 lock-in).

## Next Steps
§13 — V-06 통합 + V-13 decay 연결.

## Exit Criteria
§5 — 4 함수 + unit test 10+ + perf <30s + V-02 composition.

## Handoff Checklist
- [x] PRD v1.0
- [ ] Issue 등록
- [ ] V-02 머지 후 시작
- [ ] V-06 stats 통합
