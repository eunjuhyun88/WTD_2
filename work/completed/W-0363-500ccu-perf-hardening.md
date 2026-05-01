# W-0363 — 500 Concurrent User Performance Hardening

> Wave: 5 | Priority: P0 | Effort: L
> Charter: In-Scope §infra
> Status: 🟡 Design Draft
> Issue: #799
> Created: 2026-05-01

## Goal

500명 동시 접속 시 LCP p75 < 2.5s, p95 market API < 500ms, server bundle < 2MB, cold start TTFB < 800ms 달성. 아키텍처 변경 없이 번들 최적화 + 분산 rate limiting + CDN 강화로 달성.

## Scope

- 포함:
  - Bundle analyzer 도입 + baseline 실측
  - `assertAppServerRuntimeSecurity` 결과 module-scope 메모이즈 (boot 1회)
  - viem SSR external + 클라이언트 dynamic import (wallet route)
  - @privy-io dynamic import (로그인 모달 open 시)
  - lightweight-charts dynamic import (chart 페이지만)
  - Upstash Redis 분산 rate limiter (`chartFeedLimiter` 교체)
  - market API s-maxage TTL 튜닝 + CDN HIT 90%+ 목표
  - Critical CSS inline + font preload (LCP)
  - Engine timing middleware (p50/p95 베이스라인)
  - Cloud Run min instance 2-3 설정
  - k6 500 VU 부하 테스트 시나리오
- 파일:
  - `app/src/lib/server/rateLimit.ts` (Upstash Redis 교체)
  - `app/src/lib/server/runtimeSecurity.ts` (메모이즈)
  - `app/src/lib/wallet/privyClient.ts`, `gmxV2.ts`, `chainSwitch.ts` (dynamic import)
  - `app/src/lib/wallet/providers.ts` (dynamic import)
  - `app/src/lib/chart/*` (dynamic import)
  - `app/svelte.config.js`, `app/vite.config.ts` (external, manualChunks)
  - `app/src/routes/+layout.svelte`, `+layout.ts`
  - `app/src/routes/api/market/*` (TTL 튜닝)
  - `app/vercel.json` (functions config)
  - `engine/api/middleware/timing.py` (신규)
  - `app/load-tests/k6-500ccu.js` (신규)

## Non-Goals

- Pub/Sub 팬아웃, Read replica (1000명 이상 필요)
- Edge Runtime 전면 이전 (Node-only deps 회귀 위험, 별도 설계)
- Chart UX 변경 (W-0212류 frozen)
- copy_trading / 자동매매 (Charter Frozen)
- Cloud Run → 다른 런타임 마이그레이션

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| viem dynamic → wallet 첫 클릭 800ms+ 지연 | High | Med | hover prefetch; 로딩 스피너; AC7 wallet TTI < 1.5s 검증 |
| @privy-io dynamic → hydration mismatch | Med | High | `browser` 가드 + 서버 토큰 검증 분리 유지 |
| Upstash Redis 연결 실패 → rate limit 전체 오픈 | Low | Med | fallback: in-memory limiter (degraded mode); alert |
| `assertAppServerRuntimeSecurity` 메모이즈 → 보안 회귀 | Low | Critical | process boot id 캐시 키 포함; 검증 자체는 유지 |
| External 설정 후 SSR require 실패 | Med | High | preview smoke (wallet/chart/login) → prod |
| k6 부하 테스트 → prod 비용/rate limit | Med | Med | preview 환경 + read-only 엔드포인트만 |
| Cloud Run min instance 비용 증가 | Low | Low | 2 instance: ~$15/mo 추가 — 허용 범위 |

### Dependencies

- PR #791 (Speed Insights + CDN cache) — 완료, baseline 측정 도구 확보
- Upstash Redis 계정 (무료 tier 충분)
- Cloud Run 배포 권한 (`gcloud run services update`)
- Vercel chatbattle 프로젝트 env var 권한

### Rollback Plan

- Phase 단위 단독 PR → revert 1 PR로 회귀 가능
- Vercel instant rollback (이전 deployment promote)
- Upstash 실패 시 fallback in-memory (코드에 built-in)
- Cloud Run min instance: `gcloud run services update --min-instances=1`

## AI Researcher 관점

### Performance Baseline (측정 필요)

| 지표 | 도구 | 현재 (추정) | 목표 |
|---|---|---|---|
| LCP p75 | Speed Insights | 미측정 | < 2.5s |
| FCP p75 | Speed Insights | 미측정 | < 1.8s |
| Server function bundle | `.vercel/output` size | 4.4MB | < 2MB |
| Client first-load JS (gzip) | rollup-plugin-visualizer | 미측정 (94MB raw) | < 300KB |
| Cold start TTFB | curl 10회 평균 | 추정 1.5-3s | < 800ms |
| Market API p95 (cache HIT) | Vercel logs | 미측정 | < 300ms |
| Market API p95 (cache MISS) | Vercel logs | 미측정 | < 500ms |
| Engine `/api/scan` p95 | Sentry/timing | 미측정 | < 1.5s |
| 500 VU 에러율 | k6 | N/A | < 0.5% |
| 500 VU p95 latency | k6 | N/A | < 700ms |

### Optimization Hypothesis

