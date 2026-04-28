# W-0286 — Quant Stats Correctness: DSR horizon_hours, BH scope, ddof bias

> Wave: MM | Priority: P1 | Effort: S
> Charter: In-Scope L5 (Search) — MM Hunter validation pipeline quality
> Status: 🟡 Design Draft (사용자 검토 대기)
> Created: 2026-04-29 by Agent A076
> Branch: feat/W-quant-signal-hardening

---

## Goal

`engine/research/validation/` 3개 통계 버그를 수정하여 G1/G2 gate가 수학적으로 올바른 스케일에서 동작하게 한다.

---

## Background — 6-axis fix (b3d5cd34) 이후 잔존 이슈

이전 세션에서 아래 6개를 수정했다:
- periods_per_year 252×24 → 365×24
- n_trials 15 → 500
- overall_passed: G1+G2 mandatory
- hit_rate 0.52 → 0.55
- OI z-score window 24h → 7d
- pct_change → log returns (features)

코드 라인 레벨 PhD 분석에서 **3개 추가 이슈** 발견.

---

## Scope

- 포함: `engine/research/validation/stats.py`, `engine/research/validation/pipeline.py`
- API surface: 없음 (pure computation, no HTTP change)
- 기존 테스트 갱신 + 신규 수치 회귀 테스트 추가

## Non-Goals

- `phase_eval.py`의 리턴 산출 방식 변경 (arithmetic pct → 별도 작업)
- BH cross-pattern 완전 통합 (호출자 쪽 리팩 필요 → Phase 2 후보)
- `bootstrap_ci` BCa 업그레이드 (Efron 1987, 후속 작업)

---

## 이슈 상세

### Issue 7 — `deflated_sharpe` 내부 `horizon_hours=1` 하드코딩 [HIGH]

**위치**: `stats.py:317-319`
```python
sr = annualized_sharpe(
    arr, horizon_hours=1, periods_per_year=periods_per_year  # ← BUG
)
```

**이유**: `deflated_sharpe`는 `horizon_hours` 파라미터가 없어서 내부적으로 항상 1h 스케일로 Annualized Sharpe를 계산한다.

**impact**: 24h 패턴의 경우:
- 올바른 SR = mean/std × sqrt(365×24/24) = mean/std × 19.1
- 현재 SR = mean/std × sqrt(365×24/1) = mean/std × 93.5 → 4.9× 과팽창

Mertens(2002) sigma_SR² = (1 − skew·SR + (kurt−1)/4 · SR²) / (n−1)에서 SR² 항이 24× 과팽창 → sigma_SR 과추정 → sr_threshold 과추정 → DSR 값이 틀린 스케일에서 계산됨.

**Fix**: `deflated_sharpe`에 `horizon_hours: int = 1` 파라미터 추가 + `annualized_sharpe` 호출 시 전달. pipeline.py에서 `deflated_sharpe(samples_a, n_trials=config.n_trials, horizon_hours=h)` 로 호출.

---

### Issue 8 — BH FDR 보정 범위: 단일-패턴 내 3개 horizon [MEDIUM]

**위치**: `pipeline.py:570-573`
```python
_rejected, corrected_p = bh_correct(raw_p_values, alpha=config.bh_alpha)
```

**현재 범위**: 1패턴 × `len(horizons_hours)` = 3 p-value

**이론적 올바른 범위**: 52패턴 × 3 horizon = 156 p-value를 동시에 BH 보정

**현실적 제약**: `run_validation_pipeline`이 패턴별로 독립 호출됨. Cross-pattern BH는 호출자 (production runner)가 모든 패턴 결과 수집 후 재보정해야 함. 이는 이 티켓 scope 밖 (파이프라인 runner 레벨 변경).

**이번 Fix**: 이슈를 문서화하고, `ValidationReport.bh_scope` 필드에 `"intra_pattern"` 값 명시 + `ValidationPipelineConfig.bh_scope_warning` 주석 추가. 완전한 cross-pattern BH는 별도 W-0287로 분리.

---

### Issue 9 — `annualized_sharpe` ddof=0 편향 [LOW-MEDIUM]

**위치**: `stats.py:232`
```python
if len(arr) < 2 or arr.std() < 1e-9:  # arr.std() = ddof=0
```

**문제**: numpy `arr.std()` 기본값은 `ddof=0` (모집단 표준편차). 표본에서 추정할 때는 `ddof=1`이 불편추정량.

- n=20: ddof=0은 `sqrt(n/(n-1)) = sqrt(20/19) = 1.026` 과팽창
- n=50: 1.010 (minor)
- n=100: 1.005 (negligible)

패턴당 평균 n~80 가정 시 SR 0.8% 과팽창. n_trials=500 DSR 임계값에서 borderline 패턴에 영향.

**Fix**: `arr.std()` → `arr.std(ddof=1)` 1곳. 단, `n < 2` 가드가 이미 있으므로 ddof=1 안전.

---

## CTO 관점 (Engineering)

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Issue 7 Fix: 기존 DSR 수치 변동 | HIGH | MEDIUM | 수치 회귀 테스트로 변동량 명시 |
| Issue 9 Fix: Sharpe 소폭 감소 | HIGH | LOW | n≥50 패턴에서 0.5% 미만 |
| BH scope 문서화 → 후속 W-0287 | LOW | n/a | 이번은 문서만 |

