# W-0356 — Cogochi 3-Column TV-Style Redesign

> Wave: 4 | Priority: P0 | Effort: L
> Status: 🟡 In Progress
> Created: 2026-04-30
> Branch: feat/W-0356-cogochi-redesign

## Goal

Cogochi(`/cogochi`)를 트레이딩뷰 스타일 3-컬럼 레이아웃으로 전환 — Left(나만의 워치리스트+패턴), Center(모든 지표가 차트에 그려짐), Right(AI Agent 자연어 전용: 분석/스캔/판정).

## Architecture Decision

**인디케이터는 이미 차트에 그려지고 있음** (`chartIndicators.ts` + `ChartBoard.svelte`).
추가 필요한 것:
1. 3-컬럼 always-visible 레이아웃
2. Left: WatchlistRail (TV 즐겨찾기 스타일)
3. Right: AIPanel 구조화 카드 UI + ANALYZE/SCAN/JUDGE intent handler
4. `chartAIOverlay.ts` store: AI 분석 결과 → 차트 price lines

## Scope

### 컬럼 구조
```
┌─ Left ──────┬───── Center ──────────────────┬─── Right ────┐
│ WatchlistRail│  WorkspaceStage (Chart)         │  AIPanel      │
│ min 180px    │  flex:1  min 400px              │  min 300px    │
│ default 220  │                                 │  default 360  │
│  resizable ▶ │                  ◀ resizable    │               │
└──────────────┴─────────────────────────────────┴───────────────┘
```

### 변경 파일
| 파일 | 변경 유형 |
|---|---|
| `app/src/lib/cogochi/AppShell.svelte` | 수정 — 3-컬럼 always-visible |
| `app/src/lib/cogochi/Sidebar.svelte` | 수정 — WatchlistRail 렌더링으로 교체 |
| `app/src/lib/cogochi/WatchlistRail.svelte` | 신규 |
| `app/src/lib/cogochi/AIPanel.svelte` | 수정 — 구조화 카드 UI + intent handler |
| `app/src/lib/stores/chartAIOverlay.ts` | 신규 |
| `app/src/lib/cogochi/CommandBar.svelte` | 수정 — Pine Script 버튼 제거 |
| `engine/api/routes/chart.py` | 수정 — `/indicators` endpoint 추가 |
| `app/src/routes/api/chart/indicators/+server.ts` | 신규 — engine proxy |

### 사용 API (기존)
- `GET /api/cogochi/analyze?symbol=&tf=` — ANALYZE
- `POST /api/terminal/scan` — SCAN
- `POST /api/captures` — JUDGE/저장
- `GET /api/patterns/terminal` — 내 패턴 목록

## AI Agent Dual Output 아키텍처

```
user input → intent classify →
  ANALYZE → /api/cogochi/analyze →
    panelCard: direction + evidence + p_win
    chartOverlay: entry/stop/tp price lines → chartAIOverlay store
  SCAN → /api/terminal/scan →
    panelCard: symbol list (클릭 → chart 전환)
  JUDGE → /api/captures POST →
    panelCard: "저장됨" 확인
  INDICATOR → addIndicator/removeIndicator (기존 유지)
```

## Non-Goals
- chart indicator 데이터 계산 방식 변경 (W-0304 영역)
- WorkspacePanel 완전 삭제 (verdict buttons 유지)
- 모바일 레이아웃 변경

## CTO 결정

**D-1**: `sidebarVisible/aiVisible` 토글 제거 → AppShell에서 항상 true로 고정. shell.store 호환성 유지.

**D-2**: AIPanel은 chat messages[] 대신 cards[] 상태로 전환. 구조: `{ type, data, ts }` union type.

**D-3**: WatchlistRail은 Sidebar.svelte를 교체하지 않고 내부 콘텐츠만 바꿈 (shell.store `sidebarVisible/sidebarWidth` 재사용).

**D-4**: `chartAIOverlay` store는 Lightweight Charts `createPriceLine()` API로 연결. ChartBoard에 최소한의 wiring 추가.

## Exit Criteria
- [ ] AC01: `/cogochi` 로드 시 3컬럼 모두 항상 보임
- [ ] AC02: Left splitter 드래그 → 180~420px, double-click reset
- [ ] AC03: Right splitter 드래그 → 300~600px, double-click reset
- [ ] AC04: WatchlistRail 심볼 클릭 → center chart 전환
- [ ] AC05: WatchlistRail `/api/patterns/terminal` 결과 표시
- [ ] AC06: AIPanel "BTC 분석해줘" → `/api/cogochi/analyze` → 구조화 카드 표시
- [ ] AC07: AIPanel "스캔" → `/api/terminal/scan` → 심볼 카드 리스트 표시
- [ ] AC08: AIPanel "LONG 판정" → `/api/captures` → 저장 확인 카드
- [ ] AC09: AI ANALYZE 결과 → 차트에 entry/stop price line 그려짐
- [ ] AC10: CommandBar Pine Script 버튼 없음
- [ ] AC11: `pnpm typecheck` 0 errors
- [ ] AC12: CI green
- [ ] AC13: 1280px 화면에서 3컬럼 동시 표시, x-scroll 없음
