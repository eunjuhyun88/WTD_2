# Passport Product Spec

Purpose:
- Short product spec for the profile, proof, and future on-chain passport slice.

## Primary User Job

Provide durable proof, holdings, and long-term on-chain identity evidence without replacing `Agent HQ`.

## Surface Role In The Official IA

`Passport` is not part of the main builder nav loop today, but it remains a distinct phase-2 surface.

Its long-term responsibilities include:
- on-chain or publishable track record
- holdings and inventory proof
- performance history and revenue evidence
- specialization tiers and badges backed by durable state

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
- Passport should not duplicate the doctrine and memory responsibilities of `Agent HQ`.
- Badge and mission surfaces should be compatible with the system's data-coverage goals.
- Contribution, calibration, and weak-spot feedback should remain explainable from durable records.
- Current route-level wallet and positions affordances should stay consistent with those durable records even when holdings fall back to demo data.
- Revenue or licensing claims must stay evidence-backed and server-derived.

## Target IA

- primary route: `/passport`
- current status: secondary / phase-2 proof surface
- long-term role: publishable or on-chain track record layer

## Supporting Docs

- `docs/design-docs/cogochi-uiux-architecture.md`
- `docs/design-docs/unified-product-model.md`
- `docs/product-specs/agents.md`
- `docs/design-docs/learning-loop.md`
- `docs/references/active/PASSPORT_BACKEND_ARCHITECTURE_v1_2026-02-25.md`
- `docs/references/active/PASSPORT_ML_ORPO_LEARNING_ARCHITECTURE_v2_2026-02-25.md`
- `docs/API_CONTRACT.md`
