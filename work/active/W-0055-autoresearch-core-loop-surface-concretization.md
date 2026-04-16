# W-0055 AutoResearch Core Loop Surface Concretization

## Goal

Concretize the canonical product design so Cogochi is specified consistently as a `trade review -> Save Setup -> AutoResearch -> verdict ledger -> refinement` system across the Day-1 surfaces and supporting domain docs.

## Owner

research

## Scope

- refine the Terminal contract so capture can start from timestamp-only review, timestamp + hint, or explicit conditions
- refine the Home, Lab, Dashboard, and global system product specs around the updated core loop
- make AutoResearch an explicit cross-surface engine role rather than a vague later ML add-on
- align scanner/alerts and autoresearch domain docs to the same capture-first lifecycle

## Non-Goals

- changing engine runtime behavior or app route contracts in this slice
- redesigning frozen home implementation visuals
- renaming internal `challenge` route/type identifiers

## Canonical Files

- `AGENTS.md`
- `work/active/W-0055-autoresearch-core-loop-surface-concretization.md`
- `docs/product/pages/00-system-application.md`
- `docs/product/pages/01-home.md`
- `docs/product/pages/02-terminal.md`
- `docs/product/pages/03-lab.md`
- `docs/product/pages/04-dashboard.md`
- `docs/domains/terminal.md`
- `docs/domains/scanner-alerts.md`
- `docs/domains/autoresearch-ml.md`

## Facts

- the refined core loop is now documented as trade review and `Save Setup` originating in `/terminal`
- download design docs consistently describe the real moat as captured trader judgment plus market-wide search plus verdict accumulation
- newer v2 design drafts shift the architecture from rule-authoring toward example-based pattern registration, similarity search, and deterministic scoring over saved review evidence
- multiple design references agree that LLM should parse and explain, but not act as the final trading judge
- current canonical Home/Lab/Dashboard/scanner/autoresearch docs still under-specify how AutoResearch fits between capture and feedback
- dashboard currently treats signal alerts as optional even though feedback and alert review are essential to the loop

## Assumptions

- Day-1 can keep `challenge` as the lab evaluation artifact while still treating `capture` as the core-loop input
- AutoResearch should be specified as a layered search/monitoring system first, with heavier ML phases remaining downstream
- terminal can remain query-capable while still treating example/timestamp capture as the primary pattern-registration path

## Open Questions

- whether a later slice should rename user-facing dashboard section labels from `My Challenges` to `My Setups` without changing route semantics

## Decisions

- Home should explain the system as `capture -> scan -> judge -> deploy`, with AutoResearch named inside the scan step
- Terminal should explicitly support three Day-1 registration modes: timestamp-only capture, timestamp + hint capture, and explicit-condition capture
- Terminal should describe LLM as a parsing/explanation layer and keep deterministic scoring/search authority in engine/ML layers
- Lab should be specified as the place where saved setups are evaluated, patternized, and prepared for live monitoring
- Dashboard should canonically include signal-alert feedback handling as part of the Day-1 inbox, not as an optional side section

## Next Steps

1. update the product page specs for Home, Lab, Dashboard, and the global system guide
2. update scanner/alerts and autoresearch domain docs to the same lifecycle
3. summarize the resulting concrete product definition for future implementation slices

## Exit Criteria

- the canonical docs describe one coherent capture-first, AutoResearch-enabled product loop
- surface ownership is explicit for Home, Lab, Dashboard, and alert feedback handling
- future work can build from these docs without re-deriving the product definition from downloads or chat

## Handoff Checklist

- this slice is documentation design only; no runtime or route changes are included
- keep `capture` as the loop input, `challenge` as the lab evaluation artifact, and `AutoResearch` as the market-wide expansion engine
