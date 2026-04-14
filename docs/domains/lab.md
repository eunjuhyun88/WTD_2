# Domain: Lab

## Goal

Serve as the Day-1 challenge workbench for Evaluate + Inspect + Iterate.
`/lab` is the only surface where challenge evaluation runs and instance inspection are canonical.

## Canonical Areas

- `app/src/routes/lab`
- `app/src/lib/server/challengesApi.ts`
- `app/src/lib/server/runnerApi.ts`
- `app/src/routes/api/challenges`
- `docs/domains/contracts.md`
- `docs/product/pages/00-system-application.md`
- `docs/product/pages/03-lab.md`

## Boundary

- Owns challenge list/detail rendering, evaluate-run UX, and run log streaming display.
- Owns parse/render of run summary fields and instance table UX.
- Owns deep links between lab and terminal (`slug`, `instance` context).
- Does not own challenge composition authoring flow (terminal-owned entry point).
- Does not own indicator math, block execution math, or scoring model internals.

## Inputs

- selected challenge slug
- evaluate requests initiated by user action
- filesystem challenge artifacts (`answers.yaml`, `match.py`, `instances.jsonl`)
- stream output from server-side runner bridge
- route params/query params for deep-link hydration

## Outputs

- challenge detail panel with contract-backed block sections
- streamed run output and parsed score summary
- instance rows with deterministic deep links back to terminal context
- clear failure state when run or parse fails

## Layout Contract

Desktop baseline is a two-pane workbench:

- left pane: challenge list
- right pane: selected challenge detail + run + output + instances

Lab should preserve selected row context while run is in progress and after completion.

## Evaluate Run Contract

Run action triggers challenge evaluation through server-side subprocess bridge.
Expected parsed summary fields:

- `SCORE`
- `N_INSTANCES`
- `N_SYMBOLS_HIT`
- `MEAN_OUTCOME`
- `POSITIVE_RATE`
- `TOTAL_SECONDS`

Contract note:

- low-instance outcomes may map to sentinel score semantics

## Artifact Contract

Challenge artifact expectations:

- `answers.yaml`: canonical challenge metadata and blocks
- `match.py`: generated/editable matching implementation
- `prepare.py`: evaluator runner entry
- `output/instances.jsonl`: per-instance evaluation output rows

Lab may display `match.py` as read-mostly inspection in Day-1.

## Deep-Link Contract

- `/lab?slug=<slug>`: open and select challenge
- `/terminal?slug=<slug>&instance=<ts>`: inspect chosen instance in terminal context

## Error and Degradation Contract

- Stream errors must be visible in run output area.
- Partial logs should be preserved if run fails.
- A single failing run should not blank challenge metadata panel.

## Related Files

- `app/src/routes/lab/+page.svelte`
- `app/src/routes/api/challenges/*`
- `app/src/lib/server/challengesApi.ts`
- `app/src/lib/server/runnerApi.ts`
- `docs/domains/evaluation.md`
- `docs/domains/contracts.md`

## Non-Goals

- direct engine logic duplication
- marketing or thesis copy ownership
- character/stage/archetype UI ownership
- adapter training control ownership (Phase 2+)

## Acceptance Checks

- challenge list selection and detail slug stay consistent
- evaluate action streams output and renders summary parse
- instances render from output artifact and deep-link to terminal
- run failure handling preserves context and logs
