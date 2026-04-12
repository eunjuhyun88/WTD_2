# AGENTS.md

This file defines mandatory execution rules for all coding agents in this repository.

## Mandatory Start Sequence (Every Task)
1. Re-read `README.md` sections `0) Agent Collaboration Protocol (SSOT)` and `1.1) Context Routing`.
2. Re-read `docs/README.md` and load only the smallest relevant canonical doc set for the current task.
   - Do not start with `docs/archive/*`, old audits, or sibling clone folders unless the active docs explicitly send you there.
3. If the task changes architecture, state ownership, contracts, or product behavior, read `ARCHITECTURE.md`, `docs/SYSTEM_INTENT.md`, and the relevant canonical doc under `docs/`.
4. Run `git status --short --branch` and confirm current branch/worktree state.
5. Reserve a unique work ID using `W-YYYYMMDD-HHMM-<repo>-<agent>`.
6. Append a START entry in `docs/AGENT_WATCH_LOG.md` with:
   - Repo path
   - Branch
   - Base `origin/main` hash
   - Working tree status
   - Task summary
   - Owned files or overlap/conflict check result
7. Run `npm run safe:status` and include the result in the start log.
8. For non-trivial work, record a semantic checkpoint before or immediately after the first design decision:
   - `npm run ctx:checkpoint -- --work-id "<W-ID>" --surface "<surface>" --objective "<objective>"`
9. Do not start edits on `main`. Work must run on a `codex/<task-name>` branch.

## Mandatory Branch/Sync Policy
1. `main` is always protected:
   - No direct push to `main`
   - No rebase on `main`
   - No force push on `main`
2. Personal branch rule:
   - Use `codex/<task-name>` format
   - Rebase is allowed on personal branch only
   - After rebase, push with `--force-with-lease` only with explicit user approval
3. Shared branch rule:
   - Rebase prohibited
   - Force push prohibited
   - Sync latest `main` by merge only
4. Before PR/merge, fetch and sync from latest remote:
   - `git fetch origin --prune`
   - Personal branch: rebase or merge allowed
   - Shared branch: merge only
5. Run `npm run safe:sync` before first edit and again before push.
6. Keep pre-push hook active via `npm run safe:hooks`.

## Mandatory Verification Gate (No Exceptions)
1. Run `npm run docs:check` on the working branch.
2. Run `npm run check` on the working branch.
3. Run `npm run build` on the working branch.
4. Run `npm run ctx:check -- --strict` before push or merge.
5. If any gate fails, stop push/merge and fix errors first.

## Mandatory Context Budgeting (Multi-Agent)
1. Automatic context save/compact runs at:
   - `safe:status`
   - `safe:sync` (start/end)
   - `pre-push`
   - `post-merge`
2. Manual fallback (when automation is disabled or degraded):
   - `npm run ctx:save -- --title "<handoff>" --work-id "<W-ID>" --agent "<agent>"`
   - `npm run ctx:compact`
3. Semantic working memory for non-trivial work must live in checkpoints:
   - `npm run ctx:checkpoint -- --work-id "<W-ID>" --surface "<surface>" --objective "<objective>"`
4. Restore commands must always disambiguate mode:
   - `npm run ctx:restore -- --mode brief`
   - `npm run ctx:restore -- --mode handoff`
   - `npm run ctx:restore -- --mode files`
5. Keep `.agent-context/` local-only (gitignored). Never commit runtime snapshots, briefs, handoffs, or secret notes.

## Mandatory Finish Sequence
1. Commit and push only after passing `docs:check`, `check`, `build`, and `ctx:check -- --strict`.
2. Append FINISH data in `docs/AGENT_WATCH_LOG.md`:
   - What changed
   - Validation results
   - Commit hash
   - Push status
   - Final working tree status
3. Confirm latest brief and handoff exist for the branch:
   - `.agent-context/briefs/<branch-safe>-latest.md`
   - `.agent-context/handoffs/<branch-safe>-latest.md`
   - If missing, run `npm run ctx:compact`.
4. If this task is merged into `main`, run `npm run check` and `npm run build` again on a clean `main` worktree.
5. If the task changed architecture, surface behavior, or authority boundaries, update the relevant canonical doc under `docs/`, not only the watch log.
6. Push/merge actions require explicit user request or approval.

## Logging Model
- Development log: `docs/AGENT_WATCH_LOG.md`
- Runtime memory: `.agent-context/{snapshots,checkpoints,briefs,handoffs,compact,state}`
- Do not treat the watch log as the primary resume surface. Use checkpoints and briefs first.

## Source of Truth
- Canonical collaboration and project guide: `README.md`
- This repo execution rules: `AGENTS.md`
- Root architecture map: `ARCHITECTURE.md`
- Task-level docs router: `docs/README.md`
- Canonical docs layer: `docs/{DESIGN,FRONTEND,PLANS,PRODUCT_SENSE,QUALITY_SCORE,RELIABILITY,SECURITY}.md`
- Historical/reference-only docs: `docs/archive/`
- Sibling clone folders are not canonical implementation targets.

## Recommended Model Routing
- Preferred setup:
  - `gpt5.2 xhigh` for TL tasks (planning, review, orchestration)
  - `gpt-5.3-codex xhigh` for execution tasks (implementation, fix, integration)
- Principle:
  - Keep strategic reasoning and implementation execution split for higher throughput and lower coordination noise.
