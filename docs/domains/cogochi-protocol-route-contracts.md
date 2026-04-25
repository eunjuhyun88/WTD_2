# Domain: Cogochi Protocol Route Contracts

## Purpose

Define the browser-facing, engine-facing, and worker-control route contracts for the Cogochi Protocol extension.

This document answers:

1. which route is canonical for each protocol action?
2. which runtime owns that action?
3. which routes are browser-safe reads vs internal control-plane jobs?
4. how should implementation avoid mixing protocol truth with current pattern routes?

## Read Order

1. `docs/domains/contracts.md`
2. `docs/domains/cogochi-protocol-extension-architecture.md`
3. `docs/domains/cogochi-protocol-shared-state-schema.md`
4. `docs/domains/cogochi-protocol-object-contracts.md`
5. `docs/product/cogochi-protocol-phase1-execution-spec.md`
6. this file

## Route Design Rules

1. One route should represent one durable protocol object or one explicit lifecycle action.
2. Browser-facing routes may orchestrate, but must not invent protocol truth.
3. Engine routes remain authority for protocol semantics and read models.
4. Worker-control routes are internal-only and should own recomputation, expiry, and rebalance jobs.
5. Existing pattern or terminal routes must not be repurposed to carry protocol semantics.

## Runtime Ownership Policy

### `app-web`

Owns:

- session/auth
- public browser route orchestration
- protocol explorer rendering

May:

- proxy canonical protocol reads
- shape display-oriented envelopes

Must not:

- resolve signals
- compute rankings
- compute eligibility
- own allocations

### `engine-api`

Owns:

- protocol object read/write semantics
- verification logic
- outcome read contracts
- scoreboard read models

May:

- accept commits and reveals
- expose rankings and eligibility

Must not by default:

- run long-lived recompute loops inline

### `worker-control`

Owns:

- signal expiry jobs
- outcome resolver jobs
- scoreboard recomputation
- eligibility recomputation
- shadow rebalance jobs

Must not:

- act as browser-facing public API

## Canonical Route Pack

### 1. Engine Registry Routes

#### `POST /api/protocol/engines`

- Ownership: app-domain orchestrated route over engine authority
- Canonical action: create `protocol_engine`
- Primary caller: operator/admin UI
- Durable object: `protocol_engine`

Request:

```json
{
  "displayName": "Cogochi Engine",
  "engineType": "internal",
  "operatorId": "operator_001",
  "metadataRef": {
    "kind": "ipfs",
    "value": "ipfs://..."
  },
  "tags": ["momentum", "derivatives"]
}
```

Response:

```json
{
  "ok": true,
  "engine": {
    "id": "eng_cogochi_v1",
    "engine_status": "active",
    "stake_state": "pending"
  }
}
```

Rules:

- browser route may validate auth and permissions
- engine remains durable truth owner

#### `GET /api/protocol/engines`

- Ownership: app-domain read route over engine read model
- Canonical action: list engine summaries
- Primary caller: protocol explorer

Required fields:

- `id`
- `display_name`
- `engine_status`
- `stake_state`
- `last_heartbeat_at`
- latest score snapshot summary
- latest eligibility state

#### `GET /api/protocol/engines/{engineId}`

- Ownership: app-domain read route over engine detail contract
- Canonical action: engine detail read

Required sections:

- engine identity
- metadata
- latest performance
- latest eligibility
- recent signal history

### 2. Signal Attestation Routes

#### `POST /api/protocol/signals/commit`

- Ownership: proxy or orchestrated route to engine authority
- Canonical action: create `protocol_signal_commit`
- Primary caller: engine publisher or SDK

Request:

```json
{
  "engineId": "eng_cogochi_v1",
  "commitHash": "0xabc123",
  "revealDeadline": "2026-04-23T12:00:30Z",
  "sourceChain": "offchain-shadow"
}
```

Response:

```json
{
  "ok": true,
  "commit": {
    "id": "sig_001",
    "commit_status": "committed"
  }
}
```

#### `POST /api/protocol/signals/reveal`

- Ownership: proxy or orchestrated route to engine authority
- Canonical action: create `protocol_signal_reveal` and verify against commit

Request:

```json
{
  "commitId": "sig_001",
  "engineId": "eng_cogochi_v1",
  "asset": "BTC",
  "direction": "long",
  "tpBps": 250,
  "slBps": 100,
  "validUntil": "2026-04-23T13:00:00Z",
  "nonce": "913245"
}
```

Response:

