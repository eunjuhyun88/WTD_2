# Cogochi Worktree Guide

Last updated: 2026-04-11

This file is repo-local and worktree-aware. Treat the current git worktree rooted at this repository as active; do not assume a sibling clone path is canonical.

## Read First

1. `README.md`
2. `AGENTS.md`
3. **`docs/COGOCHI.md`** ← single source of truth for the product (thesis, surfaces, pipeline, pricing, kill criteria, home landing spec, phase 2/3 roadmap)
4. `docs/README.md` ← what else is in docs/ and why
5. `ARCHITECTURE.md` ← thin root redirect to `docs/COGOCHI.md § 20`

If the task is purely operational (CI, security, context engineering, agent coordination), also read the matching doc under `docs/{DESIGN,FRONTEND,PLANS,SECURITY,RELIABILITY,QUALITY_SCORE}.md`.

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

- **Product truth:** `docs/COGOCHI.md` (single file — do not create parallel design docs)
- Execution rules: `AGENTS.md`
- Collaboration SSOT: `README.md`
- Task-level doc router: `docs/README.md`
- Operational docs: `docs/{DESIGN,FRONTEND,PLANS,QUALITY_SCORE,RELIABILITY,SECURITY}.md`

## Guardrails

- `~/Downloads/기타_문서/cogochi-v3-archive-2026-04-11/` is **historical reference**, not current authority. Do not treat v3 specs as active. Any useful technical content from v3 has already been absorbed into `docs/COGOCHI.md` (see its § 11 Data Contracts and § 17 Phase 2/3 Roadmap).
- `.agent-context/` is local runtime memory only; never commit it.
- If product intent, architecture, ownership, or behavior changes, **update `docs/COGOCHI.md` in place**. Do not create new versioned files like `COGOCHI-v2.md`. The whole point of this consolidation is that drift ends here.
- Operational changes (CI, engineering discipline, etc.) still update the relevant `docs/*.md` — COGOCHI.md is product-scoped only.
- Keep pre-push hooks active via `npm run safe:hooks`.

## Product Surface Boundaries (from COGOCHI.md § 7)

Day-1 active:
- `/` landing · `/create` onboarding · `/terminal` (primary — DOUNI co-viewing) · `/lab` AutoResearch · `/agent/[id]` ownership · `/scanner` settings · `/dashboard` optional

Phase 2 deferred: `/market` · `/copy`
Phase 3 deferred: `/battle` · `/passport` · `/world`

Do not build Phase 2/3 surfaces without explicit prior approval — they are not in scope.
