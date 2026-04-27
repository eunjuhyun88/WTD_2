# W-0253 — F-60 Gate 경화: min-samples-per-window + near_miss 설계 결정

> Wave 4 P1 | Owner: engine | Branch: `feat/W0253-f60-gate-hardening`
> 선행: PR #437 merge 완료 후 착수

---

## Goal

F-60 multi-period gate의 통계적 신뢰성을 높인다: window당 최소 샘플 수 guard 추가 (#450) + near_miss DENOM 처리 방향 확정 (#451).

---

## Owner

engine

---

## Background (CTO + AI Researcher 진단)

### Issue #450 — min-samples-per-window 없음

현재 `_compute_gate_status()`는 window당 총 개수가 1이어도 accuracy 산입.

```python
# 현재 코드 (engine/stats/engine.py)
for w in windows:
    total = len(w)
    if total > 0:                    # ← 1이어도 통과
        accuracies.append(wins / total)
```

**시나리오**: 200 verdict 중 198이 W0에 집중, W1=1(win), W2=1(loss)
→ median(0.55, 1.00, 0.00) = 0.55 → 통계적으로 무의미하게 PASS 가능

**성능 실측**: 95% CI for p=1.0, n=1 → [0.025, 1.0] — 의미 없는 구간

### Issue #451 — near_miss DENOM Loss 처리의 행동경제학 리스크

현재: `near_miss` = DENOM에 포함 (Loss로 처리)

**자기선택 편향**: 유저가 near_miss 제출 시 accuracy 하락 → 제출 기피
→ LightGBM 훈련 데이터에서 "인식O 체결X" 케이스 누락
→ Layer C 훈련 편향

**결정이 필요한 질문**:
- Option A: near_miss = 게이트 제외 (recognition 게이트 순수화)
- Option B: near_miss = DENOM 유지 + 별도 `execution_rate` 지표 추가

---

## Scope

| 파일 | 변경 내용 | 이유 |
|------|----------|------|
| `engine/stats/engine.py` | `F60_MIN_SAMPLES_PER_WINDOW = 10` 상수 추가, `_compute_gate_status()` 수정 | #450 수정 |
| `engine/tests/test_f60_gate.py` | min-samples 경계값 테스트 3케이스 추가 | 회귀 방지 |
| `spec/CHARTER.md` | near_miss DENOM 처리 결정 사항 기록 | #451 결정 문서화 |
| `engine/stats/engine.py` (선택적) | near_miss 처리 방향 반영 | #451 결정 후 |
| `engine/stats/user_accuracy.py` (선택적) | `_SOFT_LABELS` 조정 | #451 결정 후 |

---

## Non-Goals

- F-60 임계값(0.55 median, 0.40 floor) 변경 — 데이터 없이 튜닝 금지
- LightGBM Layer C 재훈련 — 별도 W-item
- near_miss UI 변경 — 이미 PR #437로 완료

---

## Exit Criteria

- [ ] `F60_MIN_SAMPLES_PER_WINDOW = 10` 적용 후 `test_f60_gate.py` 전체 통과
- [ ] min-samples-per-window 경계 테스트 3케이스 추가 (< 10, = 10, > 10)
- [ ] #451 near_miss 처리 방향 결정 → `spec/CHARTER.md` 반영
- [ ] Engine Tests CI ✅

---

## Facts (코드 실측, 2026-04-27)

```python
# engine/stats/engine.py:35-41 현재
F60_MIN_VERDICT_COUNT = 200
F60_NUM_WINDOWS = 3
F60_WINDOW_DAYS = 30
F60_MEDIAN_THRESHOLD = 0.55
F60_FLOOR_THRESHOLD = 0.40
F60_WIN_LABELS = {"valid"}
F60_DENOM_LABELS = {"valid", "invalid", "near_miss", "too_early", "too_late"}
```

- `_compute_gate_status()`: `engine/stats/engine.py:80-130`
- 현재 insufficient_windows 체크: `len([a for a in accuracies if a > 0]) < 2`
- 테스트: `engine/tests/test_f60_gate.py` — 10케이스, 2026-04-27 기준 모두 통과

---

## Assumptions

- PR #437 merge 완료 (near_miss/too_early 레이블 정상화)
- `engine/.venv` 활성화 + pytest 설치됨
- min-samples=10은 보수적 기본값 — 실 데이터 분포 확인 후 조정 가능

---

## Canonical Files

```
engine/stats/engine.py         ← 핵심 수정
engine/tests/test_f60_gate.py  ← 테스트 추가
engine/stats/user_accuracy.py  ← #451 결정에 따라
spec/CHARTER.md                ← near_miss 결정 기록
```

---

## 구현 가이드 (#450)

```python
# engine/stats/engine.py에 추가
F60_MIN_SAMPLES_PER_WINDOW = 10  # 통계적 최소 신뢰 구간

# _compute_gate_status() 내부 수정
for w in windows:
    total = len(w)
    counts.append(total)
    if total >= F60_MIN_SAMPLES_PER_WINDOW:   # ← 변경
        wins = sum(1 for o in w if getattr(o, "user_verdict", None) in F60_WIN_LABELS)
        accuracies.append(wins / total)
    # total < 10인 window는 accuracies에 미포함 → insufficient_windows 처리
```

---

## 관련 이슈

- [#450](https://github.com/eunjuhyun88/WTD_2/issues/450) min-samples-per-window
- [#451](https://github.com/eunjuhyun88/WTD_2/issues/451) near_miss DENOM 설계 결정
