# Domain: Refinement Methodology

## Goal

Define the operating architecture that turns judged evidence into disciplined search, evaluation, and promotion decisions.

This domain does not define one specific model, sweep, or agent implementation.

It defines how refinement work is structured so the system improves by protocol rather than by ad-hoc intuition.

## Boundary

- Owns refinement methodology, research objective framing, search policy, evaluation protocol, and promotion inputs.
- Does not own live scan-time detection or alert runtime.
- Does not replace the pattern runtime, ledger plane, or explicit promotion gate.

## Why This Layer Exists

The core loop already produces judged evidence:

- `capture`
- `outcome`
- `verdict`
- `training_run`
- `model`

But evidence alone does not tell the system:

- what should be improved next
- which hypotheses are worth testing
- when to search locally vs reset from scratch
- how to reject overfit winners
- how to retain failed ideas so they are not retried blindly

Without a methodology layer, parallel agents become noise.

With a methodology layer, parallel agents become one interchangeable execution strategy.

## Canonical Position In The Core Loop

The methodology plane sits after judged evidence and before promotion-safe deployment.

```text
Candidate / Capture / Outcome / Verdict
  -> Evidence Review
  -> Methodology Plane
     -> Research Objective
     -> Hypothesis Batch
     -> Search Policy
     -> Evaluation Protocol
     -> Selection Decision
  -> Training Run / Model Candidate
  -> Promotion Gate
  -> Future Detection Quality
```

Design rule:

- live runtime creates evidence
- the methodology plane decides how to search for improvements
- execution backends run that search
- promotion gates decide what may influence future runtime

## The Five Methodology Layers

### 1. Objective Layer

Purpose:

- define what should improve next

Canonical outputs:

- `Research Objective`
- `Success Metric`
- `Failure Guardrail`

Examples:

- improve precision for one pattern without reducing coverage below a set floor
- reduce false positives in one regime
- improve calibration of score thresholds

Design rules:

- objectives must be explicit, scoped, and measurable
- every objective must name the baseline it is trying to beat
- "make it better" is not a valid objective

### 2. Search Layer

Purpose:

- generate and organize competing hypotheses and variants

Canonical outputs:

- `Hypothesis`
- `Variant Family`
- `Search Policy`

Search modes:

- local search around the current best variant
- broad parameter sweep
- structure search
- reset search from scratch
- cross-pollination from an alternate model or agent family

Design rules:

- local search alone is not sufficient; reset search must remain available
- search policies should decide when to widen, narrow, or reset
- execution tools are replaceable; the policy is the stable contract

### 3. Evaluation Layer

Purpose:

- determine whether a candidate truly beats the baseline

Canonical outputs:

- `Evaluation Protocol`
- `Experiment Run`
- `Aggregate Result`

Required properties:

- multi-seed or multi-split robustness by default
- baseline comparison, not absolute score chasing alone
- variance visibility, not just a single mean
- explicit rejection of leaderboard-only or one-batch wins

Design rules:

- no candidate is valid without a named protocol
- evaluation should optimize for stability under distribution shift
- a strong winner on one seed with weak cross-seed behavior is a failed result

### 4. Memory Layer

Purpose:

- retain learnings so future search avoids repeated dead ends

Canonical outputs:

- `Research Memory`
- `Rejected Hypothesis`
- `Confirmed Dead End`
- `Flat Landscape Note`

Required memory types:

- breakthroughs worth reusing
- ideas that failed consistently
- search spaces already found to be flat
- assumptions that turned out to be wrong

Design rules:

- memory must keep rejected paths, not only winners
- repeated failed exploration is a methodology failure, not just wasted compute
- memory should be compact and current, not a chat transcript dump

### 5. Promotion Layer

Purpose:

- turn strong candidates into promotion-safe artifacts

Canonical outputs:

- `Selection Decision`
- `Model Candidate`
- `Rollout Recommendation`

Design rules:

- the search winner is not automatically the active runtime choice
- selection must reference the evaluation protocol and baseline beaten
- promotion remains an explicit gate downstream of search
- rollback criteria should be defined before activation

## Canonical Entities

At minimum, the methodology architecture needs these entities.

| Entity | Purpose |
|---|---|
| `Research Objective` | names the target improvement and baseline |
| `Hypothesis` | proposed explanation for how to improve |
| `Variant` | concrete candidate derived from a hypothesis |
| `Search Policy` | decides local sweep vs broad sweep vs reset search |
| `Evaluation Protocol` | defines seeds, splits, metrics, and acceptance checks |
| `Experiment Run` | one executed evaluation batch with reproducible metadata |
| `Aggregate Result` | cross-run summary used for comparison |
| `Selection Decision` | records why one candidate advanced |
| `Research Memory` | retained breakthroughs, rejections, and flat areas |

## Runtime Placement

The methodology plane belongs on `worker-control`, not on the public runtime and not inside the live pattern runtime.

Placement rules:

- `engine-api` remains the source of truth for pattern evidence, stats, and promotion-safe reads
- `worker-control` owns objective generation, sweep execution, aggregate evaluation, and research memory maintenance
- `app-web` may render summaries or reports, but it must not become the authority for selection or promotion logic

Design rule:

- exploratory search state must be separable from evidence records and from active runtime scoring

## Phase A Implementation In This Repo

The current repository already has reusable research primitives in `app/src/lib/research`:

- experiment runner
- schedule primitives
- weight sweep strategies
- dataset source interfaces
- report builders

Phase A should reuse those primitives instead of inventing a second evaluation framework.

Recommended mapping:

| Methodology layer | Phase A owner | Existing anchor |
|---|---|---|
| Objective Layer | `worker-control` orchestration | pattern stats + ledger-derived summaries |
| Search Layer | `worker-control` execution | `app/src/lib/research/schedule.ts`, `weightSweep.ts` |
| Evaluation Layer | shared research primitives, orchestrated by `worker-control` | `app/src/lib/research/pipeline/*` |
| Memory Layer | `worker-control` compact state + generated reports | `docs/generated/research/` and later research state store |
| Promotion Layer | existing engine pattern model gate | pattern registry + explicit promote route |

Design rule:

- Phase A should compose the existing research spine with pattern-ledger evidence, not bypass either side

## First Durable Methodology Artifact

The first methodology-owned artifact should be `Research Run`.

Purpose:

- record one bounded search/evaluation campaign before anything is promoted to training or model state

Minimum fields:

- `research_run_id`
- `pattern_slug`
- `objective_id`
- `baseline_ref`
- `search_policy`
- `evaluation_protocol`
- `status`
- `winner_variant_ref`
- `created_at`
- `completed_at`

Phase A storage decision:

- `Research Run` should live in a separate `worker-control` research state plane first
- it should not be appended to the pattern ledger in the initial slice

Reason:

- the pattern ledger is the evidence and production-artifact plane
- exploratory methodology runs are numerous, unstable, and not all promotion-worthy
- mixing exploratory search logs into the evidence ledger makes audit semantics weaker, not stronger

Later option:

- if durable cross-run auditing becomes necessary, add a dedicated `research_run` family outside the evidence ledger or as a separate ledger namespace

## Phase A Operating Cycle

The first operating cycle should be narrow and deterministic.

```text
Verdict / outcome accumulation
  -> objective selection
  -> search-policy selection
  -> bounded sweep or reset-search run
  -> aggregate evaluation
  -> selection decision
  -> optional train-model trigger
  -> existing candidate/promotion gate
```

Phase A exclusions:

- no automatic runtime promotion
- no inline agent-driven code rewrites in production paths
- no direct coupling between search winners and alert gating

## Relationship To The Pattern Ledger

The pattern ledger remains the durable record of:

- entries
- captures
- scores
- outcomes
- verdicts
- training runs
- model artifacts

The methodology plane consumes those records, but it should not overload them with exploratory state.

Design rule:

- evidence records answer "what happened"
- methodology records answer "what should we try next"
- promotion records answer "what was allowed to affect runtime"

## Execution Backends

The methodology plane may be executed by different backends:

- scripted sweeps
- worker-control evaluation jobs
- parallel agent swarms
- mixed-model runs that compare different agent families

These are implementation choices, not the architecture itself.

Design rule:

- execution backends are interchangeable only if they emit the canonical entities above

## Relationship To Pattern ML

Pattern ML is one downstream consumer of the methodology plane.

The methodology plane decides:

- what the next research objective is
- what candidate variants should be tested
- how evaluation must be run
- what evidence is strong enough to justify a candidate

Pattern ML then uses those outputs for:

- training runs
- calibration
- candidate registration
- promotion gate inputs

Methodology is therefore upstream of training and downstream of judged evidence.

Important distinction:

- `Research Run` is not the same thing as `Training Run`
- a research run may conclude with "do nothing", "retain as dead end", or "train this candidate"
- only the last case should create downstream training/promotion artifacts

## Anti-Overfitting Rules

The methodology architecture must explicitly resist local and leaderboard overfitting.

Required rules:

- optimize against multiple seed-starts or splits, not one fixed batch
- compare stability as well as mean performance
- record score drop between local and harder validation regimes
- allow reset-search runs when local improvement stalls
- reject candidates whose gains disappear under broadened evaluation

## Reset Search Rule

The methodology plane must support complete resets.

Use reset search when:

- local search has plateaued
- the same architecture family is producing marginal or contradictory gains
- a different model family may expose a better decomposition of the problem

Design rule:

- reset search is not a failure mode; it is a standard exploration primitive

## Acceptance Checks

- the methodology plane is documented separately from runtime detection logic
- objective, search, evaluation, memory, and promotion are all explicit layers
- multi-agent swarm execution is treated as a backend, not as the methodology itself
- future research-run implementation can map cleanly onto the entities defined here
