# Home Entry UIUX Refactor Spec

Status:
- active design guidance for home-entry refactor

Purpose:
- redesign the main hero and first-entry experience so the product feels premium immediately,
- explain the product in seconds,
- allow immediate use without friction,
- and give the refactor a stable interaction model instead of another temporary landing page.

Related docs:
- [COGOCHI_UNIFIED_FLOW_AND_IA_2026-03-17.md](/Users/ej/Downloads/maxidoge-clones/frontend/docs/archive/historical/root-cleanup-2026-03-17/COGOCHI_UNIFIED_FLOW_AND_IA_2026-03-17.md)
- [COGOCHI_MENU_IA_STORYBOARD_SPEC_2026-03-17.md](/Users/ej/Downloads/maxidoge-clones/frontend/docs/archive/historical/root-cleanup-2026-03-17/COGOCHI_MENU_IA_STORYBOARD_SPEC_2026-03-17.md)
- [COGOCHI_PAGE_WIREFRAME_SPEC_2026-03-17.md](/Users/ej/Downloads/maxidoge-clones/frontend/docs/archive/historical/root-cleanup-2026-03-17/COGOCHI_PAGE_WIREFRAME_SPEC_2026-03-17.md)

---

## 1. Design Goal

The home page must do four things within the first 15 seconds:

1. explain what the product is
2. prove it is not a generic signal bot
3. show one real thing happening now
4. let the user do something immediately

If it fails any of these, the hero is decoration rather than product entry.

---

## 2. Current Problem

The current `/` route is elegant but too thin for a refactor target.

### Current strengths

- fast
- clear primary CTA
- no forced signup
- visually calm

### Current weaknesses

- product category is still abstract
- trainer flow, renter flow, and game flow are not clearly separated
- hero explains mood more than capability
- there is no live proof above the fold
- a user can open Terminal without understanding why it matters
- the experience is premium-looking but not yet premium-legible

Bottom line:

The current page is a good placeholder hero, not a strong operating front door.

---

## 3. Target Design Principles

This spec uses an Apple-like product entry mindset:

- high clarity
- few choices
- strong hierarchy
- premium restraint
- instant hands-on value
- progressive disclosure

### P1. One Dominant Action

Above the fold, only one action should visually dominate:
- `Open Terminal`

Secondary actions can exist, but they should not compete equally.

### P2. Show The Product Working

Do not only tell users "AI trading arena".
Show one live market card, one live agent proof card, and one short explanation of what is happening.

### P3. Explain In Layers

Layer 1:
- what is this?

Layer 2:
- why is this different?

Layer 3:
- what can I do first?

Do not collapse all three into one paragraph.

### P4. Immediate Use Beats Marketing

The home page is not a brochure.
It is a launchpad.

Every section must either:
- reduce confusion, or
- help the user take the first action.

### P5. Premium = Calm + Specific

Premium design here does not mean flashy animation.
It means:
- stable hierarchy
- strong typography
- clear spacing
- data with context
- no noisy CTA competition

---

## 4. First 15 Seconds

### First screen script

When the page loads, the user should understand this sequence without scrolling:

1. `This is an AI trading product.`
2. `It turns market judgment into trainable agents.`
3. `I can use it right now without signing up.`
4. `The fastest first action is Terminal.`

### Above-the-fold information hierarchy

```text
1. Product name / category signal
2. Headline
3. One-line product mechanism
4. Primary CTA
5. Secondary CTA pair
6. Live proof strip
7. Mini role switch
```

---

## 5. Refactor-First Home Structure

## 5.1 Desktop Structure

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Global Header                                                           │
├──────────────────────────────────────────────────────────────────────────┤
│ HERO LEFT                                  HERO RIGHT                   │
│ - eyebrow                                  - live proof panel           │
│ - headline                                 - featured agent             │
│ - subcopy                                  - current market snapshot     │
│ - CTA stack                                - trust badges               │
│ - role switch                              - “what happens next”        │
├──────────────────────────────────────────────────────────────────────────┤
│ Quick Start Rail: Terminal / Arena / Market                             │
├──────────────────────────────────────────────────────────────────────────┤
│ Why Different: 3 cards                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│ Creator Story | Follower Story                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ Footer CTA                                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

## 5.2 Mobile Structure

```text
┌───────────────────────────────┐
│ Header                        │
├───────────────────────────────┤
│ Hero                          │
│ Headline                      │
│ Subcopy                       │
│ [Open Terminal]               │
│ [Try Arena]                   │
│ [Browse Market]               │
├───────────────────────────────┤
│ Live Proof Carousel           │
├───────────────────────────────┤
│ Quick Start Cards             │
├───────────────────────────────┤
│ Why Different Cards           │
├───────────────────────────────┤
│ Creator / Follower Proof      │
└───────────────────────────────┘
```

---

## 6. Hero Design Spec

## 6.1 Hero Purpose

The hero is not there to explain every feature.
It has one job:

`convert uncertainty into a first click`

## 6.2 Hero Content Model

### Eyebrow

Use a category line, not a slogan.

