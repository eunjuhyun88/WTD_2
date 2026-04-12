# Usability Navigation Sprint 1

Date: 2026-03-10
Status: active implementation authority
Scope: `/Users/ej/Downloads/maxidoge-clones/frontend`

## 1. Purpose

Apply the navigation rules from [usability-redesign-spec-2026-03-09.md](/Users/ej/Downloads/maxidoge-clones/frontend/docs/archive/historical/root-cleanup-2026-03-17/usability-redesign-spec-2026-03-09.md#L497):

1. Header = `Home | Terminal | Arena | Signals | Passport`
2. mobile primary navigation = fixed bottom bar
3. `Agents` and `Settings` = secondary navigation
4. deep-link state should be shared and reusable instead of hand-built in each page

This sprint consumes the Sprint 0 foundation layer but does not yet rework route bodies.

Primary sources:

1. [usability-redesign-spec-2026-03-09.md](/Users/ej/Downloads/maxidoge-clones/frontend/docs/archive/historical/root-cleanup-2026-03-17/usability-redesign-spec-2026-03-09.md#L1)
2. [usability-foundation-sprint-0-2026-03-10.md](/Users/ej/Downloads/maxidoge-clones/frontend/docs/exec-plans/active/usability-foundation-sprint-0-2026-03-10.md#L1)

## 2. Scope

Allowed:

1. change [Header.svelte](/Users/ej/Downloads/maxidoge-clones/frontend/src/components/layout/Header.svelte#L1)
2. change [routes/+layout.svelte](/Users/ej/Downloads/maxidoge-clones/frontend/src/routes/+layout.svelte#L1)
3. add [MobileBottomNav.svelte](/Users/ej/Downloads/maxidoge-clones/frontend/src/components/layout/MobileBottomNav.svelte#L1)
4. add [deepLinks.ts](/Users/ej/Downloads/maxidoge-clones/frontend/src/lib/utils/deepLinks.ts#L1)

Not allowed:

1. terminal/signal/passport route-body rewrites
2. arena chart WIP cleanup
3. route-specific handoff rewiring beyond shared deep-link primitives

## 3. Decisions

## 3.1 Header owns desktop primary navigation only

The old mobile tab strip in [Header.svelte](/Users/ej/Downloads/maxidoge-clones/frontend/src/components/layout/Header.svelte#L1) is removed. Mobile primary navigation now belongs only to [MobileBottomNav.svelte](/Users/ej/Downloads/maxidoge-clones/frontend/src/components/layout/MobileBottomNav.svelte#L1).

## 3.2 Home is represented by the logo, not a duplicated nav tab

This keeps the primary tab count at four on mobile and five entry points overall:

1. logo -> `/`
2. terminal
3. arena
4. signals
5. passport

## 3.3 Secondary routes map back to primary areas

Active-state rules should keep orientation predictable:

1. `/arena-war` and `/arena-v2` map to `Arena`
2. `/settings` and `/agents` map to `Passport`

## 3.4 Deep-link construction is shared

[deepLinks.ts](/Users/ej/Downloads/maxidoge-clones/frontend/src/lib/utils/deepLinks.ts#L1) is now the canonical builder for:

1. `/terminal?pair=...&tf=...`
2. `/terminal?copyTrade=1&...`
3. `/signals?view=ai`
4. `/passport?tab=positions`
5. `/arena?mode=war`

This avoids every route or card component rebuilding query strings by hand.

## 4. Validation

Required before push:

1. `npm run check`
2. `npm run build`
3. `npm run docs:check`
4. `npm run ctx:check -- --strict`
5. `npm run gate`

## 5. Next

After this sprint:

1. Sprint 2 can rebuild `/` around the new navigation shell
2. Signals and terminal handoffs should migrate to [deepLinks.ts](/Users/ej/Downloads/maxidoge-clones/frontend/src/lib/utils/deepLinks.ts#L1)
3. later mobile route work should reuse [MobileBottomNav.svelte](/Users/ej/Downloads/maxidoge-clones/frontend/src/components/layout/MobileBottomNav.svelte#L1) instead of recreating page-local nav chrome
