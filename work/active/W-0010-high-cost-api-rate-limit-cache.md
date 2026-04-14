# W-0010 High-Cost API Rate Limit and Cache Hardening

## Goal

Harden the public high-cost API paths so the app can tolerate real multi-user burst traffic without letting expensive origin work fan out per request.

## Owner

app

## Scope

- shared cache and request coalescing for public heavy GET routes
- distributed/IP rate-limit protection for the main public analysis route
- consistent cache headers for cacheable public reads
- route-inventory updates for the hardened paths

## Non-Goals

- queue/worker split for long-running jobs
- full API route-tier implementation across every endpoint
- edge/WAF vendor configuration
- admin/control-plane separation
- engine algorithm changes

## Canonical Files

- `work/active/W-0010-high-cost-api-rate-limit-cache.md`
- `app/src/lib/server/publicRouteCache.ts`
- `app/src/lib/server/publicCacheHeaders.ts`
- `app/src/routes/api/cogochi/analyze/+server.ts`
- `app/src/routes/api/wallet/intel/+server.ts`
- `app/src/routes/api/terminal/intel-agent-shadow/+server.ts`
- `app/src/routes/api/terminal/opportunity-scan/+server.ts`
- `app/src/lib/server/rateLimit.ts`
- `app/docs/references/active/API_ROUTE_TIER_INVENTORY_2026-04-12.md`

## Decisions

- Public heavy reads must prefer shared cache plus in-flight coalescing before adding more origin capacity.
- `cogochi/analyze` is treated as a high-cost public compute path and must have app-level abuse protection.
- Cache behavior should be explicit and observable via response headers, not implicit in route-local Maps only.
- Existing per-instance micro-caches may remain, but shared cache must be the cross-instance truth path.

## Next Steps

- harden `/api/terminal/intel-policy` and `/api/market/snapshot` with the same shared policy primitives
- add route-level cache hit/miss/429 telemetry aggregation
- move Tier B long-running or burst-sensitive execution to queue/worker plane
- promote Redis shared cache config in production instead of relying on fallback behavior

## Exit Criteria

- the main public heavy routes share one cache/coalescing pattern
- `cogochi/analyze` has distributed/IP rate limiting
- heavy public responses expose consistent cache headers
- route inventory reflects the hardened status of the touched endpoints
