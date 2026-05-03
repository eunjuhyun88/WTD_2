# W-0397 — Verdict Throughput Booster: Keyboard Shortcuts + 5s Undo + Layer C ETA

> Wave: 6 | Priority: P0 | Effort: S
> Charter: In-Scope (Terminal Hub UX)
> Issue: #962
> PR: #965
> Status: 🟢 PR #965 open, CI 대기
> Created: 2026-05-03

## Goal
VerdictInboxPanel에서 키보드 단축키(1-5)로 verdict 입력 + 5초 undo + Layer C 진행 ETA 배지를 추가해 검토 처리량을 2-3배 향상.

## Owner
app

## Scope
- `app/src/lib/hubs/terminal/peek/VerdictInboxPanel.svelte` — 키보드 단축키 1-5, 5초 undo bar, Layer C ETA 배지
- `app/src/routes/api/users/[userId]/f60-status/+server.ts` — Layer C 진행률 프록시 신규 route

## Non-Goals
- 엔진 모델 재학습 트리거 (W-0398 범위)
- 모바일 제스처 기반 verdict (별도 작업)

## Exit Criteria
- [ ] AC1: 패널 포커스 상태에서 키 1-5 → 첫 REVIEW 항목에 해당 verdict 적용, undo bar 표시
- [ ] AC2: 5초 undo window → Escape 또는 Undo 버튼 누르면 취소, 재표시
- [ ] AC3: 5초 경과 후 API 커밋 (낙관적 숨김)
- [ ] AC4: Layer C 배지 — `Layer C N/50` → `Layer C ✓` (threshold 도달 시)
- [ ] AC5: 5회 연속 동일 verdict → outlier 경고 toast
- [ ] CI green, svelte-check 0 errors

## Facts
- VerdictInboxPanel.svelte 기존 위치: `app/src/lib/hubs/terminal/peek/`
- f60-status route: `/api/users/[userId]/f60-status` 신규 생성
- PR #965에 구현 완료 상태

## Canonical Files
- `app/src/lib/hubs/terminal/peek/VerdictInboxPanel.svelte`
- `app/src/routes/api/users/[userId]/f60-status/+server.ts`

## Assumptions
- VerdictInboxPanel은 포커스 상태에서만 키보드 이벤트 캡처 (다른 패널 방해 없음)
- f60-status 엔진 엔드포인트 이미 존재 (`/api/engine/f60-status` 또는 유사)
- Layer C threshold = 50 verdicts (W-0394 설계 기준)

## Decisions
- **[D-1]** 낙관적 숨김 + 5초 undo: 즉각적 UX 피드백. 거절 옵션: API 응답 후 숨김 → latency로 UX 저하.
- **[D-2]** outlier 경고 5회 연속: 훈련 데이터 편향 방지 신호.

## Open Questions
- [ ] [Q-1] f60-status 엔진 엔드포인트 정확한 경로 확인 (PR #965 구현에서 확인)

## Next Steps
- PR #965 merged (완료)

## Handoff Checklist
- [x] 설계 문서 작성
- [x] 구현 완료 (PR #965)
- [ ] CI green
- [ ] merged to main
