# Arena Domain Model

Purpose:
- Repo-local canonical domain model for Arena and Arena War.
- Summarizes the game/data/AI contract without requiring the external unified design first.

## Core Premise

Arena is built on one primary rule:
- human and AI see the same market context
- they may interpret that context differently
- the market resolves which interpretation was better

This matters because the product, learning pipeline, and persistence model all depend on that symmetry.

## C02 Decision Stack

The AI decision path should be legible as a layered contract:

1. `ORPO`
   - primary directional synthesis across agent/factor output
2. `CTX`
   - contextual validation and conflict pressure
3. `Guardian`
   - caution and risk pressure
4. `Commander`
   - final arbitration and canonical AI decision

In storage and product semantics, the important thing is not the exact implementation detail of each layer, but that the full stack can be represented and audited from a single game record.

## Canonical Record: GameRecord

Every meaningful Arena/Arena War run should be reducible to one `GameRecord`.

### Sections

| Section | Role |
| --- | --- |
| `context` | shared market environment visible to both human and AI |
| `human` | user decision, reasoning tags, deltas, battle actions |
| `ai` | C02 result, final decision, conflicts, RAG recall |
| `outcome` | market resolution, score, winner, consensus type |
| `derived` | ORPO pair, RAG entry, immediate feedback |

### Required Semantics

- `context` is the shared truth snapshot
- `human.reasonTags` capture structured reasoning deltas
- `ai.factorConflicts` explain ORPO vs contextual disagreement
- `outcome` resolves both score and learning value
- `derived` is not optional bookkeeping; it is the bridge into learning systems

## Phase Model

Arena phases should remain understandable as distinct product moments:

1. `DRAFT`
   - choose squad/spec/weights or equivalent setup
2. `ANALYSIS`
   - inspect market context and AI-side interpretation
3. `HYPOTHESIS`
   - human commits reasoning and directional view
4. `BATTLE`
   - sequential action or validation phase
5. `RESULT`
   - market and scoring resolution with learning implications

Each phase should leave behind legible state transitions, not hidden side effects.

## Human Decision Contract

The human side is more than direction:
- direction
- confidence
- target and stop assumptions
- structured `reasonTags`
- optional free-text reasoning
- timing and revision behavior
- battle-time interventions

These are product features and also future learning inputs.

## AI Decision Contract

The AI side should preserve:
- final direction/confidence/targets
- the full C02 result or a lossless summary of it
- RAG recall usage
- major contextual conflicts

The goal is future inspectability. If an agent cannot tell why the AI landed on a decision, the data loop is weakened.

## Outcome Contract

Outcome should answer four questions:

1. What did the market do?
2. Who won?
3. Why did they win under the score model?
4. What derived learning artifact should exist because of this?

That means the outcome needs both market resolution and scoring decomposition.

## Derived Artifacts

### ORPO Pair

The winner becomes `chosen`; the loser becomes `rejected`.

Important fields:
- shared context snapshot
- winner/loser decisions
- margin
- quality bucket
- consensus type

### RAG Entry

The memory object should preserve:
- pattern identity
- regime/pair/timeframe
- decision comparison
- winner/outcome summary
- compact lesson text
- quality metadata

## Pair Quality

Base local quality buckets:
- `strong`
- `medium`
- `weak`
- `noise`

Important nuance:
- near-miss cases with low score margin but meaningful reasoning differences are strategically valuable
- they may deserve a separate `boundary` treatment in learning systems even if the simpler storage contract still uses `noise`

## Design Implications

If a UI or API change touches Arena, check that it does not break:
- shared-context symmetry
- GameRecord completeness
- derived ORPO/RAG artifact generation
- phase clarity
- inspectability of human-vs-AI disagreement

## Source Docs

- `docs/product-specs/arena.md`
- `docs/generated/game-record-schema.md`
- `docs/design-docs/learning-loop.md`
