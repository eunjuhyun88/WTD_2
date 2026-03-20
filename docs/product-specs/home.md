# Home Product Spec

Purpose:
- Short product spec for the landing, activation entry, and first-action path.

## Primary User Job

Help the user understand what they can own, improve, and eventually monetize, then start the loop without unnecessary setup drag.

## Surface Role In The Merged Product

Home must explain, in plain language, that the product is:
- a place to create an agent
- train that agent's brain in `Terminal`
- send the prepared agent into `World`
- fight whale encounters in `Battle`
- review growth, record, share, and rental state in `Agent`
- later distribute proven specialists through the secondary `Signals / Market` layer

## Current Route Shape

- `/` currently behaves as a hero-led landing route, not a signup/demo wizard.
- The hero supports feature exploration:
  - desktop swaps hero detail content inline
  - mobile opens a feature bottom sheet
- Primary CTA routes into `/terminal`.
- Secondary CTA is wallet-gated:
  - connected users can enter `/arena`
  - disconnected users get wallet connect
- Funnel events are part of the route contract today.
- Use `docs/page-specs/home-onboarding.md` for the detailed route contract.

## Required Message Order

Home should communicate the loop in this order:
1. own or activate a character-agent
2. train its brain in `Terminal`
3. deploy it into `World`
4. resolve encounters in `Battle`
5. grow proof, shareability, and rental readiness in `Agent`

If Home cannot communicate those five steps quickly, the surface is failing.

## Core Flows

1. Land on the home route and understand the product promise.
2. Explore one feature path without leaving the hero context.
3. Choose the next action:
   - create an agent
   - inspect the loop
   - continue into setup if already eligible
4. Understand that monetization is downstream of proof, not the first action.

## Product Constraints

- The first valuable path should remain available without forced wallet connection.
- The page should explain the product through the hero, not through a long setup checklist.
- The hero should communicate the agent create -> terminal train -> world deploy -> battle -> grow loop faster than any lore or worldbuilding detail.
- The hero should make the ownership -> readiness -> deployment -> proof progression more obvious than any market-jargon or operator-console copy.
- Desktop and mobile feature exploration should remain semantically aligned.
- Landing analytics should reflect the real current CTA paths.
- Home should not read like a direct shortcut into `Terminal`.
- Public earnings or rental upside can be mentioned, but only after ownership and evidence are legible.

## Target IA

- Primary CTA: `Create My Agent`
- Target handoff: `/create`
- Secondary CTA: `See The Loop`
- Returning-user CTA: progress-aware handoff into the next eligible surface
- Home should stop behaving like a direct shortcut into the operator console.

## Supporting Docs

- `docs/page-specs/home-onboarding.md`
- `docs/PRODUCT_SENSE.md`
- `docs/design-docs/six-surface-game-loop.md`
- `docs/design-docs/unified-product-model.md`
- `docs/product-specs/create-agent.md`
