# Domain: Contracts

## Goal

Define and stabilize app-engine interfaces to reduce cross-layer reads and breakage.

For Day-1 core-loop work, this file is the index, not the whole contract pack.
The core-loop extension documents are:

- `docs/product/core-loop-agent-execution-blueprint.md`
- `docs/domains/core-loop-object-contracts.md`
- `docs/domains/core-loop-route-contracts.md`
- `docs/product/core-loop-state-matrix.md`
- `docs/product/core-loop-surface-wireframes.md`
- `docs/runbooks/core-loop-verification.md`
- `docs/runbooks/core-loop-migration-plan.md`

## Canonical Type Homes

- App shared schemas: `app/src/lib/contracts/index.ts`
- Challenge schema: `app/src/lib/contracts/challenge.ts`
- Verdict schema: `app/src/lib/contracts/verdict.ts`
- Engine challenge types: `engine/challenge/types.py`
- Engine pattern routes: `engine/api/routes/patterns.py`
- App proxy routes: `app/src/routes/api/wizard/+server.ts`, `app/src/routes/api/patterns/*`

## Contract Set (Current Baseline)

1. Challenge input contract (`POST /api/wizard`)
2. Evaluation run contract (`POST /api/engine/verdict`, `POST /api/patterns/{slug}/evaluate`)
3. Result summary contract (pattern stats / evaluate summaries)
4. Instance detail contract (per-outcome result rows)
5. Error contract (uniform envelope)

## Surface-Contract Index (Day-1 Canonical)

Use this table as the first lookup for "which document is source-of-truth for this behavior."

MANDATORY rule:

- Before implementing, reviewing, or QA-ing any surface behavior, you must read this index and then follow the read order below.
- Do not start coding from route files first.
- If this order is skipped, the change is considered out-of-contract.

| Surface | Product Spec (behavior) | Domain Spec (ownership/boundary) | Primary Contract Types |
|---|---|---|---|
| Global system | `docs/product/pages/00-system-application.md` | `docs/domains/contracts.md` | route ownership, error envelope, shared schema/version policy |
| Home (`/`) | `docs/product/pages/01-home.md` | n/a (frozen maintenance surface) | start-bar route handoff contract |
| Terminal (`/terminal`) | `docs/product/pages/02-terminal.md` | `docs/domains/terminal.md` | query/deep-link, evidence/source ordering, tab/result payloads |
| Lab (`/lab`) | `docs/product/pages/03-lab.md` | `docs/domains/lab.md` | challenge artifacts, evaluate stream summary, instances rows |
| Dashboard (`/dashboard`) | `docs/product/pages/04-dashboard.md` | `docs/domains/dashboard.md` | alert inbox rows, watching state shape, saved setup summary rows |

Read order for implementation or QA:

1. this contracts doc as the index
2. `docs/product/pages/00-system-application.md`
3. `docs/product/core-loop-agent-execution-blueprint.md` for Day-1 core-loop work
4. `docs/domains/core-loop-object-contracts.md` when payload or object semantics change
5. `docs/domains/core-loop-route-contracts.md` when route ownership or API shape changes
6. `docs/product/core-loop-state-matrix.md` when lifecycle or activation behavior changes
7. target surface product spec (`docs/product/pages/*`)
8. matching domain spec (`docs/domains/*.md`)
9. this contracts doc again for payload and envelope details

Conflict resolution rule:

- If product/domain behavior text and payload schema appear to conflict, schema safety in this file wins for wire format, and behavior wording should be updated in the corresponding product/domain doc in the same task.

Supporting cross-surface domains:

- `docs/domains/scanner-alerts.md` (scan cadence, dedup, feedback lifecycle)
- `docs/domains/autoresearch-ml.md` (feedback-to-training, validation, deploy/rollback gates)

## Route Ownership Policy

Every app-facing route must declare one of the following ownership types:

1. **Proxy route**
   - Example: `app/src/routes/api/engine/[...path]/+server.ts`
   - Rule: pass-through only (transport, timeout, error normalization)
   - Must not implement product decision logic.

2. **Orchestrated route**
   - Example: `app/src/routes/api/cogochi/analyze/+server.ts`
   - Rule: app may collect upstream raw data, call multiple services, and shape response.
   - Must keep engine as decision authority for scoring/verdict logic.

3. **App-domain route**
   - Example: `app/src/routes/api/terminal/scan/+server.ts`
   - Rule: full app ownership (auth/session/rate-limit/persistence/workflow).
   - Engine integration is optional and explicit.

All new routes should document their ownership type in route-level comments and relevant work items.

## Runtime Placement Policy

Ownership type and runtime placement are related, but not identical.

1. Public app-facing routes live on `app-web`
   - Includes proxy routes and thin orchestrated routes.
   - Must avoid long-running control-plane work.

2. Engine-owned compute routes live on `engine-api`
   - Deterministic score/deep/evaluate semantics belong here.
   - App routes may orchestrate around them, but do not replace them.

3. Scheduler, training, report generation, and queue consumers live on `worker-control`
   - These are not public browser-origin responsibilities.
   - Public web routes may enqueue or request internal work, but should not execute long-running control-plane jobs inline by default.

