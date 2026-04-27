# W-0164 — Repo State Hygiene

## Goal

Keep the active repo state restartable from canonical files by removing stale active checkpoints and aligning `CURRENT.md` with the actual tracked `origin/main`.

## Owner

contract

## Primary Change Type

Contract change

## Scope

- Update `work/active/CURRENT.md` to the current `origin/main` SHA.
- Move invalid active checkpoint notes out of `work/active/`.
- Record the dirty-file assessment from the shared worktree without modifying unrelated files.
- Leave app warning burn-down as the next app lane after state hygiene is clean.

## Non-Goals

- App warning fixes.
- Engine dependency changes.
- Research experiment log cleanup.
- Branch protection or CI workflow changes.

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0164-repo-state-hygiene.md`
- `docs/archive/work-checkpoints/W-app-ci-repair-checkpoint-20260426.md`

## Facts

1. `origin/main` moved through `2092ac01`, `87f44b0b`, `cdefda4d`, and `092a50de`; this branch resolves state hygiene against `092a50de`.
2. The shared root worktree had unrelated dirty files: `engine/uv.lock` and `research/experiments/experiment_log.jsonl`.
3. `work/active/W-app-ci-repair-checkpoint-20260426.md` does not satisfy the required `W-xxxx-slug` active work item naming rule.
4. App baseline passed locally before this slice: `npm run check` had 0 errors and `npm test` had 250 passed.
5. Engine full pytest passed locally before this slice: 1448 passed.

## Assumptions

1. The shared root dirty files belong to another lane or automated test run and should not be committed into this contract-state hygiene branch.

## Open Questions

- none.

## Decisions

- Use a dedicated `codex/w-0164-repo-state-hygiene` worktree instead of editing the shared root worktree.
- Archive the app CI checkpoint under `docs/archive/work-checkpoints/` instead of leaving it in `work/active/`.
- Do not commit or revert unrelated dirty files from the shared root worktree.
- Treat the PyJWT lock drift as engine dependency hygiene, not part of this contract-state branch.

## Next Steps

1. Merge PR #305 after required checks pass.
2. Keep W-0164 reference-only unless the state hygiene lane is reopened.
3. Resume app warning burn-down in a separate app-owned lane.

## Exit Criteria

- `CURRENT.md` points at the current local `origin/main`.
- `work/active/` contains only `CURRENT.md` plus valid `W-xxxx-*` work items.
- Shared-root dirty files are documented but untouched.

## Handoff Checklist

- active work item: `work/active/W-0164-repo-state-hygiene.md`
- branch: `codex/w-0164-repo-state-hygiene`
- verification:
  - active work item naming: pass
  - `git diff --check`: pass
  - MemKraft protocol validator: pass
  - `uv run --locked` MemKraft validator: blocked by existing `engine/uv.lock` drift
- remaining blockers:
  - shared root dirty-file ownership remains outside this branch
  - `engine/uv.lock` needs a separate engine dependency hygiene commit if locked uv workflows become required
