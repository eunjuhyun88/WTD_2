# W-0243 — Wave 3 Phase 1.1: W-0102 Slice 1+2 mop-up

> Wave 3 entry | Owner: app | Branch: `feat/W-0243-w0102-slice-1-2`
> **선행: 없음 (W-0241/W-0242와 병렬 가능)**

## Goal

W-0230 5단 파이프라인의 첫 단계인 **AI 프롬프트 → 차트 control** 경로를 작동시키기 위해 W-0102의 Slice 1+2를 마무리. URL `?q=` 파싱 + BottomDock auto-submit + `chart_action` SSE event handler.

## Owner

app

## Primary Change Type

Product surface change (URL routing + SSE handler)

## Scope

| 파일 | 변경 이유 |
|---|---|
| `app/src/routes/terminal/+page.svelte` (or +page.ts) | URL `?q=` 읽고 BottomDock에 auto-submit |
| `app/src/components/terminal/workspace/TerminalCommandBar.svelte` (or BottomDock equivalent) | auto-submit hook |
| `app/src/lib/server/douni/sseStream.ts` (or message handler) | `chart_action` event 처리 (없으면 추가) |
| `app/src/components/terminal/chart/ChartBoard.svelte` | `chart_action` 수신 시 indicator/symbol 적용 |
| `app/src/lib/stores/chartActionBus.ts` (NEW or 기존) | event bus for chart_action |
| `app/src/components/terminal/__tests__/UrlQueryParse.test.ts` | NEW — URL `?q=` 파싱 테스트 |

## Non-Goals

- W-0102 Slice 3 `add_indicator` glue (별도 PR — Wave 3 Phase 1.3)
- 6 Intent classifier 통합 (W-0230 Phase 1.2 별도)
- Template Router / Highlight Planner (Wave 3 Phase 1.3)
- chart_action tool 정의 변경 (이미 `douni/tools.ts`에 있음, 사용만)
- Annotation 그리기 (W-0102 Slice 5)

## Canonical Files

- `work/active/W-0243-w0102-slice-1-2-mop-up.md` (this)
- `work/completed/W-0102-prompt-agent-chart-control.md` (선행 spec)
- `work/active/W-0230-tradingview-grade-viz-design.md` (상위 설계)
- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/workspace/TerminalCommandBar.svelte`
- `app/src/lib/server/douni/tools.ts` (참조, 변경 X)
- `app/src/components/terminal/chart/ChartBoard.svelte`

## Facts

1. main = `c43a22ed`
2. `W-0102-prompt-agent-chart-control.md` work/completed에 spec 존재
3. `chart_control` tool 정의됨 (`app/src/lib/server/douni/tools.ts:42-76`)
4. SSE 4-round tool loop 작동 (`app/src/routes/api/cogochi/terminal/message/+server.ts`)
5. Intent classifier (chart_ctrl) 작동 (`douni/intentClassifier.ts`)
6. ChartBoard.svelte 5 sub-pane 예약 슬롯 (vol/rsi/macd/oi/cvd) 정의됨

## Assumptions

1. terminal/+page.svelte는 URL search params 읽기 가능 (SvelteKit `$page.url.searchParams`)
2. BottomDock command bar 컴포넌트 존재 (또는 TerminalCommandBar)
3. SSE stream에 `chart_action` event 추가 가능 (engine response가 emit)
4. `?q=` 파라미터는 자유 텍스트 (sanitization은 server에서)

## Open Questions

1. URL `?q=` auto-submit 후 URL clear 정책? — 권고: `replaceState`로 clear (history 오염 방지)
2. SSE `chart_action` payload schema 정확? — 권고: `{symbol, timeframe?, indicator?, action: 'set_context'|'add_indicator'|'remove_indicator'}`
3. 중복 auto-submit 방지? — 권고: query string changed 시에만 trigger

## Decisions

- D-W-0243-1: URL `?q=` clear via `history.replaceState` (재실행 방지)
- D-W-0243-2: chart_action event는 Svelte writable store로 broadcast (chartActionBus)
- D-W-0243-3: ChartBoard subscribe해서 indicator/symbol 변경
- D-W-0243-4: 에러 시 toast 또는 console.warn (silent fail X)
- D-W-0243-5: 대상 사용자 = 기존 terminal 사용자 (회귀 0 보장)

## Next Steps

1. terminal/+page.svelte URL `?q=` 파싱 + BottomDock auto-submit
2. `replaceState`로 URL clear
3. chartActionBus store (writable) 신규 또는 확인
4. SSE handler에 `chart_action` event 처리
5. ChartBoard subscribe + indicator/symbol apply
6. Vitest URL parse + chart_action handler
7. App CI pass

## Exit Criteria

- [ ] `/terminal?q=btc` 접근 → BottomDock에 "btc" 자동 입력 + submit
- [ ] URL clear (history.replaceState)
- [ ] chart_action SSE event 수신 → ChartBoard symbol 변경
- [ ] chart_action `add_indicator` event → ChartBoard sub-pane 표시
- [ ] 빈 query (`?q=`) → no-op
- [ ] 기존 terminal 사용자 회귀 0
- [ ] App CI pass

## API Contract (chart_action SSE event)

```typescript
// SSE event payload
type ChartAction =
  | { action: 'set_context'; symbol: string; timeframe?: string }
  | { action: 'add_indicator'; indicator: 'vol' | 'rsi' | 'macd' | 'oi' | 'cvd'; pane?: number }
  | { action: 'remove_indicator'; indicator: string };
```

## CTO 설계 원칙 적용

### 성능
- URL parse는 `$page.url.searchParams` (네이티브 SvelteKit, 추가 비용 0)
- chart_action store는 writable, subscribe만 (재계산 없음)
- replaceState로 history 오염 방지

### 안정성
- Empty query → no-op (silent)
- Invalid action → console.warn + ignore
- chartActionBus subscribe cleanup (onDestroy)

### 보안
- URL `?q=` text는 server-side에서 sanitize (Claude prompt injection 방지 — engine 책임)
- replaceState는 history만 변경, 보안 영향 없음

### 유지보수성
- 계층: app/ 단독 (engine 변경 0)
- 계약: ChartAction discriminated union
- 테스트: URL parse 케이스 + chart_action handler 케이스
- 롤백: terminal/+page.svelte 변경만 revert → 영향 0

## Handoff Checklist

- 본 PR 머지 후 W-0102 Slice 3 (`add_indicator` glue 정밀화) 후속 가능
- chartActionBus는 W-0230 Phase 1.3 viz/ 디렉토리에서 재사용 예정

## Risks

| 위험 | 완화 |
|---|---|
| URL `?q=` injection | server-side sanitize (engine LLM 책임) |
| 자동 submit 중복 | query string changed 시에만 trigger |
| ChartBoard race (init 전 chart_action 도착) | chartActionBus는 buffer (last value cache) |
| 기존 terminal 사용자 회귀 | 추가 기능만, 기존 path 변경 X |
