# STOCKCLAW Worktree Guide

Last updated: 2026-03-06

This file is repo-local and worktree-aware. Treat the current git worktree rooted at this repository as active; do not assume a sibling clone path is canonical.

## Read First

1. `README.md`
2. `AGENTS.md`
3. `docs/README.md`
4. `docs/SYSTEM_INTENT.md`
5. `ARCHITECTURE.md`

## Execution Defaults

- Start every task with `git status --short --branch`.
- Use `npm run safe:status` before edits and `npm run safe:sync` before push.
- Record semantic working memory with:
  - `npm run ctx:checkpoint -- --work-id "<W-ID>" --surface "<surface>" --objective "<objective>"`
- Build resume artifacts with:
  - `npm run ctx:compact`
- Validate handoff quality with:
  - `npm run ctx:check -- --strict`

## Canonical Authority

- Execution rules: `AGENTS.md`
- Collaboration SSOT: `README.md`
- Root map: `ARCHITECTURE.md`
- Task-level doc router: `docs/README.md`
- Canonical docs: `docs/{DESIGN,FRONTEND,PLANS,PRODUCT_SENSE,QUALITY_SCORE,RELIABILITY,SECURITY}.md`

## Guardrails

- `docs/archive/` is historical context, not current authority.
- `.agent-context/` is local runtime memory only; never commit it.
- If architecture, ownership, or behavior changes, update the relevant canonical doc under `docs/`.
- Keep pre-push hooks active via `npm run safe:hooks`.
