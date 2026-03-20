# Warning Cleanup Priority (2026-03-06)

Baseline command:

```bash
npm run check
```

Current baseline in `frontend`:

- `0 errors`
- `0 warnings`
- `0 files`

## Status

- Warning backlog is closed.
- `npm run check`, `npm run build`, and `npm run check:budget` all pass with a zero-warning baseline.
- Any new warning is now treated as a regression, not as part of an accepted cleanup backlog.

## What Was Cleared

- `TokenDropdown.svelte`, `PhaseGuide.svelte`: runes capture/reactivity warnings
- `PokemonFrame.svelte`: deprecated slot rendering
- `HPBar.svelte`, `TypewriterBox.svelte`, `PhaseTransition.svelte`: shared self-closing tag warnings
- `arena-v2/{BattleScreen,BattleMissionView,BattleChartView,BattleCardView,ResultScreen}.svelte`: self-closing tag and accessibility/legacy ignore warnings
- `arena-v2/HypothesisScreen.svelte`: runes reactivity + slider compatibility warnings
- `arena-v2/DraftScreen.svelte`: slider compatibility warning

## Maintenance Order If Warnings Reappear

1. Fix runes correctness warnings first (`non_reactive_update`, `state_referenced_locally`).
2. Fix deprecated slot/render usage next.
3. Fix markup/a11y warnings before adding more cleanup work.
4. Keep CSS compatibility warnings from accumulating; they are small individually but noisy in aggregate.

## Guardrails Added

- `npm run guard:workspace`:
  - Blocks push/gate from deprecated local workspace name `frontend-passport`.
- `npm run check:budget`:
  - Fails if warnings exceed budget (`WARNING_BUDGET`, default `49`).
- CI check job now runs `guard:workspace` and `check:budget`.
- Operational baseline:
  - keep `0 warnings` as the expected steady state