```json
{
  "ok": true,
  "reveal": {
    "id": "rev_001",
    "verification_state": "verified"
  }
}
```

#### `GET /api/protocol/signals/{commitId}`

- Ownership: app-domain read route
- Canonical action: return combined commit / reveal / outcome state

Required sections:

- commit summary
- reveal summary if any
- verification state
- outcome summary if resolved

### 3. Scoreboard And Eligibility Routes

#### `GET /api/protocol/scoreboard`

- Ownership: app-domain read route over engine read model
- Canonical action: ranked engine list

Query:

- `window?`
- `status?`
- `eligibleOnly?`
- `limit?`

Response rows:

- `engineId`
- `displayName`
- `rollingSharpe`
- `cumulativePnLBps`
- `hitRate`
- `maxDrawdownPct`
- `uptimeScore`
- `eligibilityState`

#### `GET /api/protocol/engines/{engineId}/eligibility`

- Ownership: app-domain read route over engine authority
- Canonical action: return latest `protocol_engine_eligibility`

Required response:

- `eligibilityState`
- `reasons`
- `effectiveFrom`
- threshold summary

### 4. Router Read Routes

#### `GET /api/protocol/router/allocations/current`

- Ownership: app-domain read route over router authority
- Canonical action: return latest `protocol_router_allocation_snapshot`
- Current status: Phase 2 target route

Required response:

- `allocationKind`
- `computedAt`
- `weights[]`
- `rebalanceReason`

Rules:

- Phase 1 may return `not_available`
- app must not fabricate allocations from scoreboard rows

## Internal Engine Routes

These routes are engine-owned and may or may not be directly browser-exposed.

### `POST /protocol/engines`

- Ownership: engine-api
- Canonical action: durable engine create

### `POST /protocol/signals/commit`

- Ownership: engine-api
- Canonical action: durable commit create

### `POST /protocol/signals/reveal`

- Ownership: engine-api
- Canonical action: durable reveal create + verification

### `GET /protocol/engines/{engineId}/stats`

- Ownership: engine-api
- Canonical action: canonical engine performance read

### `GET /protocol/engines/{engineId}/eligibility`

- Ownership: engine-api
- Canonical action: canonical eligibility read

### `GET /protocol/router/allocations/current`

- Ownership: engine-api
- Canonical action: canonical allocation read

## Worker-Control Job Pack

These are internal control-plane routes or equivalent queue job names.

### `POST /jobs/protocol/expire-signals`

- Ownership: worker-control
- Canonical action: mark missed reveal windows as expired

### `POST /jobs/protocol/resolve-outcomes`

- Ownership: worker-control
- Canonical action: resolve pending verified signals into outcomes

### `POST /jobs/protocol/recompute-scoreboard`

- Ownership: worker-control
- Canonical action: rebuild performance snapshots from outcome records

### `POST /jobs/protocol/recompute-eligibility`

- Ownership: worker-control
- Canonical action: rebuild eligibility state from snapshots and policy

### `POST /jobs/protocol/rebalance-shadow-router`

- Ownership: worker-control
- Canonical action: compute new shadow allocation snapshot

## Failure-Mode Policy

### Attestation matrix

1. `commit=ok`, `reveal=ok`, `verify=ok`
   - signal is `verified`
2. `commit=ok`, `reveal=missing`
   - signal is `expired`
3. `commit=ok`, `reveal=present`, `verify=fail`
   - signal is `invalid`
4. `commit=fail`
   - no durable signal lifecycle begins

### Outcome matrix

1. `verified + price_source_ok`
   - resolve normally
2. `verified + price_source_stale`
   - keep pending or mark blocked with explicit reason
3. `verified + timeout_reached`
   - resolve to `timeout`

### Browser degradation rule

If protocol read models are unavailable:

- browser routes may return explicit degraded responses
- browser routes must not infer or fake missing protocol truth

## Separation Rule

The following current routes must not become protocol truth carriers:

- `/api/patterns/*`
- `/api/terminal/pattern-captures/*`
- `/api/live-signals/*`
- `/api/cogochi/analyze`

They remain part of the current Cogochi Engine operating loop.

Protocol routes must live in an explicit `/protocol` namespace or equivalent canonical grouping.

## Suggested Contract Tests

1. commit followed by matching reveal returns `verified`
2. commit followed by mismatched reveal returns `invalid`
3. unresolved verified signal can move to `win`, `loss`, or `timeout`
4. scoreboard read equals aggregate of outcome rows
5. eligibility read equals policy applied to latest performance snapshots
6. app route returns canonical protocol ids and states without renaming semantics
