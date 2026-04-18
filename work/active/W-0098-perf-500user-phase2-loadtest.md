# W-0098 — 500-User Safety: Phase 2 로드테스트 + 잔여 병목 제거

**상태: 완료 (2026-04-19) — main 9f18f10 머지**

## Goal

W-0096 Phase 1–3 완료 기준으로, 실제 500 동시 접속 부하에서 병목이 어디 남아 있는지 측정하고 우선순위를 정한다.

**정량 목표**
- p95 latency `/api/chart/klines` < 200ms (캐시 히트 기준)
- p95 latency `/api/engine/score` < 800ms
- 에러율 < 0.5% @ 500 VU
- Vercel cold start 비율 < 5%

## 완료된 구현 (main 머지됨)

| 레이어 | 이전 | 지금 |
|--------|------|------|
| Engine kline I/O | CSV per-request | Redis-first, 5m prefetch |
| Engine HTTP 연결 | AsyncClient per-call | 싱글톤 풀 max=100 |
| Engine rate limit | 없음 | slowapi 120/60/30 per IP |
| App chart 데이터 | Binance FAPI per-request | 15s in-process + Upstash shared cache |
| App rate limit | 없음 | chartKlinesLimiter(120/min) + engineProxyLimiter(60/min) |
| Engine score | LightGBM per-request | TTL=30s in-process cache (symbol, last_bar_ts_ms) |
| Engine CPU | 단일 worker | UVICORN_WORKERS env var 지원 |
| 429 UX | 에러 페이지 | ChartBoard amber 10s countdown + ChartMode 5s retry |

## 구현 완료 슬라이스

### Slice A: App rate limiting
- `rateLimit.ts` — `chartKlinesLimiter`(120/min) + `engineProxyLimiter`(60/min)
- `klines/+server.ts` — rate limit guard 추가
- `engine/[...path]/+server.ts` — HEAVY_ENGINE_PATHS에만 적용

### Slice B: 공유 캐시 (Upstash Redis)
- `chartSeriesService.ts` — in-process 캐시 앞에 `getSharedCache` / `setSharedCache` wired
- `sharedCache.ts` — 이미 존재, `UPSTASH_REDIS_REST_URL` env var 사용
- Vercel env `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` production에 등록 완료

### Slice C: Engine score cache
- `engine/api/score_cache.py` — TTL=30s, key=(symbol, last_bar_ts_ms), max 512 entries
- `engine/api/routes/score.py` — cache check + store 추가
- `engine/tests/test_score_cache.py` — 9 tests pass

### Slice D: Engine multi-worker
- `engine/Dockerfile` — `UVICORN_WORKERS` env var 지원 (default=1)
- 주의: UVICORN_WORKERS>1 시 `ENGINE_ENABLE_SCHEDULER=false` 필수

### Slice E: 429 UX
- `ChartBoard.svelte` — amber 10s countdown state
- `ChartMode.svelte` — 5s auto-retry on 429

### k6 scripts
- `scripts/load_test_500.js` — 500VU × 60s, /api/chart/klines + healthz
- `scripts/load_test_score.js` — score endpoint fixture test

## 남은 사용자 액션 (다음 세션)

- [ ] **k6 실측**: `k6 run --env BASE=https://www.cogotchi.dev scripts/load_test_500.js`
- [ ] **Engine prod**: `UVICORN_WORKERS=4` + `ENGINE_ENABLE_SCHEDULER=false` (엔진 서버에 직접 설정)
- [ ] **k6 score 실측**: `k6 run --env BASE=https://www.cogotchi.dev scripts/load_test_score.js`

## Exit Criteria

- [x] 코드 구현 완료 — rate limit + shared cache + score cache + 429 UX + k6 scripts
- [x] Vercel env provisioned
- [x] main 머지 완료 (9f18f10)
- [ ] k6 500VU 60s 실행 결과 기록 (p95, error rate)
- [ ] 실측 병목 확인 후 추가 조치 여부 결정

## 브랜치

`claude/perf-500user-phase2` → main 머지 (cherry-pick 방식, 2026-04-19)

## 이전 컨텍스트

- W-0096 PR #86 (Phase 1), #87 (Phase 2), #89 (Phase 3) → main 머지 완료 (2026-04-19)
- W-0098 PR #91 생성 (rebase 충돌로 cherry-pick 방식으로 대체)
- Upstash Redis: `normal-stag-81227.upstash.io` (이미 `.env.local`에 있었음, Vercel에만 미등록 상태였음)
