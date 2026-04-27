# W-0222 — V-04 Sequence Completion Test (M3)

**Owner:** research
**Status:** Ready (PRD only)
**Type:** New module (`engine/research/validation/sequence.py`) — **thin wrapper**
**Depends on:** V-02 (W-0218)
**Effort:** 1 day implementation + 0.5 day test (가장 쉬움 — 3 함수 thin wrap)
**Parallel-safe:** ✅ V-02와 거의 독립

---

## 0. 한 줄 요약

W-0214 §3.2 **M3 Sequence Completion Rate** — phase 1→k 시퀀스 완성도 vs outcome 품질. **pattern_search.py의 3 함수 (`_phase_path_in_order`, `_phase_depth_progress`, `summarize_phase_attempt_records`) thin wrapper**.

## 1. Goal

W-0214 §3.2 M3 + §3.7 G6 (sequence monotonic):
1. phase 1 진입 시점에서 phase k까지 도달 비율
2. 도달 vs 미도달 forward return 비교
3. monotonic violation count

## 2. Owner

research

## 3. Scope

| 파일 | 변경 |
|---|---|
| `engine/research/validation/sequence.py` | new (thin wrapper) |
| `engine/research/validation/test_sequence.py` | new |
| `engine/research/pattern_search.py` | **read-only** (3 함수 import) |

## 4. Non-Goals

- ❌ pattern_search.py 수정 (3 함수 import만)
- ❌ M1/M2/M4 (V-02/V-03/V-05)
- ❌ Sequence learning (LSTM 등) — out of scope

## 5. Exit Criteria

```
[ ] SequenceCompletionResult dataclass (pattern, phase_seq, completion_rate, monotonic_violation_count)
[ ] measure_sequence_completion(pattern, phase_attempts, expected_path) → SequenceCompletionResult
[ ] thin wrapper: 3 함수 (_phase_path_in_order / _phase_depth_progress / summarize_phase_attempt_records) import + 결합
[ ] unit test ≥8 case (edge: 빈 시퀀스, 단일 phase, monotonic 위반)
[ ] integration: 1 P0 pattern × replay → SequenceCompletionResult
[ ] performance: <100ms per pattern (in-memory)
```

## 6. CTO 설계

```python
# engine/research/validation/sequence.py
from dataclasses import dataclass

from engine.research.pattern_search import (
    _phase_path_in_order,
    _phase_depth_progress,
    summarize_phase_attempt_records,
)
from ledger.types import PatternLedgerRecord

@dataclass(frozen=True)
class SequenceCompletionResult:
    pattern_slug: str
    expected_path: tuple[str, ...]
    observed_path: tuple[str, ...]
    completion_rate: float          # 0.0 ~ 1.0
    depth_progress: float            # current phase depth / total phases
    monotonic_violation_count: int   # phase 진행 중 역행 횟수
    n_attempts: int

def measure_sequence_completion(
    pattern_slug: str,
    expected_path: list[str],
    observed_path: list[str],
    phase_attempts: list[PatternLedgerRecord],
    current_phase: str,
) -> SequenceCompletionResult:
    """W-0214 §3.2 M3. 3 함수 thin wrapper."""
    completion = _phase_path_in_order(expected_path, observed_path)
    progress = _phase_depth_progress(expected_path, observed_path, current_phase)
    summary = summarize_phase_attempt_records(phase_attempts)
    # monotonic violation: observed_path에서 expected_path index 역행 count
    violations = _count_monotonic_violations(expected_path, observed_path)
    return SequenceCompletionResult(
        pattern_slug=pattern_slug,
        expected_path=tuple(expected_path),
        observed_path=tuple(observed_path),
        completion_rate=float(completion),
        depth_progress=float(progress),
        monotonic_violation_count=violations,
        n_attempts=len(phase_attempts),
    )

def _count_monotonic_violations(expected: list[str], observed: list[str]) -> int:
    expected_idx = {p: i for i, p in enumerate(expected)}
    last_idx = -1
    violations = 0
    for p in observed:
        if p in expected_idx:
            idx = expected_idx[p]
            if idx < last_idx:
                violations += 1
            last_idx = max(last_idx, idx)
    return violations
```

## 7. AI Researcher 설계

### 7.1 W-0214 §3.2 M3 spec 정합

**spec**: "phase 1 진입 시점에서 phase k까지 도달 비율 vs phase k에서 직접 진입한 시점 forward return 비교"

→ V-04 단독으로 도달률만. forward return 비교는 V-08 pipeline에서 V-02 호출.

### 7.2 G6 acceptance

W-0214 §3.7 G6: "Sequence monotonic — monotonic violation 0".

→ `monotonic_violation_count == 0` → G6 pass.

## 8. Quant Trader 설계

V-04 자체는 통계 X. cost/risk-adj은 V-02에서. V-04는 sequence quality metric만.

## 9. Risk

| Risk | Impact | Mitigation |
|---|---|---|
| `_phase_path_in_order` 함수 시그니처 변경 | 높음 | V-00 augment-only enforce |
| Empty observed_path | 저 | early return rate=0 |
| Expected path 부재 (PatternObject) | 중 | 외부 주입 + skip if None |

## 10. Open Questions

- Q1: monotonic violation count vs binary (any vs none)? → count로 외부 임계 결정 유연성.
- Q2: 같은 phase 반복 (cycle)은 violation? → 일단 N. 후속 ADR.

## 11. Acceptance Test

```bash
test -f engine/research/validation/sequence.py
cd engine && pytest research/validation/test_sequence.py -v
git diff origin/main -- engine/research/pattern_search.py
# → 0 lines
```

## 12. Cross-references

- W-0214 §3.2 M3 + §3.7 G6
- W-0215 §14.4 (M3 매핑 — 3 함수)
- W-0218 V-02 (forward return 비교 시)

## 13. Next

- V-08 pipeline 통합 (V-02 forward return 비교)
- V-11 gate v2 (G6 임계)

---

*W-0222 v1.0 created 2026-04-27 by Agent A033 — V-04 sequence test PRD (thin wrapper) with 3-perspective sign-off.*

---

## Goal
§1 — M3 sequence completion. 3 함수 thin wrapper.

## Owner
§2 — research

## Scope
§3 — `validation/sequence.py` 신규.

## Non-Goals
§4 — pattern_search.py 수정 X / 다른 M X / sequence learning X.

## Canonical Files
§3 — `sequence.py`, `test_sequence.py`.

## Facts
W-0215 §14.4 M3 매핑 (3 함수 thin wrapper 가장 쉬움). W-0214 §3.2 M3.

## Assumptions
3 함수 시그니처 안정 (V-00 enforce). expected_path 외부 주입.

## Open Questions
§10 Q1~Q2.

## Decisions
thin wrapper only. monotonic count (binary X).

## Next Steps
§13 — V-08 통합 + V-11 G6.

## Exit Criteria
§5 — 함수 구현 + unit test 8+ + perf <100ms.

## Handoff Checklist
- [x] PRD v1.0
- [ ] Issue 등록
- [ ] thin wrapper 구현
- [ ] V-08 통합
