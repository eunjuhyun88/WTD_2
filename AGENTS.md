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

## Default Context Pack

- Load only the minimum pack required for the active work item.
- Default pack = `AGENTS.md` + one active work item + one relevant domain doc + minimum code files.
- Use owner and primary change type to keep the default pack narrow.
- Many docs, tools, and memory lanes may exist, but they must not be loaded by default.

## Late-Bound Packs

- Expand context only when the default pack cannot support the next action safely.
- Prefer pack expansion by need:
  - `app` pack: active work item + relevant product/domain docs + touched app files
  - `engine` pack: active work item + relevant domain docs + touched engine files/tests
  - `contract` pack: active work item + contract/domain docs + route/type boundaries
  - `research` pack: active work item + product/domain docs + experiment/eval references
- Heavy lanes such as memory tooling, broad runbooks, or unrelated domains should stay late-bound.

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
- Required sections: Goal, Scope, Non-Goals, Canonical Files, Facts, Assumptions, Open Questions, Decisions, Next Steps, Exit Criteria, Handoff Checklist
- Keep one owner per work item: `engine`, `app`, `contract`, or `research`

## Agent Operating Loop

1. Reconstruct context from canonical files before acting.
2. State the intended design or implementation approach before non-trivial edits.
3. Separate facts, assumptions, decisions, and open questions.
4. Prefer small reversible changes over broad rewrites.
5. Update the active work item with decisions and next steps when context changes.
6. Do not rely on chat history as the source of truth.

## Design Before Action

- For any non-trivial task, define the target change in the active work item before editing code.
- Write or refresh `Goal`, `Scope`, `Non-Goals`, and `Exit Criteria` before implementation starts.
- Prefer contract and design changes before runtime changes when ownership boundaries may move.
- If the task touches multiple layers, split work by primary change type instead of improvising a mixed patch.
- Do not treat chat as plan storage; durable intent belongs in `work/active/*.md`.

## Context Management

- Start from the canonical read order and stop reading once the task can be executed safely.
- Re-anchor context after switching folders, worktrees, or branches by re-reading `AGENTS.md`, the active work item, and the relevant domain doc.
- Keep working context small: prefer one work item, one domain doc, and the minimum code needed.
- Record durable findings, assumptions, and scope changes in the work item instead of leaving them in chat only.
- Distinguish `verified` facts from `assumptions` and `open questions` when decisions are still in motion.
- Preserve source attribution for decisions by naming the canonical files or external references that justified them.

## Preview-First Loading

- Prefer brief or preview views before full documents, catalogs, or memory outputs.
- Load summaries, indexes, or narrow excerpts first; open the full file only if the preview is insufficient.
- Do not inject full tool catalogs, runbook sets, or memory outputs into ordinary turns.
- Expand from preview to full detail only for the current execution need.

## Context Budget

- Keep work items compressed enough that another agent can scan them quickly.
- `Facts`, `Assumptions`, `Open Questions`, and `Next Steps` should contain only the current minimum needed to act.
- Prefer replacing stale entries over appending timeline-style notes.
- If a section grows noisy, compact it immediately instead of carrying forward historical residue.
- Facts target: `3-5`
- Assumptions target: `0-3`
- Open Questions target: `0-3`
- Next Steps target: `1-3`
- Saved context artifacts should default to compact output unless full verbosity is explicitly requested.

## Action Gating

- Before acting, confirm the owner, primary change type, canonical files, and verification target.
- For debugging or investigation, write down the current hypothesis and update the result after the check so future agents do not repeat failed paths.
- Prefer dry-run, shadow mode, or read-only inspection before irreversible or high-risk actions.
- If new information changes scope or invalidates the current plan, update the work item first and then continue.

## Multi-Agent Collaboration Guardrails

- Never commit directly on `main`; use task branches only.
- Quick rule:
  - one thread
  - one active work item
  - one active execution branch
