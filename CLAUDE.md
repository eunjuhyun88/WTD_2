# WTD v2 Agent Router

Use this repository as a low-context AI research operating system.

## Canonical Read Order

1. `AGENTS.md`
2. `work/active/CURRENT.md`
3. Relevant `work/active/*.md` listed in `CURRENT.md`
4. Relevant `docs/domains/*.md`
5. Relevant `docs/product/*.md`
6. Minimal required code files

## Canonical Truth

- Backend truth: `engine/`
- Surface and orchestration: `app/`
- Current product truth: `docs/product/*.md`
- Domain maps: `docs/domains/*.md`
- Decisions: `docs/decisions/*.md`
- Runbooks: `docs/runbooks/*.md`

## Default Exclude Scope

Do not read these unless explicitly required:

- `.claude/`
- `.git/`
- `app/node_modules/`
- `app/build/`
- `app/.svelte-kit/`
- `engine/.venv/`
- `engine/data_cache/cache/`
- `docs/archive/`
- `app/docs/COGOCHI.md`
- `app/docs/generated/`
- `app/_archive/`
- `**/__pycache__/`
- `**/.pytest_cache/`

## Work Mode

- Continue non-trivial work through `work/active/CURRENT.md` and the listed active work item, not chat history.
- Prefer domain docs and contracts over long legacy PRDs.
- Keep `app/` free of duplicated engine business logic.

## Design-First Loop

- Before acting on a non-trivial task, define the intended change in the active work item.
- Refresh `Goal`, `Scope`, `Non-Goals`, and `Exit Criteria` before implementation.
- Prefer contract/design clarification before runtime edits when boundaries may shift.
- Split mixed work into smaller change types instead of planning in chat and coding ad hoc.

## Context Discipline

- Re-anchor after switching folders, worktrees, or branches: re-read `AGENTS.md`, the active work item, and the relevant domain doc.
- Keep context intentionally small; load only the files required to act safely.
- Move durable findings, assumptions, and rejected hypotheses into the active work item tracked from `work/active/CURRENT.md`.
- Preserve source attribution for key decisions so another agent can continue without chat replay.

## Branch and Worktree Operating Rules

- Do all non-trivial work on a task branch in a dedicated worktree, not on `main`.
- Use one active task branch per agent to avoid cross-agent contamination.
- Do not push or merge without explicit user approval.
- Prefer PR-based integration to keep review boundaries clear.
- If unrelated or unexpected diffs appear, pause and confirm before continuing.

## Branch-Thread Rules

- One thread maps to one active work item and one active execution branch.
- Do not create a new branch just because a new chat message arrived.
- Split commits first; split branches only for a new merge unit.
- If the branch changes but the work item does not, continue on the same thread after explicit confirmation.
- If the work item changes, start a new thread or explicitly rebind the thread to the new branch.

## Vercel Deploy Guardrail

- Treat Vercel production deploy as a dedicated release lane, not as a side-effect of agent branches.
- Do not route Vercel auto-deploy through `main`, `master`, `claude/*`, or `codex/*`.
- For `app/`, reconnect Git deploys only after `app/vercel.json` contains branch deployment guardrails and Vercel production is reassigned to `release`.
- If that remote setup is not confirmed, assume manual `vercel deploy --prod` is the safe path.
