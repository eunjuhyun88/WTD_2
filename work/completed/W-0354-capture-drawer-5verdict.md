---
id: W-0354
title: CaptureReviewDrawer 5-verdict alignment
status: design
wave: 5
priority: P1
effort: S
owner: app
issue: "#764"
created: 2026-04-30
---

# W-0354 — CaptureReviewDrawer 5-verdict alignment

> Wave: 5 | Priority: P1 | Effort: S
> Owner: app
> Status: 🟡 Design Draft
> Created: 2026-04-30

## Goal
Jin이 Chart Drawer에서 capture를 리뷰할 때 VerdictInbox와 동일한 5개 옵션(valid / invalid / near_miss / too_early / too_late)을 보고, 어디서든 같은 라벨링 체계로 verdict를 제출한다.

## Scope
### Files
- `app/src/components/terminal/chart/CaptureReviewDrawer.svelte` — 실측:
  - 20행 `onVerdict?: (captureId: string, verdict: 'valid' | 'invalid' | 'missed') => void` → `'valid' | 'invalid' | 'near_miss' | 'too_early' | 'too_late'`
  - 45~47행 `VERDICT_LABEL` map: `missed: '⚠️ Missed'` 제거, 4개 신규 추가 (`near_miss`, `too_early`, `too_late`)
  - 60행 `_submitVerdict(verdict: 'valid' | 'invalid' | 'missed')` 시그니처 5-union으로 교체
  - 168~183행 verdict-buttons 영역: 3 버튼 → 5 버튼 (VerdictInboxPanel 237~270행 참조)
- `app/src/components/terminal/peek/VerdictInboxPanel.svelte` — 라벨/색 일관성 비교 (변경 없음, 이미 5-verdict 지원)
- `engine/api/routes/captures.py:69` — `VerdictLabel = Literal["valid", "invalid", "near_miss", "too_early", "too_late"]` (실측: 이미 5종, 변경 없음 — 단, "missed"는 절대 받지 않음 확인)
- `app/src/components/terminal/chart/__tests__/W0354_drawer_verdict.test.ts` (신규) — 5 버튼 렌더 + 클릭 → API body 일치 검증

### API Changes
- 없음 (engine은 이미 5-verdict 수용 중)
- `missed` 라벨은 deprecated → app에서 발송 차단 (UI 옵션 제거로 자연 차단)

### Schema Changes
- 없음

## Non-Goals
- 신규 verdict label 추가 (e.g. "unclear" — 사용자 spec과 달리 engine은 미지원)
- VerdictModal (앱 별도 화면) 변경 — 이미 5-verdict 지원 추정
- verdict 기반 자동 학습 (W-0351에서 별도)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 기존 "missed" 라벨로 저장된 historical capture | M | M | DB read는 그대로 허용, write만 차단 (frontend) — 실측: engine VerdictLabel `missed` 미포함이므로 기존에 저장된 missed는 없음. 가정 검증 필요 (DB grep) |
| 5 버튼이 좁은 drawer에 안 들어감 | H | L | flex-wrap + 2x3 grid 또는 dropdown |
| 사용자가 too_early/too_late 의미 헷갈림 | M | M | tooltip (VerdictInboxPanel 라인 252, 258 참조) 동일 적용 |
| `onVerdict` 시그니처 변경으로 호출처 깨짐 | M | M | grep callsite 모두 수정 (1~2곳 추정) |

### Dependencies
- 없음 (engine은 이미 준비됨)

### Rollback
- CaptureReviewDrawer.svelte 단일 파일 revert

## AI Researcher 관점

### Data Impact
- 라벨 일관성 ↑ → near_miss/too_early/too_late가 모든 입력 경로에서 수집됨
- 학습 셋의 라벨 분포 균등화 (이전: drawer는 3종만 → invalid에 잘못 합류했을 가능성)

### Statistical Validation
- 배포 후 7일 capture verdict 분포 변화 측정
- 가설: drawer 경로에서 near_miss + too_early + too_late 합산 비율 ≥ 15% (이전 0%)

### Failure Modes
- 사용자가 too_early와 missed 구분 못함 → tooltip + 7일 후 사용 빈도 분석
- 모바일에서 5 버튼 tap 영역 협소 → min 44px touch target 보장

## Implementation Plan
1. app: `CaptureReviewDrawer.svelte` 시그니처/라벨/버튼 5-verdict로 통일
2. app: tooltip 텍스트 VerdictInboxPanel과 동일하게 복제
3. app 단위 테스트: vitest로 5 버튼 렌더 + 각 클릭 시 `onVerdict` 콜백 인자 검증
4. svelte-check / typecheck 통과 확인
5. visual snapshot 갱신 (drawer)

## Exit Criteria
- [ ] AC1: CaptureReviewDrawer에 5개 verdict 버튼 렌더 (valid/invalid/near_miss/too_early/too_late), missed 버튼 0개
- [ ] AC2: 각 버튼 클릭 → `POST /api/captures/{id}/verdict` body.verdict가 정확한 라벨로 전송 (5 case 테스트)
- [ ] AC3: 320px 모바일 viewport에서 모든 버튼 tap 영역 ≥ 44px
- [ ] AC4: `onVerdict` 콜백 시그니처 grep 일치, "missed" 문자열 0건 (drawer 한정)
- [ ] CI green (vitest + svelte-check)
- [ ] PR merged + CURRENT.md SHA 업데이트
