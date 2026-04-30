# W-0314 — 마켓플레이스 패턴 품질 점수 (Composite Score)

> Wave: 4 | Priority: P2 | Effort: S  (F-60 선행 조건)
> Status: ✅ Implemented — composite_score.py + 18 tests PASS
> Created: 2026-04-29

## Goal

게이트(`n_trades≥200 ∧ win_rate≥0.55`) 통과 패턴들에 대해 **단일 스칼라 0~100**으로 마켓플레이스 노출 순위를 결정하는 알고리즘을 확정한다. 수익성·위험·신뢰도 3축을 분해해서 점수 게임을 어렵게 만든다.

## Scope

- `engine/verification/composite_score.py` (신규, ~120 LoC)
- `PatternCompositeScore` dataclass
- `compute_composite_score(result: PaperVerificationResult) -> PatternCompositeScore`
- Grade 컷오프 S/A/B/C 확정
- `engine/tests/test_composite_score.py` (신규)

**파일**
```
engine/verification/composite_score.py       (NEW)
engine/verification/__init__.py              (export)
engine/tests/test_composite_score.py         (NEW)
```

F-60 구현 시 추가:
```
engine/verification/executor.py              (1 line: compute_composite_score 호출)
engine/marketplace/listing.py                (sort key)
```

## Non-Goals

- F-60 게이트 강화(n_trades≥200) 자체 구현 (별도 work item)
- Marketplace UI/복사 실행 (Wave 4 Frozen)
- 유저별 personalized ranking (Phase 2)
- Live PnL 기반 점수 (paper-only)
- 점수 history 시계열 저장 (latest snapshot만)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 점수 게임 (overfitting toward score) | High | High | 5축 분해 + Sharpe denominator + sample cap |
| MDD≈0인 신생 패턴 과대평가 | Med | Med | confidence_bonus n_trades 의존 → MDD만으로 S 불가 |
| Sharpe NaN/inf | Low | High | clamp + fallback (σ=0 → sharpe_score=50) |
| 가중치 변경 시 기존 점수 invalidate | Med | Low | `score_version: str` + 버전 변경 시 일괄 재계산 |

### Dependencies (F-60과의 관계)

- **F-60 (n_trades≥200 강화)** → W-0314는 F-60 통과 패턴에만 적용
- **W-0298 PV-01** → `PaperVerificationResult` schema 안정화 의존 (frozen=True dataclass 그대로)
- **선행 순서**: W-0314 design lock-in → F-60 구현 시 `compute_composite_score` hook 1줄 추가

### Rollback

- `score_version` 필드 → v1→v2 병행 30일 후 v1 deprecate
- 실패 시 `quality_grade="C"`, `composite=0.0` fallback
- Feature flag `MARKETPLACE_COMPOSITE_SCORE_ENABLED` (default false until F-60)

## AI Researcher 관점

### 복합 점수 수식 상세

```python
composite = (
    0.30 * E_score    # expectancy
  + 0.25 * S_score    # sharpe
  + 0.15 * W_score    # win_rate excess
  + 0.20 * D_score    # drawdown penalty
  + 0.10 * C_bonus    # confidence (sample size)
)  # 합계 1.00, 결과 0~100
```

**E_score (w=0.30) — Expectancy**
```python
E_clipped = clip(expectancy_pct, -0.5, 1.0)   # %, -50bp~+100bp
E_score = 100 * (E_clipped + 0.5) / 1.5        # linear 0~100
```
근거: >1.0%는 fee 미반영/overfit 가능성 → clip이 outlier 폭주 차단

**S_score (w=0.25) — Sharpe**
```python
S_clipped = clip(sharpe, -2.0, 4.0)
S_score = 100 * (S_clipped + 2.0) / 6.0        # Sharpe 0→33, 1→50, 2→67, 4→100
if not isfinite(sharpe): S_score = 50.0        # variance=0 fallback
```

**Sharpe vs Sortino 선택**: Sharpe. win_rate≥55% 게이트 → upside skew 있음. Sortino는 downside만 → n=200 small sample에서 분모 폭발. D_score(MDD)가 downside risk 별도 반영.

