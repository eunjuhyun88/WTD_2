# CLAUDE.md

This directory is higher risk than the average repository surface.

## Why This Area Is Sensitive
- Primary reason: database boundary.
- Changes here can affect correctness, safety, or irreversible system behavior.

## Before You Edit
1. Re-read `README.md`, `AGENTS.md`, and `docs/README.md`.
2. Re-read `docs/SECURITY.md`, `docs/RELIABILITY.md`, and `docs/GIT_WORKFLOW.md`.
3. Open the smallest relevant canonical docs before touching code.
4. Prefer the smallest safe change that preserves current invariants.

## Local Risks
- Replace this placeholder with directory-specific failure modes.
- Replace this placeholder with nearby invariants or irreversible actions.

## Required Checks
- `npm run docs:check`
- `npm run ctx:check -- --strict`
- Add project-specific build/test gates here if this directory requires them.

## Escalate Before
- schema or migration changes
- auth boundary changes
- secret or credential handling changes
- destructive backfills or irreversible infrastructure changes

## Local Scope
- Directory: `db`

