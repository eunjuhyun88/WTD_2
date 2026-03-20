# Context System Rollout

Date: 2026-03-06
Status: active hardening
Scope: current git worktree rooted at this repository

## Goal

Turn the repo's current mixed document set into an agent-first context system that is:
- discoverable,
- bounded,
- mechanically checked,
- and easier to extend without drift.

## Invariants

1. This repository remains the canonical implementation target regardless of worktree path.
2. `AGENTS.md` stays short and routes into deeper sources of truth.
3. Canonical docs are stable entry points; dated docs remain supporting material.
4. Archive does not compete with current authority.

## Steps

1. Add canonical entrypoint docs for design, frontend, plans, product sense, quality, reliability, and security.
2. Add structured subtrees:
   - `design-docs/`
   - `product-specs/`
   - `exec-plans/`
   - `generated/`
   - `references/`
3. Add a docs validation script and wire it into local checks.
4. Update routing docs and start-sequence rules.
5. Gradually promote stable rules from dated docs into canonical docs.
6. Add semantic checkpoint, brief, and handoff artifacts under `.agent-context/`.
7. Add strict context quality validation before push.

## Exit Criteria

- A future agent can find the right surface docs within two to three file opens.
- The repo has a mechanical check for the context system structure.
- Product intent and major invariants are readable without leaving the repo.

## Follow-Ups

- Localize remaining Arena/War edge cases from `../STOCKCLAW_UNIFIED_DESIGN.md`.
- Move stable parts of dated working docs into canonical docs.
- Reduce sibling clone drift operationally.
