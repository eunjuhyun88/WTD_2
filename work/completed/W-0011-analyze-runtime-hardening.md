# W-0011 Analyze Runtime Hardening

## Goal

Make `/api/cogochi/analyze` safer under real concurrent usage by hardening request normalization, request tracing, cache/coalescing behavior, and verification around the hot path.

## Owner

app

## Scope

- remove unsafe response-sharing from analyze request coalescing
- keep short-TTL analyze caching but move coalescing to payload-level semantics
- tighten analyze request normalization for empty or malformed query params
- add focused tests for analyze request parsing and cache-key behavior
- make degraded and error response envelopes explicit for analyze callers
- add request-level analyze telemetry for cache, fallback, and failure outcomes

## Non-Goals

- redesigning terminal response payloads
- changing engine scoring or deep-analysis semantics
- introducing queue workers or cross-process job orchestration
- broad rate-limit policy redesign across unrelated routes

## Canonical Files

- `work/active/W-0011-analyze-runtime-hardening.md`
- `app/src/routes/api/cogochi/analyze/+server.ts`
- `app/src/lib/server/analyze/cache.ts`
- `app/src/lib/server/analyze/requestParser.ts`
- `app/src/lib/server/analyze/smoke.test.ts`
- `app/src/lib/server/analyze/responseEnvelope.ts`
- `app/src/lib/server/analyze/responseEnvelope.test.ts`
- `app/src/lib/server/analyze/responseMapper.test.ts`
- `app/src/lib/server/analyze/telemetry.ts`
- `app/src/lib/server/publicRouteCache.ts`
- `app/src/lib/server/rateLimit.ts`
- `app/src/lib/server/authSecurity.ts`

## Decisions

- coalescing must happen on cached payloads, not shared `Response` instances
- analyze cache stays intentionally short-lived to reduce duplicate engine fan-out without hiding fresh market moves for long
- empty `symbol` or `tf` query params should collapse back to route defaults instead of creating noisy cache keys
- request-id propagation remains mandatory on analyze responses for traceability
- degraded fallback responses should bypass cache storage and return `no-store` headers
- partial-engine success responses must declare degraded mode explicitly, not only full fallback responses
- analyze failures should return a stable error envelope with machine-readable `error` and human-readable `reason`
- analyze route logs should include request id, HTTP status, cache status, and degraded mode for operations tracing

## Next Steps

- add route-level tests once the analyze handler is easier to isolate under vitest without over-mocking heavy imports
- surface analyze cache and rate-limit counters into aggregated metrics beyond structured logs
- decide whether cache hits should bypass part of the distributed limiter budget

## Exit Criteria

- concurrent analyze callers do not share the same `Response` instance
- analyze cache keys are normalized and deterministic
- focused tests cover request normalization and cache-key rules
- successful analyze payloads expose explicit degraded metadata when engine coverage is partial
- caller-facing analyze failures use a stable error envelope
- app checks and targeted tests pass after the hardening changes
