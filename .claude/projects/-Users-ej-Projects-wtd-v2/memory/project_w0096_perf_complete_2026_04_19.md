---
name: W-0096 Performance Phase 1-3 완료 + W-0098 다음 계획
description: 500-user 안정성 목표 — Phase 1-3 머지 완료, 잔여 병목 및 다음 로드테스트 계획
type: project
---

## W-0096 Phase 1-3 완료 (2026-04-19, PR #86/#87/#89)

**Phase 1 — Redis kline cache (engine)**
- `engine/cache/kline_cache.py`: Redis async pool, TTL per-TF, graceful degrade
- `engine/workers/kline_prefetcher.py`: APScheduler 5분 prefetch, 상위 50 심볼 × [1h,4h,1d]
- `engine/api/routes/chart.py`: GET /chart/klines — Redis-first, CSV fallback
- 787 tests pass

**Phase 2 — httpx singleton + slowapi (engine)**
- `engine/cache/http_client.py`: AsyncClient 싱글톤 max_conn=100
- `engine/api/limiter.py`: slowapi per-IP (chart=120/m, score=60/m, deep=30/m)
- ctx_cache, l0_context, realtime, alerts, universe_scan 전부 싱글톤 사용

**Phase 3 — Chart streaming CTO 리팩토링 (app)**
- `app/src/lib/server/chart/indicatorUtils.ts`: 순수 수학 분리 (sma/ema/BB/ATR/VWAP/RSI/MACD)
- `chartSeriesService.ts`: 3-layer (fetch/compute/cache) + startTime cursor pagination
- `ChartBoard.svelte`: 좌스크롤 lazy load (LAZY_TRIGGER_BARS=30), Binance WS 실시간 캔들, $effect lifecycle

**Why:** 목표 500 동시 접속 안정성 — CSV I/O 제거, 연결 미공유 제거, 실시간 업데이트 추가

**How to apply:** W-0096 완료 기준으로 다음 병목은 Vercel 인스턴스 간 캐시 미공유 + 엔진 단일 인스턴스 CPU

---

## W-0098 다음 계획 (미착수)

**설계문서:** `work/active/W-0098-perf-500user-phase2-loadtest.md`

**순서:**
1. Slice A: k6 로드테스트 베이스라인 (500VU × 60s) — 실측 우선
2. Slice B: Upstash/Vercel KV로 App 캐시 인스턴스 간 공유
3. Slice C: SvelteKit hooks.server.ts rate limiting
4. Slice D: /score Redis 캐싱 (features_hash 기반, TTL=30s)

**정량 목표:** p95 /api/chart/klines < 200ms, error rate < 0.5% @ 500VU
