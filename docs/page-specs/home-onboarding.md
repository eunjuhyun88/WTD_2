# Home And Onboarding

Route scope:
- `/`

Purpose:
- Define the landing-page contract as it exists now, while making the six-surface migration target explicit.

## Primary User Job

- Understand the product promise from the hero without leaving the page.
- Explore one feature path quickly and understand the next eligible action from the hero CTA group.

## Core Flow

1. Hero intro animates in and logs a `hero_view` funnel event.
2. User explores the feature rail:
   - desktop swaps hero detail content in place
   - mobile opens a feature bottom sheet instead of swapping the desktop pane
3. Primary CTA always takes the user to `/terminal`.
4. Secondary CTA either opens wallet connect or enters `/arena`, depending on current wallet state.
5. Connected-wallet state is reflected directly in the hero CTA area.

## Target Migration Contract

When the route is migrated to the final IA:

1. Primary CTA moves from `/terminal` to `/create`.
2. Hero copy explains the loop in this order:
   - create an agent
   - train it in `Terminal`
   - deploy it into `World`
   - resolve encounters in `Battle`
   - grow and publish proof in `Agent`
3. Secondary CTA stops acting like a wallet gate and becomes a loop-explainer or progression-explainer action.
4. Returning-user CTA may route to the next eligible surface based on durable progression state.

## Guardrails

- Do not block the primary Terminal path on wallet connection.
- Desktop wheel capture inside the hero must disable when reduced-motion is preferred and stop once the hero is out of view.
- Mobile bottom-sheet content and desktop hero-detail content must stay semantically aligned.
- Funnel events must reflect the real CTA and feature interactions, not an outdated signup/demo story.
- Migration should not reintroduce a fake demo/signup funnel or a dense market-workstation first impression.

## Key UI Blocks

- animated hero and positioning copy
- feature rail with desktop detail swap
- mobile feature bottom sheet
- primary CTA to `/terminal`
- secondary CTA for wallet connect or `/arena`
- wallet/address status chip when already connected
- loop explanation blocks for ownership, readiness, deployment, and proof

## State Authority

- selected feature and mobile sheet: route local
- wallet connection and short address: `walletStore`
- profile summary used in hero chrome: `userProfileStore`
- funnel instrumentation: client analytics events
- future progression-aware CTA routing: durable agent progression state, not hero-local flags

## Supporting APIs And Data

- route handoff targets: `/terminal`, `/arena`
- wallet modal / connect flow from `walletStore`
- hero content and funnel names from `components/home/homeData`

## Failure States

- docs describe signup/demo states that the route no longer exposes
- wallet connect appears as the first or only action
- mobile bottom sheet traps interaction or diverges from desktop feature detail
- hero wheel capture keeps intercepting scroll outside the intended section
- Home still reads like a direct Terminal shortcut after the IA migration is meant to land

## Read These First

- `docs/SYSTEM_INTENT.md`
- `docs/PRODUCT_SENSE.md`
- `docs/product-specs/index.md`

## Applied Source Inputs

- `2026-03-01__STOCKCLAW_PRD_A01.md`
- `2026-02-20__STOCKCLAW_UserJourney_Lifecycle_v1.docx`