## Failure-Mode Contract Policy

The caller-facing contract must make degradation explicit. Silent fallback is disallowed.

### Analyze policy matrix

1. `deep=ok`, `score=ok`
   - return full payload with standard confidence semantics.
2. `deep=ok`, `score=fail`
   - return deep-authoritative payload, set ML-specific fields nullable.
3. `deep=fail`, `score=ok`
   - return score-limited payload and mark reduced confidence/degraded mode.
4. `deep=fail`, `score=fail`
   - return explicit degraded error/limited payload with machine-readable status.

### Error envelope requirements

- include stable top-level fields: `ok`, `error`
- include optional diagnosis fields: `reason`, `issues`, `upstream`
- do not expose raw internal stack traces to clients
- keep HTTP status aligned with failure class (4xx input, 5xx system/upstream)

## SignalSnapshot Version Policy

- Canonical version field: `schema_version` on `SignalSnapshot`.
- Current supported version: `1`.
- Backward compatibility rule:
  - missing `schema_version` from legacy clients is normalized to `1`.
  - unsupported versions are rejected with `400`.
- Change rule:
  - increment `schema_version` only on breaking schema changes.
  - update engine adapters + app type definitions + contract tests in the same change set.

## Challenge Input Contract

### Request shape (app)

```json
{
  "slug": "btc-4h-rally-bb-expand",
  "description": "Recent rally continuation with band expansion",
  "direction": "long",
  "timeframe": "4h",
  "blocks": [
    {
      "role": "trigger",
      "module": "triggers",
      "function": "recent_rally",
      "params": { "pct": 0.1 },
      "source_token": "recent_rally 10%"
    }
  ],
  "universe": "binance_30",
  "outcome": { "target_pct": 0.06, "stop_pct": 0.02, "horizon_bars": 24 }
}
```

### Response shape (app)

```json
{
  "ok": true,
  "answers": {
    "version": 1,
    "schema": "pattern_hunting",
    "created_at": "2026-04-14T10:00:00.000Z",
    "identity": { "name": "btc-4h-rally-bb-expand", "description": "..." },
    "setup": { "direction": "long", "universe": "binance_30", "timeframe": "4h" },
    "blocks": {
      "trigger": { "module": "triggers", "function": "recent_rally", "params": { "pct": 0.1 } },
      "confirmations": [],
      "entry": null,
      "disqualifiers": []
    },
    "outcome": { "target_pct": 0.06, "stop_pct": 0.02, "horizon_bars": 24 }
  }
}
```

## Evaluation Run Contract

### A) Engine verdict compute (`POST /api/engine/verdict`)

```json
{
  "entry_price": 68100.2,
  "direction": "long",
  "bars_after": [
    { "h": 68400.0, "l": 67950.0, "c": 68220.0 },
    { "h": 69020.0, "l": 68120.0, "c": 68910.0 }
  ],
  "target_pct": 0.01,
  "stop_pct": 0.01,
  "max_bars": 24
}
```

```json
{
  "outcome": "hit",
  "pnl_pct": 0.01,
  "bars_held": 2,
  "exit_price": 68781.2,
  "max_favorable": 0.028,
  "max_adverse": -0.004,
  "direction": "long"
}
```

### B) Pattern auto-evaluate (`POST /api/patterns/{slug}/evaluate`)

```json
{
  "slug": "oi-reversal-v1",
  "evaluated_count": 2,
  "results": [
    { "id": "outcome_001", "symbol": "BTCUSDT", "verdict": "hit" },
    { "id": "outcome_002", "symbol": "ETHUSDT", "verdict": "miss" }
  ]
}
```

## Result Summary Contract

### Pattern stats (`GET /api/patterns/{slug}/stats`)

```json
{
  "pattern_slug": "oi-reversal-v1",
  "total": 124,
  "pending": 9,
  "success": 73,
  "failure": 42,
  "success_rate": 0.591,
  "expected_value": 0.0341,
  "avg_duration_hours": 19.4,
  "btc_conditional": { "bullish": 0.62, "bearish": 0.47, "sideways": 0.55 },
  "decay_direction": "stable"
}
```

## Instance Detail Contract

Per-outcome row returned from evaluation endpoints:

```json
{
  "id": "outcome_001",
  "symbol": "BTCUSDT",
  "verdict": "hit"
}
```

If richer detail is needed (entry/exit/timing/confidence), add fields in a versioned extension and document in ADR.

## Error Contract

### Standard envelope (app routes)

```json
{
  "ok": false,
  "error": "invalid_request",
  "reason": "request body is not valid JSON"
}
```

### Engine passthrough variants

- FastAPI detail style may appear: `{ "detail": "Pattern not found: <slug>" }`
- Proxy may wrap text errors: `{ "ok": false, "error": "<raw engine error>" }`

Normalization target: all app-facing routes should converge to `{ ok: false, error: string, reason?: string, issues?: unknown }`.

## Change Policy

- Any breaking change to request/response shape requires:
  1. ADR update in `docs/decisions/`
  2. Sample payload update in this doc
  3. App+engine caller/callee validation update in same change set
- Keep one contract owner per work item (`contract` owner type).
