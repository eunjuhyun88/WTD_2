# Six-Surface UX Contract

Purpose:
- Translate the six-surface IA into implementation-grade UX rules.
- Lock page purpose, CTA, and nav presence before route code changes.

## Final Surface Order

1. `Home`
2. `Create Agent`
3. `Terminal`
4. `World`
5. `Battle`
6. `Agent`

## Main User Flow

`Home -> Create Agent -> Terminal -> World -> Battle -> Agent`

## Global Nav Model

### Primary Nav

- `Home`
- `Create`
- `Terminal`
- `World`
- `Agent`

### Battle Nav Rule

- `Battle` is a route but not necessarily a permanent primary nav item.
- It is encounter-driven and usually entered from `World`.

## Page Contract

### Home
- purpose: understand the product and start
- primary CTA: `Create My Agent`
- secondary CTA: inspect loop or learn more
- success state: user knows the six-surface loop and starts creation

### Create Agent
- purpose: finish creation in one sitting
- primary CTA: `Mint & Activate`
- completion CTA: `Enter Terminal`
- success state: minted agent + Stage 1 + Terminal unlocked

### Terminal
- purpose: prepare the agent brain
- primary CTA: `Run First Training`
- completion CTA: `Unlock World`
- success state:
  - model connected
  - doctrine selected
  - first training/validation completed

### World
- purpose: main play and traversal
- primary CTA: `Continue Run`
- encounter CTA: `Enter Battle`
- success state: user understands current era, position, and next encounter

### Battle
- purpose: resolve whale encounter
- primary CTA: round action / intervention
- completion CTA:
  - `Return to World`
  - `Open Agent Record`
- success state: result + reflection logged

### Agent
- purpose: review growth and manage the asset
- primary tabs:
  - `Train`
  - `Record`
- key CTAs:
  - `Back to Terminal`
  - `Back to World`
  - `Share Trainer Card`
  - `Enable Rental` when eligible

## Lock States

### Before agent creation
- `Terminal`, `World`, `Battle`, and `Agent` should be visibly locked or degraded.

### Before Terminal readiness
- `World` remains locked.
- The missing checklist should be explicit:
  - model connected
  - doctrine selected
  - first train/validation run completed

### Before battle
- `Battle` should not feel like a default dashboard destination.
- It needs a world encounter context.

## Legacy Bridge

| Final label | Current route bridge |
| --- | --- |
| `Home` | `/` |
| `Create Agent` | not shipped |
| `Terminal` | `/terminal` |
| `World` | not shipped |
| `Battle` | `/arena` |
| `Agent` | merge of `/lab` + `/passport` |

## Non-Goals

- Do not bring `Signals/Market` back into the primary IA.
- Do not merge `World` and `Terminal`.
- Do not split `Create Agent` into wallet page, mint page, and AI setup page.
- Do not keep `Lab` and `Passport` as equal long-term top-level destinations.
