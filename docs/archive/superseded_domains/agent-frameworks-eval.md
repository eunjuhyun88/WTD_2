# Agent Frameworks Evaluation

This document tracks CTO-level evaluation of external agent frameworks for `wtd-v2`.

## Source

- Candidate guide: [subinium/awesome-agent-frameworks](https://github.com/subinium/awesome-agent-frameworks)
- Important limitation: this source is architecture-comparison guidance, not runtime benchmark validation.

## Evaluation Principle

- Use external lists for discovery, not direct adoption.
- Require local-only PoC in this repository before any platform decision.
- Preserve `engine`/`app` boundaries and existing guardrail architecture.

## Adoption Design (Concrete)

### Integration Goal

Import external architecture patterns without replacing `wtd-v2` core structure.

### Adapter Spec (v1)

Candidate patterns must map to these internal interfaces:

- `evaluateRuntimePolicy(input) -> { decision, reasons, riskTier }`
- `evaluateChannelPolicy(input) -> { decision, reasons, riskTier }`
- `buildAgentHandoff(input) -> { taskId, owner, payload, constraints }`
- `emitAuditEvent(input) -> void`

### Compatibility Rules

- No direct dependency from `engine/` to imported app-side adapter code.
- No mutation of existing `SignalSnapshot` semantics.
- No bypass of existing guardrail enforcement path.

### Rollout Plan

1. `shadow` integration on terminal execution path
2. side-by-side decision comparison (`native` vs `candidate`)
3. enforce only for selected high-risk actions
4. extend to additional orchestration paths after stable metrics

### Failure and Rollback

- If CI failure rate or rework rate exceeds baseline threshold, rollback adapter to `native`.
- Rollback mechanism must be config-only (no schema migration required).

## Scoring Model (100)

- Boundary safety fit (`engine`/`app` contracts): 25
- Governance fit (task branch/worktree/PR gate): 20
- Runtime guardrail fit (deny/ask/allow + audit): 20
- Local-only operation fit: 20
- Ops complexity and adoption cost: 15

Passing guideline:

- `>= 75`: PoC candidate
- `60-74`: limited experiment only
- `< 60`: reject for now

## Initial Shortlist

### 1) NanoClaw

- Why shortlisted: small TS core, container isolation model, easier pattern import
- Risks: "fork-and-modify" upgrade path can diverge quickly
- PoC focus:
  - tool execution policy chain mapping to `app/src/lib/guardrails/runtime/*`
  - audit log compatibility

### 2) Hermes Agent

- Why shortlisted: mature learning loop and strong provider strategy
- Risks: high runtime complexity; may overfit to different operating model
- PoC focus:
  - skill auto-creation concepts mapped into `work/active` process
  - governance compatibility with current PR gates

### 3) ZeptoClaw (policy model reference)

- Why shortlisted: explicit multi-layer security model useful as guardrail checklist
- Risks: language/runtime mismatch and migration cost
- PoC focus:
  - security-layer checklist adaptation, not framework adoption

## PoC Template

For each candidate, run:

1. Scope one route path (`terminal` runtime path recommended).
2. Implement one pattern adapter behind existing guardrail interfaces.
3. Run:
   - route tests
   - guardrail tests
   - deployment checks
4. Compare against baseline metrics:
   - lead time
   - CI failure rate
   - runtime guardrail block observability
   - rework count per PR
5. Validate adapter contract conformance:
   - runtime policy output shape
   - audit event schema
   - shadow/enforce mode behavior

## Decision Log

- `2026-04-14`: added evaluation framework and shortlist based on awesome-agent-frameworks analysis; no adoption decision yet.
- `2026-04-14`: defined adapter-first adoption design and phased rollout model for framework pattern import.

