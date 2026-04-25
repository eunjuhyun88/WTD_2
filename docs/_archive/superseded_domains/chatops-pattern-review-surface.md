# Domain: ChatOps Pattern Review Surface

## Goal

Define how CUI-based, event-driven ChatOps should be applied to Cogochi without
turning the product into an order-execution bot.

The useful pattern is:

```text
engine event
  -> compact chat card
  -> one-word human response
  -> engine writes canonical record
  -> result posted back to the same thread
```

This is a surface and workflow accelerator for pattern review, verdict,
benchmark, and promotion operations.

It is not the core engine and not the source of truth.

## Inspiration

External pattern:

```text
Trading event
  -> AI analysis
  -> chat card
  -> human approve/reject
  -> broker API execution
  -> chat result
```

Cogochi adaptation:

```text
Pattern/search/runtime event
  -> engine evidence summary
  -> chat card
  -> human verdict/review action
  -> capture/search/outcome/verdict ledger write
  -> benchmark/promotion state updated
```

## Boundary

Owns:

- chat card interaction model
- event-to-card routing rules
- response vocabulary
- timeout/default behavior
- audit and idempotency requirements for chat actions

Does not own:

- order execution
- broker or exchange API calls
- canonical market truth
- pattern truth
- search ranking truth
- outcome or verdict storage

Canonical truth remains in engine-owned contracts and stores.

## Positioning

This is similar to trading ChatOps in the interaction pattern, but different in
the compounding asset.

| Axis | Trading ChatOps | Cogochi ChatOps |
|---|---|---|
| Primary action | approve or reject an order | judge or route a pattern event |
| Core risk | wrong trade execution | bad pattern promotion / false positives |
| Main artifact | order log | capture/search/outcome/verdict ledger |
| Learning loop | usually weak or absent | verdict -> negative set -> benchmark -> refinement |
| Moat | operational convenience | judgment ledger and benchmarked pattern memory |

Rule:

- ChatOps is a thin surface over the engine loop.
- The moat remains `Pattern Research OS`, not the chat bot.

## Event Types

### 1. Candidate Review Event

Triggered when:

- engine finds an actionable pattern candidate
- similar search returns a high-confidence match
- benchmark detects a candidate worth human review

Card fields:

- `candidate_id`
- `definition_id`
- `symbol`
- `timeframe`
- `current_phase`
- `similarity_score`
- `top_evidence`
- `risk_flags`
- `chart_deeplink`
- `expires_at`

Allowed responses:

- `valid`
- `invalid`
- `near_miss`
- `too_early`
- `too_late`
- `save`
- `ignore`

Canonical write:

- `verdict`
- optional `capture`
- optional `negative_set` proposal

### 2. Outcome Review Event

Triggered when:

- auto outcome window closes
- outcome disagrees with initial rank
- user verdict is missing after alert/candidate exposure

Card fields:

- `subject_id`
- `entry_or_capture_id`
- `auto_outcome`
- `peak_return_pct`
- `exit_return_pct`
- `initial_score`
- `needs_manual_verdict`

Allowed responses:

- `hit`
- `miss`
- `void`
- `valid`
- `invalid`
- `near_miss`

Canonical write:

- manual verdict
- outcome/verdict disagreement marker

### 3. Benchmark Regression Event

Triggered when:

- a candidate engine change fails a benchmark guardrail
- p95 latency regresses
- top-k relevance drops
- negative rejection drops

Card fields:

- `improvement_id`
- `baseline_run_ref`
- `candidate_run_ref`
- `failed_guardrails`
- `primary_delta`
- `decision_required`

Allowed responses:

- `accept`
- `reject`
- `shadow`
- `rerun`
- `hold`

Canonical write:

- comparison decision
- benchmark note
- promotion gate status

### 4. Promotion Decision Event

Triggered when:

- promotion pack becomes complete
- a variant passes benchmark and shadow gates
- runtime activation needs explicit approval

Card fields:

- `promotion_pack_id`
- `definition_id`
- `variant_id`
- `benchmark_summary`
- `negative_set_summary`
- `rollback_rule`
- `activation_scope`

Allowed responses:

- `promote`
- `shadow`
- `pause`
- `reject`

