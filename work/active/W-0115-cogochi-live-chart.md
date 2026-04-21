# W-0115 — Cogochi Live Chart (ChartBoard 교체 + 실시간 데이터)

## Status
`SLICE 1 DONE` — PR #124 merged to main (2026-04-21)
`SLICE 3 DONE` — raw WS in TradeMode replaced with ChartBoard `onCandleClose` callback (2026-04-21, worktree agitated-mcclintock). ChartBoard already owned resilient DataFeed (reconnect+backoff+gap-fill+heartbeat) — TradeMode now rides on that instead of running a duplicate WS. Net: -1 WS per user, -75% fetch on candle close (4→1 endpoint).
Slice 2 pending — next execution target

## Goal
`/cogochi` TradeMode를 실시간 터미널급 차트로 업그레이드.
CgChart(하드코딩 SVG 목업) → ChartBoard(lightweight-charts, OI/CVD 내장)로 교체하고,
evidence/proposal/α를 analyze API 응답에 바인딩한다.

## Context
- ChartBoard는 `terminalState` 임포트만 있고 실제 사용 없음 — 결합도 zero
- `chartIndicators`, `chartSaveMode` 두 스토어는 전역 → cogochi에서 그대로 동작
- cogochi `fetchTerminalBundle`이 이미 klines + snapshot + derivatives 반환 중
- 하드코딩: `tradePlan {entry:83700…}`, `evidenceItems`, `α82`, `proposal` 전부 교체 대상

## Scope

### Slice 1 — CgChart → ChartBoard 교체 (시각적 확증 즉시)
- [x] `TradeMode.svelte`에서 `<CgChart>` → `<ChartBoard>`
  - props: `symbol`, `tf`, `initialData={chartPayload}`, `verdictLevels={atrLevels}`, `change24hPct`, `contextMode="chart"`
  - `chartPayload` = `fetchTerminalBundle` 응답의 `chartPayload`
  - OI/Funding/CVD 서브패인 → ChartBoard 내장으로 대체
- [x] `tradePlan` 하드코딩 제거, `verdictLevels`를 analyze entryPlan에서 파생
- [x] `PhaseChart` 임포트 제거 (ChartBoard로 대체)

### Slice 2 — Evidence/Proposal/α analyze 바인딩
- [ ] `analyze.deep?.evidence` → `evidenceItems` (없으면 빈 배열)
- [ ] `analyze.deep?.atr_levels` + `analyze.snapshot?.price` → `proposal`
- [ ] `analyze.verdict?.confidence_score` → α badge
- [ ] 필드가 없으면 `/api/cogochi/analyze` 응답 contract 확인 후 adapter 함수 추가

### Slice 3 — Binance WS kline 실시간 (DONE)
- [x] `btcusdt@kline_<tf>` WebSocket 구독 — ChartBoard.DataFeed 재사용
- [x] 마지막 캔들 tick → ChartBoard `priceSeries.update()` (DataFeed.onBar)
- [x] 새 캔들 close 시 `/api/cogochi/analyze` 단건 호출 → analyze 갱신 (ChartBoard `onCandleClose` callback)
- [x] 심볼/TF 전환 시 재구독 — DataFeed.reconfigure
- [x] Reconnect+backoff+gap-fill+heartbeat — DataFeed 내장

## Non-Goals
- DEX(GMX/Polymarket) 통합 — 별도 W-0116
- `/terminal` 구조 변경 — ChartBoard 원본 건드리지 않음
- mobile 반응형 레이아웃 — 별도 작업

## Exit Criteria
- Slice 1: `/cogochi`에서 실제 캔들 차트 + OI/CVD 서브패인 렌더링
- Slice 2: evidenceItems/proposal/α가 API 응답에 동적으로 바인딩
- Slice 3: 15초 이내 가격 tick이 차트에 반영됨
- 기존 `/terminal` 동작 무변경

## Key Files
- `app/src/lib/cogochi/modes/TradeMode.svelte` — 교체 대상
- `app/src/components/terminal/workspace/ChartBoard.svelte` — 참조/재사용
- `app/src/components/cogochi/CgChart.svelte` — 교체 후 삭제 대상
- `app/src/lib/api/terminalBackend.ts` — fetchTerminalBundle 응답 contract

## Decisions
- `terminalState` 결합도 없음 확인 → 리팩토링 없이 직접 import 가능
- `chartSaveMode` 전역 스토어 → cogochi SELECT RANGE 버튼과 자연스럽게 연결
- Polling(15s) 먼저, WS는 Slice 3에서 proper하게 구현

## Next Steps
1. Slice 2: `/api/cogochi/analyze` 응답 contract 확인 → TradeMode adapter 함수 작성
2. Slice 3: Binance WS kline 구독 → ChartBoard update() 연결
