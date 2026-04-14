# WTD v2 Agent Router

Use this repository as a low-context AI research operating system.

## Canonical Read Order

1. `AGENTS.md`
2. Relevant `work/active/*.md`
3. Relevant `docs/domains/*.md`
4. Relevant `docs/product/*.md`
5. Minimal required code files

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

- Continue non-trivial work through `work/active/*.md`, not chat history.
- Prefer domain docs and contracts over long legacy PRDs.
- Keep `app/` free of duplicated engine business logic.

## Branch and Worktree Operating Rules

- Do all non-trivial work on a task branch in a dedicated worktree, not on `main`.
- Use one active task branch per agent to avoid cross-agent contamination.
- Do not push or merge without explicit user approval.
- Prefer PR-based integration to keep review boundaries clear.
- If unrelated or unexpected diffs appear, pause and confirm before continuing.