**W_score (w=0.15) — Win Rate Excess**
```python
W_excess = max(0, win_rate - 0.55)             # 게이트 기준 초과분
W_score = 100 * min(1.0, W_excess / 0.20)      # 0.75+ → saturate 100
```
근거: 0.75 이상은 overfit 의심 → saturate로 win_rate 무한 올리기 방어

**D_score (w=0.20) — Drawdown (sqrt convex penalty)**
```python
DD = min(50.0, abs(max_drawdown_pct))
D_score = 100 * (1.0 - (DD / 50.0) ** 0.5)    # DD 5%→68, 10%→55, 25%→29, 50%→0
```
근거: sqrt convex → 작은 DD 관대, 큰 DD 가파른 페널티 (linear보다 변별력)

**C_bonus (w=0.10) — Confidence (log scale)**
```python
C_bonus = 100 * min(1.0, log10(n_trades / 200) / 1.0)
# n=200→0, n=400→30, n=632→50, n=1000→70, n=2000→100 (saturate)
```
근거: log scale → 한계효용 체감 자연. 2000 saturate → n 무한 키우기 방어

### Grade 컷오프

| Grade | Composite | 예상 분포 |
|---|---|---|
| **S** | ≥ 85 | ~5% (모든 축 강함) |
| **A** | 70~84 | ~20% |
| **B** | 55~69 | ~50% (평균) |
| **C** | < 55 | ~25% |

평균 패턴(win=0.60, sharpe=1.5, DD=-15%, exp=0.1%, n=200) ≈ 58점 → median B.

### Failure Modes

1. Low-vol scalping (σ→0 → sharpe 폭발): D_score(MDD 절대값) + E_score(절대 exp) 방어
2. 99% win + 1% catastrophic: W_score saturate + D_score MDD 직접 페널티
3. Sample inflation (짧은 TF로 n 폭증): C_bonus log scale + 2000 saturate

## Decisions

- **[D-0314-1]** 가중치: **고정값 0.30/0.25/0.15/0.20/0.10**, `score_version="v1"`. 유저별 가중치 → sort 정의 불가
- **[D-0314-2]** 공개: **composite + grade + component_scores 전부 공개**. 5축 분해 투명성이 신뢰의 기본
- **[D-0314-3]** 갱신: **새 verdict 기록 시 write-through + nightly 일괄 재계산** (window metric drift 보정)

## Open Questions

- [ ] [Q-0314-1] Live divergence(paper vs live gap) -10pt penalty → F-60 후속 W-0314.1에서 결정
- [ ] [Q-0314-2] 패턴 카테고리별(scalp/swing) separate ranking? → v1은 통합, avg_duration_hours 필터만

## Implementation Plan

```python
# engine/verification/composite_score.py (전체 구현)

SCORE_VERSION = "v1"
WEIGHTS = {"E": 0.30, "S": 0.25, "W": 0.15, "D": 0.20, "C": 0.10}
GRADE_CUTS = {"S": 85.0, "A": 70.0, "B": 55.0}

@dataclass(frozen=True)
class PatternCompositeScore:
    pattern_slug: str
    composite: float
    quality_grade: str
    component_scores: dict[str, float]
    score_version: str
    computed_at: datetime
```

1. `composite_score.py` 신규 작성
2. `engine/verification/__init__.py` export
3. `engine/tests/test_composite_score.py` (12+ assertions)
4. F-60 구현 시 `executor.py` hook 1줄 추가
5. `docs/decisions/D-0314.md` lock-in

## Exit Criteria

- [ ] AC1: P1(exp=0.02%, sharpe=1.0, win=0.58, DD=-15%, n=200) vs P2(exp=0.20%, sharpe=2.5, win=0.65, DD=-8%, n=400) → composite 차이 ≥ 15pt, P2 grade≥A, P1 grade=C
- [ ] AC2: n_trades=200 vs n_trades=2000 → C_bonus 차이 정확히 10.0pt (w=0.10 × 100)
- [ ] AC3: max_drawdown_pct=-50% 패턴 (다른 축 평균) → D_score=0 → composite ≤ 69 (B 이하)
- [ ] AC4: sharpe=NaN/inf → S_score=50 fallback, composite 계산 성공
- [ ] AC5: 동일 입력 두 번 → composite 동일 (computed_at 제외 deterministic)
- [ ] AC6: 가중치 합 = 1.0 (단위 테스트)
- [ ] AC7: pytest 12+ assertions PASS
