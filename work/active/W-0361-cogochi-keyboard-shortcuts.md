# W-0361 — Cogochi TV-Style Keyboard Shortcuts (B/Esc/Enter/Slash+Cmd+K)

> Wave: 4 | Priority: P1 | Effort: S
> Issue: #793
> Status: 🟡 Design Draft
> Created: 2026-05-01

## Goal

TV 트레이더가 차트 분석 시 마우스 없이 키보드만으로 핵심 워크플로(range select → analyze → AI 질문 → 심볼 전환)를 완주하도록 한다. B,B 클릭 워크플로(W-0360)가 완성됐으나 실 트레이더는 키보드에 손이 있는 상태가 90%다. 단축키 없이는 "TV-style"이라고 부를 수 없다.

## UX 워크플로

**Workflow 1 — Range Analyze (핵심)**
1. `B` → ChartBoard 좌상단 "Range Mode: Click anchor A" status hint
2. 차트 클릭 → anchor A / 두번째 클릭 → anchor B → 300ms debounce → AIPanel auto-analyze
3. `Esc` → range mode 취소

**Workflow 2 — AI Quick Question**
1. `/` → AIPanel input focused, placeholder "Ask AI about {currentSymbol}..."
2. 타이핑 + `Enter` → analyze 실행
3. `Esc` → input blur

**Workflow 3 — Symbol Switch**
1. `Cmd/Ctrl+K` → CommandPalette modal (WatchlistRail 심볼 fuzzy filter)
2. `Enter` → 차트 전환 / `Esc` → 닫힘

**Conflict 회피**: `<input>`, `<textarea>`, `[contenteditable]` focused 시 B/`/`/K 무시.

## Scope

**신규 파일:**
- `app/src/lib/stores/keyboardShortcuts.ts` — 글로벌 keydown 등록/해제 + context stack
- `app/src/lib/stores/keyboardShortcuts.test.ts`
- `app/src/lib/components/cogochi/CommandPalette.svelte` — Cmd+K symbol search palette
- `app/src/lib/components/cogochi/CommandPalette.test.ts`
- `app/src/lib/components/cogochi/RangeModeHint.svelte` — 차트 상단 persistent status bar

**수정 파일:**
- `app/src/lib/cogochi/AIPanel.svelte` — input ref 노출, `/`+`Enter` 연결
- `app/src/components/terminal/workspace/ChartBoard.svelte` — `B` 키 → `enterRangeMode()`
- `app/src/routes/+layout.svelte` (cogochi route) — 글로벌 listener 등록

## Non-Goals

- Drawing tools 단축키 — W-0289 후속에서 처리 (별도 W-number)
- Timeframe 단축키 (`1`/`5`/`D` 등) — 별도 W-number
- Pine Script 단축키 부활 없음 (W-0357에서 완전 제거됨)
- 자동매매 단축키 — Frozen
- Mobile/touch — natural no-op (키보드 없음, 코드 추가 불필요)
- 사용자 커스텀 단축키 설정 UI

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `B` 키가 input focus 상태에서 발화 → 텍스트 입력 깨짐 | 높 | 높 | `event.target` tagName + `isContentEditable` 검사 (표준 패턴) |
| `Esc` 글로벌 핸들러가 기존 modal close 로직과 충돌 | 중 | 중 | priority chain: modal > palette > range > input blur, stopPropagation |
| keydown listener 메모리 leak (route 이탈 후 미해제) | 중 | 낮 | onMount/onDestroy lifecycle binding |
| Cmd+K가 Mac vs Windows 키 차이 | 낮 | 낮 | `event.metaKey \|\| event.ctrlKey` OR 처리 |
| `/` 키가 브라우저 quick find와 충돌 | 낮 | 낮 | `preventDefault()` + cogochi route only |

### Dependencies / Rollback

