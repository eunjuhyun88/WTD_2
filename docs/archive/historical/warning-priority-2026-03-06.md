# Warning Cleanup Priority (2026-03-06)

Baseline command:

```bash
npm run check
```

Current baseline in `frontend`:

- `0 errors`
- `49 warnings`
- `17 files`

## Priority Table

| Priority | Warning Type | Count | Why | First Target Files |
|---|---|---:|---|---|
| P1 | `a11y_label_has_associated_control` | 11 | Accessibility and form usability impact | `src/components/arena-war/HumanCallPhase.svelte`, `src/components/arena-war/SetupPhase.svelte` |
| P1 | `slot_element_deprecated` | 1 | Svelte 5 forward-compat risk | `src/components/shared/PokemonFrame.svelte` |
| P2 | `element_invalid_self_closing_tag` | 23 | HTML parsing ambiguity, hydration mismatch risk | `src/components/arena-v2/BattleScreen.svelte`, `src/components/arena-v2/ResultScreen.svelte`, `src/components/shared/TypewriterBox.svelte` |
| P3 | `export_let_unused` | 10 | Noise + unclear component API surface | `src/components/arena-v2/*.svelte`, `src/components/arena/views/ChartWarView.svelte` |
| P3 | CSS compatibility (`appearance`) | 3 | Cross-browser polish issue | `src/components/arena-v2/DraftScreen.svelte`, `src/components/arena-v2/HypothesisScreen.svelte` |
| P4 | Empty CSS ruleset | 1 | Low risk cleanup | `src/components/arena/ChartPanel.svelte` |

## Cleanup Order

1. P1 accessibility + deprecated slot.
2. P2 self-closing tag normalization.
3. P3 unused exports and CSS compatibility.
4. P4 cosmetic cleanup.

## Guardrails Added

- `npm run guard:workspace`:
  - Blocks push/gate from deprecated local workspace name `frontend-passport`.
- `npm run check:budget`:
  - Fails if warnings exceed budget (`WARNING_BUDGET`, default `49`).
- CI check job now runs `guard:workspace` and `check:budget`.
