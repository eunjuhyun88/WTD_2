# Six-Surface Game Loop

Purpose:
- Define the final user-facing IA for the game-first agent product.
- Separate the target product from the current implementation bridge.
- Lock the core loop before more route or copy work lands.

## Final IA

1. `Home`
2. `Create Agent`
3. `Terminal`
4. `World`
5. `Battle`
6. `Agent`

## Core Product Loop

`Home -> Create Agent -> Terminal -> World -> Battle -> Agent`

One-line definition:
- `Minted agent -> Train in Terminal -> Deploy to World -> Fight whales in Battle -> Grow in Agent`

Secondary public layer:
- `Signals / Market` remains outside the primary six-surface IA.
- It exists to distribute proven agents, trainer cards, and specialist outputs through follow, share, rental, or listing flows.
- It should consume evidence from `Agent`, not replace the core player loop.

## Surface Roles

### Home
- Explain the product and start the loop.
- Primary CTA: `Create My Agent`

### Create Agent
- First-time activation flow.
- Must complete:
  - character shell selection
  - agent naming
  - wallet connection
  - mint/activation
  - AI binding
  - starter setup

### Terminal
- Agent brain console.
- Purpose:
  - model connection
  - data source connection
  - doctrine setup
  - first training/validation
  - readiness inspection

### World
- Main play screen.
- BTC-history chart becomes the world map.
- Shows:
  - era segmentation
  - agent position
  - whale markers
  - auto progression
  - cards, streak, HP

### Battle
- Whale encounter resolution screen.
- Focused loop:
  - 3 rounds
  - intervention actions
  - result
  - 2-line reflection

### Agent
- Merged growth and record hub.
- Owns:
  - stage
  - record
  - reflection history
  - trainer card
  - share
  - rental status
  - release readiness for public distribution

## Gating Rules

### Before Create Agent completes
- `Terminal`, `World`, `Battle`, and `Agent` are not meaningfully usable.

### Before Terminal readiness completes
- `World` remains locked.

Minimum readiness:
- model connected
- doctrine selected
- first train/validation run completed

### Battle entry
- `Battle` is normally entered from `World`.
- It is not the default daily landing screen.

## World vs Terminal

These must remain separate.

- `World` = play
- `Terminal` = brain setup and control

`World` should not inherit dense scan/intel workstation chrome.
`Terminal` should not pretend to be the main exploration map.

## Agent Merge Rule

`Agent` absorbs the user-facing roles currently split between:
- `/lab`
- `/passport`

Meaning:
- `Lab` behavior becomes `Agent > Train`
- `Passport` behavior becomes `Agent > Record`

## Current Implementation Bridge

| Final label | Target route | Current bridge |
| --- | --- | --- |
| `Home` | `/` | exists |
| `Create Agent` | `/create` | not shipped |
| `Terminal` | `/terminal` | exists, role must shift |
| `World` | `/world` | not shipped |
| `Battle` | `/battle` or Battle-labeled `/arena` | current shell is `/arena` |
| `Agent` | `/agent` | merge target for `/lab` + `/passport` |

Secondary route:
- `/signals` remains public/community support, not a primary IA surface.
