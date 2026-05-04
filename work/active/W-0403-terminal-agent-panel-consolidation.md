# W-0403 — Terminal AgentPanel 5-tab 통합 + Footer 제거

> Wave: 7 | Priority: P0 | Effort: M (2 PR)
> Charter: In-Scope (Terminal Hub UX)
> Issue: #1058
> Status: 🟡 Design
> Created: 2026-05-04
> Depends on: PR #1066 (collapsible panels ✅ merged a17f1302)

## Goal

Jin이 차트와 AI 판단을 한 화면에서 보면서, `TerminalBottomDock`에 분산된 정보를 우측 `AIAgentPanel` 한 곳에서 5탭(Verdict / Scan / Research / Why / Judge)으로 일원화한다.

## Owner

app

## Scope

**PR 1 — AgentPanel 5-tab + Footer 제거 (Effort: M)**

현재 탭: `decision | pattern | verdict | research | judge` (shell.store.ts:13)
목표 탭: `verdict | scan | research | why | judge` — 5탭, 라벨 정리

**변경 파일:**
- `app/src/lib/hubs/terminal/shell.store.ts` — `RightPanelTab` 타입 + `SHELL_KEY` v13
- `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIAgentPanel.svelte` — TABS 배열 교체 + BottomDock 데이터 수신
- `app/src/lib/hubs/terminal/workspace/TerminalBottomDock.svelte` — 제거 또는 내용 이관 후 stub
- `app/src/lib/hubs/terminal/L1/TerminalShell.svelte` — BottomDock import 제거

**PR 2 — GTM 텔레메트리 (Effort: S)**

**변경 파일:**
- `app/src/lib/hubs/terminal/telemetry.ts` — `tab_switch` 이벤트 + `panel_fold` 이벤트 추가
- `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIAgentPanel.svelte` — tab switch tracking 호출

## Non-Goals

- 신규 AI 기능 (Chat GPT 통합 등)
- 모바일 bottom sheet (Wave-8)
- Home 디자인 토큰 (별도 W-0212)
- 백엔드 API 신규 추가

## Exit Criteria

- [ ] AC1: `TerminalBottomDock` 렌더링 제거 (grep으로 확인: 0 references in active HTML)
- [ ] AC2: AIAgentPanel 탭 5개 표시 — verdict / scan / research / why / judge
- [ ] AC3: 기존 탭 localStorage migrate (`SHELL_KEY v13`) — 구 키 접근 시 fallback 정상
- [ ] AC4: GTM `rightpanel_tab_switch` 이벤트 payload에 `tab_id` 포함
- [ ] AC5: CI (vitest + svelte-check) green

## AI Researcher 관점

- 탭 구조 변경으로 `judge` 탭 클릭률 변화 가능 → W-0401-P4 velocity 데이터와 함께 1주 후 비교
- `decision` 탭 제거 시 해당 탭 사용자 journey 단절 여부 → GTM 이벤트로 실측 후 결정

## CTO 설계 결정

| ID | 결정 | 이유 |
|---|---|---|
| D-1 | `decision` → `verdict`로 rename | 기존 decision 탭 = verdict 심사 기능. 라벨 일치 |
| D-2 | `pattern` 탭 → `scan`으로 rename | scan = 능동 탐색 의미. PatternTab 컴포넌트는 유지 |
| D-3 | BottomDock stub 유지 (삭제 안 함) | 참조 컴포넌트 다수 — stub으로 렌더링 제거만 |
| D-4 | SHELL_KEY v13 | 탭 타입 변경 시 localStorage 오염 방지 |

## Facts (실측)

```
RightPanelTab 현재: 'decision' | 'pattern' | 'verdict' | 'research' | 'judge'  (shell.store.ts:13)
SHELL_KEY 현재: 'cogochi_shell_v12'  (shell.store.ts:290)
AIAgentPanel TABS 배열 위치: panels/AIAgentPanel/AIAgentPanel.svelte:31
TerminalBottomDock 참조: workspace/index.ts:14, L1/TerminalShell.svelte:13
telemetry.ts 이벤트: trackRightpanelTabSwitch 존재 확인 (AIAgentPanel.svelte:5)
```

## Canonical Files

- `app/src/lib/hubs/terminal/shell.store.ts`
- `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIAgentPanel.svelte`
- `app/src/lib/hubs/terminal/workspace/TerminalBottomDock.svelte`
- `app/src/lib/hubs/terminal/L1/TerminalShell.svelte`
- `app/src/lib/hubs/terminal/telemetry.ts`
