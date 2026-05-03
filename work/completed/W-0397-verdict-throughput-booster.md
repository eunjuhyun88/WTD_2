# W-0397 — Verdict Throughput Booster

> Wave: 6 | Priority: P0 | Effort: S
> Charter: In-Scope (L6 Ledger flywheel)
> Issue: #962
> Status: 🟡 Design Draft
> Created: 2026-05-03

## Goal
VerdictInboxPanel 1-tap 키보드 단축키 + 5초 undo + Layer C ETA 카운터를 추가해 verdict throughput을 현재 ~2min/verdict에서 ≤2s/verdict로 낮추고, 첫 Layer C 훈련 트리거(50 verdicts) 도달 속도를 가속화한다.

## Context
- VerdictInboxPanel.svelte (601줄): 5-cat 버튼 이미 있음, 키보드 없음
- auto_trainer.py (W-0394): 첫 훈련 트리거 = verdicts ≥ 50 (doubling schedule)
- F-60 gate API: `/api/users/{id}/f60-status` 실존

## Scope

### 구현 항목

1. **키보드 단축키** (VerdictInboxPanel focused 시)
   - `1` → valid, `2` → invalid, `3` → near_miss, `4` → too_early, `5` → too_late
   - Section 2 (REVIEW)의 첫 번째 pending item에 바인딩
   - 패널 focused 상태에서만 활성화 (전역 충돌 방지)

2. **5초 Undo**
   - submitVerdict() 직후 → `undoState = { captureId, verdict, expiresAt }`
   - 5초 타이머 중 Undo 버튼 표시 (progress bar 포함)
   - undo 클릭 → `DELETE /api/captures/{id}/verdict` (또는 재submit with `null`)
   - 5초 후 → `undoState = null`, 실제 확정

3. **Layer C ETA 카운터** (패널 상단 배지)
   - `GET /api/users/{id}/f60-status` → `verdict_count` 읽기
   - 표시: `Layer C: 23/50` (훈련까지 27개 남음)
   - 50 초과 시 `Layer C: Active ✓` 표시
   - 30초 폴링 (submitting 시 즉시 갱신)

4. **Outlier 경보**
   - 연속 5개 동일 verdict 제출 → 경고 토스트 "같은 판정 5번 연속 — 맞나요?"
   - localStorage 기반 (세션 내 카운터)

### 파일 범위
- `app/src/lib/hubs/terminal/peek/VerdictInboxPanel.svelte` (주 수정)
- `app/src/routes/api/captures/[capture_id]/verdict/+server.ts` (undo DELETE 지원 확인)

## Non-Goals
- VerdictCard.svelte, VerdictBanner.svelte 수정 없음 (별도 컴포넌트)
- 글로벌 키보드 단축키 (패널 focused 시만)
- 모바일 gesture (wave 6+ 별도)

## CTO 관점

### 리스크 매트릭스
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 1-5 숫자키 ↔ ⌘K CommandPalette 충돌 | 중 | 중 | $focused 상태 게이트, e.stopPropagation() |
| 5초 undo 중 페이지 이탈 → verdict 날아감 | 중 | 중 | beforeunload 경고 ("1개 verdict 미확정") |
| ETA 카운터 30초 폴링 → API 과부하 | 저 | 저 | AbortController + visibility API (hidden 시 폴링 중지) |
| Undo DELETE API 미존재 | 중 | 고 | PR 전에 `app/src/routes/api/captures/[capture_id]/verdict/+server.ts` 확인 필수 |

### 거절 옵션
- **"전역 단축키"** → 거절. 다른 패널 포커스 시 충돌 (AnalysisHub 등 입력 필드)
- **"토스트 없이 즉시 확정"** → 거절. 오클릭 시 데이터 오염, 해자 데이터 신뢰도 저하

## AI Researcher 관점

### 데이터 품질 보호
- Undo = 오클릭 방지 (verdict 오염 방어선)
- Outlier 경보 = consecutive same-label ≥ 5 → human in the loop
- Layer C ETA = 훈련까지 남은 거리를 가시화 → 행동 유도 (gamification)

### 예상 throughput 개선
| 방법 | 예상 시간/verdict | 개선 |
|---|---|---|
| 현재 (마우스 클릭) | ~3-5초 | baseline |
| 키보드 단축키 | ~0.5-1초 | ~5× |
| 키보드 + ETA 동기 | ~0.5초 | ~7× |

50 verdicts 목표: 현재 ~4-7시간 → 개선 후 ~30분 (집중 세션 1회)

## Decisions
- **[D-1]** undo DELETE vs re-submit null: `DELETE /api/captures/{capture_id}/verdict` 엔드포인트 신설. 이유: null re-submit은 기록이 남아 분석 오염.
- **[D-2]** ETA 카운터 target = 50 (Layer C 첫 훈련). 이유: `_TRIGGER_THRESHOLDS` 최솟값.
- **[D-3]** 패널 focused 게이트 = `tabindex="0"` + `onfocus`/`onblur` Svelte 5 state. 이유: 전역 keydown 피하고 aria-accessible.

## Open Questions
- [ ] [Q-1] `app/src/routes/api/captures/[capture_id]/verdict/+server.ts` — DELETE 메서드 이미 있는가? 없으면 PR에 추가 필요.
- [ ] [Q-2] VerdictInboxPanel이 복수 열릴 수 있는가? (duplicate key listener 방어)

## Implementation Plan
1. VerdictInboxPanel.svelte: `tabindex="0"` + `$focused` state + keydown handler (1-5)
2. `submitVerdict()` → `undoState` 세팅 + 5초 setTimeout → 실제 API 호출
3. Undo UI: 상단 배너 (progress bar 5초), keyboard Escape도 undo
4. ETA 위젯: `onMount` + 30초 setInterval + `count_labelled_verdicts` → `/api/users/{id}/f60-status`
5. Outlier 감지: localStorage `vip_consecutive` 카운터 ≥ 5 → toast
6. DELETE 엔드포인트 존재 확인 → 없으면 `+server.ts` DELETE handler 추가
7. 테스트: Playwright e2e (1-tap keyboard flow) + unit (outlier counter)

## Exit Criteria
- [x] AC1: 키보드 1-5가 Section 2 첫 아이템에 정확히 매핑, non-focused 시 작동 안 함
- [x] AC2: submitVerdict() 후 5초 undo 버튼 표시 (타이머 취소 방식)
- [x] AC3: ETA 카운터 `/api/users/{id}/f60-status` 응답과 ±0 오차
- [x] AC4: 연속 5개 동일 verdict → toast 1회 (중복 없음)
- [x] AC5: svelte-check 0 errors ✅, capture vitest 4/4 pass ✅
- [ ] AC6: CI green, PR #965 merged, CURRENT.md main SHA 업데이트
