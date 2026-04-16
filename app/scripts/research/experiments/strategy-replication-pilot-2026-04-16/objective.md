# Experiment Objective — Strategy Replication Pilot Source Preflight

**Status**: Active preflight for the first replication pilot.

## Research Question

Can the repository produce a canonical, reviewable source pack for one external strategy before any local parity implementation begins?

## Hypothesis

If the first pilot target is simple enough, a lightweight preflight can make missing provenance, hidden assumptions, and source ambiguities explicit before engineering effort is spent on parity code.

## Success Criteria

- the preflight reads the canonical source-pack directory without throwing
- a machine-readable status file is written to `docs/generated/research/`
- a markdown preflight report is written to `docs/generated/research/`
- the report clearly distinguishes `ready_for_parity` from `blocked`
- the report lists unresolved source-capture requirements when blocked

## Pre-registration

This preflight does not claim strategy edge or replication success. It claims only that source-capture readiness can be made explicit and reviewable from files instead of chat memory.

## Runnable Command

From repo root:

```bash
npm --prefix app run research:replication-pilot:preflight
```

## Expected Outputs

- `docs/generated/research/report-replication-pilot-source-capture-2026-04-16.md`
- `docs/generated/research/report-replication-pilot-source-capture-2026-04-16.json`

## Reference

- `research/evals/strategy-replication-protocol-v0.md`
- `research/experiments/strategy-replication-pilot-2026-04-16.md`
- `research/datasets/strategy-replication/rsi-overbought-long-btc-4h/`