- W-0360 (B,B workflow) ✅ 머지됨 — `enterRangeMode()`, `exitRangeMode()`, `anchorA`, `anchorB` 사용
- W-0357 ✅ 머지됨 — TerminalCommandBar 단축키 충돌 없음
- **Rollback**: `PUBLIC_COGOCHI_KBD_SHORTCUTS=false` env var → listener 등록 자체 skip

## AI Researcher 관점

### Data Impact / Failure Modes

- DB schema 변경 없음 (migration 034 미사용, 다음 W-number 보존)
- Telemetry P2 deferred — P1은 단축키 작동 자체
- **F1**: `B` 키 input guard 미동작 시 텍스트 깨짐 → tagName/isContentEditable 표준 패턴
- **F2**: range mode 중복 진입 → store 내부 `isActive` guard로 idempotent 보장
- **F3**: Cmd+K + `B` 동시 active → context stack으로 palette > range 우선순위

## Decisions

- [D-01] **단축키 범위 = Cogochi route only** (`/cogochi/*`). 다른 route 미적용. 이유: scope creep 방지, 검증 후 확장.
- [D-02] **`/` = AI input focus** (TV symbol search 의미와 다름). Cogochi 컨텍스트에서 AI 입력이 더 빈번, Cmd+K가 symbol search.
- [D-03] **Cmd+K palette 신설** (WatchlistRail symbol fuzzy filter, 서버 호출 없음). 거절: 기존 WatchlistRail search focus — TV/Linear 스타일 신설이 임팩트 큼.
- [D-04] **Esc priority chain**: modal > palette > range mode cancel > input blur > no-op.
- [D-05] **시각 hint = 차트 상단 persistent status bar** (토스트 아님). 이유: range mode는 지속 상태, 토스트는 사라짐.
- [D-06] **Feature flag** `PUBLIC_COGOCHI_KBD_SHORTCUTS` default true (초기 deploy 24h는 false 권장).
- [D-07] **Migration 034 미사용** — 다음 W-number 보존.

## Open Questions

- [ ] [Q-01] AIPanel.svelte의 input element가 ref로 노출 가능한지 코드 실측 필요
- [ ] [Q-02] AIPanel `Enter` 분석 트리거가 이미 있는가? (있으면 그대로 유지)
- [ ] [Q-03] Telemetry: `keyboard_shortcut_used` event 기록 여부 — P2 deferred or P1 포함?

## Implementation Plan

### Phase 1 — Store + Listener Infrastructure (~3h)
1. `keyboardShortcuts.ts`: `registerShortcut(key, handler, options)` + `activeContext` stack + input focus guard
2. cogochi route layout keydown listener 등록/해제
3. Unit tests (register/unregister/conflict/input-guard)

### Phase 2 — B + Esc for Range Mode (~2h)
1. ChartBoard.svelte에 `B` 핸들러 → `chartSaveMode.enterRangeMode()`
2. RangeModeHint.svelte (차트 상단 persistent status bar)
3. `Esc` 핸들러 → `chartSaveMode.exitRangeMode()` if active

### Phase 3 — `/` for AI Input Focus (~1.5h)
1. AIPanel.svelte input ref 노출
2. `/` 핸들러 → ref.focus(), placeholder dynamic
3. `Enter` 분석 트리거 검증/추가
4. `Esc` blur 핸들러

### Phase 4 — Cmd+K Symbol Palette (~4h)
1. CommandPalette.svelte — fixed center modal, fuzzy filter
2. WatchlistRail symbol list 구독
3. Arrow keys + Enter navigation
4. Symbol switch (기존 `onSelectSymbol` 경로)
5. Tests

### Phase 5 — QA + Feature Flag + PR (~2h)
1. `PUBLIC_COGOCHI_KBD_SHORTCUTS` env var
2. Manual QA: input field에서 `B` 눌러도 텍스트 깨지지 않음
3. svelte-check, vitest, eslint → PR

## Exit Criteria

