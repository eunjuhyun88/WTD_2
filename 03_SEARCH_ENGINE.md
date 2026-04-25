# Domain: AutoResearch & ML

## Goal

Define the AutoResearch expansion and feedback-to-improvement pipeline contract for capture-driven search, pattern weighting, model training, validation, and deployment gates.

## Scope

- capture-driven market search and monitoring expansion
- feedback ingestion from scanner/terminal outcomes
- weight optimization loop (Phase A baseline)
- later-phase training tracks (KTO/DPO/LoRA)
- validation gate and rollback policy

## Boundary

- Owns training/evaluation lifecycle policy.
- Owns how saved captures/challenges expand into market-wide search layers.
- Does not own Day-1 surface UI composition.
- Exposes contract-safe status summaries for dashboard/lab visibility.

## Day-1 Operational Baseline

AutoResearch is not only "later ML."
In Day-1 it already has two jobs:

1. expand one saved review into market-wide search/monitoring
2. improve future search quality from judged outcomes

Concrete Day-1 stack:

- Layer 0: saved capture evidence from terminal
- Layer 1: challenge/pattern projection used by lab evaluation
- Layer 2: rule/state-based live monitoring and candidate/alert generation
- Layer 3: feedback aggregation and Phase-A weight optimization

Heavier model tracks remain downstream of this baseline.

## Search Layer Contract

AutoResearch may use multiple search strategies over the same saved setup, but the lifecycle stays consistent.

Typical strategy families:

- structural similarity over saved feature/capture evidence
- rule/state progression over active market data
- deterministic ML scoring over candidate feature vectors

Design rule:

- multiple strategies may compete or complement each other
- the user-facing surfaces should see one coherent monitoring/evidence contract, not strategy-specific leakage by default

## Phase Contract (Roadmap)

1. Phase A0: capture-driven search and monitoring baseline
2. Phase A: rule/weight optimization (no GPU required)
3. Phase B: preference-label tuning (KTO-like workflow)
4. Phase C: pairwise preference optimization (DPO/ORPO-like workflow)
5. Phase D: per-user adapter deployment with validation gate

Current Day-1 operational baseline should explicitly identify active phase.

## Feedback Contract

Feedback inputs may include:

- manual agreement/disagreement on alerts/verdicts
- auto-judged outcomes
- capture-linked verdicts and outcome records
- run/evaluation outcome summaries

Feedback events must be attributable by source and timestamp for auditability.

## Validation & Deploy Contract

Before promotion/deploy of a new model/adapter:

- run defined validation gate(s)
- compare against baseline metrics
- deploy only on measured improvement threshold
- rollback automatically on post-deploy regression trigger

## Risk Controls

System should support explicit guardrails:

- loss/circuit thresholds
- cooldown and concurrency limits
- clear "paused/degraded" state reporting

## Integration Points

- Terminal: source of durable capture evidence and later alert drilldown
- Lab: display of evaluation metrics, stage-gate messages, and monitoring activation
- Dashboard: feedback queue and high-level progress/status indicators
- Contracts: versioned payloads for training job/state summaries

## Non-Goals

- embedding training logic into app route handlers
- replacing engine evaluation authority with UI heuristics
- exposing non-validated model claims in Day-1 UX

## Acceptance Checks

- active phase and gate policy are documented and explicit
- capture-first search baseline is explicit before heavier ML phases
- feedback sources are distinguishable and traceable
- deploy/rollback criteria are deterministic and testable
