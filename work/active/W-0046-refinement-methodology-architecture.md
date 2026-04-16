# W-0046 Refinement Methodology Architecture

## Goal

Define a canonical methodology architecture for refinement so parallel autoresearch, sweeps, and model iteration operate as a governed layer above the core evidence loop instead of leaking into runtime detection behavior.

## Owner

research

## Scope

- define the methodology plane that sits between judged evidence and train/deploy actions
- specify the canonical layers, entities, and operating rules for objective-setting, hypothesis search, evaluation, memory, and promotion
- connect the new methodology architecture back into core-loop and pattern-ML docs

## Non-Goals

- implementing swarm runners or worker-control jobs in this slice
- changing scanner, alert, or scoring runtime behavior
- redesigning existing app surfaces

## Canonical Files

- `AGENTS.md`
- `work/active/W-0046-refinement-methodology-architecture.md`
- `docs/product/core-loop-system-spec.md`
- `docs/domains/pattern-ml.md`
- `docs/domains/refinement-methodology.md`

## Facts

- the core loop already defines `Refinement Proposal`, `Training Run`, `Model Candidate`, and `Deployment Record` as downstream artifacts
- the repo already has pattern-specific training, training-run records, and explicit model promotion gates
- the current docs do not yet define the methodology layer that governs how new hypotheses are generated, evaluated, and promoted
- the Paradigm hackathon writeup demonstrates a useful pattern: parallel search, multi-seed evaluation, reset search, and dead-end memory outperform intuition-led sequential tuning
- the app research spine already provides reusable experiment, schedule, and sweep primitives under `app/src/lib/research`
- current pattern ledger records evidence and production-adjacent training artifacts, but it does not yet have a dedicated exploratory research-run record family

## Assumptions

- refinement must remain downstream of judged evidence, not part of the live scan runtime
- the first implementation phase should stay rule-first and protocol-driven, with agent swarms treated as one possible execution backend

## Open Questions

- whether objective/hypothesis state belongs in engine storage or a separate research state plane

## Decisions

- introduce a named `Methodology Plane` between evidence accumulation and train/deploy actions
- treat agent swarms, parameter sweeps, and reset-search runs as execution strategies inside the methodology plane, not as the methodology itself
- make robust evaluation and rejected-hypothesis retention first-class requirements, not optional research hygiene
- Phase A methodology execution should live in a separate `worker-control` research state plane instead of the pattern ledger, so exploratory runs do not pollute evidence records

## Next Steps

1. Define the Phase A implementation map and first `research_run` artifact.
2. Decide the storage boundary for methodology state under `worker-control`.
3. Use this doc as the design source before adding worker-control swarm execution.

## Exit Criteria

- a canonical doc exists for refinement methodology architecture
- core-loop and pattern-ML docs reference that architecture explicitly
- future swarm/eval work can resume from files without relying on chat context

## Handoff Checklist

- this slice is doc-only and should not modify runtime code
- unrelated dirty app and engine files were left untouched
- follow-on execution slices should start from `docs/domains/refinement-methodology.md`
