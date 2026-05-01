# W-0354 — CaptureReviewDrawer 5-verdict 정렬 + 키보드 단축키

> Wave: 5 | Priority: P2 | Effort: S
> Charter: In-Scope (기존 verdict 제출 UI 개선 — 신규 로직 없음)
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: TBD

## Goal
CaptureReviewDrawer에서 verdict 5단계(strong_valid → strong_invalid)를 순서대로 볼 수 있고, 키보드 1~5로 빠르게 입력한다.

## Scope
- 포함:
  - `CaptureReviewDrawer.svelte`의 verdict 버튼을 5단계 순서로 정렬: `strong_valid`, `valid`, `near_miss`, `invalid`, `strong_invalid`
  - 키보드 단축키 바인딩: 1=strong_valid, 2=valid, 3=near_miss, 4=invalid, 5=strong_invalid
  - drawer가 열려있을 때만 단축키 활성 (document keydown listener + isOpen guard)
- 파일:
  - `app/src/lib/components/captures/CaptureReviewDrawer.svelte` (수정)
  - `app/src/lib/components/captures/CaptureReviewDrawer.test.ts` (신규 또는 기존 확장)
- API: 없음 (기존 verdict POST 흐름 그대로)

## Non-Goals
- verdict 종류 추가/제거 — 현재 5종 고정
- verdict 제출 후 animation — 별도 UX polish W-item
- 모바일 터치 단축키 — 키보드 전용

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| keydown listener 누수 (drawer 닫힌 후 미제거) | 중 | 중 | Svelte `onDestroy` / `$effect` cleanup 에서 removeEventListener |
| 기존 전역 키 바인딩과 충돌 (1~5가 다른 의미로 사용 중) | 중 | 중 | drawer `isOpen` + drawer 포커스 guard 확인 필수 |
| 버튼 렌더 순서 변경으로 기존 스냅샷 테스트 실패 | 저 | 저 | 스냅샷 업데이트 or DOM 구조 assert로 교체 |

### Dependencies / Rollback / Files Touched
- **Dependencies**: 없음 (독립)
- **Rollback**: verdict 배열 순서 원복 + keydown listener 제거 (1개 파일 변경)
- **Files Touched**:
  - 수정: `app/src/lib/components/captures/CaptureReviewDrawer.svelte`
  - 신규/수정: `CaptureReviewDrawer.test.ts`

## AI Researcher 관점

### Data Impact
- UI 순서 변경만 — 제출 verdict 값 자체 변화 없음
- 키보드 단축키 사용률 telemetry 추가 고려 (선택)

### Statistical Validation
- 기존 verdict 제출 회귀 없음: 5종 verdict 각각 제출 후 payload 동일한지 assert

### Failure Modes
- F1: 키보드 이벤트 drawer 외부에서 발화 → isOpen guard로 차단
- F2: 빠른 연속 키 입력 → debounce 불필요 (각 키 독립적으로 verdict 선택, 실제 제출은 별도 confirm 버튼)

## Decisions
- [D-0354-01] 키 단축키 scope: drawer isOpen 상태일 때만 활성 (전역 충돌 방지)
- [D-0354-02] 키 1~5는 verdict 선택만 (제출 trigger 아님) — 오입력 방지
- [D-0354-03] 버튼 순서 상수 배열로 정의: `VERDICT_ORDER = ['strong_valid', 'valid', 'near_miss', 'invalid', 'strong_invalid']`

## Open Questions
- [ ] [Q-0354-01] 현재 전역 키 바인딩 목록 확인 필요 — 1~5가 다른 곳에 할당되어 있는지?
- [ ] [Q-0354-02] 키 단축키 힌트 UI 추가? (버튼 옆에 "1" 표시)

## Implementation Plan
1. `CaptureReviewDrawer.svelte`에서 현재 verdict 버튼 렌더 코드 위치 확인
2. `VERDICT_ORDER` 상수 배열 정의 후 버튼 map 렌더로 교체
3. `$effect` 또는 `onMount`에서 `keydown` 이벤트 리스너 등록 + `onDestroy` cleanup
4. isOpen guard: `if (!isOpen) return` in keydown handler
5. vitest: 버튼 순서 DOM assert, keydown 1~5 각각 해당 verdict 선택 state 변경 확인
6. 기존 verdict 제출 흐름 회귀 테스트 추가

## Exit Criteria
- [ ] AC1: 5단계 verdict 버튼 순서대로 렌더 — DOM 내 버튼 순서 vitest 검증
- [ ] AC2: keydown '1'~'5' 시 해당 verdict 선택 state 변경 — 5개 assertions
- [ ] AC3: vitest ≥ 3 PASS (신규 테스트 기준)
- [ ] AC4: 기존 verdict 제출 흐름 회귀 없음 (기존 테스트 0 실패)
- [ ] CI green (app vitest + svelte-check)
- [ ] PR merged + CURRENT.md SHA 업데이트
