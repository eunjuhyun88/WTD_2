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

## Branch Naming — MANDATORY

**Before creating any branch**, look up the Issue ID in `docs/live/feature-implementation-map.md`.

Branch name format: `feat/{Issue-ID}-{kebab-desc}`

Examples:
- `feat/F02-verdict-5cat`
- `feat/A03-ai-parser-engine`
- `feat/D03-watch-engine`

**NEVER** create branches with auto-generated names:
- `claude/*` — forbidden
- `codex/*` — forbidden
- Any name without a Feature ID prefix — forbidden

If no matching Issue ID exists in `feature-implementation-map.md`, **stop and ask the user** before creating a branch. Do not invent a new branch name.

The pre-push hook at `.githooks/pre-push` will block `claude/*` and `codex/*` pushes.

## Branch and Worktree Operating Rules

- One agent = one worktree = one branch = one issue. Never mix.
- Worktree path: `.claude/worktrees/feat-{Issue-ID}/`
- Create worktree: `git worktree add .claude/worktrees/feat-{ID} -b feat/{ID}-{desc} main`
- Delete worktree after PR merge: `git worktree remove .claude/worktrees/feat-{ID}`
- Work only inside your own worktree path. Never edit files in another agent's worktree.
- Do not push or merge without explicit user approval.
- If unrelated or unexpected diffs appear, pause and confirm before continuing.

## Branch-Thread Rules

- One thread maps to one active work item and one active execution branch.
- Do not create a new branch just because a new chat message arrived.
- Split commits first; split branches only for a new merge unit.
- If the branch changes but the work item does not, continue on the same thread after explicit confirmation.

## Vercel Deploy Guardrail

- Treat Vercel production deploy as a dedicated release lane, not as a side-effect of agent branches.
- Do not route Vercel auto-deploy through `main`, `master`, `claude/*`, or `codex/*`.
- For `app/`, reconnect Git deploys only after `app/vercel.json` contains branch deployment guardrails and Vercel production is reassigned to `release`.
- If that remote setup is not confirmed, assume manual `vercel deploy --prod` is the safe path.
