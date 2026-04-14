# W-0013 Launch Readiness Program

## Goal

Keep one canonical launch-readiness reference for the future point when the project approaches first external deployment, without letting launch work outrank the current research-first local-development program.

## Owner

contract

## Scope

- define launch-readiness gates across runtime, contracts, testing, and operational state planes
- summarize the top launch blockers with explicit owners and linked work items
- connect route-tier policy to runtime-plane policy for public, engine, and worker/control execution
- update release/runbook docs so launch reviews do not rely on chat history

## Non-Goals

- implementing worker/control-plane extraction
- rewriting route handlers or engine logic in this work item
- changing product copy or UI behavior
- selecting a production cloud vendor

## Canonical Files

- `work/active/W-0013-launch-readiness-program.md`
- `docs/runbooks/launch-readiness.md`
- `docs/runbooks/release-checklist.md`
- `app/docs/references/active/API_ROUTE_TIER_INVENTORY_2026-04-12.md`
- `work/active/W-0006-full-architecture-refactor-design.md`
- `work/active/W-0012-runtime-split-and-state-plane.md`

## Decisions

- public launch readiness must be reviewable from canonical docs, not inferred from scattered work items
- runtime-plane separation, shared hot-state promotion, and route-level contract/testing depth are launch-critical gates
- disabled-by-default control-plane routes on the web origin still count as launch debt until they are moved or formally isolated
- launch blockers should be grouped by operational risk, not by folder alone
- while the repository remains local-only and undeployed, this work item is reference-only and should not outrank P0/P1 research pipeline work

## Next Steps

- keep launch blockers documented so future deployment work starts from reality, not memory
- defer implementation of launch-only tasks until the project has a real deployment path
- add targeted route-level tests only when they directly protect current local inference/research workflows
- promote route inventory updates whenever new `/api/*` paths are added or reclassified

## Exit Criteria

- launch blockers are listed canonically with owner and execution order
- release/runbook docs point reviewers to one launch-readiness source
- route inventory now reflects runtime-plane policy in addition to route tier
- future refactor slices can reference one launch program instead of re-deriving priorities
