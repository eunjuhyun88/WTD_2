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
- Add verifiable design contracts and a CI gate so design docs cannot drift silently from code.
- Surface design verification in agent boot/end tools.

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
- `.gitattributes`
- `memory/mk.py`
- `tools/claim.sh`
- `tools/track_repo.sh`
- `tools/start.sh`
- `tools/end.sh`
- `tools/verify_design.sh`
- `tools/verify/*.py`
- `design/current/architecture.md`
- `design/current/contracts/*.md`
- `design/current/invariants.yml`
- `.github/workflows/design-verify.yml`
- `app/scripts/dev/bootstrap-git-config.sh`
- `scripts/validate_memkraft_protocol.py`
- `scripts/sync_memory.py`
- `scripts/contract-check.sh`

## Facts

1. PR #291 merged even though `App Check And Test` failed, and the main push also failed App CI.
2. Branch protection currently requires `App CI`, `Engine Tests`, and `Contract CI`, while workflow job names do not all match those contexts.
3. Workflow-level path filters can leave required checks missing on docs or memory-only PRs.
4. Memory sync direct push was replaced with PR-based sync, but per-merge branches created stale concurrent PRs touching the same `memory/sessions/*.jsonl` and `CURRENT.md` files.
5. `claim.sh` previously scanned all of `spec/CONTRACTS.md`, so explanatory text containing a domain string could cause a false-positive lock collision.
6. Design docs are useful only if drift is machine-detected; otherwise the next agent can follow stale architecture or component contracts.
7. Current `ChartBoard.svelte` still accepts `surfaceStyle` and `analysisData`, so the first invariant set records the current contract instead of pretending those props are already forbidden.

## Assumptions

1. `MEMORY_SYNC_TOKEN` is optional; when missing, Memory Sync falls back to `GITHUB_TOKEN` plus manual `workflow_dispatch`.
2. App baseline repair remains a separate follow-up because current app check failures are real product-surface errors.

## Open Questions

- none.

## Decisions

- Required check contexts will be `App CI`, `Engine Tests`, and `Contract CI`.
- App, engine, and contract workflows will run on every PR to avoid missing required checks.
- Memory sync creates or updates an `automation/memory-sync-pr-*` branch and opens a PR instead of pushing to `main`.
- If `MEMORY_SYNC_TOKEN` is missing, Memory Sync uses `GITHUB_TOKEN` and manually dispatches required workflows for the sync PR.
- Memory sync follow-ups now converge on a single `automation/memory-sync-queue` branch/PR so multiple merge events do not produce competing stale PRs.
- `sync_memory.py` records merge events idempotently and uses Asia/Seoul dates for `CURRENT.md`.
- Stale handoff snapshots belong in archive, not `work/active/`.
- `from memory.mk import mk` is backed by a repo-local wrapper and validated in the contract gate.
- Memory sync uses the engine uv environment instead of an unpinned global `pip install memkraft`; it intentionally matches Engine CI's non-locked `uv sync` because the current lock can drift during dependency repair work.
- The protocol validator enforces canonical `W-xxxx-slug` entries and ignores temporary human-readable PR rows until CURRENT.md is fully normalized.
- MemKraft `decision_record` tags must be passed as a list; comma strings are persisted as character lists in the current package.
- `.gitattributes` uses union merges for append-style MemKraft records and the repo `ours` merge driver for generated/cache or coordination files that automation must not overwrite.
- `app/scripts/dev/bootstrap-git-config.sh` installs `merge.ours.driver=true` so the `merge=ours` attributes behave consistently in local worktrees.
- `claim.sh` only scans active lock table rows for domain collisions.
- `design/current/invariants.yml` is the machine-readable design contract. The verifier checks Svelte props, required file contents, absent duplicate memory roots, forbidden imports, and ignored generated state.
- `./tools/start.sh` prints a design status summary; `./tools/end.sh` runs the full verifier before releasing the agent lock.
- Design verification is a required PR workflow via `.github/workflows/design-verify.yml`.

## Next Steps

1. Commit and push the Phase 3 design verification changes on `feat/multi-agent-os-slash-commands`.
2. Confirm PR #335 runs the new Design Verify workflow plus existing app/engine/contract checks.
3. Follow up with broader invariants only when contracts are ready to become stricter.

## Exit Criteria

- Required CI checks are present for every PR.
- Memory sync no longer attempts a direct protected-branch push.
- Memory sync uses one queue PR instead of one stale branch per merged PR.
- Merge attributes prevent memory-sync queue branches from overwriting active coordination state.
- Active state starts from `CURRENT.md` plus listed work items only.
- Runtime SQLite artifacts do not dirty the worktree.
- `./tools/verify_design.sh` passes locally and in CI.
- Agent boot output reports `Design status: sync`.

## Handoff Checklist

- active work item: `work/active/W-0163-ci-agent-governance.md`
- branch: `feat/multi-agent-os-slash-commands` (PR #335)
- verification:
  - YAML parse / workflow inspection: pass
  - App check/test: pass
  - Contract gate with MemKraft protocol validation: pass
  - Engine full pytest: pass
  - branch protection check update via GitHub API: `enforce_admins=true`, required contexts present
  - `git check-ignore` for feature window SQLite: pass
  - PR #322 local contract gate: pass
  - design verification: pass
  - design verifier failure smoke test: pass
- remaining blockers:
  - `MEMORY_SYNC_TOKEN` can still be added later to avoid manual workflow dispatch fallback.
