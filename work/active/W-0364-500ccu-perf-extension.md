# W-0364 — 500 CCU Performance Extension (DB+API+Live+Observability)

> Wave: 5 | Priority: P1 | Effort: L
> Charter: In-Scope §infra
> Status: 🟡 Design Draft
> Depends on: W-0363
> Issue: #800
> Created: 2026-05-01

## Goal

W-0363(번들/rate limiter/cold start) 위에 데이터 레이어·API 캐시·실시간 팬아웃·관측성을 보강하여 500 CCU에서 engine 도달 트래픽 80% 감소 및 p95 회귀를 5분 내 자동 감지.

## Scope

- 포함:
  - **분산 Rate Limiter** (Upstash Redis) — 다중 Vercel 인스턴스 간 공유 카운터
  - **API 캐시 커버리지 확장**: 공개 market/cogochi 라우트에 CDN s-maxage 일괄 추가
  - **Engine 응답 캐시** (Upstash Redis): `engineClient` wrapper에 SWR 캐시 layer
  - **Supabase 연결 정책 확인**: `db.ts`의 singleton Pool 검증 + PgBouncer URL 점검
  - **WebSocket 팬아웃 패턴**: `useMicrostructureSocket` per-user → broadcast 허브
  - **이미지/폰트**: `IntelPanel`, `SearchResultCard` enhanced:img, font preload, font-display swap
  - **압축 + preconnect**: brotli 검증, `app.html`에 preconnect (Supabase/Cloud Run/Upstash)
  - **Observability**: Sentry tracing app→engine trace 연결, p95 budget 알람
- 파일:
  - `app/src/lib/server/distributedRateLimit.ts` (신규)
  - `app/src/lib/server/rateLimit.ts` (heavy limiter 교체)
  - `app/src/routes/api/cogochi/thermometer/+server.ts`
  - `app/src/routes/api/cogochi/news/+server.ts`
  - `app/src/routes/api/cogochi/whales/+server.ts`
  - `app/src/routes/api/confluence/current/+server.ts`
  - `app/src/routes/api/market/indicator-context/+server.ts`
  - `app/src/routes/api/market/kimchi-premium/+server.ts`
  - `app/src/lib/server/engineCache.ts` (신규)
  - `app/src/lib/server/engineTransport.ts`
  - `app/src/lib/trade/useMicrostructureSocket.svelte.ts`
  - `app/src/lib/server/realtime/microstructureBroadcaster.ts` (신규)
  - `app/src/app.html`

## Non-Goals

- W-0363 중복: bundle reduction, viem/privy dynamic import, cold start memoize, Cloud Run min-instance, 6개 market API s-maxage
- DB 스키마 변경 (별도 마이그레이션)
- copy_trading, 자동매매 (Charter Frozen)
- Edge Runtime 전면 이전

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 캐시 stale 데이터 노출 (포지션/잔고 등) | 중 | 높음 | viewer-scoped/integrity-critical은 `private, no-store`만 |
| WebSocket broadcast 권한 누설 | 중 | 높음 | `audienceFilter` 강제 타입, cross-tenant 단위 테스트 |
| Upstash 연결 실패 → rate limit 전체 오픈 | 저 | 중 | fallback in-memory (degraded mode) |
| Engine 캐시 stale + write race | 중 | 중 | write 경로 명시적 invalidate, TTL 짧게(15-60s) |
| Upstash 비용 폭증 | 저 | 중 | command/s 모니터링, `allkeys-lru`, 큰 payload 압축/제외 |

### Dependencies

