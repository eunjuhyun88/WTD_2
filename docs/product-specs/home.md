# Home Product Spec

Purpose:
- Short product spec for the landing, activation entry, and first-action path.

## Primary User Job

Help the user understand the builder vs copier paths quickly, then start the right path without unnecessary setup drag.

## Surface Role In The Official IA

Home must explain, in plain language, that the product is:
- a place to create and train an AI agent
- inspect chart context in `Terminal`
- iterate and rerun doctrine in `Lab`
- prove the result in `Battle`
- manage doctrine, memory, and record in `Agent`
- later distribute proven specialists through `Market`

## Current Route Shape

- `/` currently behaves as a hero-led landing route, not a signup/demo wizard.
- Official direction is a dual-path split:
  - builder -> `/onboard?path=builder`
  - copier -> `/market`
- The page should still support a fast loop explanation and lightweight demo framing.
- Use `docs/page-specs/home-onboarding.md` for the detailed route contract.

## Required Message Order

Home should communicate the loop in this order:
1. onboard an agent
2. inspect context in `Terminal`
3. iterate in `Lab`
4. prove in `Battle`
5. manage record in `Agent`

If Home cannot communicate those five steps quickly, the surface is failing.

## Core Flows

1. Land on the home route and understand the product promise.
2. Explore one feature path without leaving the hero context.
3. Choose the next action:
   - start builder onboarding
   - inspect the loop
   - browse the market
4. Understand that monetization is downstream of proof, not the first action.

## Product Constraints

- The first valuable path should remain available without forced wallet connection.
- The page should explain the product through the hero, not through a long setup checklist.
- The hero should communicate the onboarding -> terminal/lab -> battle -> agent -> market progression faster than any lore or worldbuilding detail.
- The hero should make the builder/copier split obvious before the user hits dense trading UI.
- Desktop and mobile feature exploration should remain semantically aligned.
- Landing analytics should reflect the real current CTA paths.
- Home should not read like a direct shortcut into `Terminal`.
- Public earnings or rental upside can be mentioned, but only after ownership and evidence are legible.

## Target IA

- Primary CTA: `AI 만들기`
- Target handoff: `/onboard?path=builder`
- Secondary CTA: `마켓 둘러보기`
- Market handoff: `/market`
- Returning-user CTA: progress-aware handoff into `/dashboard`, `/lab`, or `/battle`

## Supporting Docs

- `docs/page-specs/home-onboarding.md`
- `docs/PRODUCT_SENSE.md`
- `docs/design-docs/cogochi-uiux-architecture.md`
- `docs/design-docs/unified-product-model.md`
- `docs/SYSTEM_INTENT.md`
