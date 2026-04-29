# Domain: Core Loop Route Contracts

## Purpose

Define the Day-1 browser-facing and engine-facing route contracts for the capture-first core loop.

This document answers:

1. which route is canonical for each core-loop action?
2. which existing routes are transitional or legacy?
3. which layer owns the route?
4. how should new work avoid drifting from the capture-first model?

## Read Order

1. `docs/domains/contracts.md`
2. `docs/product/core-loop-agent-execution-blueprint.md`
3. `docs/domains/core-loop-object-contracts.md`
4. `docs/product/core-loop-state-matrix.md`
5. this file

## Route Design Rules

1. One route should represent one durable object or one explicit lifecycle action.
2. Browser-facing routes should return contract-safe envelopes and object shapes.
3. Engine routes remain decision authority where evaluation, verdict, and ledger semantics are deterministic.
4. Existing route names may remain during migration, but the canonical role must be explicit.
5. `terminal/alerts` and live `alerts` are not the same object and must not share semantics.

## Canonical Route Pack

### 1. Capture Routes

#### `POST /api/terminal/pattern-captures`

- Ownership: app-domain orchestrator
- Canonical action: create saved `capture`
- Current status: implemented
- Primary caller: `/terminal`
- Durable object: `capture`

Request:

- `PatternCaptureCreateRequestSchema`
- required minimum: `symbol`, `timeframe`, `triggerOrigin`, concrete `snapshot.viewport` or equivalent reviewed-range evidence

Response:

- `PatternCaptureResponseSchema`
- returns one newly created capture record in `records[0]`

Rules:

- this is the canonical browser-facing `Save Setup` route in Day-1
- current app-side persistence is allowed during migration
- target behavior is app orchestration over engine-backed durable capture truth

#### `GET /api/terminal/pattern-captures`

- Ownership: app-domain read route
- Canonical action: list saved captures
- Current status: implemented

Query:

- `symbol?`
- `timeframe?`
- `verdict?`
- `triggerOrigin?`
- `limit?`

Response:

- `PatternCaptureResponseSchema`

#### `POST /api/terminal/pattern-captures/similar`

- Ownership: app-domain or research-facing app route
- Canonical action: preview similar saved captures for the current reviewed range
- Current status: implemented

Request:

- `PatternCaptureSimilarityDraftSchema`

Response:

- `PatternCaptureSimilarResponseSchema`

Rules:

- similarity preview is helper behavior, not evaluation authority
- this route must never claim backtest, verdict, or activation authority

### 2. Explicit Query Helper Route

#### `POST /api/wizard`

- Ownership: app-domain helper route
- Canonical action: turn explicit query/blocks into challenge composition payload
- Current status: implemented
- Primary caller: `/terminal` query/composer path

Rules:

- secondary path only
- must not be used as fallback when `Save Setup` fails
- may create or return challenge definition material, but it is not the primary route for reviewed-range capture

### 3. Challenge Projection and Evaluation Routes

#### `POST /api/lab/challenges/project`

- Ownership: app-domain orchestration route
- Canonical action: project one saved capture into a lab-owned `challenge`
- Current status: target route, not yet canonical in implementation
- Primary caller: `/terminal` success follow-up or `/lab` direct projection flow

Request:

```json
{
  "captureId": "cap_123",
  "projectionMode": "capture_only",
  "title": "TRADOOR-style OI reversal",
  "description": "optional override",
  "preserveNote": true
}
```

Response:

```json
{
  "ok": true,
  "challenge": {
    "slug": "tradoor-oi-reversal-v1",
    "source_capture_ids": ["cap_123"],
    "evaluation_status": "projected"
  },
  "sourceCapture": {
    "id": "cap_123"
  }
}
```

Rules:

- every projected challenge must preserve source capture linkage
- explicit query path may also call this route after `wizard`, but the source mode must remain visible

#### `GET /api/lab/challenges`

- Ownership: app-domain read route over challenge bridge
- Canonical action: list lab-owned challenge summaries
- Current status: target canonical read route

Response summary fields:

- `slug`
- `title`
- `source_capture_ids`
- `evaluation_status`
- `latest_summary`
- `updated_at`

#### `GET /api/lab/challenges/{slug}`

- Ownership: app-domain read route
- Canonical action: return challenge detail for lab
- Current status: target canonical detail route

Required response sections:

- challenge identity
- source capture summary
- definition reference
- latest evaluation summary
- artifacts reference

#### `POST /api/lab/challenges/{slug}/evaluate`

- Ownership: orchestrated route with engine or runner authority downstream
- Canonical action: run deterministic evaluation for selected challenge
- Current status: target canonical browser-facing route

Request:

```json
{
  "mode": "manual",
  "requestedBy": "user"
}
```

Response:

- immediate accepted/started envelope or SSE stream contract
- final summary must include `SCORE`, `N_INSTANCES`, and related evaluation fields

Rules:

- if app bridges to `prepare.py evaluate`, that bridge is orchestration only
- if app bridges to engine evaluate, engine remains scoring authority

### 4. Watch Activation and Continuity Routes

#### `POST /api/lab/challenges/{slug}/activate`

- Ownership: orchestrated route
- Canonical action: create or update `watch` from evaluated challenge
- Current status: target route
- Primary caller: `/lab`

