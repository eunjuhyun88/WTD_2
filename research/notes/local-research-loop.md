# Local Research Loop

## Goal

Give the solo developer one short path for running the current research stack end-to-end.

## Current entry points

From repo root:

```bash
npm --prefix app run research:smoke-core
npm --prefix app run research:rq-b-core
```

`research:smoke-core` verifies the locked research primitives and data sources.

`research:rq-b-core` runs the current canonical RQ-B baseline path on top of the required smoke gates.

## Command map

### 1. Primitive smoke gates

- `npm --prefix app run research:e1-namespace-smoke`
- `npm --prefix app run research:e2-verdict-builder-smoke`
- `npm --prefix app run research:e5-db-source-smoke`
- `npm --prefix app run research:r4-1-fixtures`
- `npm --prefix app run research:r4-1-scheduled-end`
- `npm --prefix app run research:r4-2-smoke`
- `npm --prefix app run research:r4-3-smoke`
- `npm --prefix app run research:r4-4-smoke`

### 2. Canonical experiment family

- synthetic ladder: `npm --prefix app run research:rq-b-sample-size`
- DB-backed ladder: `DATABASE_URL=... npm --prefix app run research:rq-b-real-data`

## Interpretation

- run `research:smoke-core` after changing `app/src/lib/research/*` or the research-facing contracts
- run `research:rq-b-core` when changing the current RQ-B baseline stack or its protocol-facing behavior
- treat generated reports under `docs/generated/research/` as outputs, not the source of protocol truth

## Canonical links

- thesis: `research/thesis/current-thesis.md`
- protocol: `research/evals/rq-b-baseline-protocol.md`
- experiment family: `research/experiments/rq-b-ladder-2026-04-11.md`
