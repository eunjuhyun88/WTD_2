# 0001 Shared Memento Memory Layer

Date:
- 2026-03-17

Status:
- accepted

## Context

The project already has repo-local collaboration files:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `context-kit.json`
- `.agent-context/`
- `agents/*.json`

At the same time, the repo is being worked on through multiple sibling worktrees:

- `frontend/`
- `frontend-pr-home-entry/`
- `.wt-passport-learning-panel/`
- `.wt-passport-learning-merge/`

Durable agent memory cannot live only inside one worktree.

## Decision

We keep `frontend/` as the only canonical implementation repo and add a shared memory layer outside it:

- repo truth:
  - `/Users/ej/Downloads/wtd-clones/frontend`
- shared memory:
  - `/Users/ej/Downloads/wtd-clones/.memento/memories/*`
- shared runtime relay:
  - `/Users/ej/Downloads/wtd-clones/.memento/runtime/wtd`

We also formalize repo-local promotion targets:

- stable decisions -> `docs/decisions/`
- branch handoffs -> `docs/handoffs/`
- active claims -> `.agent-context/coordination/claims/`
- semantic resume checkpoints -> `.agent-context/checkpoints/`

## Why

This preserves the current codebase and worktree layout while making cross-agent memory reusable.

It avoids two common failures:

1. treating one worktree's notes as global truth
2. leaving critical context only inside chat history

## Impact

Immediate:
- better handoff quality
- lower drift between parallel worktrees
- cleaner split between canonical docs and personal memory

Required behavior:
- architectural or IA changes must be promoted into repo docs
- personal or role-specific lessons belong in `.memento/memories/*`

## Rollback

If the shared layer proves too heavy:
- keep `docs/decisions/` and `docs/handoffs/`
- reduce `.memento` usage to planner + reviewer only