- W-0363 머지 후 시작 (Upstash 인스턴스 재사용)
- W-0249 Sentry 기존 도입 위에 tracing 확장
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` Vercel env 추가

### Rollback

- Phase별 단독 PR
- Engine 캐시: `ENGINE_RESPONSE_CACHE_ENABLED=false`로 즉시 우회
- WebSocket 팬아웃: `MICROSTRUCTURE_FANOUT_ENABLED=false` 기존 per-user 유지

## AI Researcher 관점

### Performance Hypothesis

| 최적화 | 영향 지표 | 예상 개선 |
|---|---|---|
| 분산 rate limiter | 500 CCU 다중 인스턴스 정확도 | rate limit 실효화 → 정확한 제한 |
| API 캐시 커버리지 (5%→80%) | engine/DB origin RPS | -70~80% at 500 CCU |
| Engine 응답 캐시 | 결정론적 read p95 | 200~400ms → 20~40ms |
| WebSocket 팬아웃 | engine 연결 수 | 500 → 1 |
| Font preload + display swap | LCP p75 | -150~250ms |

### Failure Modes

- **Cache poisoning**: viewer scope hash 누락 → fail-closed `private, no-store`
- **WebSocket 권한 누설**: audienceFilter 없으면 컴파일 에러 (타입 강제)
- **DB 풀 고갈 cascade**: statement_timeout + circuit breaker, 80% 도달 알람

## Decisions

- **[D-0364-1]** 분산 rate limiter = Upstash Redis. 거절: in-memory 유지 (500 CCU 다중 인스턴스에서 실효)
- **[D-0364-2]** Engine 캐시 = Upstash (W-0363 인스턴스 재사용). 거절: Vercel KV (lock-in)
- **[D-0364-3]** tracing = Sentry 확장. 거절: OTel 별도 (W-0249 이미 Sentry 도입, 운영 이중화)
- **[D-0364-4]** 캐시 정책 = 각 라우트 inline (단순함 우선). 거절: 별도 policy.ts (오버엔지니어링, Phase 1)
- **[D-0364-5]** WebSocket hub = Phase 3 별도 PR. 거절: Phase 1 통합 (위험 큼)

## Open Questions

- [ ] [Q-0364-1] Vercel chatbattle 플랜 HTTP/3 / early hints 지원?
- [ ] [Q-0364-2] Upstash 월 command 예산 (W-0363 + W-0364 합산)
- [ ] [Q-0364-3] engine 응답 캐시: write 경로 identify (어떤 엔드포인트가 state 변경하는가)
- [ ] [Q-0364-4] WebSocket 팬아웃 필요성: Phase 1-2 후 실측 데이터로 재판단

## Implementation Plan

### Phase 1 — 분산 Rate Limiter + API 캐시 커버리지 (현재 PR)

1. `distributedRateLimit.ts` — Upstash sliding window, in-memory fallback
2. `rateLimit.ts` — scan/analyze/engine proxy 등 heavy limiter를 distributed로 교체
3. 공개 market/cogochi 라우트 6개에 CDN cache headers 추가
4. Vercel에 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 추가 안내

### Phase 2 — Engine 응답 캐시 + Observability (별도 PR)

1. `engineCache.ts` — Upstash SWR layer for engineTransport
2. Sentry tracing 확장 (app→engine traceparent)
3. p95 latency budget 알람 등록

### Phase 3 — WebSocket 팬아웃 (별도 PR, Phase 1-2 데이터 후 Go/No-Go)

1. microstructureBroadcaster
2. per-user → broadcast 전환
3. cross-tenant 단위 테스트

### Phase 4 — 이미지/폰트/압축 (별도 PR)

1. enhanced:img (2 컴포넌트)
2. font preload + display swap
3. preconnect 태그

## Owner

app

## Facts

- Vercel 인스턴스 다중화 → in-memory rate limiter는 per-instance → 공유 counter 필요
- `app/src/lib/server/rateLimit.ts` 현재 in-memory sliding window 사용
- 공개 market/cogochi 라우트 6개 중 Cache-Control 없는 것 다수
- `app/src/lib/server/engineTransport.ts` 캐시 layer 없음

## Canonical Files

```
app/src/lib/server/distributedRateLimit.ts   # 신규
app/src/lib/server/rateLimit.ts              # distributed로 교체
app/src/lib/server/engineCache.ts            # 신규
app/src/lib/server/engineTransport.ts        # SWR cache 추가
app/src/routes/api/cogochi/thermometer/+server.ts
app/src/routes/api/cogochi/news/+server.ts
app/src/routes/api/cogochi/whales/+server.ts
app/src/routes/api/confluence/current/+server.ts
app/src/routes/api/market/indicator-context/+server.ts
app/src/routes/api/market/kimchi-premium/+server.ts
app/src/app.html
```

## Assumptions

- W-0363 머지 완료 (Upstash 인스턴스 생성됨)
- UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN Vercel env에 추가됨

## Next Steps

1. Phase 1: distributedRateLimit.ts + API cache headers (PR 단독)
2. Phase 2: engineCache.ts + Sentry tracing
3. Phase 3: WebSocket 팬아웃 (데이터 확인 후 Go/No-Go)

## Handoff Checklist

- [ ] UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN Vercel env 추가 확인
- [ ] Phase 1 PR CI green
- [ ] `pnpm check` 0 errors

## Exit Criteria

- [ ] **AC1**: 캐시 가능 GET 라우트 80%+ `Cache-Control` 헤더 보유
- [ ] **AC2**: Engine 응답 캐시 HIT > 70% (결정론적 read, Upstash 메트릭)
- [ ] **AC3**: 500 CCU k6 시나리오 engine RPS < 100/s
- [ ] **AC4**: WebSocket — engine↔app = 1 연결 (Phase 3)
- [ ] **AC5**: Supabase active conn p95 < 30
- [ ] **AC6**: LCP p75 W-0363 baseline 대비 -200ms
- [ ] **AC7**: 합성 p95 회귀 → Sentry 알람 5분 내
- [ ] **AC8**: stale/cross-tenant 노출 0건
- [ ] CI green, PR(s) merged, CURRENT.md SHA 업데이트
