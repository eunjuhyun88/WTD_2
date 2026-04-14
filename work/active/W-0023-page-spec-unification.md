# W-0023 Page Spec Unification

## Goal

Unify Day-1 surface behavior by introducing page-specific product contracts and a global application guide.

## Scope

- Add global surface application doc
- Add page specs for `/`, `/terminal`, `/lab`, `/dashboard`
- Connect canonical references from product/domain docs

## Non-Goals

- No route implementation changes
- No engine contract/schema rewrites
- No deferred surface activation

## Canonical Files

- `docs/product/pages/00-system-application.md`
- `docs/product/pages/01-home.md`
- `docs/product/pages/02-terminal.md`
- `docs/product/pages/03-lab.md`
- `docs/product/pages/04-dashboard.md`
- `docs/product/surfaces.md`
- `docs/domains/app-route-inventory.md`

## Decisions

- Day-1 vocabulary is fixed to challenge-first wording.
- Page specs are split by route to avoid monolithic drift.
- Global checklist is centralized so all surface changes use one gate.

## Next Steps

1. Align existing route implementations to acceptance checks.
2. Add route-level checklists to active work items touching surfaces.
3. Add lightweight doc lint/check in CI for page-spec references.

## Exit Criteria

- Page-spec docs exist and are linked from canonical product surface doc.
- Domain inventory references the application guide.
- Team can map each active Day-1 route to a single detailed spec.
