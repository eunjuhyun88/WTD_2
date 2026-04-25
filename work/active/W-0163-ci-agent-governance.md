# W-0163 — CI And Agent Governance Hardening

## Goal

CI required checks, memory sync, and agent handoff files must enforce one consistent repo state instead of only documenting it.

## Owner

contract

## Primary Change Type

Contract change

## Scope

- Align required GitHub check names with workflow job names.
- Ensure required CI workflows run for every PR so required checks are never missing because of path filters.
- Change memory sync from protected-branch direct push to pull-request based sync.
- Remove stale `AGENT-HANDOFF-*` files from `work/active/`.
- Ignore local feature-window SQLite runtime artifacts.

## Non-Goals

- Fixing current app TypeScript/Svelte errors.
- Changing engine runtime behavior.
- Reworking Vercel deployment settings.
- Replacing MemKraft or the memory file format.

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0163-ci-agent-governance.md`
- `.github/workflows/app-ci.yml`
- `.github/workflows/engine-ci.yml`
- `.github/workflows/contract-ci.yml`
- `.github/workflows/memory-sync.yml`
- `.gitignore`
- `memory/mk.py`
- `scripts/validate_memkraft_protocol.py`
- `scripts/sync_memory.py`
- `scripts/contract-check.sh`

## Facts

1. PR #291 merged even though `App Check And Test` failed, and the main push also failed App CI.
2. Branch protection currently requires `App CI`, `Engine Tests`, and `Contract CI`, while workflow job names do not all match those contexts.
3. Workflow-level path filters can leave required checks missing on docs or memory-only PRs.
4. Memory sync tried to push directly to protected `main` and failed with `GH006`.
5. `work/active/AGENT-HANDOFF-2026-04-25.md` is stale and conflicts with `CURRENT.md`.

## Assumptions

1. `MEMORY_SYNC_TOKEN` will be provided as a GitHub secret for memory-sync PR creation.
2. App baseline repair remains a separate follow-up because current app check failures are real product-surface errors.

## Open Questions

- none.

## Decisions

- Required check contexts will be `App CI`, `Engine Tests`, and `Contract CI`.
- App, engine, and contract workflows will run on every PR to avoid missing required checks.
- Memory sync creates or updates an `automation/memory-sync-pr-*` branch and opens a PR instead of pushing to `main`.
- If `MEMORY_SYNC_TOKEN` is missing, Memory Sync exits green with a notice instead of making `main` red.
- Stale handoff snapshots belong in archive, not `work/active/`.
- `from memory.mk import mk` is backed by a repo-local wrapper and validated in the contract gate.
- Memory sync uses the engine uv lock instead of an unpinned global `pip install memkraft`.
- The protocol validator enforces canonical `W-xxxx-slug` entries and ignores temporary human-readable PR rows until CURRENT.md is fully normalized.
- MemKraft `decision_record` tags must be passed as a list; comma strings are persisted as character lists in the current package.

## Next Steps

1. Configure GitHub secret `MEMORY_SYNC_TOKEN`.
2. Commit and push the local W-0163/App CI repair changes.
3. Let required PR checks run and merge only after green.

## Exit Criteria

- Required CI checks are present for every PR.
- Memory sync no longer attempts a direct protected-branch push.
- Active state starts from `CURRENT.md` plus listed work items only.
- Runtime SQLite artifacts do not dirty the worktree.

## Handoff Checklist

- active work item: `work/active/W-0163-ci-agent-governance.md`
- branch: `fix/loader-primary-cache-dir`
- verification:
  - YAML parse / workflow inspection: pass
  - App check/test: pass
  - Contract gate with MemKraft protocol validation: pass
  - Engine full pytest: pass
  - branch protection check update via GitHub API: `enforce_admins=true`, required contexts present
  - `git check-ignore` for feature window SQLite: pass
- remaining blockers:
  - GitHub secret `MEMORY_SYNC_TOKEN` must exist for memory sync PR creation; without it, sync is skipped by design.
