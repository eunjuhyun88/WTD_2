# W-0118 — COGOTCHI Layout A/B/C 완성 + JudgePanel 3열

## Status
`DONE` — commit a2ee644 (2026-04-21)
Slice D (JudgePanel 3-col) was pre-existing. Layouts A/B/C already had ChartBoard.
Slice F (evidence/proposal/α binding) + Slice E (PeekDrawer animation) implemented.

## Goal
COGOTCHI TradeMode의 Layout A/B/C stub 구현 완성 + JudgePanel 수직→3열 수평 전환.
W-0115 Slice 2/3 (evidence/proposal/α API 바인딩 + WS kline)과 병행 또는 직후 실행.

## Context
W-0114 gap analysis 기준 현황:
- Layout A (Chart only) — EmptyCanvas stub
- Layout B (Chart + AI 2분할) — EmptyCanvas stub
- Layout C (chart + AI sidebar) — 부분 구현
- Layout D (PEEK) — 완전 동작 ✅
- JudgePanel — 수직스택, 3열 수평 미구현
- PeekDrawer — 슬라이드 애니메이션 없음

Key files:
- `app/src/lib/cogochi/modes/TradeMode.svelte` — 926줄, Layout A/B/C stub 있음
- `app/src/components/terminal/peek/PeekDrawer.svelte` — 탭 shell
- `app/src/components/terminal/peek/JudgePanel.svelte` — 수직스택 현황
- `app/src/components/terminal/peek/ScanGrid.svelte` — grid만 있음

## Scope

### Slice A — Layout A: Chart only (fullscreen)
- [ ] TradeMode `layout === 'A'` 분기: 좌측 Sidebar + 우측 AIPanel 숨김
- [ ] ChartBoard가 전체 너비 차지
- [ ] PEEK 버튼 유지 (Layout D 접근 가능)

### Slice B — Layout B: Chart + AI 2분할
- [ ] `layout === 'B'` 분기: `flex row`, 좌측 ChartBoard (60%), 우측 AIPanel (40%)
- [ ] Splitter 드래그로 비율 조정 가능
- [ ] Sidebar 숨김

### Slice C — Layout C: Chart + AI info sidebar 완성
- [ ] `layout === 'C'` 분기: Sidebar(240px) + ChartBoard(flex-1) + AIPanel(320px)
- [ ] 현재 부분 구현 → 3열 완성
- [ ] 각 패널 독립 스크롤

### Slice D — JudgePanel 3열 수평
- [ ] `JudgePanel.svelte` flex 방향 변경: column → row
- [ ] Plan | Judge | AfterResult 3열 나란히
- [ ] 각 열 독립 스크롤, flex: 1 균등 배분
- [ ] 좁은 뷰포트 (<768px)에서 column fallback

### Slice E — PeekDrawer 슬라이드 애니메이션
- [ ] PeekDrawer 열림/닫힘에 `@keyframes peekSlide` 또는 CSS transition 적용
- [ ] 프로토타입 참조: `peekSlide` 애니메이션 (translateY 기반)
- [ ] reduced-motion 미디어 쿼리 처리

### Slice F — Evidence/Proposal/α 바인딩 (W-0115 Slice 2 이식)
- [ ] `/api/cogochi/analyze` 응답 contract 확인
- [ ] `analyze.deep?.evidence` → `evidenceItems`
- [ ] `analyze.deep?.atr_levels` + `snapshot.price` → `proposal`
- [ ] `analyze.verdict?.confidence_score` → α badge
- [ ] 필드 없을 시 빈 배열/null fallback

## Non-Goals
- ScanGrid WideGridView/TableView/StripView — 별도 P2 항목
- topology_linear.jsx 이식 — 별도 P2
- AIPanel quick-pick + setup token 카드 — 별도 P2
- 모바일 레이아웃 반응형 — W-0114 mobile-state-persistence 범위

## Exit Criteria
- [ ] Layout A/B/C 전환 시 EmptyCanvas 없이 정상 렌더
- [ ] Layout 전환 후 `/terminal` 무변경
- [ ] JudgePanel 3열이 데스크탑(≥768px)에서 수평 배치
- [ ] PeekDrawer 열림/닫힘 애니메이션 동작
- [ ] evidence/proposal/α가 하드코딩 없이 API 응답에서 파생

## Key Files
| 파일 | 변경 |
|---|---|
| `app/src/lib/cogochi/modes/TradeMode.svelte` | Slice A/B/C |
| `app/src/components/terminal/peek/JudgePanel.svelte` | Slice D |
| `app/src/components/terminal/peek/PeekDrawer.svelte` | Slice E |
| `app/src/lib/cogochi/AppShell.svelte` | 레이아웃 오케스트레이터 확인 |
| `app/src/routes/api/cogochi/analyze/+server.ts` | Slice F contract 확인 |

## Priority Order
1. Slice F (evidence 바인딩) — 실제 데이터 먼저
2. Slice D (JudgePanel 3열) — 가장 눈에 띄는 UX 갭
3. Slice A/B/C (Layout 완성) — 순서대로
4. Slice E (애니메이션) — 마지막 polish
