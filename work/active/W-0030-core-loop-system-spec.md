# W-0030 Core Loop System Spec

## Goal

Turn the current high-level core loop into a concrete product and system specification that defines one full operating cycle across surfaces, engine lanes, records, and feedback paths.

## Owner

research

## Scope

- define the end-to-end cycle from trader review to refined future detection
- map the loop onto `/terminal`, `/lab`, `/dashboard`, shared components, scanner alerts, and AutoResearch
- specify the minimal canonical entities, events, and runtime responsibilities needed to close the loop
- distinguish Day-1 implementation scope from later ML rollout phases

## Non-Goals

- implementing the system spec in this work item
- redesigning page layouts beyond what the spec already implies
- rewriting legacy docs in `Downloads/`
- changing engine runtime behavior in this slice

## Canonical Files

- `work/active/W-0030-core-loop-system-spec.md`
- `docs/product/core-loop.md`
- `docs/product/core-loop-system-spec.md`
- `docs/domains/pattern-engine-runtime.md`
- `docs/domains/pattern-ml.md`

## Facts

- the current canonical core loop exists in `docs/product/core-loop.md`, but it is still conceptual rather than operational
- the pattern engine runtime is documented in `docs/domains/pattern-engine-runtime.md`
- the downloads specs define page-level intent for `/terminal`, `/lab`, `/dashboard`, shared components, scanner alerts, and AutoResearch
- the user’s TRADOOR/PTB writeup defines the reference pattern as a five-phase OI reversal sequence

## Assumptions

- Day-1 still means 3 active surfaces plus landing, with Terminal/Lab/Dashboard carrying the main loop
- the rule-first pattern runtime remains the source of truth, with ML as a downstream scoring and refinement plane
- `Save Setup` should be treated as a canonical capture event even if implementation is not fully closed yet

## Open Questions

- whether the canonical capture record should live under challenge semantics, pattern semantics, or both
- whether Day-1 user feedback should stay binary (`valid` / `invalid`) or support richer labels immediately
- whether alert dedupe and alert policy should be one plane or two separate planes in implementation

## Decisions

- the product core loop will be specified as one concrete operating cycle with named stages, records, and transitions
- the spec will use the TRADOOR/PTB OI reversal pattern as the reference case, but the architecture must generalize
- page-level specs from the downloads will be treated as source inputs, while canonical truth will live under `docs/product/`

## Next Steps

- write the concrete system spec
- link it from the existing core-loop product doc
- use it as the reference for future durable-state, capture-plane, and refinement-plane work

## Exit Criteria

- a canonical spec exists for one full core-loop cycle
- the spec defines surfaces, entities, events, runtime lanes, and feedback closure
- future implementation slices can reference the spec without relying on chat context

## Handoff Checklist

- continue from `docs/product/core-loop-system-spec.md`
- treat the loop stages and canonical records as the current source of truth
- use this spec before changing capture, state, ledger, or refinement behavior
