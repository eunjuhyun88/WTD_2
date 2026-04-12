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

## MemKraft (Accumulated Knowledge)

- Knowledge base: `memory/` directory (plain Markdown, git-tracked)
- Auto-extract on session end (fail-open hook)
- `npm run mk:dream:dry` — memory health check (7 automated checks)
- `npm run mk:search "query"` — knowledge search
- `npm run mk:lookup "entity"` — entity lookup (brain-first priority)
- `npm run mk:extract "text" --source "src"` — manual extraction
- `npm run mk:track "Name" --type concept` — track new entity
- `npm run mk:log --event "description" --tags "tag1,tag2"` — log event
- Entities: Compiled Truth (current state, mutable) + Timeline (history, append-only)

## Guardrails

- `~/Downloads/기타_문서/cogochi-v3-archive-2026-04-11/` is **historical reference**, not current authority. Do not treat v3 specs as active. Any useful technical content from v3 has already been absorbed into `docs/COGOCHI.md` (see its § 11 Data Contracts and § 17 Phase 2/3 Roadmap).
- `.agent-context/` is local runtime memory only; never commit it.
- If product intent, architecture, ownership, or behavior changes, **update `docs/COGOCHI.md` in place**. Do not create new versioned files like `COGOCHI-v2.md`. The whole point of this consolidation is that drift ends here.
- Operational changes (CI, engineering discipline, etc.) still update the relevant `docs/*.md` — COGOCHI.md is product-scoped only.
- Keep pre-push hooks active via `npm run safe:hooks`.

## Advisor Pattern (Executor–Advisor model split)

This repo uses a two-model strategy to optimize cost and quality:

- **Executor (Sonnet)**: Default. Handles file moves, grep, edits, type checks, test runs — all mechanical execution.
- **Advisor (Opus)**: On-demand. Called via `Agent tool` with `model: opus` (or `subagent_type: advisor` if available) for architecture decisions, cross-dependency analysis, extraction order, and risk assessment.

### When to call the Advisor

- Cross-boundary refactors (archiving files that might break active code)
- Extraction order decisions (which module to extract first)
- Ambiguous dependency graphs (3+ files with unclear ownership)
- Any decision where getting it wrong means rework

### When NOT to call the Advisor

- Single file edits, renames, simple archive moves
- Running checks, tests, git operations
- Grep/glob searches
- Following an already-approved plan

### How to call

```
Agent tool:
  model: "opus"
  prompt: "[describe the decision needed]"
```

The Advisor returns structured advice (Decision → Analysis → Recommendation → Confidence) and **never writes code**.

## Product Surface Boundaries (from COGOCHI.md § 7)

Day-1 active:
- `/` landing · `/create` onboarding · `/terminal` (primary — DOUNI co-viewing) · `/lab` AutoResearch · `/agent/[id]` ownership · `/scanner` settings · `/dashboard` optional

Phase 2 deferred: `/market` · `/copy`
Phase 3 deferred: `/battle` · `/passport` · `/world`

Do not build Phase 2/3 surfaces without explicit prior approval — they are not in scope.
