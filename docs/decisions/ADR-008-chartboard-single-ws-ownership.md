# ADR-008: ChartBoard 가 단일 WS 오너

## Status

Accepted (2026-04-21)

## Context

Binance futures WebSocket (`fstream.binance.com`) 은 우리가 차트 실시간성을 확보하는 유일한 무료 채널이다. 그러나 app 내부에는 두 WS 클라이언트가 존재했다.

1. **`ChartBoard.svelte` 내부의 `DataFeed`** — resilient, production-grade
   - exponential backoff reconnect (100ms → 10s)
   - gap-fill on reconnect (`_gapFillIfNeeded`)
   - 45s heartbeat
   - 60s sub-pane polling for OI/funding/liq
   - perp vs spot stream 자동 선택

2. **`TradeMode.svelte` 내부의 raw `WebSocket`** — primitive
   - reconnect 없음 (`onclose = klineWs = null`)
   - backoff 없음
   - heartbeat 없음
   - 단일 용도: `k.x=true` (candle close) 시 `fetchTerminalBundle` 재호출 → analyze 갱신

두 WS 는 동일한 `{symbol, tf}` 스트림을 **중복 구독**하고 있었다. 500 user 정상 상태에서:

- 불필요한 WS 연결: +500
- Binance fstream 연결 제한은 user-per-IP 기준이 아니지만, 관찰 가능한 side effect 과 race condition 이 있었다.
- TradeMode 의 raw WS 는 재연결 로직이 없어 네트워크 flap 발생 시 analyze 가 영구히 stale 해지는 버그 잠재.

## Decision

**ChartBoard 를 단일 WS 오너로 고정한다.**

1. 모든 Binance kline WS 구독은 `DataFeed` 를 경유한다. Raw `new WebSocket('wss://fstream.binance.com/...')` 은 cogochi/terminal 컴포넌트에서 금지.
2. candle close 이벤트가 필요한 부모 컴포넌트는 `ChartBoard` 의 `onCandleClose?: (bar) => void` prop 을 통해 구독한다.
3. `DataFeed.onBar(bar, isClosed)` 는 `isClosed=true` 일 때만 `onCandleClose(bar)` 를 호출한다 (live tick 은 ChartBoard 내부에서만 소비).
4. 신규 파생 지표 pane (예: Pillar 1 Liq Heatmap, Pillar 2 Options) 이 자체 WS 를 필요로 할 때는 **새로운 Pane-scoped DataFeed 서브클래스를 만들고 같은 reconnect 규율을 지킨다**.

## Alternatives Considered

### A. TradeMode 의 raw WS 를 그냥 hardening (reconnect/backoff 추가)

- **거부됨.** 두 WS 를 유지하는 한 중복 구독 · race condition 문제가 남는다. 엔지니어링 부채 확대.

### B. 60s interval polling 으로 WS 제거

- **거부됨.** candle close 는 정확한 시각(4h TF 기준 14:00:00 UTC)에 발생. polling 은 최대 60s 지연 발생 → verdict/analyze 가 한 캔들 뒤쳐짐.

### C. analyze 전용 별도 WS (예: `/api/engine/analyze/ws`)

- **거부됨.** engine 이 SSE/WS 서버를 운영하고 있지 않으며, HTTP round-trip 이 candle close 당 단 한번이면 최적화 가치 없음.

## Consequences

### 긍정

- **-1 WS/user × 500 users = 500 fewer Binance WS connections**
- TradeMode 가 ChartBoard 의 reconnect/backoff/gap-fill/heartbeat 를 **자동 상속**. raw WS 에 있던 잠재 버그(네트워크 flap 후 영구 stale analyze) 제거.
- candle close 당 fetch: 4 → 1 endpoint (analyze 만). 네트워크 75% 감소.
- **Indicator Registry 패턴 확장 시 일관성 확보** — 모든 WS 기반 pane 이 같은 DataFeed 규율을 따름.

### 부정 / 트레이드오프

- ChartBoard prop surface 가 한 줄 늘어남 (`onCandleClose`).
- ChartBoard 를 렌더하지 않는 곳에서 candle close 가 필요해지면 별도 경로 설계 필요 (현재 그런 경우 없음).

## Implementation

- `app/src/components/terminal/workspace/ChartBoard.svelte` — `onCandleClose?: (bar) => void` prop, `DataFeed.onBar` 에서 `isClosed` 시 호출.
- `app/src/lib/cogochi/modes/TradeMode.svelte` — raw WS `$effect` 삭제, `handleCandleClose(bar)` 핸들러 추가, 5 개 `<ChartBoard>` 인스턴스에 prop 전달.
- 커밋 `6d539cdd` — refactor(cogochi): TradeMode uses ChartBoard.onCandleClose, drop duplicate WS.

## Follow-up

- 신규 Pillar 1-4 pane 은 이 ADR 의 **Rule 4** 를 따를 것.
- `DataFeed` 클래스가 multi-pane 확장성을 지원하도록 리팩토링할 수 있음 (다중 stream concurrent 구독). 현재는 단일 `{symbol, tf}` 만 지원.
