# W-0125 Vercel Branch Deploy Guardrails

## Goal

Stop accidental Vercel auto-deploys from agent or default branches, while preserving a clean path to re-enable Git-based deploys with an explicit release branch.

## Owner

app

## Scope

- add repository-level Vercel branch deployment guardrails in `app/vercel.json`
- document the intended branch model for reconnecting Git safely
- promote the branch/deploy policy into repo-wide agent rule documents
- record the policy in app memory so future agents can recover it from files
- keep the change limited to deployment triggering behavior

## Non-Goals

- changing product or engine runtime behavior
- altering custom domain mappings or environment variables

## Canonical Files

- `work/active/W-0125-vercel-branch-deploy-guardrails.md`
- `AGENTS.md`
- `CLAUDE.md`
- `app/AGENTS.md`
- `app/CLAUDE.md`
- `app/vercel.json`
- `app/.vercel/project.json`
- `app/memory/live-notes/vercel-deploy-policy.md`

## Facts

- The `cogochi-2` Vercel project was linked from `app/.vercel/project.json`.
- Git auto-deploys were disconnected to stop repeated production deployments from ongoing automated edits.
- Vercel supports repository-level branch deployment filters through `git.deploymentEnabled` in `vercel.json`.
- Root `AGENTS.md` and `CLAUDE.md` are the first files agents read, so durable cross-agent policy belongs there.

## Assumptions

- The user wants Git auto-deploy re-enabled only after an explicit branch split.
- Future Git reconnect should allow a dedicated release branch to deploy while agent branches stay quiet.

## Open Questions

- Whether non-agent feature branches should keep preview deploys after reconnect.

## Decisions

- Add explicit deployment disables for `main`, `master`, `claude/*`, `claude-*`, `codex/*`, and `codex-*`.
- Leave `release` unspecified so it can remain deployable after Git reconnect and production-branch reassignment.
- Standardize one deploy lane: agent/default branches never auto-deploy; reconnect Git only after `vercel.json` guardrails are present; use `release` as the production branch when Git deploys are enabled.

## Next Steps

- commit and push the guardrail/doc changes on a clean setup branch
- create and push `release` from the guarded state
- reconnect Vercel Git integration and switch production branch to `release`

## Exit Criteria

- repository config prevents automatic Vercel deploys from the known agent/default branches
- repo rule docs and app memory encode the same deploy policy
- `release` exists as the explicit production lane for future Vercel Git deploys

## Handoff Checklist

- active work item: `work/active/W-0125-vercel-branch-deploy-guardrails.md`
- branch: `codex/w-0125-vercel-release-lane`
- verification: JSON parse of `app/vercel.json`, clean commit, pushed `release`, Vercel Git reconnected, production branch reassigned to `release`
- remaining blockers: remote Vercel production-branch change must succeed
