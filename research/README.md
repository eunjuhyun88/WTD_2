# Research Workspace

Research artifacts are separate from product docs and task work items.

## Canonical entry points

- thesis: `research/thesis/current-thesis.md`
- fixed protocol: `research/evals/rq-b-baseline-protocol.md`
- active experiment family: `research/experiments/rq-b-ladder-2026-04-11.md`
- replication protocol: `research/evals/strategy-replication-protocol-v0.md`
- replication experiment family: `research/experiments/strategy-replication-pilot-2026-04-16.md`

## Structure

- `research/thesis/`: active hypotheses, decision criteria, and claim boundaries
- `research/experiments/`: canonical records for runnable experiment families
- `research/evals/`: fixed protocols, metrics, and acceptance rules
- `research/datasets/`: dataset contracts and provenance notes
- `research/notes/`: short working notes that do not change protocol or thesis

## Runtime mapping

`research/` is the record layer. Runnable implementation stays here:

- library/runtime: `app/src/lib/research`
- smoke gates and experiment runners: `app/scripts/research`
- generated reports: `docs/generated/research`

## Fast path

- current loop guide: `research/notes/local-research-loop.md`
- core smoke suite: `npm --prefix app run research:smoke-core`
- current canonical experiment path: `npm --prefix app run research:rq-b-core`

## Rules

- record experiments in files, not chat-only context
- tie product claims to explicit eval outputs
- prefer adding a new protocol or experiment note over silently rewriting history
