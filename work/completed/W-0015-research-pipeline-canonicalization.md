# W-0015 Research Pipeline Canonicalization

## Goal

Make `research/` the canonical record of the current local-first ML/eval loop so a solo developer can find the active thesis, eval protocol, and runnable experiments without relying on chat history or scattered script-local docs.

## Owner

research

## Scope

- create canonical research artifacts under `research/thesis/`, `research/evals/`, and `research/experiments/`
- map the current runnable research entry points in `app/scripts/research` to those artifacts
- define a short command path for the current local research loop
- replace stale or missing references to removed `docs/exec-plans/*` research docs
- update umbrella architecture docs to point at the new canonical research records

## Non-Goals

- changing experiment logic or evaluation semantics
- moving `app/src/lib/research` runtime code into a different package
- adding MLflow, W&B, or a durable experiment registry in this slice
- implementing production deployment or multi-runtime research infrastructure

## Canonical Files

- `work/active/W-0015-research-pipeline-canonicalization.md`
- `work/active/W-0006-full-architecture-refactor-design.md`
- `research/README.md`
- `research/thesis/current-thesis.md`
- `research/evals/rq-b-baseline-protocol.md`
- `research/experiments/rq-b-ladder-2026-04-11.md`
- `research/notes/local-research-loop.md`
- `docs/product/research-thesis.md`
- `app/package.json`

## Decisions

- `research/` is the canonical record layer; `app/scripts/research` remains the runnable implementation layer
- each active experiment should have a stable canonical note under `research/experiments/` even if the runnable script also keeps implementation-local notes
- the first canonical research spine is the RQ-B baseline ladder because it already has runnable scripts and smoke gates
- removed `docs/exec-plans/*` references should be replaced with `research/*` paths rather than recreated
- top-level npm aliases should expose the current research loop without requiring script archaeology

## Next Steps

- add a second canonical experiment record when the next non-RQ-B experiment lands
- decide whether implementation-local `objective.md` files should be kept or folded entirely into `research/experiments/`
- add a small generated-report index once at least one experiment report is committed under `docs/generated/research/`
- decide whether to collapse the remaining research code comments onto fewer canonical reference docs

## Exit Criteria

- a solo developer can open `research/README.md` and reach the current thesis, eval protocol, and active experiment
- active experiment docs under `research/` point to runnable commands and implementation paths that exist in the repo
- a solo developer can run the current research loop from one short command path
- no current research script depends on a missing `docs/exec-plans/*` path for its canonical documentation reference
