# AGENTS

Execution rules for humans and coding agents.

## Core Rules

1. `engine/` is the only backend truth.
2. `app/` is surface + orchestration only.
3. Contracts define app-engine coupling.
4. Work continues via `work/active/*.md`, not chat history.

## Default Read Scope

Read in this order:

1. `AGENTS.md`
2. Relevant `work/active/*.md`
3. Relevant `docs/domains/*.md`
4. Relevant `docs/product/*.md`
5. Minimal required code files

## Default Exclude Scope

Do not read these unless explicitly required:

- `app/node_modules/`
- `app/build/`
- `app/.svelte-kit/`
- `engine/.venv/`
- `**/__pycache__/`
- `**/.pytest_cache/`
- `docs/archive/`
- `app/_archive/`
- `docs/generated/`

## Work Item Discipline

Every non-trivial task must have one active work item:

- Path: `work/active/W-xxxx-<slug>.md`
- Required sections: Goal, Scope, Non-Goals, Canonical Files, Decisions, Next Steps, Exit Criteria
- Keep one owner per work item: `engine`, `app`, `contract`, or `research`

## Multi-Agent Collaboration Guardrails

- Never commit directly on `main`; use task branches only.
- Start each task in a dedicated git worktree bound to one branch.
- Keep one branch per agent/task (`agent/<name>/<task>` or `task/<id>-<slug>`).
- Merge via PR only after user approval; no direct push-to-main flow.
- Before merge, pass the minimum gate: clean `git status`, scoped tests/checks, and conflict review.
- If unexpected file changes appear, stop and confirm scope before committing.

## Change Type Tags

Each PR/change should be one primary type:

- Product surface change
- Engine logic change
- Contract change
- Research or eval change

Avoid mixing types in one change set when possible.

## Verification Minimum

- Engine changes: run targeted engine tests first, then broader suite if needed.
- App changes: run app check/lint relevant to touched area.
- Contract changes: validate both route and engine caller/callee shapes.

## Canonical Docs

- Product: `docs/product/*.md`
- Domains: `docs/domains/*.md`
- Decisions: `docs/decisions/*.md`
- Runbooks: `docs/runbooks/*.md`
