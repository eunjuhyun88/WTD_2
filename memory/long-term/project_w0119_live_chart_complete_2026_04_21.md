---
name: W-0119 Live Chart + Liq Pane 완료 체크포인트
description: W-0119 라이브 차트 DataFeed + 청산 서브패인 구현 + Svelte 5 무한루프 버그 수정. HEAD=f13f593a, 브랜치=claude/condescending-thompson
type: project
---

## 완료 항목 (2026-04-21)

**브랜치**: `claude/condescending-thompson`
**HEAD**: `f13f593a`
**커밋 3개**:
- `38c8a197` feat(W-0119): live chart with liq sub-pane + resilient DataFeed
- `3e83f36e` fix: remove liqEl render guard that blocked chart on cold load
- `f13f593a` fix(W-0119): resolve Svelte 5 infinite $effect loop in TradeMode + perf

## 구현 내용

### DataFeed class (`app/src/lib/chart/DataFeed.ts`)
- Binance WS 실시간 캔들 (fstream)
- Exponential backoff 재연결 [100, 300, 1000, 3000, 10000]ms
- 45초 heartbeat, 60초 sub-pane 폴링
- Gap fill on reconnect

### 청산 서브패인 (`app/src/components/terminal/workspace/ChartBoard.svelte`)
- `_initLiqPane()` — green=short liq fuel, red=long liq cascade histogram
- `syncTimeScales()` — 메인 차트와 시간축 동기화
- liqEl guard 수정: `if (!liqEl) return` 제거 (liqEl은 {`{:else}`} 블록 내부)

### 인증 공개 처리 (`app/src/hooks.server.ts`)
- `/api/chart/` 를 PUBLIC_API_PREFIXES에 추가 (Binance 공개 시장 데이터, rate-limited)

### 통합 피드 엔드포인트 (`app/src/routes/api/chart/feed/+server.ts`)
- klines + OI + funding + liqBars 병렬 패치
- 15s TTL, chartFeedLimiter (120/min)

## 핵심 버그 수정

### Svelte 5 무한 $effect 루프 (TradeMode.svelte)
**원인**: `klineWs = $state<WebSocket | null>(null)` — `$effect` 내부에서 `klineWs?.close()` (읽기)와 `klineWs = new WebSocket(...)` (쓰기)를 동시에 수행 → Svelte가 klineWs 변경에 재구독 → 무한 재실행
**증상**: "updated at" 에러 48개 루프, `loadToken` race condition, 차트가 "Loading BTCUSDT 4h..." 에 고착
**수정**: `let klineWs: WebSocket | null = null` (plain variable, $state 제거)
**추가**: `DRAWER_TABS` const 추출 ({`{#each [...]}`} 인라인 배열 → 모듈 상수)

## 현재 상태

- 차트 정상 렌더링 확인 (BTC/USDT 4h, 실시간 데이터)
- 에러 루프 해소
- **PR #140 main 머지 완료** (2026-04-21T00:28:41Z)

**Why:** W-0119 DataFeed + liq pane 구현 + 성능 최적화 세션
**How to apply:** 다음 세션에서 PR 생성 또는 추가 sub-pane 작업 시 참조
