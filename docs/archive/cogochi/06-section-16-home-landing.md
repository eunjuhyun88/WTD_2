## § 16. Home Landing Page (implementation spec)

### 2026-04-12 refinement

Home now follows this combined direction:

- **clean hierarchy first**: one thesis, one proof story, one visible next action
- **immediate start second**: the user should feel they can begin work from Home, not just read about the product

The practical result:

- no builder/copier split
- no onboarding-first framing
- no card explosion above the fold
- one strong hero + one start bar + one proof panel

### Current contract

Home is **not** a route explainer and not a game lobby.  
Its job is to make the product thesis legible in one screen:

1. **This AI learns your judgment**
2. **It proves itself before asking for trust**
3. **There is a clear first move for a new user and a quiet return path for an existing one**

The approved visual direction is:

- mostly black field
- embossed, low-contrast Cogochi background mark
- one premium proof panel, not multiple floating cards
- no 3D logo
- no floating orbit cards
- no global market dock on the home route
- minimal above-the-fold copy
- action surface visible immediately
- stronger spacing and hierarchy than the current dense mixed layout

### Sections (current approved implementation)

**1. Hero — thesis first**

- Eyebrow: `COGOCHI`
- H1: the strongest single statement on home
  - Cogochi is the AI that learns how this user judges the market
- Sub copy:
  - save a pattern
  - let the scanner watch while the user is away
  - judge hits
  - deploy a better adapter
- Primary interaction: a **start bar**
  - prompt: `What setup do you want to track?`
  - submit routes into `/terminal`
  - helper example chips can prefill likely intents
- Primary CTA:
  - `Open Terminal`
  - `/terminal`
- Secondary CTA:
  - `See How Lab Scores It`
  - `/lab`
- Tertiary return action:
  - `Return to Dashboard`
  - quiet text-link treatment only
- Hero visual:
  - one device-like proof panel
  - panel shows the learning loop as evidence, not decoration
  - examples:
    - pattern captured
    - scanner hit
    - verdict logged
    - adapter improved / rolled back
- Background:
  - black-toned WebGL / ASCII field
  - large but quiet Cogochi logo watermark
  - motion stays low and ambient, never dominant
- Supporting data rail:
  - short proof claims
  - per-user adapter
  - proof-before-trust
  - rollback if worse
- Above-the-fold priority:
  - thesis
  - start bar
  - proof panel
  - supporting proof rail
  - nothing else should compete with those 4 elements

**2. Learning Loop**

- First scroll section appears quickly after hero; avoid a large dead gap
- 4-step sequence:
  - `01 Capture`
  - `02 Scan`
  - `03 Judge`
  - `04 Deploy`
- Purpose:
  - explain the product mechanism, not just the route map
  - show how judgment turns into infrastructure
  - make the H1 claim feel operational instead of abstract

**3. Surfaces**

- 3-card grid with crisp role language:
  - `Terminal` — where the user sees and judges signals
  - `Lab` — where the model improves and gets evaluated
  - `Dashboard` — where saved work and recent runs wait
- This section is for orientation only; it must not overpower the hero

**4. Final CTA**

- a quiet closing section at the bottom of the landing page
- repeats the 3-surface loop in compressed form
- offers:
  - `Open Terminal`
  - `Open Lab`
  - `Return to Dashboard`

### Layout rules

- Desktop hero: left thesis + start bar, right proof panel
- Tablet/mobile hero: stack vertically, copy first, then start bar, then proof panel
- The first content section must start within one natural scroll from hero
- Home must feel quieter than `/terminal`
- Accent color can appear as a restrained signal line, not as a page wash
- The logo watermark should read like an embossed background mark, not a foreground object
- Typography should do most of the work; cards support the message rather than carrying it alone
- If something competes with the H1 for attention, remove or weaken it
- the start bar should feel like a working surface, not like decorative chrome
- one decisive desktop screen should explain the product and offer a first move without forcing a long read

### Content rules

- Home speaks in product truth, then mechanism, then route
- Avoid long research explanations, jargon blocks, or feature inventories
- Avoid route-first copy before the thesis is understood
- Avoid builder/copier framing in Day-1
- Existing-user return paths should exist, but stay visually secondary
- Copy should feel assured, compressed, and premium. No hype phrasing and no dashboard-ish labels as hero copy

### Interaction rules

- The start bar must work with or without typed input
- Empty submit routes to `/terminal`
- Filled submit routes to `/terminal` carrying the prompt into the initial compose state
- Helper chips should be examples, not tabs or navigation detours
- Home should make starting feel immediate while keeping the visual tone restrained

### Future extension note

- If pricing / claim / waitlist sections return later, they should be reintroduced under the same black mono system and must not override the thesis + proof + first move structure

### Shader tuning (exact numbers)

`src/lib/webgl/ascii-trail-shaders.ts` COMPOSITE_FRAG ambient block:

```glsl
// before
float ambientAlpha = clamp(
  0.024 + ambientFocus*0.072 + ambientSweep*0.02 + ambientRibbon*0.018,
  0.0, 0.11);
vec3 col = ambientPal * ambientAlpha;

// after — ~4–5× reduction, keep background mostly black
float ambientAlpha = clamp(
  0.004 + ambientFocus*0.016 + ambientSweep*0.004 + ambientRibbon*0.003,
  0.0, 0.024);
vec3 col = ambientPal * ambientAlpha * 0.7;
```

`src/components/home/WebGLAsciiBackground.svelte` CSS filter:

```css
/* before */ filter: saturate(1.45) brightness(1.14) contrast(1.08);
/* after  */ filter: saturate(1.15) brightness(1.02) contrast(1.10);
```

Expected result: mouse-still state ≥ 95% black; mouse-move state shows ASCII trail in rose/sage/gold/ember with clear contrast.

---

