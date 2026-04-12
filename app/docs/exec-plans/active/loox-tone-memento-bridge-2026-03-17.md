# Loox Tone + Memento Bridge

Date:
- 2026-03-17

Status:
- ready_for_push

Owner:
- `codex`

Work ID:
- `W-20260317-1321-frontend-codex`

## Objective

Take the current space-game direction and make it feel more disciplined:

- `Loox / Lost in Space` mood
- Apple-level clarity and spacing
- first-screen message that explains the product fast
- operational shared-memory flow that does not depend on chat history alone

## Constraints

1. Do not restart the visual system from scratch.
   - Build on the current shared token layer and shared chrome.
2. Do not turn the UI into pure decoration.
   - readability, hierarchy, and CTA legibility come first
3. Do not rely on one worktree's chat memory.
   - operational handoff must land in repo-local docs and the shared `.memento` layer
4. Do not expand scope into deep route rewrites.
   - this slice is foundation, copy, and bridge workflow

## Implementation Slice

### 1. Shared tone foundation

- adjust `src/lib/styles/tokens.css`
- refine `src/app.css`
- keep the cosmic tone, but remove muddy color drift and over-busy emphasis

### 2. Home clarity pass

- simplify hero headline and supporting copy in `src/routes/+page.svelte`
- keep the product loop obvious:
  - `Terminal`
  - `Arena`
  - `Lab`
  - `Market`
  - `Passport`
- preserve the playful companion framing without making the copy sound internal-only

### 3. Shared chrome cleanup

- refine `src/components/layout/Header.svelte`
- refine `src/components/layout/BottomBar.svelte`
- refine `src/components/layout/MobileBottomNav.svelte`
- bias toward stronger legibility on dark backgrounds

### 4. Memento bridge

- add `npm run memento:resume`
- add `npm run memento:relay`
- bridge `.agent-context` branch artifacts into:
  - `/Users/ej/Downloads/maxidoge-clones/.memento/memories/*`
  - `/Users/ej/Downloads/maxidoge-clones/.memento/runtime/stockclaw/handoff-inbox`

## Definition Of Done

- the home route feels clearer and more premium without losing its worldbuilding
- the shared chrome reads cleanly on desktop and mobile
- the repo can emit a reusable relay payload into the shared `.memento` runtime layer
- the memory workflow is documented in canonical repo docs

## Validation Plan

- run `npm run memento:resume -- --agent implementer-ui`
- run `npm run memento:relay -- --work-id W-20260317-1321-frontend-codex --agent implementer-ui --summary "loox tone + bridge slice"`
- run `npm run check`
- run `npm run docs:check`
- run `npm run build`