Canonical write:

- `SelectionDecision`
- alert policy state transition
- promotion record

## Response Rules

Responses must be constrained.

Allowed response styles:

- one-word command
- slash command
- button click

Examples:

```text
valid
invalid
near_miss
too_early
too_late
/verdict valid
/benchmark rerun
/promotion shadow
```

Forbidden response styles:

- free-form command that mutates engine truth directly
- natural-language order execution
- hidden multi-step side effects
- LLM interpretation of ambiguous approvals

If the response is ambiguous, the system must ask for clarification or mark the
event as `needs_review`.

## Safety Rules

### Timeout

Every actionable card must have an expiry.

Default behavior:

- candidate review: `ignore`
- outcome review: `pending_manual`
- benchmark regression: `hold`
- promotion decision: `hold`

Never default to promote, execute, or accept.

### Idempotency

Every card must include:

- `event_id`
- `subject_id`
- `action_nonce`
- `expires_at`

Every accepted response must write with an idempotency key:

```text
chat_action:{event_id}:{action_nonce}:{normalized_response}
```

Duplicate responses must be acknowledged but not double-applied.

### Audit

Chat history is useful, but not canonical.

Canonical audit records must include:

- chat platform
- channel/thread id
- message id
- actor id
- normalized action
- engine subject ref
- resulting engine record id
- timestamp

### No Order Execution In Day-1

Cogochi ChatOps must not call broker/exchange order APIs in Day-1.

Future order execution, if ever introduced, must be a separate work item with:

- risk limits
- broker abstraction
- compliance review
- paper-trade gate
- explicit user approval model
- rollback and kill switch

## Architecture

```text
engine event
  -> ChatOps event router
  -> card renderer
  -> chat provider adapter
  -> user response
  -> command normalizer
  -> engine action route
  -> canonical store
  -> result reply
```

### Router

Responsible for:

- mapping engine event type to card type
- enforcing delivery policy
- assigning expiry
- storing outbound action nonce

### Card Renderer

Responsible for:

- compact evidence summary
- deeplink to `/terminal`, `/lab`, or `/dashboard`
- allowed response list
- no hidden engine logic

### Provider Adapter

Potential providers:

- Discord
- Telegram
- Slack

First implementation should use one provider only.

### Command Normalizer

Responsible for:

- mapping text/button responses to canonical actions
- rejecting ambiguous commands
- enforcing expiry and idempotency

### Engine Action Route

Responsible for:

- writing verdict/capture/benchmark/promotion records
- returning accepted/rejected/expired state
- never trusting chat payloads as domain truth without validation

## Surface Relationship

ChatOps does not replace the Day-1 surfaces.

- `/terminal` remains the chart review and capture surface.
- `/lab` remains the evaluation and benchmark inspection surface.
- `/dashboard` remains the inbox, alert, and feedback surface.
- ChatOps is a low-friction action lane that deep-links into those surfaces when
  a full chart or report is needed.

Rule:

- if the user needs to inspect chart evidence, the chat card must link to the
  canonical surface instead of trying to recreate the full UI inside chat.

## Why This Is Not The Moat

The interaction pattern is widely copyable.

Copyable:

- chat cards
- event handlers
- approve/reject buttons
- Discord/Telegram bots
- webhook routing

Harder to copy:

- pattern memory
- phase-sequence search corpus
- judgment ledger
- negative sets
- benchmark packs
- promotion history
- refinement loop

Therefore:

```text
ChatOps = low-friction surface
Engine = differentiating system
Ledger = compounding asset
```

## First Slice

Work item:

- `W-0204-chatops-pattern-review-surface`

Minimum first slice:

- design-only CUI card contracts
- candidate review card
- outcome review card
- normalized response vocabulary
- engine record mapping
- no provider implementation
- no order execution

First implementation candidate:

```text
CandidateReviewEvent
  -> chat card
  -> valid / invalid / near_miss / too_early / too_late
  -> engine verdict write
  -> reply with verdict_id and deeplink
```

## Final Rule

Use ChatOps to reduce human judgment friction.

Do not let ChatOps redefine the product as a trading execution bot.

The user should be able to judge faster, not accidentally trade faster.
