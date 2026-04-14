# Surface Spec: Home (`/`)

## Role

Thesis-first landing that gives one immediate next action and one quiet return path.

## Current Policy

`/` is frozen for now.
Keep the current implemented home experience unless there is an explicit product decision to reopen home redesign.

## Core User Questions

1. What is Cogochi in one screen?
2. How do I start right now?
3. Where do I go if I already have work in progress?

## Page Contract

Home is not an operational dashboard and not a route catalog.
Home should do only four things:

1. state thesis clearly
2. show product mechanism simply
3. orient to three Day-1 surfaces
4. route into terminal/lab/dashboard

## Required Sections (Reference Only While Frozen)

1. Hero
2. Learning Loop
3. Surface Map
4. Final CTA

## Hero Requirements (Do Not Trigger New Redesign Work)

- Eyebrow: `COGOCHI`
- H1: single strongest thesis line
- Sub-copy: compact mechanism (`capture -> scan -> judge -> deploy`)
- Start bar input:
  - empty submit -> `/terminal`
  - filled submit -> `/terminal` with query seed
- Actions:
  - Primary: `Open Terminal` -> `/terminal`
  - Secondary: `See How Lab Scores It` -> `/lab`
  - Tertiary: `Return to Dashboard` -> `/dashboard` (quiet style)

## Learning Loop Requirements

- Show exactly four stages:
  - `01 Capture`
  - `02 Scan`
  - `03 Judge`
  - `04 Deploy`
- Explain mechanism, not implementation internals.

## Surface Map Requirements

Show only Day-1 active surfaces:

- Terminal: compose + observe
- Lab: evaluate + inspect + iterate
- Dashboard: my-stuff inbox

## Visual System Constraints

- Keep home calmer than terminal.
- Avoid decorative overload that competes with thesis.
- Preserve black-first visual language and restrained accents.
- Maintain high contrast readability for CTA and start bar.

## Non-Goals

- No home redesign work in current scope
- No onboarding wizard flow as Day-1 default
- No character/archetype/stage framing
- No operational scanner cockpit
- No feature dump above the fold

## States

- Loading: lightweight skeleton only; do not block CTA visibility
- Error (optional dynamic fragments): fail soft, keep CTA paths active
- Mobile: stack hero content, then start bar, then proof visual

## Acceptance Checks (For Maintenance/Regression Only)

- [ ] Hero communicates one thesis, not a feature list
- [ ] Start bar routes correctly with empty and filled input
- [ ] Surface map names match Day-1 contract exactly
- [ ] Copy does not imply deferred routes are active
- [ ] Home remains navigationally simple and conversion-oriented

## Freeze Guardrails

While frozen, only allow:

1. broken-link fixes
2. copy typo fixes
3. responsive/accessibility regressions
4. analytics/event instrumentation fixes

Do not run visual/layout redesign work on home without explicit product approval.

## Start Bar Contract (Regression)

- Empty submit: must route to `/terminal`
- Filled submit: should route to `/terminal` with query payload
- Helper chips: prefill input only, no alternate navigation semantics

## Button Action -> Outcome Contract

### Hero / Primary Actions

1. `Open Terminal`
   - action: navigate to `/terminal`
   - expected result: user lands in terminal ready-to-compose state
   - failure result: keep user on home and show route failure notice

2. `See How Lab Scores It`
   - action: navigate to `/lab`
   - expected result: user lands in lab workbench
   - failure result: visible navigation failure notice

3. `Return to Dashboard`
   - action: navigate to `/dashboard`
   - expected result: user lands in inbox surface
   - failure result: visible navigation failure notice

### Start Bar Actions

1. `Submit (empty input)`
   - action: navigate to `/terminal`
   - expected result: terminal opens with default context
   - failure result: route failure notice

2. `Submit (filled input)`
   - action: navigate to `/terminal?q=<input>`
   - expected result: terminal opens with seeded query intent
   - failure result: route failure notice while preserving typed input

3. `Helper chip`
   - action: prefill start-bar input text only
   - expected result: input value changes; user still decides submit
   - failure result: chip click is ignored with no destructive side effects
