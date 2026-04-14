# Usability Foundation Sprint 0

Date: 2026-03-10
Status: active implementation authority
Scope: `/Users/ej/Downloads/wtd-clones/frontend`

## 1. Purpose

Land the shared usability primitives from [usability-redesign-spec-2026-03-09.md](/Users/ej/Downloads/wtd-clones/frontend/docs/archive/historical/root-cleanup-2026-03-17/usability-redesign-spec-2026-03-09.md#L1) and the Sprint 0 slice described in `/Users/ej/.claude/plans/elegant-giggling-quokka.md`.

Sprint 0 exists to prevent each route from inventing its own:

1. loading skeleton
2. freshness chip
3. inline important banner
4. critical confirmation modal
5. progressive onboarding hint
6. page-level zero state
7. position risk visualization

## 2. Scope

This slice is additive only.

Allowed:

1. add shared components under `src/components/shared`
2. add freshness utilities under `src/lib/utils`
3. update canonical docs that describe the new shared boundaries

Not allowed:

1. route-level UI rewrites
2. arena chart WIP cleanup
3. passport tab refactors
4. navigation or home cutover work from later sprints

## 3. Canonical Files

Shared components:

1. [SkeletonLoader.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/SkeletonLoader.svelte#L1)
2. [FreshnessIndicator.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/FreshnessIndicator.svelte#L1)
3. [InlineBanner.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/InlineBanner.svelte#L1)
4. [CriticalModal.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/CriticalModal.svelte#L1)
5. [OnboardingHint.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/OnboardingHint.svelte#L1)
6. [ZeroState.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/ZeroState.svelte#L1)
7. [PositionRiskBar.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/PositionRiskBar.svelte#L1)

Utility:

1. [freshness.ts](/Users/ej/Downloads/wtd-clones/frontend/src/lib/utils/freshness.ts#L1)

## 4. Decisions

## 4.1 Freshness is a shared contract, not a route-local ternary

`fresh / aging / stale / unknown` status must come from [freshness.ts](/Users/ej/Downloads/wtd-clones/frontend/src/lib/utils/freshness.ts#L1), not ad-hoc `Date.now() - updatedAt` branches spread across terminal, signals, or passport surfaces.

## 4.2 Shared usability primitives must stay presentation-first

These components are intentionally generic so later route slices can adopt them without dragging route stores into the shared layer.

Examples:

1. [ZeroState.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/ZeroState.svelte#L1) accepts CTA callbacks and optional hrefs, but does not own navigation policy
2. [OnboardingHint.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/OnboardingHint.svelte#L1) persists only a local seen flag and does not own milestone logic
3. [CriticalModal.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/CriticalModal.svelte#L1) wraps [ModalShell.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/ui/ModalShell.svelte#L1) and keeps destructive confirmation copy outside route shells

## 4.3 Sprint 0 must not absorb unrelated worktree WIP

The active branch already contains unrelated arena chart and `arena-v2` WIP. Sprint 0 is valid only if the commit stays limited to the shared foundation layer and supporting docs.

## 5. Validation

Required before push:

1. `npm run check`
2. `npm run build`
3. `npm run docs:check`
4. `npm run ctx:check -- --strict`
5. `npm run gate`

## 6. Next

Once Sprint 0 lands cleanly:

1. Sprint 1 can consume these primitives while changing navigation
2. Sprint 2 can rebuild `/` on top of [ZeroState.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/ZeroState.svelte#L1) and [OnboardingHint.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/OnboardingHint.svelte#L1)
3. Sprint 4 can add [FreshnessIndicator.svelte](/Users/ej/Downloads/wtd-clones/frontend/src/components/shared/FreshnessIndicator.svelte#L1) to terminal without redefining freshness semantics
