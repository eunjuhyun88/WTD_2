---
name: W-0096 Redis Kline Cache Phase 1
description: engine에 Redis kline cache 레이어 추가 완료 (2026-04-19)
type: project
---

W-0096 Phase 1 구현 완료 (브랜치: claude/perf-redis-kline-cache, 커밋: 0fda176).

**Why:** 500명 동시 접속 시 /chart/klines 요청마다 CSV I/O + pandas resample 발생. Redis-first로 < 10ms 응답.

**What was built:**
- `engine/cache/kline_cache.py`: async Redis pool (redis[asyncio]), get/set/invalidate + TTL policy + graceful degrade
- `engine/workers/kline_prefetcher.py`: 5분 주기 APScheduler job, BINANCE_30 × [1h, 4h, 1d] → Redis
- `engine/api/routes/chart.py`: GET /chart/klines?symbol&tf&limit — Redis-first, CSV fallback on miss
- `engine/api/main.py`: lifespan에 Redis pool init/close + AsyncIOScheduler kline prefetch 추가
- 12 unit tests (fake Redis, no live Redis needed). 787 total tests pass.

**Key design:** `redis[asyncio]>=4.6` (not aioredis, deprecated). REDIS_URL env var, default `redis://redis:6379`. TTL per-TF (1m=60s → 1w=86400s).

**Not done (보류):** GlobalCtx Redis 직렬화 (in-memory 싱글톤으로 단일 워커 충분, 멀티워커 시 재검토).

**How to apply:** Phase 2 작업 시 이 브랜치 기준. PR은 사용자 승인 후.
