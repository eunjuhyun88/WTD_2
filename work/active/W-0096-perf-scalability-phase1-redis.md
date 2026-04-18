# W-0096 — Performance & Scalability: Phase 1 Redis Kline Cache

## Goal
500명 동시 접속 안전성 확보. `/chart/klines` 요청이 디스크 CSV I/O 없이 Redis에서 즉시 응답.

## Scope
- `engine/cache/kline_cache.py` 신규
- `engine/cache/ctx_cache.py` 신규
- `engine/workers/kline_prefetcher.py` 신규
- `engine/routes/chart.py` 수정 (Redis-first)
- `engine/core/global_ctx.py` 수정 (Redis fallback)
- `engine/main.py` 수정 (lifespan Redis pool init)
- 테스트: `engine/tests/test_kline_cache.py`

## Non-Goals
- Phase 2 (connection pool, rate limit) — 별도 작업
- Phase 3 (chart streaming API) — 별도 작업
- UI 변경 없음

## Exit Criteria
- [ ] `/chart/klines` 응답이 Redis 히트 시 < 10ms
- [ ] Redis 미연결 시 CSV fallback 정상 동작 (graceful degrade)
- [ ] GlobalCtx가 Redis에 직렬화되어 멀티워커 간 공유 가능
- [ ] kline_prefetcher가 APScheduler에 등록되어 주기적으로 갱신
- [ ] 기존 테스트 전부 통과

## Architecture

```
요청 흐름 (Redis-first):

GET /chart/klines?symbol=BTCUSDT&tf=4h
  │
  ├─► Redis GET kline:BTCUSDT:4h
  │     hit  → JSON 응답 즉시 반환 (< 10ms)
  │     miss ↓
  │
  ├─► CSV 로드 + pandas resample
  │
  ├─► Redis SET kline:BTCUSDT:4h TTL=3600s
  │
  └─► JSON 응답

Background prefetcher (APScheduler):
  ├─ 5m 주기: universe 상위 50 심볼 × [1h, 4h, 1d] kline → Redis 업데이트
  └─ universe scan 완료 후 invalidate → re-populate
```

## Redis Key 설계

```
kline:{symbol}:{tf}           ← OHLCV JSON array, TTL per TF
ctx:global                    ← GlobalCtx 직렬화 JSON, TTL 600s
ctx:global:lock               ← 갱신 중복 방지 분산 락 (SET NX EX 30)
```

## TTL 정책

```python
KLINE_TTL = {
    '1m':  60,
    '5m':  300,
    '15m': 600,
    '30m': 900,
    '1h':  1800,
    '2h':  3600,
    '4h':  3600,
    '6h':  7200,
    '12h': 7200,
    '1d':  14400,
    '1w':  86400,
}
```

## Graceful Degrade

Redis 연결 실패 시:
- `kline_cache.get()` → None 반환 (예외 삼킴)
- `/chart/klines` → CSV fallback 그대로
- `ctx_cache.get()` → None 반환
- GlobalCtx → in-memory singleton fallback

## Dependencies

```
redis[asyncio]>=4.6        ← aioredis는 deprecated, redis-py async 사용
```

`engine/requirements.txt`에 추가.

## 브랜치

`claude/perf-redis-kline-cache` (main에서 분기)

## 이전 컨텍스트

- W-0095 (checkpoint): 병목 분석 완료, 이 작업 진입점
- 분석 결과: Redis docker-compose 선언됨 (`redis:7-alpine`), 엔진 미연결
- engine/data_cache/cache/{SYMBOL}_1h.csv 형식으로 캐시 존재