- New chat messages do not justify new branches.
- Prefer commit splitting before branch splitting.
- Default operating unit is:
  - one active work item
  - one execution branch
  - one checked-out worktree
- Branch creation is the exception, not the default:
  - create a new branch when starting a new work item
  - create a new branch when the user explicitly asks for isolated PR scope
  - create a new branch when unrelated in-flight changes make one clean PR impossible
  - do not create a new branch merely to split commits, answer a review comment, or continue the same work item
- Start each active execution branch in a dedicated git worktree bound to that branch.
- Keep one execution branch per agent/task (`task/<id>-<slug>` preferred).
- Do not create extra branch pointers without explicit reason recorded in the active work item.
- Merge via PR only after user approval; no direct push-to-main flow.
- Before merge, pass the minimum gate: clean `git status`, scoped tests/checks, and conflict review.
- If unexpected file changes appear, stop and confirm scope before committing.

## Branch Lifecycle Policy

- Use the current task branch until one of these is true:
  - the active work item changes
  - the intended PR scope changes materially
  - the user asks for a separate branch
- Commit splitting and branch splitting are different operations:
  - prefer multiple commits on one branch for multiple functional slices inside one work item
  - use a separate branch only for a separate merge unit
- If the worktree is dirty with unrelated changes, first try:
  - narrower staging
  - smaller commits
  - a documented defer/ignore decision
  before creating another branch
- Before creating a new branch, record in the active work item:
  - why the current branch is no longer the right merge unit
  - which work item owns the new branch
  - what commit range or scope belongs to each branch
- Branch names should be stable and task-oriented, not conversational.

## Agent Roles

- `Orchestrator`
  - chooses work-item order, merge order, and integration timing
  - does not mix unrelated implementation slices into one PR
- `Implementer`
  - owns one active work item and one execution branch at a time
  - keeps changes inside the declared scope
- `Reviewer`
  - validates correctness, regression risk, boundary discipline, and merge readiness
  - treats missing work-item updates as a finding
- `Integrator`
  - merges only after approval and gate pass
  - is responsible for branch cleanup and baseline sync

## Agent Operating Rules

- An implementer should not hold more than one active execution branch at once unless the user explicitly approves parallel ownership.
- If a task needs multiple agents, split by work item or merge unit, not by arbitrary file subsets.
- Every agent handoff must name:
  - active work item
  - active branch
  - verification status
  - remaining blockers
- Do not switch branches or create new ones mid-task without updating the work item first.
- If a branch exists only to preserve a commit range, label that intent explicitly in the work item so it is not mistaken for the active execution branch.

## Handoff Memory

- A task must be restartable from files, not from one agent's private reasoning.
- Update `Decisions` and `Next Steps` whenever the plan, blocker, or boundary changes materially.
- Record rejected approaches or failed hypotheses when they affect future execution choices.
- Leave the next agent enough context to continue without reconstructing hidden assumptions from chat.
- Any future `file-back` automation must default to compacting current state, not appending history.

## Handoff Checklist

- Confirm the active work item reflects the latest scope, decisions, and next steps.
- Mark which facts are verified, which assumptions remain open, and which questions still block progress.
- Record the exact files, checks, or commands the next agent should continue from.
- Note any rejected paths, failed hypotheses, or deferred risks that should not be rediscovered.
- Do not hand off work that depends on unstated chat context.

## Context Health

- Prefer small, current, canonical docs over large historical narratives.
- Archive or de-emphasize stale guidance instead of letting multiple truths compete.
- If a root rule is important enough to govern work across folders, mirror it in the top-level entry docs.
- Treat missing work-item updates as context debt that must be repaid before handoff or merge.
- Delete or replace outdated work-item bullets once they no longer affect the next action.
- Keep only the latest valid state; do not preserve obsolete intermediate notes just because they were once true.
- If recent work supersedes previous notes, update the section in place rather than stacking new bullets underneath.
- Historical detail belongs in commits, ADRs, or archive docs, not in the active work item.

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