- [ ] AC01: `B` → range mode 진입, ChartBoard 상단 "Click anchor A" hint 표시
- [ ] AC02: Range mode active 시 `Esc` → `exitRangeMode()`, hint 사라짐
- [ ] AC03: `/` → AIPanel input focused, placeholder = "Ask AI about {symbol}..."
- [ ] AC04: AIPanel input focused 시 `Enter` → analyze 실행 (W-0360 동일 경로)
- [ ] AC05: AIPanel input focused 시 `Esc` → blur
- [ ] AC06: `Cmd/Ctrl+K` → CommandPalette 열림, fuzzy filter 동작
- [ ] AC07: CommandPalette `Enter` → 선택 심볼로 차트 전환
- [ ] AC08: `<input>`, `<textarea>` focused 시 `B`/`/`/`K` 입력해도 텍스트 정상 입력
- [ ] AC09: 단축키 응답 latency < 50ms (keydown → visual change)
- [ ] AC10: vitest 신규 ≥ 12 tests PASS
- [ ] AC11: svelte-check 0 errors
- [ ] AC12: `PUBLIC_COGOCHI_KBD_SHORTCUTS=false` → 단축키 전체 비활성화, 마우스 워크플로 무영향
- [ ] AC13: CI green + PR merged + CURRENT.md SHA 업데이트

## Canonical Files

```
app/src/lib/stores/keyboardShortcuts.ts                  — 신규
app/src/lib/stores/keyboardShortcuts.test.ts             — 신규
app/src/lib/components/cogochi/CommandPalette.svelte     — 신규
app/src/lib/components/cogochi/CommandPalette.test.ts    — 신규
app/src/lib/components/cogochi/RangeModeHint.svelte      — 신규
app/src/lib/cogochi/AIPanel.svelte                       — 수정
app/src/components/terminal/workspace/ChartBoard.svelte  — 수정
app/src/routes/+layout.svelte                            — 수정 (cogochi route)
```

## Owner

app (Svelte) — single owner, S effort

## Facts

- W-0360 PR #789 머지됨 (main SHA `469f961e`)
- `chartSaveMode.enterRangeMode()`, `exitRangeMode()`, `anchorA`, `anchorB` 존재 (W-0360 구현됨)
- AIPanel.svelte에 `$chartSaveMode` effect 이미 추가됨 (W-0360)
- TerminalCommandBar Pine Script 완전 제거됨 (W-0357)
- migration 033 = propfirm P1 사용 중, 다음 = 034
- WatchlistRail: SYMBOLS 배열 `['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','AVAXUSDT','DOGEUSDT']` (고정)
- Contract CI가 13개 섹션 검사 (Goal, Owner, Scope, Non-Goals, Canonical Files, Facts, Assumptions, Open Questions, Decisions, Next Steps, Exit Criteria, Handoff Checklist + UX 워크플로)

## Assumptions

- AIPanel input element가 단일 명확한 ref로 노출 가능 (Q-01 코드 실측 필요)
- cogochi route는 `/cogochi` prefix를 가지며 layout 분기 가능
- `PUBLIC_COGOCHI_KBD_SHORTCUTS` env var 추가가 Vercel build에 무영향
- WatchlistRail SYMBOLS는 hardcoded array — Cmd+K palette에서 클라이언트 필터로 충분
- 단축키 charset은 영문 키보드 기준 (한글 IME 활성 시 자연 no-op)

## Next Steps

1. `feat/W-0361-cogochi-keyboard-shortcuts` 브랜치 생성 (origin/main `469f961e` 기준)
2. Phase 1: `keyboardShortcuts.ts` store + listener 구현
3. Phase 2: `B`/`Esc` range mode 연결 + RangeModeHint
4. Phase 3: `/`/`Enter`/`Esc` AIPanel input
5. Phase 4: Cmd+K CommandPalette
6. `/검증` 후 PR 생성

## Handoff Checklist

- [ ] PR merged
- [ ] CURRENT.md SHA 업데이트
- [ ] work item completed 이동