| 최적화 | 영향 지표 | 예상 개선 |
|---|---|---|
| viem SSR external | Server bundle, cold start | -1.2~1.8MB, -300~600ms |
| viem + privy dynamic import | Client first-load JS | -250~450KB gzip |
| `assertAppServerRuntimeSecurity` 메모이즈 | Cold start TTFB | -100~300ms |
| Upstash Redis rate limiter | 500 VU 에러율 | in-memory 불일치 제거 |
| Cloud Run min 2-3 인스턴스 | Engine cold start | -500ms~1s |
| CDN HIT 90%+ | p95 API, 500 VU throughput | engine 부하 80% 감소 |
| Critical CSS + font preload | LCP, FCP | -200~400ms |

### Failure Modes

- viem dynamic → wallet 연결 첫 클릭 800ms+ → prefetch로 완화, AC7으로 검증
- privy dynamic → SSR hydration mismatch → browser 가드 + smoke 필수
- Upstash cold connection (첫 요청 50-100ms) → connection pool warmup
- k6 preview 트래픽이 engine prod에 영향 → read-only 엔드포인트 제한

## Decisions

- **[D-0363-1]** viem SSR external 처리. 거절: 완전 제거(wallet 손상), tree-shake만(61MB 그대로)
- **[D-0363-2]** @privy-io 클라 dynamic import. 거절: 정적 유지(LCP 영향)
- **[D-0363-3]** Rate limiter: Upstash Redis. 거절: in-memory 유지(500명 인스턴스 분산 문제), Redis 자체 호스팅(운영 부담)
- **[D-0363-4]** Cloud Run min instance 2-3. 거절: min 0 유지(cold start 500명 버스트 시 engine down 위험)
- **[D-0363-5]** Engine 최적화는 Phase 4 별도 PR (차단 안 함). 거절: 통합(PR 비대화)

## Open Questions

- [ ] [Q-0363-1] @privy-io SDK 버전이 dynamic import + SSR 안정적인가?
- [ ] [Q-0363-2] viem이 SSR에서 직접 호출되는 코드 경로 있는가? (있으면 wallet API route 분리 필요)
- [ ] [Q-0363-3] 현재 market API CDN HIT률은? (PR #791 머지 후 24-48h 데이터 수집 후 확인)
- [ ] [Q-0363-4] Engine `/api/scan` p95 실측치는? (Phase 1 timing middleware 추가 후 확인)
- [ ] [Q-0363-5] Cloud Run 현재 min instance, max concurrency 설정값은?

## Implementation Plan

### Phase 1 — Measurement + Quick Wins (1-2일, 단독 PR)

1. `rollup-plugin-visualizer` 추가, `npm run build:analyze` 스크립트
2. `assertAppServerRuntimeSecurity` 결과 module-scope 메모이즈 (boot 1회)
3. Engine timing middleware: `/api/scan`, `/api/cogochi/*` p50/p95 Sentry 로깅
4. Cloud Run min instance 2-3 설정 (`gcloud run services update --min-instances=2`)
5. 베이스라인 문서화 (bundle size, cold TTFB, engine p95 실측)
6. Open Questions Q-0363-2~5 해소

### Phase 2 — Bundle Reduction (3-5일, 단독 PR)

1. viem SSR external (`vite.ssr.external`)
2. wallet 진입점 dynamic import: `privyClient`, `gmxV2`, `chainSwitch`, `providers`
3. @privy-io dynamic import (wallet 버튼 hover prefetch 포함)
4. lightweight-charts dynamic import (chart 페이지만)
5. route-level code splitting / manualChunks 점검
6. 회귀 smoke: wallet connect, chart render, login flow

### Phase 3 — Rate Limiter + CDN (2-3일, 단독 PR)

1. `rateLimit.ts` → Upstash Redis (@upstash/ratelimit)
2. fallback in-memory (Redis 연결 실패 시)
3. market API s-maxage TTL 재검토 (실측 HIT률 기반)
4. `stale-while-revalidate` 공격적으로 (cache MISS 시에도 stale 응답)
5. CDN cache key 정리 (불필요 query param 제거)
6. Critical CSS inline + font preload (LCP)

### Phase 4 — Load Test + Engine (3-5일, 단독 PR — 옵션)

1. k6 시나리오: 500 VU × 60s, market/scan/cogochi mix (preview only)
2. Engine 핫 쿼리 인덱스 (Phase 1 timing 기반, `CREATE INDEX CONCURRENTLY`)
3. 부하 테스트 결과 문서화
4. Sentry 회귀 알람 등록 (LCP regression, bundle budget, p95 spike)

## Exit Criteria

- [ ] **AC1**: LCP p75 < 2.5s (Speed Insights 7일 평균, app.cogotchi.dev)
- [ ] **AC2**: Market API p95 < 500ms, CDN HIT > 90% (Vercel CDN logs)
- [ ] **AC3**: Server function bundle < 2MB (`.vercel/output/functions` 측정)
- [ ] **AC4**: Client first-load JS < 300KB gzip (visualizer report 첨부)
- [ ] **AC5**: 500 VU k6 부하 테스트 — 에러율 < 0.5%, p95 < 700ms
- [ ] **AC6**: Cold start TTFB p75 < 800ms (curl 10회 평균)
- [ ] **AC7**: Wallet connect TTI < 1.5s (dynamic import 회귀 방지)
- [ ] **AC8**: Engine `/api/scan` p95 < 1.5s (Sentry transaction)
- [ ] **AC9**: Hydration mismatch / console error 0건 (preview smoke)
- [ ] CI green (vitest + svelte-check + bundle size budget check)
- [ ] PR(s) merged + CURRENT.md SHA 업데이트
- [ ] Sentry 회귀 알람 4개 등록
