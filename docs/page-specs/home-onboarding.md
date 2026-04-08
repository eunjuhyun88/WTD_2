# Home Page

Route scope:
- `/`

Purpose:
- Define the landing-page contract around the official builder/copier split.

## Primary User Job

- Understand the product promise from the hero without leaving the page.
- Choose the right first path quickly from the hero CTA group.

## Core Flow

1. Hero intro animates in and logs a `hero_view` funnel event.
2. User sees the builder/copier split and a lightweight demo or loop explanation.
3. Primary CTA routes builders into `/onboard?path=builder`.
4. Secondary CTA routes copiers into `/market`.
5. Returning-user state may route to a progress-aware continuation target.

## Official Contract

1. Hero copy explains the loop in this order:
   - onboard an agent
   - inspect chart context in `Terminal`
   - iterate in `Lab`
   - prove in `Battle`
   - manage record in `Agent`
2. Builder CTA should not drop users into dense analysis UI first.
3. Copier CTA should land in the public market flow, not in private builder surfaces.
4. Returning-user CTA may route to the next eligible surface based on durable progression state.

## Guardrails

- Do not force wallet connection before the user understands the builder/copier choice.
- Builder CTA should not jump directly into `Terminal`.
- Funnel events must reflect the real CTA and feature interactions, not an outdated terminal-first story.
- The page should not feel like a generic exchange dashboard.

## Key UI Blocks

- animated hero and positioning copy
- builder / copier path cards
- primary CTA to `/onboard?path=builder`
- secondary CTA to `/market`
- loop explanation blocks for onboarding, analysis, lab, battle, and proof
- optional returning-user CTA

## State Authority

- selected feature and mobile sheet: route local
- wallet connection and short address: `walletStore`
- profile summary used in hero chrome: `userProfileStore`
- funnel instrumentation: client analytics events
- progression-aware CTA routing: durable agent progression state, not hero-local flags

## Supporting APIs And Data

- route handoff targets: `/onboard`, `/market`, optional `/dashboard`
- wallet modal / connect flow from `walletStore`
- hero content and funnel names from `components/home/homeData`

## Failure States

- wallet connect appears as the first or only action
- home still reads like a direct Terminal shortcut
- builder and copier CTAs are visually ambiguous
- hero storytelling hides the actual next action

## Read These First

- `docs/SYSTEM_INTENT.md`
- `docs/PRODUCT_SENSE.md`
- `docs/product-specs/home.md`
- `docs/design-docs/cogochi-uiux-architecture.md`

## Applied Source Inputs

- `2026-03-01__STOCKCLAW_PRD_A01.md`
- `2026-02-20__STOCKCLAW_UserJourney_Lifecycle_v1.docx`
