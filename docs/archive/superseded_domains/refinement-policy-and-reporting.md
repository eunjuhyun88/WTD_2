# Domain: Refinement Policy and Reporting

## Goal

Define how the refinement methodology chooses what to do next, how it branches search strategy, and how it leaves durable reports for operator review.

This document is the policy layer above the existing Phase A execution path.

## Why This Upgrade Exists

The current Phase A loop already works:

- derive an objective
- run a bounded refinement cycle
- record `research_run`, `selection_decision`, and `research_memory`
- optionally hand off a `train_candidate` into the training lane

But the current policy is still too thin:

- objective derivation is mostly dataset-readiness based
- search behavior is not meaningfully branched
- completed runs do not produce a canonical operator-facing report artifact
- scheduled execution exists without a strong rollout policy

This doc closes those gaps.

## Policy Inputs

Refinement policy should reason over four input families.

### 1. Evidence Inputs

Derived from the pattern ledger:

- training-usable count
- win/loss balance
- score coverage
- threshold pass rate
- above-vs-below-threshold outcome separation
- latest scored model version

Purpose:

- determine whether the pattern is data-poor, train-ready, or showing scoring drift

### 2. Registry Inputs

Derived from the pattern model registry:

- active vs candidate rollout state
- latest promoted model version
- preferred scoring model

Purpose:

- determine whether refinement is bootstrapping, refreshing, or attempting recovery after a weak candidate cycle

### 3. Research History Inputs

Derived from recent `research_run` state and selection decisions:

- recent `dead_end` count
- recent `train_candidate` count
- recent `no_op` count
- presence of repeated rejected variants or flat-landscape notes
- presence of a prior handoff that trained but did not replace the incumbent

Purpose:

- distinguish between "not enough data", "incremental refresh", and "plateau / local optimum" conditions

### 4. Operator Policy Inputs

Explicit control-plane settings:

- scheduled refinement enabled/disabled
- automatic train handoff enabled/disabled
- report destination
- operator approval requirement for train handoff

Purpose:

- keep automation level explicit and reversible

## Objective Policy

Objective derivation must output more than an `objective_id`.

Each derived objective should include:

- `objective_id`
- `objective_kind`
- `rationale`
- `baseline_ref_hint`
- `recommended_search_policy`
- `recommended_evaluation_protocol`
- `supporting_signals`

### Objective Kinds

At minimum, support these policy-level objective kinds.

| Objective kind | When to use |
|---|---|
| `dataset_readiness` | not enough usable evidence to justify bounded training evaluation |
| `first_train_candidate` | enough evidence exists and no prior model lineage exists |
| `refresh_train_candidate` | evidence is ready and a current model lineage exists |
| `reset_search` | repeated dead ends or plateau signals indicate local search is no longer enough |
| `scoring_drift_review` | score coverage or threshold separation suggests current scoring behavior is degrading |

Design rule:

- objective kinds should be few, explicit, and easy to inspect
- adding a new objective kind should require a policy reason, not just a new branch in code

## Search-Policy Branching

Search policy is not synonymous with execution backend.

It is the policy choice of how aggressively to search relative to current evidence and recent failures.

### Initial Search Policies

| Search policy | Meaning |
|---|---|
| `readiness_accumulation` | do not search new variants yet; accumulate usable evidence and record why |
| `bounded_walk_forward` | run the current bounded evaluation gate against the current training-ready dataset |
| `local_refresh_sweep` | explore small bounded variations around the current best candidate or active model |
| `reset_search` | deliberately avoid local anchoring and search from a fresh decomposition |
| `dead_end_confirmation` | run a narrow confirmation cycle to prove a path is flat or broken before abandoning it |

### Branching Rules

Start with these rules:

1. `dataset_readiness`
   - choose `readiness_accumulation`
   - no train handoff allowed

2. `first_train_candidate`
   - choose `bounded_walk_forward`
   - evaluate a first candidate without pretending a local neighborhood exists yet

3. `refresh_train_candidate`
   - choose `local_refresh_sweep`
   - baseline is the preferred scoring model or latest accepted candidate lineage

4. `reset_search`
   - choose `reset_search`
   - trigger when repeated dead ends or plateau indicators suggest local improvements are exhausted

5. `scoring_drift_review`
   - choose `dead_end_confirmation` when score coverage degradation looks structural
   - choose `local_refresh_sweep` when coverage is intact but threshold separation is weakening incrementally

Design rule:

- the policy chooses among a small number of search shapes
- execution code should not silently invent a new policy branch

## Evaluation Policy

Evaluation protocol should be selected by objective/search policy, not by route defaults alone.

Required protocol fields:

- protocol kind
- fold or seed count
- mean-performance floor
- variance ceiling
- baseline comparison reference
- rejection condition

Examples:

- `bounded_walk_forward`: moderate mean floor, moderate variance ceiling
- `local_refresh_sweep`: baseline-relative comparison plus variance check
- `reset_search`: stricter variance and stronger win-over-baseline requirement

Design rule:

- evaluation strictness should increase when search aggressiveness increases

## Report Artifacts

Completed refinement runs should leave a durable operator-readable artifact.

### Report Purpose

- summarize what objective was chosen
- show why that objective was chosen
- show what policy path was taken
- show whether the run ended in `no_op`, `dead_end`, or `train_candidate`
- show whether a train handoff happened and what it produced

### Required Sections

- run metadata
- objective summary
- evidence summary
- search policy summary
- evaluation result summary
- selection decision
- research memory excerpts
- training handoff result, if any
- operator recommendation

### Storage Rule

Preferred path:

- a dedicated worker-control artifact path under the engine research runtime

Reason:

- these are generated control-plane artifacts
- they are not canonical product docs
- they should be durable and inspectable without polluting committed domain docs

Fallback:

- generated-doc paths may be used later for curated or published reports, not for every raw run

## Operator and Scheduler Policy

Automation should be staged.

### Default Policy

- scheduled refinement: disabled by default
- automatic train handoff: disabled by default
- operator reviews report before enabling automatic train handoff

### Progressive Rollout

1. Manual one-shot refinement only
2. Scheduled refinement on, automatic train handoff off
3. Scheduled refinement on, automatic train handoff on for selected patterns only

Design rule:

- do not enable more automation until the report artifacts make the system inspectable

## Recommended Next Implementation Order

1. Enrich objective derivation output with `recommended_search_policy`, `recommended_evaluation_protocol`, and `supporting_signals`
2. Add research-history-aware `reset_search` and `local_refresh_sweep` branching
3. Add durable report writer and emit one report per completed refinement run
4. Wire scheduler/operator policy to those reports, not directly to raw state rows

## Acceptance Checks

- refinement policy is defined separately from execution backend code
- objective derivation produces operator-readable reasoning, not only IDs
- search-policy branching is explicit and finite
- report artifacts are part of the control plane by design
- automation rollout remains explicitly staged
