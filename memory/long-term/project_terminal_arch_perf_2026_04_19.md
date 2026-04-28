# Terminal Architecture Cleanup + Performance Plan (2026-04-19)

## Session 완료 내용

### 1. Terminal +page.svelte Architecture Cleanup (commit 0791941)
- **dead code 제거 –134줄**: `layout` state, `patternTransitionAlerts`, `PatternTransitionAlert` import, `leftWidth`+`startResize`, `MOBILE_CHIPS`, `MobileCommandDock`, `showDetailSheet`+`openMobileDetail`, `mobile-board-wrap` div
- **MarketDrawer 이중 렌더링 수정**: `viewportTier` import → `isDesktop` 파생 → `{#if !isDesktop}` 게이트
- `showLeftRail` 기본값 `false` → `true` (desktop left rail 기본 표시)
- TypeScript/Svelte-check 에러 0

### 2. 이전 세션 TV-style UX (main 0e7978e + 0791941)
- DesktopShell TV 팔레트, TerminalCommandBar 42px 스트립, TerminalContextPanel verdict-hero, TerminalBottomDock slim, TerminalLeftRail watchlist 최상단
- Engine fail retry CTA (isEngineDegraded), handleRetryAnalysis()
- home 페이지 구디자인 유지 (TV 팔레트 .desktop-shell 스코프)

## 성능 분석 결과 (engine/ 전수 조사)

| 레이어 | 현재 | 문제 |
|---|---|---|
| kline cache | CSV disk per request | 500명 = 500 I/O |
| GlobalCtx | in-memory singleton | 멀티워커 공유 불가 |
| Redis | docker-compose 선언 | 엔진 코드 미연결 |
| httpx | 매 요청마다 새 client | 풀 없음 |
| chart API | REST 일회성 | TV 연속 스크롤 불가 |

## 다음 작업 (W-0096)

**Phase 1 — Redis kline cache (브랜치: claude/perf-redis-kline-cache)**
```
engine/cache/kline_cache.py       ← Redis client + TTL per TF
engine/cache/ctx_cache.py         ← GlobalCtx 직렬화
engine/workers/kline_prefetcher.py ← APScheduler 갱신 잡
engine/routes/chart.py            ← Redis-first
engine/core/global_ctx.py         ← Redis fallback chain
engine/main.py                    ← lifespan Redis pool init
```

TTL: 1m=60s, 5m=300s, 1h=1800s, 4h=3600s, 1d=14400s
Graceful degrade: Redis 다운 시 CSV fallback

**Phase 2** — httpx pool + slowapi rate limit + asyncpg
**Phase 3** — `/chart/klines` 커서 페이지네이션 + WS `/ws/ticker`
**Phase 4** — ChartBoard lazy load + CommandBar price WS 연결
