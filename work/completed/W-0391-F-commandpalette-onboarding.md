# W-0391-F — ⌘K CommandPalette 연결 + Spotlight Onboarding

> Wave: 5 | Priority: P1 | Effort: S-M (1.5-2d)
> Charter: In-Scope
> Status: 🟡 Design Draft
> Parent: W-0391 #937
> Created: 2026-05-03

## Goal

⌘K 한 번으로 어디서든 심볼 검색 + 빠른 액션 5개 실행. WAU ≥ 30% 사용.

## Gap

- `app/src/lib/shared/panels/CommandPalette.svelte` 이미 존재 — ⌘K 트리거 미연결
- 최근 검색 히스토리 미구현
- 5개 빠른 액션 미정의

## Scope

### Phase F1 — ⌘K 트리거 연결 (0.5d)
파일:
- `app/src/lib/hubs/terminal/TerminalHub.svelte` — keydown 핸들러에 `ctrl+K` / `meta+K` 추가
- `app/src/lib/shared/panels/CommandPalette.svelte` — 기존 컴포넌트에 open/close 스토어 연결

```ts
// TerminalHub.svelte 기존 handleKeydown()에 추가
case 'k':
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    commandPaletteStore.open();
  }
  break;
```

### Phase F2 — 5개 빠른 액션 (0.5d)
CommandPalette 검색 결과:
1. **심볼 전환**: BTC / ETH / SOL … (WatchlistRail symbols)
2. **TF 전환**: 1m / 5m / 15m / 1h / 4h / 1D
3. **Hub 이동**: Terminal / Dashboard / Patterns / Lab / Settings
4. **모드 전환**: TRADE / TRAIN / FLYWHEEL
5. **분석 시작**: "BTC 지금 분석" → analyzeStore.trigger(symbol)

최근 검색 히스토리: localStorage `cmdpalette.history` (최대 10개)

### Phase F3 — Spotlight Onboarding Tour (0.5-1d)
파일: `app/src/lib/shared/SpotlightTour.svelte` (신규)

진입 조건: `localStorage.getItem('spotlight.v1')` 없을 때 + 첫 cogochi 진입
3단계 highlight:
1. ⌘K 버튼 spotlight → "여기서 모든 것을 시작하세요"
2. WatchlistRail → "심볼 j/k 이동"  
3. AIAgentPanel → "분석 결과가 여기"

완료: `localStorage.setItem('spotlight.v1', 'done')` + `track('spotlight_complete')`

## Non-Goals

- ⌘K NL(자연어) 검색 (W-0392 이후)
- 글로벌 app-wide ⌘K (Terminal 외 페이지 — Phase 2)

## Exit Criteria

- [ ] AC1: TerminalHub에서 `meta+K` / `ctrl+K` keydown → CommandPalette 열림 확인
- [ ] AC2: CommandPalette 5개 액션 렌더 (dev server snapshot)
- [ ] AC3: 최근 검색 localStorage 저장 확인
- [ ] AC4: SpotlightTour 3단계 렌더 (첫 진입 시뮬레이션)
- [ ] AC5: `track('spotlight_complete')` 호출 확인 (analytics.ts 연동)
- [ ] CI green, svelte-check 0 errors

## Files Touched (stream-exclusive)

```
app/src/lib/hubs/terminal/TerminalHub.svelte  (⌘K keydown 추가 — B 스트림과 공유 주의*)
app/src/lib/shared/panels/CommandPalette.svelte  (store 연결)
app/src/lib/shared/panels/commandPaletteStore.ts  (신규 또는 기존)
app/src/lib/shared/SpotlightTour.svelte  (신규)
```

*⚠️ TerminalHub.svelte는 B 스트림과 겹침 — 순서: B(OnboardingBanner mount)→F(⌘K keydown) 또는 같은 PR 내 처리.