### Dependencies

- 선행: b3d5cd34 (6-axis fix) ✅ merged
- 차단 없음: stats.py는 standalone, pipeline.py augment-only

### Rollback Plan

- `git revert b3d5cd34`로 rollback 가능 (단일 commit)
- 수치 변동은 테스트로 문서화

### Files Touched (예상)

- `engine/research/validation/stats.py:317` — `deflated_sharpe` horizon_hours param (3줄)
- `engine/research/validation/stats.py:232` — `arr.std()` → `arr.std(ddof=1)` (1줄)
- `engine/research/validation/pipeline.py:544` — `deflated_sharpe` 호출 시 `horizon_hours=h` 추가 (1줄)
- `engine/research/validation/pipeline.py:92-95` — `bh_scope_warning` 주석 추가 (3줄)
- `engine/tests/research/validation/test_stats.py` — 수치 회귀 테스트 추가

---

## AI Researcher 관점 (Data/Model)

### Impact Matrix: 6-axis fix (이미 merged) + Issue 7/9

| 지표 | 이전 (buggy) | 6-axis fix 후 | +Issue7 fix 후 | 방향 |
|---|---|---|---|---|
| SR (Sharpe 1h) | `mean/std × sqrt(252×24)` | `mean/std × sqrt(365×24)` | ddof=1 | 소폭 ↓ |
| SR (Sharpe 24h) | `mean/std × sqrt(252×24/24)` | `mean/std × sqrt(365×24/24)` | ddof=1 | 소폭 ↓ |
| DSR (G2) @ 24h | 내부적으로 1h-scaled SR로 계산 → 4.9× 왜곡 | 동일 왜곡 (미수정) | **올바른 24h scale** | 수정됨 |
| DSR threshold @ n=500 | ≈3.00σ_SR (1h scale에서) | 동일 | **올바른 3.00σ_SR (24h)** | 신뢰도 ↑ |
| overall_passed 비율 | 과다 통과 | G1+G2 의무 → ↓ | 추가 감소 예상 | 더 엄격 |

### Statistical Validation

- 현재 53패턴 중 overall_passed 비율 측정 → before/after 비교
- G2 (DSR) 통과율 24h horizon에서 Issue 7 fix 전후 비교
- 목표: false positive rate < 5% (BH α=0.05 정의)

### Failure Modes

1. 너무 엄격: 유효 패턴이 실패 → F-60 gate 통과 패턴 수 급감 → 마켓플레이스 공급 부족
2. Issue 7 fix 후 DSR 24h 패턴이 대량 실패 → 1h 패턴 편향 심화
3. ddof=1: n<10 guard 있어서 zero-division 없음

---

## Decisions

- [D-286-1] BH cross-pattern 통합을 별도 W-0287로 분리 (이번 이슈 scope: intra-pattern 문서화만)
  - 거절: 이번에 runner 레벨 리팩 → scope 확장, 다른 패턴 결과에 사이드이펙트 위험
- [D-286-2] `deflated_sharpe` 시그니처에 `horizon_hours` 추가 (기본값 1 → backward compatible)
  - 거절 옵션: 별도 함수 `deflated_sharpe_h` → 중복, 불필요

---

## Open Questions

- [ ] [Q-286-1] Issue 7 fix 후 24h 패턴 DSR 통과율이 얼마나 변하는지 실데이터로 측정 필요?
  - 현재 추정: DSR은 `(SR - threshold) / sigma_SR` — fix 후 SR scale이 낮아지므로 threshold도 낮아짐. 순방향은 수치 실험 필요.

---

## Implementation Plan

1. **`stats.py` Issue 9**: `arr.std()` → `arr.std(ddof=1)` (1줄)
2. **`stats.py` Issue 7**: `deflated_sharpe(...)` 시그니처에 `horizon_hours: int = 1` 추가, 내부 `annualized_sharpe` 호출에 전달
3. **`pipeline.py`**: `deflated_sharpe(samples_a, n_trials=config.n_trials, horizon_hours=h)` 업데이트
4. **`pipeline.py`**: `bh_alpha` docstring에 "intra-pattern scope" 명시
5. **테스트**: DSR 수치 before/after 어설션 + ddof=1 Sharpe 어설션 추가

---

## Exit Criteria

- [ ] AC1: `deflated_sharpe(arr, n_trials=500, horizon_hours=24)` != `deflated_sharpe(arr, n_trials=500, horizon_hours=1)` (수치 테스트)
- [ ] AC2: `annualized_sharpe([0.1]*20) < annualized_sharpe_old([0.1]*20)` — ddof=1이 ddof=0보다 작음
- [ ] AC3: `pipeline.py`에서 `deflated_sharpe` 호출 시 `horizon_hours=h` 전달 확인
- [ ] AC4: 기존 1624 테스트 통과
- [ ] AC5: CI green + CURRENT.md SHA 업데이트

---

## References

- stats.py:317 — deflated_sharpe horizon_hours=1 hardcode
- stats.py:232 — arr.std() ddof=0
- pipeline.py:544 — deflated_sharpe call without horizon_hours
- Bailey & López de Prado (2014) eq.10 — DSR formula
- Mertens (2002) — SR variance under non-normal returns (sigma_SR formula)
- Efron (1979) — Bootstrap CI (percentile method, seed=42 concern → future BCa)
