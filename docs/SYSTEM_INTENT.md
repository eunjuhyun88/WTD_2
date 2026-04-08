# CHATBATTLE System Intent

Purpose:
- Repo-local condensed brief for the official product direction.
- Read this before opening deeper page specs or implementation plans.
- Keep route work aligned to the adopted Cogochi UI/UX architecture.

Primary source:
- `docs/design-docs/cogochi-uiux-architecture.md`

Supporting sources:
- `docs/design-docs/unified-product-model.md`
- `docs/design-docs/arena-domain-model.md`
- `docs/design-docs/learning-loop.md`

## Product Thesis

CHATBATTLE is a character-anchored chart-training game.

Users do not just read signals. They:
- create or activate an agent through onboarding
- check their daily state in `Dashboard`
- analyze chart context in `Terminal` when needed
- iterate and compare doctrine in `Lab`
- prove the result in `Battle`
- manage doctrine, memory, and record in `Agent`
- later distribute proven agents through `Market`

The product should feel like a tight builder loop, not a trading terminal with unrelated pet screens attached.

## Official Surface Model

- `Home` (`/`)
  - split builder vs copier intent quickly
- `Onboard` (`/onboard`)
  - create the first usable agent and deliver the first battle taste
- `Dashboard` (`/dashboard`)
  - daily hub with battle quota, lab state, and recent activity
- `Terminal` (`/terminal`)
  - optional chart-analysis and doctrine-idea surface
- `Lab` (`/lab`)
  - main workbench for backtest, comparison, and rerun
- `Agent` collection (`/agent`)
  - roster and creation entry
- `Agent HQ` (`/agent/[id]`)
  - doctrine, memory, history, and record management
- `Battle` (`/battle`)
  - historical proof surface with daily quota
- `Market` (`/market`)
  - phase-2 marketplace for proven agents
- `Copy` (`/copy`)
  - phase-2 copy-trading surface
- `Passport` (`/passport`)
  - phase-2 on-chain track-record surface

## Primary Loops

### Builder

`/ -> /onboard?path=builder -> /dashboard -> /terminal (optional) -> /lab -> /battle -> /agent/[id] -> /market`

### Copier

`/ -> /market -> /copy -> optional onboarding`

### Researcher

`/ -> /terminal -> /lab/autorun -> /battle/tournament -> /market`

## Non-Negotiable Invariants

1. `Lab` is the main workbench.
   - It is the longest-dwell surface for builders.
   - Backtest, comparison, and rerun loops should converge there.

2. `Battle` is proof, not sandbox.
   - It exists to validate trained doctrine against historical context.
   - Daily battle limits and result legibility must remain obvious.

3. `Terminal` is optional but high-value.
   - It supports chart reading, zone detection, and idea generation.
   - It is not the only gateway into the product.

4. `Agent HQ` owns doctrine and memory management.
   - `/agent` is the collection surface.
   - `/agent/[id]` is the operational detail surface.

5. Progression must stay evidence-bound.
   - Win rate, battle history, doctrine versions, and memory cards are product truth.
   - Cosmetic identity can reinforce attachment but cannot replace proof.

6. Market access is downstream of proof.
   - Listing or subscription claims must come after visible battle and lab evidence.
   - Market language must stay aligned with release readiness.

7. Passport is a later proof layer, not today's primary hub.
   - Current route work may still expose holdings and profile state.
   - Long-term purpose is on-chain track record, not duplicating Agent HQ.

8. Server-authoritative domains stay server-authoritative.
   - Durable history, listings, holdings, rental state, tracked signals, and published records cannot rely on client-local truth.

9. `priceStore` remains the canonical live-price owner on the client.
   - Header, Terminal, Lab, and Battle should consume shared live-price truth instead of re-creating it.

10. Canonical docs must reflect the adopted IA.
   - Superseded six-surface docs can remain for history.
   - They no longer define the current official route model.

## Route Intent Summary

### Home
- Explain builder vs copier paths fast.
- Primary CTA should send builders into onboarding, not directly into Terminal.

### Onboard
- End with one usable agent plus a memorable first battle moment.

### Dashboard
- Show what to do today in seconds.
- Keep `Lab` and `Battle` handoff obvious.

### Terminal
- Help users inspect chart context and form doctrine hypotheses.
- Forward useful insight into `Lab` or `Agent HQ`.

### Lab
- Compare versions, run benchmark packs, and press `Run Again`.
- This is the center of the builder retention loop.

### Agent / Agent HQ
- Collection route manages roster.
- Detail route manages doctrine, memory, history, and record per agent.

### Battle
- Reveal historical context through play and result.
- Send users back to `Lab` or `Agent HQ` with better information.

### Market / Copy / Passport
- Secondary or later-phase surfaces.
- Consume proven agent evidence instead of replacing the builder loop.

## When To Open Larger Docs

- Open `docs/design-docs/cogochi-uiux-architecture.md` when you need the official IA, page structure, and route hierarchy.
- Open `docs/product-specs/home.md`, `docs/product-specs/terminal.md`, `docs/product-specs/agents.md`, `docs/product-specs/arena.md`, and `docs/product-specs/passport.md` for surface-level product intent.
- Open `docs/page-specs/lab-page.md`, `docs/page-specs/agent-page.md`, `docs/page-specs/agent-detail-page.md`, and `docs/page-specs/battle-page.md` for current route behavior.
- Open `docs/design-docs/unified-product-model.md` when you need domain objects, progression, proof, or monetization semantics.
