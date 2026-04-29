# W-0287 — BH Cross-Pattern FDR Correction

> Wave: MM | Priority: P2 | Effort: S
> Charter: In-Scope L5 (Research/Validation pipeline quality)
> Status: 🟡 Design Draft
> Created: 2026-04-29 by Agent A076
> Depends on: W-0286 ✅ PR #560

---

## Goal

`run_validation_pipeline`이 패턴별로 독립 호출되는 현재 구조에서, 다중 패턴 배치 실행 시 Benjamini-Hochberg FDR 보정을 cross-pattern (52패턴 × 3h = 156 p-value) 수준으로 적용한다. 현재 intra-pattern (3개 p-value) BH는 FDR 보정 강도가 설계 의도의 1/52에 불과하다.

---

## Scope

- 포함: `engine/research/validation/runner.py` (batch runner 추가)
- 포함: `engine/research/validation/pipeline.py` (raw_p_values 외부 노출 옵션)
- 파일: `engine/research/validation/stats.py` (bh_correct 재사용, 변경 없음)
- API surface: 없음 (internal computation)

## Non-Goals

- 단일 패턴 평가 경로 변경 (기존 `run_validation_pipeline` 시그니처 유지)
- BCa bootstrap (별도 후속 작업)
- 실시간 gate 경로 변경 (batch 분석 전용)

---

## Facts (코드 실측)

```
engine/research/validation/runner.py:55 — run_full_validation(research_run_id)
  패턴 1개씩 독립 호출. p-value 반환 안 함.

engine/research/validation/pipeline.py:570-573
  bh_correct(raw_p_values, alpha=config.bh_alpha) — 3개 p-value (1패턴×3h)

engine/research/validation/stats.py:145
  bh_correct(p_values, alpha=0.05) — 외부 호출 가능, 리스트 입력 지원

engine/research/validation/pipeline.py:220
  ValidationReport.horizon_reports: list[HorizonReport]
  HorizonReport.p_vs_b0: float — raw p-value 이미 저장됨
```

**핵심 관측**: `p_vs_b0`는 이미 `HorizonReport`에 저장되어 있다. cross-pattern BH는 모든 패턴의 결과를 수집한 후 p-value 배열을 재보정하면 된다. 새로운 파이프라인 수정 없이 post-hoc aggregation으로 구현 가능.

---

## CTO 설계 결정

### 구현 전략: Post-hoc aggregation (비파괴적)

기존 `run_validation_pipeline` 수정 없이 새 배치 함수 추가:

```python
# engine/research/validation/runner.py 에 추가

def run_batch_validation_with_cross_bh(
    research_run_ids: list[str],
    *,
    config: ValidationPipelineConfig | None = None,
    btc_returns: pd.Series | None = None,
    bh_alpha: float = 0.05,
) -> dict[str, GateV2Result]:
    """패턴 배치 실행 후 cross-pattern BH FDR 재보정."""
    # 1. 각 패턴 개별 실행 (기존 run_full_validation 재사용)
    # 2. 모든 HorizonReport.p_vs_b0 수집 (N×H 배열)
    # 3. bh_correct(all_p_values, alpha) 일괄 적용
    # 4. 보정된 p-value로 overall_passed 재판정
```

### 성능

- 52패턴 순차 실행: ~5초 (per-pattern ~100ms)
- 배치 BH 재보정: O(N log N) — 무시할 수 있음
- 기존 단일 패턴 경로: **변경 없음**

### Rollback

- 신규 함수 추가만 (기존 삭제 없음) → revert = 함수 삭제

---

## AI Researcher 관점

### 현재 vs 목표 FDR 제어

| | 현재 (intra-pattern) | 목표 (cross-pattern) |
|--|---------------------|---------------------|
| BH 입력 크기 | 3 (1패턴 × 3h) | 156 (52패턴 × 3h) |
| 개별 테스트 α | 0.05 | 0.05 |
| 실제 FDR 제어 | ~0.05 × 52 ≈ 2.6 (uncontrolled) | ≤ 0.05 |
| 예상 overall_pass 변화 | — | 감소 (더 엄격) |

### 통계적 유효성

- BH는 독립 또는 PRDS(Positive Regression Dependency) 조건에서 FDR ≤ α 보장 (Benjamini & Hochberg 1995)
- 패턴들의 p-value가 완전 독립은 아니지만 (BTC 가격 공통 드라이버), PRDS 조건은 충족 가능
- 샘플 크기 영향 없음 (BH는 p-value 순위 기반)

### 실데이터 시나리오

- 현재 53개 PatternObject corpus 기준: 53×3h = 159 p-value 배치
- 예상 통과율 변화: overall_pass 패턴 수 10-20% 감소 예상 (더 엄격한 기준)
- F-60 gate 임계값 impact 평가 필요

---

## Exit Criteria

- [ ] AC1: `run_batch_validation_with_cross_bh([id1, id2, ...])` 실행 → 각 패턴의 `p_bh_vs_b0` 값이 단독 실행보다 크거나 같음 (보정 후 더 보수적)
- [ ] AC2: 배치 입력 1개일 때 단독 실행과 동일 결과 (backward compat 검증)
- [ ] AC3: `bh_correct` 호출 1회로 156개 p-value 처리 확인 (분산 호출 금지)
- [ ] AC4: 기존 1624 tests 통과
- [ ] AC5: 신규 pytest 2개 (배치 BH 수치 회귀 + single-item 동등성)

---

## Implementation Plan

1. `ValidationReport`에 `raw_p_values: list[float]` property 추가 (HorizonReport에서 collect)
2. `runner.py`에 `run_batch_validation_with_cross_bh()` 함수 추가
3. 테스트 2개 작성
4. docstring에 "intra-pattern BH는 유지, cross-pattern은 이 함수 사용" 명시

## References

- Benjamini & Hochberg (1995) — BH procedure
- W-0286 `pipeline.py` bh_scope 주석 (intra-pattern 문서화)
- `engine/research/validation/stats.py:145` — `bh_correct` 공개 API
