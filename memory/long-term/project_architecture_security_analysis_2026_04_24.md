---
name: Architecture security & scale analysis checkpoint
description: Full system architecture review (2026-04-24) — 5-plane design, security posture, 1000+ user scale readiness
type: project
---

## Current Architecture Summary

### Design: 5-Plane Terminal AI System

**Engine (Python/FastAPI):**
- Single source of truth: `engine/` only
- 16 patterns, 29 building blocks, 1193 tests
- Ledger: captures, outcomes, verdicts
- Market cache: Redis 5m prefetch + kline state machine
- Scoring: JUDGE/SCAN verdict engine

**App (TypeScript/Svelte):**
- Pure orchestration + UI surface
- Routes proxy through typed client helpers
- No business logic duplication
- Workspace: terminal page, compare/pin, analyze

**Contract Planes (5):**
1. **Raw Layer**: provider fetch, freshness state
2. **Fact Plane** (W-0122): FactSnapshot, confluence, indicator catalog
3. **Search Plane** (W-0145): corpus retrieval, ranking
4. **Agent Context** (W-0143): bounded AI inputs (AgentContextPack)
5. **Surface Plane** (W-0139/W-0140): terminal UI results

**Runtime State Plane** (W-0142): workflow truth (capture, pins, ledger) — engine-owned authoritative store

### Status

Merged planes: Raw, Fact, Search, Agent Context, Surface (14 work items active)
- PR #244: app warning cleanup (0 errors/warnings)
- PR #235–#243: latest wave merges (definition truth, DOUNI contracts)

Deferred: Cloud Run region, Vercel EXCHANGE_ENCRYPTION_KEY, W-0124 (GCP ingress auth)

---

## Haiku Findings

✅ **Strengths:**
- Clear separation of concerns (engine only truth, app pure surface)
- Contract-first execution with strangler pattern
- Security audit completed (PR #145: error sanitization)
- Systematic work item tracking (AGENTS.md discipline)

⚠️ **Scale/Security Gaps Identified (Sonnet to analyze):**

### 1. 1000+ Concurrent User Readiness
- [ ] No load test baseline (throughput, latency, failure rates)
- [ ] Database: Supabase migration 018 pending execution
- [ ] Caching strategy: Redis prefetch 5m only; broader hot/cold not documented
- [ ] Connection pooling: app/engine FastAPI settings unclear
- [ ] WebSocket scaling: `klineWs` state management in Svelte 5 (W-0116 fixed $state mutation but scale limit unknown)
- [ ] Fact plane queries: pagination, limit, timeout policies undefined

### 2. Security Posture
- [ ] **Authentication**: W-0124 deferred (GCP ingress hardening incomplete)
- [ ] **Secrets Management**: EXCHANGE_ENCRYPTION_KEY not yet in Vercel prod
- [ ] **Input Validation**: Error sanitization done but request body/query schema validation unclear
- [ ] **Data Isolation**: Multi-tenant support design not found
- [ ] **Rate Limiting**: No documented per-user or per-IP limits
- [ ] **API Key Rotation**: `/api/cogochi/` gated (PR #142) but key lifecycle policy missing

### 3. Data Access Control
- [ ] **RLS Policies**: Supabase row-level security coverage unclear (migration 018 pending)
- [ ] **Ledger Access**: capture/outcome/verdict read boundary — user-scoped or admin?
- [ ] **Search Corpus**: who can access search results? (corpus accumulation policy in W-0145)
- [ ] **Pattern Definitions**: W-0160 definition_scope added but legacy backfill/sunset policy pending

### 4. Infrastructure & Env
- [ ] Cloud Run: `asia-southeast1/cogotchi` vs `us-east4/cogotchi` region choice deferred
- [ ] Vercel: Git deploy guardrails in `app/vercel.json` missing (PR0.2 contract blocker)
- [ ] Database failover: not documented
- [ ] Observability: logging/metrics for audit trail?

---

## Next: Sonnet Deep Dive

**Sonnet will analyze:**
1. **Performance bottlenecks** for 1000+ users (DB queries, cache hits, WebSocket handling)
2. **Security gaps** (auth bypass paths, injection vectors, data leak scenarios)
3. **Specific code audit** (engine routes, app client contracts, Supabase RLS)
4. **Concrete recommendations** (caching, queuing, rate limits, isolation)
5. **Implementation roadmap** (phased scaling, security hardening, monitoring)

**Blockers to resolve before scale:**
- Supabase migration 018 execution (DB schema, indexes)
- W-0124 implementation (GCP ingress auth)
- Vercel EXCHANGE_ENCRYPTION_KEY wiring
- Load test baseline + SLA definition
