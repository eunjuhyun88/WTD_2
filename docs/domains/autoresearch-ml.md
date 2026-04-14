# Domain: AutoResearch & ML

## Goal

Define the feedback-to-improvement pipeline contract for pattern weighting, model training, validation, and deployment gates.

## Scope

- feedback ingestion from scanner/terminal outcomes
- weight optimization loop (Phase A baseline)
- later-phase training tracks (KTO/DPO/LoRA)
- validation gate and rollback policy

## Boundary

- Owns training/evaluation lifecycle policy.
- Does not own Day-1 surface UI composition.
- Exposes contract-safe status summaries for dashboard/lab visibility.

## Phase Contract (Roadmap)

1. Phase A: rule/weight optimization (no GPU required)
2. Phase B: preference-label tuning (KTO-like workflow)
3. Phase C: pairwise preference optimization (DPO/ORPO-like workflow)
4. Phase D: per-user adapter deployment with validation gate

Current Day-1 operational baseline should explicitly identify active phase.

## Feedback Contract

Feedback inputs may include:

- manual agreement/disagreement on alerts/verdicts
- auto-judged outcomes
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

- Lab: display of evaluation metrics and stage-gate messages
- Dashboard: high-level progress/status indicators (non-authoritative)
- Contracts: versioned payloads for training job/state summaries

## Non-Goals

- embedding training logic into app route handlers
- replacing engine evaluation authority with UI heuristics
- exposing non-validated model claims in Day-1 UX

## Acceptance Checks

- active phase and gate policy are documented and explicit
- feedback sources are distinguishable and traceable
- deploy/rollback criteria are deterministic and testable
