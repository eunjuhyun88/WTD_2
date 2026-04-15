# W-0037 Performance Audit Gate

## Goal

Introduce a repeatable performance audit for the app/engine runtime that can fail fast like the DB security audit, with explicit budgets for a 500-concurrent-user operating target.

## Owner

contract

## Scope

- add a performance budget file for the 500-user target
- add an audit CLI that reads k6 summary exports and runtime env posture
- classify performance findings by severity and support `--strict`
- expose the audit as an npm script
- document how to run and interpret the audit

## Non-Goals

- replacing full load testing or tracing infrastructure
- auto-provisioning Redis/cache/worker topology
- guaranteeing production capacity without a real staged load test

## Canonical Files

- `work/active/W-0037-performance-audit-gate.md`
- `app/scripts/perf/performance-audit.mjs`
- `app/scripts/perf/perf-budget.json`
- `app/package.json`
- `docs/runbooks/performance-hardening.md`
- `docs/runbooks/env-vars.md`

## Decisions

- performance review should combine dynamic load evidence and static runtime posture checks
- 500-user safety requires shared cache, distributed rate limiting, and scheduler isolation to be auditable
- missing k6 evidence is a warning in normal mode and a failure only when explicitly required by the selected profile
- audit output should mirror the DB security audit shape: findings, severity, `--json`, `--strict`

## Next Steps

- export k6 summaries for auth and analyze paths in staging
- run `npm run performance:audit -- --strict --profile auth-snapshot-500 --summary <file>`
- run `npm run performance:audit -- --strict --profile analyze-500 --summary <file>`
- wire the audit into CI after staging thresholds stabilize

## Exit Criteria

- the repo contains a 500-user performance budget contract
- operators can run a single audit CLI for perf posture + k6 evidence
- `--strict` exits non-zero on high/critical perf findings
- runbook explains how to collect and audit k6 evidence
