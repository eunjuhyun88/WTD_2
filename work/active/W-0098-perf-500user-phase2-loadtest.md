# W-0098 — 500-User Safety: Phase 2 로드테스트 + 잔여 병목 제거

## Goal

W-0096 Phase 1–3 완료 기준으로, 실제 500 동시 접속 부하에서 병목이 어디 남아 있는지 측정하고 우선순위를 정한다.

**정량 목표**
- p95 latency `/api/chart/klines` < 200ms (캐시 히트 기준)
- p95 latency `/api/engine/score` < 800ms
- 에러율 < 0.5% @ 500 VU
- Vercel cold start 비율 < 5%

## 현재 상태 (Phase 1–3 완료 후)

| 레이어 | 이전 | 지금 |
|--------|------|------|
| Engine kline I/O | CSV per-request | Redis-first, 5m prefetch |
| Engine HTTP 연결 | AsyncClient per-call | 싱글톤 풀 max=100 |
| Engine rate limit | 없음 | slowapi 120/60/30 per IP |
| App chart 데이터 | Binance FAPI per-request | 15s in-process cache + startTime cursor |
| App 실시간 | 없음 | Binance WS per-browser (client-side) |
| App indicator 계산 | chartSeriesService 혼합 | indicatorUtils.ts 순수 계산 분리 |

## 잔여 병목 (가설)

### 높은 위험
1. **App 캐시 미공유** — Vercel 함수가 수평 확장 시 각 인스턴스가 독립 15s 캐시 보유. 동일 심볼 요청이 인스턴스마다 Binance FAPI를 다시 호출.
2. **Engine 단일 인스턴스** — 500명이 동시에 `/score`, `/deep` 호출 시 엔진이 병렬 처리 못하면 큐잉.
3. **Binance FAPI rate limit** — Vercel 서버 IP에서 Binance를 대량 호출 시 429 가능성.

### 중간 위험
4. **App 라우트 rate limit 없음** — SvelteKit API 라우트(`/api/chart/klines`)에 rate limiting 없음.
5. **Engine /score CPU** — LightGBM predict_one은 빠르지만 features_table 계산이 CPU-bound일 수 있음.
6. **Supabase 연결 풀** — 대량 captures read/write 시 PostgreSQL 연결 수 초과 가능성.

### 낮은 위험
7. **Client-side Binance WS** — 각 브라우저가 독립 WS → Binance 서버 기준 IP 분산 → 문제 없음.
8. **indicatorUtils 계산** — 순수 JS, V8 JIT 기준 500개 캔들 < 5ms → 문제 없음.

## Phase 2 실행 계획

### Slice A: 로드테스트 베이스라인 (측정 우선)

```
도구: k6 (Node.js 기반, OSS)
시나리오:
  - 500 VU × 60s sustained
  - 엔드포인트: /api/chart/klines, /api/engine/score, /api/engine/deep
  - 심볼: BTCUSDT, ETHUSDT, SOLUSDT (캐시 히트 + 미스 혼합)
측정: p50/p95/p99 latency, error rate, Vercel function invocations
```

```javascript
// k6 script skeleton (scripts/load_test_500.js)
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 500,
  duration: '60s',
};

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
const TFS = ['1h', '4h', '1d'];
const BASE = 'https://wtd-app.vercel.app';  // 실제 URL로 교체

export default function () {
  const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const tf  = TFS[Math.floor(Math.random() * TFS.length)];
  const r = http.get(`${BASE}/api/chart/klines?symbol=${sym}&tf=${tf}&limit=200`);
  check(r, { 'status 200': (r) => r.status === 200, 'p95 < 500ms': (r) => r.timings.duration < 500 });
  sleep(0.1);
}
```

### Slice B: App 캐시 공유 (Vercel KV 또는 Upstash Redis)

Vercel 함수 인스턴스 간 공유 캐시:
- **Option A**: Upstash Redis (serverless Redis, pay-per-use) — `@upstash/redis` SDK
- **Option B**: Vercel KV (Upstash 기반) — SvelteKit 친화적

```typescript
// app/src/lib/server/chart/sharedCache.ts
// Binance FAPI 응답을 Upstash에 TTL=15s로 저장
// chartSeriesService에서 in-process 캐시 앞에 sharedCache.get() 추가
```

### Slice C: App 라우트 rate limiting

SvelteKit hooks.server.ts에서 IP 기반 rate limit:
- `/api/chart/klines`: 120 req/min/IP
- `/api/engine/*`: 60 req/min/IP (엔진 slowapi와 동기)

### Slice D: Engine 수평 확장 준비

- `/score` 응답 Redis 캐싱 (캐시 키: `score:{symbol}:{tf}:{features_hash}`, TTL=30s)
- 동일 feature set의 반복 요청은 LightGBM 재계산 없이 응답

## 구현 현황 (2026-04-19, 858874c)

| Slice | 상태 | 내용 |
|-------|------|------|
| C — Rate limit | ✅ | chartKlinesLimiter(120/min) + engineProxyLimiter(60/min) |
| B — Shared cache | ✅ | sharedCache(Upstash REST) → chartSeriesService, graceful fallback |
| D — Score cache | ✅ | score_cache.py TTL=30s, key=(symbol, last_bar_ts_ms) |
| A — k6 script | ✅ | scripts/load_test_500.js, 500VU×60s |

## Exit Criteria

- [ ] k6 500VU 60s 실행 결과 기록 (p95, error rate) — **Upstash 연결 후 실측 필요**
- [x] 실측 병목 top 3 확인 후 Slice B/C/D 우선순위 확정 (코드 분석 기반)
- [x] 선택된 Slice 구현 (C/B/D 전부 구현 완료)
- [x] 기존 테스트 전부 통과 (797 engine / 0 app type errors)

## 잔여 작업

1. **Upstash 프로비저닝** — `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` Vercel env 설정
2. **k6 실측** — `k6 run --env BASE=https://wtd-app.vercel.app scripts/load_test_500.js`
3. **PR 생성** → main 머지 (사용자 승인 후)

## Non-Goals

- DB 스키마 변경
- 인프라 재구성 (Docker Compose 변경 없음)
- 엔진 수평 배포 (현재 단일 인스턴스 유지)

## 브랜치

`claude/perf-500user-phase2` (main에서 분기)

## 이전 컨텍스트

- W-0096 PR #86 (Phase 1), #87 (Phase 2), #89 (Phase 3) → main 머지 완료 (2026-04-19)
- 원래 병목 지도: CSV I/O, 연결 미공유, 실시간 없음 → 전부 해소
- 남은 위험: Vercel 인스턴스 간 캐시 미공유, 엔진 단일 인스턴스 CPU, Binance FAPI 429
