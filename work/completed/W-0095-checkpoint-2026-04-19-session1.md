# W-0095 — Checkpoint 2026-04-19 Session 1

## Session Summary

### 1. Architecture Cleanup (완료, commit 0791941)

**Dead code removed from `app/src/routes/terminal/+page.svelte` (–134줄):**
- `layout` state — 설정만 되고 렌더링에 전혀 안 쓰임
- `patternTransitionAlerts` + `dismissPatternAlert` — 표시 안 됨
- `PatternTransitionAlert` 타입 import
- `leftWidth` + `startResize` — DOM에 연결 안 됨
- `MOBILE_CHIPS` + `MobileCommandDock` import
- `showDetailSheet` + `openMobileDetail`
- `mobile-board-wrap` div (MobileShell이 slotFooter 무시하므로 완전 사각지대)

**Architecture fix — 중복 TerminalLeftRail:**
- Desktop에서 `MarketDrawer` 오버레이가 이미 보이는 persistent left rail 위에 열리던 이중 렌더링 제거
- `viewportTier` import → `isDesktop` 파생 → `{#if !isDesktop}` 로 MarketDrawer 게이트
- `showLeftRail` 기본값 `false` → `true` (desktop에서 left rail 기본 표시)
- TypeScript/Svelte-check 에러 0개

### 2. 성능 아키텍처 분석 (완료, 미구현)

**병목 지도 (engine/ 분석 결과):**

| 레이어 | 현재 상태 | 문제 |
|---|---|---|
| kline cache | CSV 파일 기반, 요청마다 디스크 읽기 | 500명 동시 = 500번 I/O |
| Feature 계산 | 요청당 pandas 재계산 | CPU 폭증 |
| GlobalCtx | in-memory singleton (10m TTL) | 멀티워커 간 상태 공유 불가 |
| Redis | docker-compose에 선언됨 | 엔진 코드에 전혀 미연결 |
| httpx client | 매 요청마다 새로 생성 | 커넥션 풀 없음 |
| 차트 API | REST 일회성 응답 | TradingView 연속 스크롤 불가 |

**What exists:**
- ✅ Async FastAPI + middleware
- ✅ Request ID tracing + metrics
- ✅ GlobalCtx singleton cache (10m TTL)
- ✅ Worker thread offload (asyncio.to_thread)
- ✅ Background scheduler (APScheduler, 3 jobs)
- ✅ CSV kline cache (disk-only)
- ✅ Postgres + Redis declared (docker-compose)

**What's missing:**
- ❌ Redis 미연결 (선언만)
- ❌ In-memory LRU kline cache
- ❌ HTTP rate limiting
- ❌ httpx connection pooling
- ❌ asyncpg async Postgres driver
- ❌ OHLCV paginated streaming API
- ❌ WebSocket ticker

---

## 다음 세션 진입점 (W-0096)

### Phase 1 — Redis kline cache (최우선)

**목표:** 500명 동시 → 동일 symbol/TF 요청이 Redis 히트로 즉시 응답

**파일 생성 목록:**
```
engine/cache/kline_cache.py       ← Redis client + get/set/invalidate
engine/cache/ctx_cache.py         ← GlobalCtx Redis 직렬화 (멀티워커 공유)
engine/workers/kline_prefetcher.py ← APScheduler 잡: universe kline 주기 갱신
```

**파일 수정 목록:**
```
engine/routes/chart.py            ← /chart/klines Redis-first 로직
engine/core/global_ctx.py         ← in-memory → Redis fallback chain
engine/main.py                    ← lifespan에서 Redis pool init
```

**TTL 정책:**
```
1m  TF → 60s TTL
5m  TF → 300s TTL
15m TF → 600s TTL
1h  TF → 1800s TTL
4h  TF → 3600s TTL
1d  TF → 7200s TTL
```

### Phase 2 — Connection pooling + rate limit

```
engine/core/http_client.py        ← 싱글톤 AsyncClient (limits=Limits(max_connections=100))
slowapi + Limiter                 ← /deep: 10/min per IP, /chart/klines: 60/min per IP
asyncpg pool                      ← Postgres ledger 쓰기 비동기화
```

### Phase 3 — Chart streaming API

```
GET /chart/klines?symbol=BTCUSDT&tf=1h&to=<ts>&limit=200
  └── cursor 기반 페이지네이션
  └── 프론트: 초기 200봉 로드 → 스크롤 왼쪽 시 이전 구간 lazy fetch

WS /ws/ticker
  └── 실시간 캔들 close 업데이트
  └── ChartBoard lightweight-charts subscribeVisibleLogicalRangeChange 훅
```

### Phase 4 — UI/UX 머지

```
ChartBoard.svelte      ← 커서 기반 API 연결 + leftward lazy load
TerminalCommandBar     ← price → WebSocket ticker 연결
TerminalBottomDock     ← SSE 기반 AI 스트림 유지 (변경 없음)
```

---

## 브랜치 상태

- main: 0791941 (architecture cleanup 커밋)
- 다음 브랜치: `claude/perf-redis-kline-cache` (Phase 1)

## 실험 로그

| 날짜 | 실험 | 결과 |
|---|---|---|
| 2026-04-19 | 아키텍처 분석 (engine/ 전수 조사) | Redis 미연결 확인, 병목 5곳 특정 |
| 2026-04-19 | terminal +page.svelte dead code 제거 | -134줄, TS 에러 0 |
| 2026-04-19 | MarketDrawer 이중 렌더링 수정 | isDesktop 게이트, showLeftRail=true 기본값 |
