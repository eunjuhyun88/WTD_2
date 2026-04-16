# Domain: Refinement Operator Control Plane

## Goal

Define the operator-facing control plane that sits on top of the refinement methodology runtime.

This plane does not decide the research objective or search policy.

It decides how operators inspect, approve, defer, reject, pause, and resume refinement actions once the methodology runtime has already produced outputs.

## Boundary

- Owns operator approval state, read-only inspection surfaces, and scheduler guardrail policy.
- Does not own objective derivation, search-policy branching, or report-content design.
- Consumes outputs from `research_run`, `selection_decision`, `research_memory`, report artifacts, and training handoff state.

## Why This Layer Exists

The current refinement runtime can already:

- derive an objective
- run a bounded refinement cycle
- record `research_run`, `selection_decision`, and `research_memory`
- optionally hand off a `train_candidate` into the training lane

That is enough for machine execution.

It is not enough for safe operations.

Safe operations also require:

- an explicit operator decision point
- an inspectable recent-state surface
- guardrails that can stop repeated automated mistakes

## Canonical Position

```text
Evidence / registry / research history
  -> Methodology policy
  -> Research run + report
  -> Operator control plane
     -> inspect
     -> approve / defer / reject
     -> pause / resume automation
  -> Optional train handoff
  -> Promotion gate
```

Design rule:

- operator control is downstream of methodology policy
- operator control does not rewrite the objective or report
- operator control decides whether and when outputs may advance

## Operator Decision Surface

The first operator decision surface concerns `train_candidate`.

### Required Actions

- `approve`
- `defer`
- `reject`

### Semantics

- `approve`
  - eligible for train handoff execution
- `defer`
  - keep the candidate and report available, but do not execute handoff yet
- `reject`
  - no handoff; record rationale and preserve the run for history

### Required Fields

- `research_run_id`
- `decision`
- `decided_by`
- `rationale`
- `decided_at`

Design rule:

- approval state must be explicit and queryable
- implicit approval by scheduler setting alone is not sufficient once operator control is enabled

## Read-Only Inspection Surface

Operators need a compact way to inspect recent refinement state.

### Minimum Read Views

1. recent runs list
   - `research_run_id`
   - `pattern_slug`
   - `objective_id`
   - `status`
   - `completion_disposition`
   - `created_at`
   - `completed_at`

2. run detail
   - run metadata
   - selection decision
   - research memory excerpts
   - report location, if any
   - training handoff result, if any
   - operator approval state, if any

3. pattern summary
   - recent refinement outcomes by pattern
   - recent dead-end count
   - recent train-candidate count
   - current scheduler guardrail state

### Delivery Options

Phase A acceptable surfaces:

- CLI commands
- engine-internal read-only API

Later:

- app-web operational UI

Design rule:

- inspection should begin read-only
- mutation belongs to explicit operator actions only

## Scheduler Guardrails

Simple enable/disable flags are not enough once automation grows.

### Minimum Guardrails

1. pattern-local enable/disable
   - one pattern may be paused while others continue

2. repeated-dead-end pause
   - auto-pause scheduled refinement after N recent dead ends

3. auto-train allowlist
   - automatic train handoff should be enable-able per pattern, not only globally

4. cooldown after handoff
   - prevent repeated immediate handoffs for the same pattern

5. operator-required mode
   - even if scheduled refinement runs, train handoff may still require explicit approval

Design rule:

- guardrails should fail closed
- the default response to uncertainty is pause or defer, not auto-advance

## Recommended Control States

At minimum, the scheduler/control state per pattern should support:

- `enabled`
- `paused_by_policy`
- `paused_by_operator`
- `approval_required`
- `auto_train_allowed`
- `cooldown_until`

These may live in one control-plane store, but their meanings should remain distinct.

## Relationship To W-0048

W-0048 owns:

- objective derivation
- search-policy branching
- report content and structure

W-0049 owns:

- operator approval state
- read-only inspection surface
- scheduler guardrails and pause policy

Design rule:

- W-0048 decides what the machine thinks should happen
- W-0049 decides what the operator allows to happen

## Recommended Next Implementation Order

1. add approval-state schema linked to `research_run_id`
2. add read-only CLI or engine-inspection surface for recent runs and run detail
3. add pattern-local scheduler control state with pause and allowlist semantics
4. only then allow automation to bypass operator approval for selected patterns

## Acceptance Checks

- operator control is defined separately from methodology policy
- approval, inspection, and guardrails are explicit responsibilities
- scheduled refinement remains reversible and inspectable
- the control plane can be implemented without changing the evidence or research semantics
