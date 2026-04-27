# W-0243 — F-5: IDE-style Split-Pane (3-mode)

> Wave 4 P0 | Owner: app | Branch: `feat/F5-ide-split-pane`
> **PRD D5 lock-in: free-form canvas 폐기, IDE split-pane으로 대체**

---

## Goal

Terminal/Lab을 3-mode IDE split-pane으로 재구성: Observe(시장 모니터링) / Analyze(패턴 분석, default) / Execute(Capture+Watch+Verdict). 메인 70% / HUD 20% / Workspace 30% resizable.

## Owner

app

---

## CTO 설계

```
┌────────────────────────────────────────────────────┐
│ [Observe] [Analyze ●] [Execute]    [Symbol: BTCUSDT]│
├──────────────────────┬─────────────────────────────┤
│                      │                             │
│   Chart (70%)        │  Decision HUD (F-4)         │
│   + Overlays         │  (20%)                      │
│                      │                             │
├──────────────────────┴─────────────────────────────┤
│   Workspace (30%) — Pattern Candidates / Captures  │
└────────────────────────────────────────────────────┘
```

### 3-mode 행동

| Mode | 기본 레이아웃 | 용도 |
|------|-------------|------|
| Observe | Chart 전체 | 시장 모니터링, alert 대기 |
| Analyze | Chart + HUD | 패턴 분석 (default) |
| Execute | Chart + HUD + Workspace | Capture/Watch/Verdict 실행 |

### 기술 설계

- CSS Grid `grid-template-columns: 1fr 0.28fr` + row `1fr 0.43fr`
- Resizable: `svelte-split-pane` or CSS resize handle
- Mode 전환: URL param `?mode=analyze` or svelte store
- HUD 컴포넌트: W-0237 DecisionHUD 재사용

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `app/src/routes/terminal/+page.svelte` | 변경 — 3-mode split layout |
| `app/src/lib/components/terminal/SplitPaneLayout.svelte` | 신규 — resizable pane wrapper |
| `app/src/lib/components/terminal/ModeToggle.svelte` | 신규 — Observe/Analyze/Execute 토글 |
| `app/src/lib/stores/terminalMode.ts` | 신규 — mode state store |

## Non-Goals

- 모바일 최적화
- 4개 이상 pane
- per-user 레이아웃 저장 (localStorage만)

## Exit Criteria

- [ ] 3개 mode 토글 작동
- [ ] Analyze mode에서 Chart + HUD 동시 표시
- [ ] resizable pane (드래그로 비율 조정)
- [ ] mode 상태 URL param으로 유지
- [ ] App CI ✅

## Facts

1. `app/src/routes/terminal/+page.svelte` — 현재 단일 레이아웃.
2. D5 lock-in: free-form canvas 폐기, IDE split-pane 채택.
3. W-0237 DecisionHUD — HUD 컴포넌트 재사용.

## Canonical Files

- `app/src/routes/terminal/+page.svelte`
- `app/src/lib/components/terminal/SplitPaneLayout.svelte`