Recommended:
- `AI Trading Game + Agent Marketplace`

### Headline

Must combine:
- market use
- agent creation
- validation

Recommended direction:

`Read the market. Train the agent. Prove the edge.`

Alternative:

`Turn market judgment into tradable AI agents.`

### Subcopy

One sentence only.

Recommended direction:

`Start in Terminal, train in Lab, validate in Arena, and turn proof into performance in Market and Passport.`

### CTA Stack

- Primary: `Open Terminal`
- Secondary: `Try Arena`
- Tertiary: `Browse Market`

### Supporting microcopy

- `No signup required for first analysis`
- `Wallet optional until you save or trade`

---

## 7. Above-the-Fold Live Proof

This is the most important new addition.

### Proof panel contents

The right side of the desktop hero or first carousel item on mobile should contain:

1. one live market card
2. one featured agent card
3. one one-line explanation of why this matters

### Live market card

Contents:
- pair
- current move
- latest signal direction
- timestamp freshness
- small “Open in Terminal” link

Example:

```text
BTC/USDT
LONG BIAS 68
OI cooling + whale outflow easing
Updated 18s ago
```

### Featured agent card

Contents:
- agent name
- archetype
- current public score summary
- rental or publish signal
- one trust marker

Example:

```text
CRUSHER-0847
Short-pressure specialist
Win rate 61% · drawdown -7.1%
Track record locked before outcome
```

### Trust badges

Keep to three.

- `Live market data`
- `Battle-validated`
- `Recorded performance`

---

## 8. Quick Start Rail

This section should sit immediately below the hero.

### Purpose

Let different users self-segment instantly.

### Cards

#### Card 1. Start Trading
- label: `Open Terminal`
- desc: scan the market and act now
- CTA: `Start`

#### Card 2. Test Your Judgment
- label: `Try Arena`
- desc: compare your call against the agent
- CTA: `Battle`

#### Card 3. Follow Proven Agents
- label: `Browse Market`
- desc: discover public agents and signals
- CTA: `Explore`

### Rule

The rail must be useful even if the user ignores every section below it.

---

## 9. “Why Different” Section

This section should replace generic feature cards.

### Card 1. Not Just AI Advice

Message:
- judgments become trainable agents

### Card 2. Not Just Backtests

Message:
- performance is validated through battle and durable records

### Card 3. Not Just Signals

Message:
- users can create, validate, publish, and follow

Rule:
- each card must explain difference, not list features

---

## 10. GTM Lens

The hero has to convert three types of traffic.

### A. Trader traffic

Question:
- `Can I use this right now?`

Need:
- Terminal CTA
- live market proof

### B. Creator traffic

Question:
- `Can I turn my strategy into an asset?`

Need:
- agent proof card
- Lab/Arena pathway

### C. Follower traffic

Question:
- `Can I trust what I follow?`

Need:
- Market CTA
- proof / record / battle validation signals

### GTM rule

Do not hide these three motivations under one generic feature rail.
They must be visually distinct within the first screen or first scroll.

---

## 11. Immediate Usability Rules

### Rule 1

`Open Terminal` must work without wallet or signup.

### Rule 2

The user must understand the three main product verbs without scrolling far:
- analyze
- validate
- follow/create

### Rule 3

Home should never become a dead-end.
Every major section must end with a real route CTA.

### Rule 4

Returning users should bypass home when possible.
Home is primarily for new or cold traffic.

### Rule 5

If a section cannot be consumed in 3 seconds, it should not be above the fold.

---

## 12. Refactor Sequence

This is the implementation-safe order.

### Slice 1. Hero shell

Replace the current minimal hero with:
- new headline hierarchy
- CTA stack
- live proof panel

No deep new routing yet.

### Slice 2. Quick start rail

Add the three path cards:
- Terminal
- Arena
- Market

### Slice 3. Why different

Replace generic feature explanation with three difference cards.

### Slice 4. Social proof + trust

Add:
- featured agent card
- trust badges
- creator/follower proof blocks

### Slice 5. Returning-user behavior

Preserve skip-to-Terminal behavior for returning users.
Do not regress direct-use flow while improving acquisition flow.

---

## 13. Visual Direction

### Tone

- premium
- calm
- sharp
- technical but not messy

### Avoid

- neon overload
- too many equal-weight cards
- meme language on the first screen
- giant walls of product text
- over-animated hero gimmicks

### Prefer

- one strong headline
- one dominant CTA
- restrained motion
- data previews with clean typography
- clear card hierarchy

---

## 14. Success Metrics

The redesigned home should improve:

1. `hero_cta_click -> terminal_open`
2. `home visit -> first scan success`
3. `home visit -> arena start`
4. `home visit -> market browse`

Secondary:

5. time to first meaningful action
6. bounce rate on new visitors
7. share-link visitors who continue beyond home

---

## 15. Final Decision

The main hero should no longer be:
- a stylish intro page

It should become:
- a premium launch surface that proves the product, segments the user, and gets them into the first valuable action immediately.

If the user cannot understand `why this is different` and `what to do next` in one screen, the home refactor is incomplete.
