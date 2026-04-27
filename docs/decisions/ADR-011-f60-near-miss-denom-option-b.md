# ADR-011 — F-60 Gate: near_miss DENOM 처리 Option B 확정

**Date**: 2026-04-28
**Work Item**: W-0253 (issue #451)
**Status**: ACCEPTED

---

## 결정

F-60 gate `_compute_gate_status()`에서 `near_miss` 레이블은 **DENOM(분모)에 포함**한다 (Option B).

```python
F60_DENOM_LABELS = {"valid", "invalid", "near_miss", "too_early", "too_late"}
# near_miss = loss로 처리 (win 아님, 분모에 포함)
```

## 선택지

- **Option A**: near_miss = 게이트 제외 (recognition 게이트 순수화)
- **Option B**: near_miss = DENOM 유지 + 행동경제학 리스크 별도 `execution_rate` 지표로 추적

## 근거

1. **데이터 연속성**: F-02-fix(PR #472)에서 `missed → near_miss` 레이블 rename. DENOM에서 제외하면 기존 `missed` 데이터와의 연속성이 끊김.
2. **자기선택 편향 완화**: near_miss를 DENOM에서 제외하면 유저가 accurate 유저로 분류되어 grade inflation 발생. DENOM 포함 시 실제 타이밍 미스가 정확도에 반영됨.
3. **LightGBM 훈련 다양성**: near_miss = "인식O 체결X" 케이스 — Layer C 훈련 시 false negative를 줄이는 데 필요한 음성 예시. 제외하면 훈련 편향.
4. **행동경제학 리스크 별도 추적**: near_miss 제출 기피(accuracy 하락 우려)는 별도 `execution_rate` 지표로 모니터링 (W-0262+ 이후).

## 코드 위치

`engine/stats/engine.py:42` — `F60_DENOM_LABELS`
`engine/stats/user_accuracy.py` — `_SOFT_LABELS` (near_miss 포함)