Request:

```json
{
  "activationMode": "manual_accept",
  "deliveryTargets": ["dashboard"],
  "scopeOverride": null
}
```

Response:

```json
{
  "ok": true,
  "watch": {
    "id": "watch_123",
    "challenge_slug": "tradoor-oi-reversal-v1",
    "status": "live"
  }
}
```

Rules:

- this is the only Day-1 browser-facing activation route
- dashboard must not create a new watch directly

#### `GET /api/watches`

- Ownership: app-domain or proxy read route
- Canonical action: list current watch objects for dashboard
- Current status: target route

Response fields:

- `id`
- `challenge_slug`
- `status`
- `scope`
- `last_evaluated_summary`
- `updated_at`

#### `PATCH /api/watches/{id}`

- Ownership: app-domain mutation route
- Canonical action: pause, resume, or retire an existing watch
- Current status: target route
- Primary caller: `/dashboard`

Request:

```json
{
  "action": "pause"
}
```

Allowed actions:

- `pause`
- `resume`
- `retire`

Rules:

- no `create` action here
- this route cannot activate a brand-new watch with no challenge context

### 5. Live Alert Routes

#### `GET /api/alerts`

- Ownership: orchestrated read route
- Canonical action: list live `alert` objects for dashboard and terminal drilldown
- Current status: target route
- Upstream source during migration: `GET /api/cogochi/alerts`

Required response fields:

- `id`
- `watch_id?`
- `challenge_slug`
- `symbol`
- `timeframe`
- `detected_at`
- `manual_verdict_state`
- `auto_verdict_state`
- `drilldown_context`

Rules:

- this is the canonical live alert route
- browser surfaces should stop consuming raw `cogochi/alerts` directly once this route exists

#### `GET /api/alerts/{id}`

- Ownership: app-domain read route
- Canonical action: retrieve one alert with full drilldown context
- Current status: target route

#### `POST /api/alerts/{id}/verdict`

- Ownership: app-domain or proxy mutation route
- Canonical action: persist manual feedback on an alert
- Current status: target route
- Primary caller: `/dashboard`

Request:

```json
{
  "label": "agree",
  "note": "optional"
}
```

Response:

```json
{
  "ok": true,
  "alert": {
    "id": "alert_123",
    "manual_verdict_state": "agree"
  },
  "verdict": {
    "source": "manual",
    "label": "agree"
  }
}
```

Rules:

- route must create a manual verdict record or equivalent audit-safe history
- manual feedback must not overwrite auto outcome data

### 6. Ledger Routes

#### `GET /api/ledger/summary`

- Ownership: engine-facing summary route or app proxy
- Canonical action: aggregate challenge, watch, and alert performance summary
- Current status: target route

Query examples:

- `challengeSlug=<slug>`
- `watchId=<id>`
- `symbol=<symbol>`

#### `GET /api/ledger/entries`

- Ownership: engine-facing detail route or app proxy
- Canonical action: return ledger evidence rows
- Current status: target route

Rules:

- summary routes may aggregate
- entries routes must expose durable evidence rows, not only derived metrics

## Existing Route Mapping

| Current Route | Current Meaning | Canonical Role | Migration Note |
|---|---|---|---|
| `/api/terminal/pattern-captures` | saved pattern capture persistence | keep | remains Day-1 `Save Setup` route |
| `/api/terminal/pattern-captures/similar` | similar capture preview | keep | remains helper route |
| `/api/wizard` | explicit query to challenge composer | keep as helper | secondary path only |
| `/api/terminal/watchlist` | local watchlist continuity state | transitional | do not treat as canonical `watch` object |
| `/api/terminal/alerts` | local alert-rule persistence | transitional | do not treat as live signal alerts |
| `/api/cogochi/alerts` | raw engine-backed alert feed | transitional upstream | should feed canonical `/api/alerts` |
| `/api/engine/captures` | engine canonical capture store | keep internal authority | browser should prefer app orchestration route |
| `/api/patterns/{slug}/evaluate` | pattern-engine evaluate | internal or secondary | do not expose as primary lab challenge route without adapter layer |
| `/api/patterns/{slug}/stats` | ledger stats for pattern engine | internal or secondary | may back ledger summary views later |

## Route Ownership Notes

### App-domain routes

Allowed to own:

- auth
- request validation
- orchestration
- local continuity state
- response shaping

Must not own:

- scoring truth
- final verdict truth
- hidden state transitions that violate the state matrix

### Engine-facing routes

Allowed to own:

- capture truth
- deterministic evaluate semantics
- verdict and ledger truth

Must not own:

- surface-specific labels
- client navigation decisions

## Error Envelope Rules

All browser-facing core-loop routes should return:

```json
{
  "ok": false,
  "error": "stable_code",
  "reason": "human-readable explanation"
}
```

Optional fields:

- `issues`
- `upstream`
- `retryable`

## Day-1 Prohibited Route Behavior

1. `Save Setup` falling back to challenge creation on capture failure
2. dashboard directly activating monitoring through local-only mutation
3. browser surfaces reading raw engine alert feed and inventing manual verdict state client-side
4. one route mixing local alert-rule settings and live signal alert judgments
