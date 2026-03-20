# Passport Product Spec

Purpose:
- Short product spec for the legacy implementation slice that will be absorbed into `Agent`.

## Primary User Job

Provide the current durable proof and holdings slice while the final `Agent` hub is still being assembled.

## Surface Role In The Merged Product

`Passport` is no longer a target primary-nav surface in the final IA.

Its responsibilities will be absorbed into `Agent`:
- durable proof
- holdings and inventory
- performance and track record
- badges, specialization tiers, and history
- future revenue or rental evidence

## Current Route Shape

- `/passport` currently operates as a four-tab route: `wallet`, `positions`, `profile`, and `arena`.
- The route already treats holdings sync, open/closed positions, avatar/name edits, and learning actions as first-class features.
- Live holdings can fall back to demo holdings when sync is unavailable.
- Use `docs/page-specs/passport-page.md` for the actual route contract; keep this file focused on Passport's surface intent.

## Core Flows

1. Load profile and progression.
2. Show badges, tiers, owned assets, and history.
3. Reflect durable actions and outcomes from other surfaces.
4. Surface learning, performance, and future earnings artifacts without letting the client author them.

## Product Constraints

- Profile and badge state are server-derived or server-validated.
- The UI should not imply earned state that the server cannot justify.
- Passport should act as a migration slice toward `Agent`, not as a forever-separate primary product.
- Badge and mission surfaces should be compatible with the system's data-coverage goals.
- Contribution, calibration, and weak-spot feedback should remain explainable from durable records.
- Current route-level wallet and positions affordances should stay consistent with those durable records even when holdings fall back to demo data.
- Revenue or licensing claims must stay evidence-backed and server-derived.

## Target IA

- final destination: `Agent > Record`
- current route remains `/passport` until the merge lands

## Supporting Docs

- `docs/design-docs/six-surface-game-loop.md`
- `docs/design-docs/unified-product-model.md`
- `docs/product-specs/agents.md`
- `docs/design-docs/learning-loop.md`
- `docs/references/active/PASSPORT_BACKEND_ARCHITECTURE_v1_2026-02-25.md`
- `docs/references/active/PASSPORT_ML_ORPO_LEARNING_ARCHITECTURE_v2_2026-02-25.md`
- `docs/API_CONTRACT.md`
