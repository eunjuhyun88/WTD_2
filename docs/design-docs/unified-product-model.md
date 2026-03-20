# Unified Product Model

Purpose:
- Consolidate `StockClaw` terminal intelligence and the `Cogochi` character/agent economy into one repo-local canon.
- Define the product in terms of user loops, surface roles, and domain objects.
- Give future agents one file that answers `what are we actually building`.

Primary IA note:
- For the final user-facing six-surface structure, read `docs/design-docs/six-surface-game-loop.md` first.
- This file is the canonical domain-object, progression, and monetization model behind that IA.

## One-Line Definition

STOCKCLAW is a character-anchored agent trading game where users mint or activate a character, train its AI brain in `Terminal`, deploy it through `World` and `Battle`, compound evidence into specialization, and monetize proven agents through public distribution layers.

## Core User Promise

1. Create or activate a character that represents a starting trading archetype.
2. Use `Terminal` to bind a brain, choose doctrine, connect data, and train or validate the first usable setup.
3. Send the prepared agent into `World`, then resolve high-signal encounters in `Battle`.
4. Accumulate proof, history, retained lessons, and release readiness inside `Agent`.
5. Publish trainer cards, proof, and releasable specialists into the secondary public `Signals / Market` layer for share, rental, listing, or copy-use.

## Surface Model

| Surface | Primary user question | Main output |
| --- | --- | --- |
| `Home` | What is this and why should I start? | legible first-action path |
| `Create Agent` | How do I finish activation and ownership? | usable Stage-1 agent |
| `Terminal` | Is this brain ready and how should it operate? | doctrine, readiness, execution control |
| `World` | Where is my agent now and what is happening on the run? | traversable BTC-history world state |
| `Battle` | How do I resolve this encounter? | explicit outcome and reflection |
| `Agent` | How is this agent growing, proving itself, and earning? | train/record/proof/rental/share state |
| `Signals / Market` | Which public agents, proofs, or strategies are worth following or licensing? | discovery, distribution, monetization |

Implementation bridge:
- `Create Agent` is target route `/create` and is not shipped yet.
- `World` is target route `/world` and is not shipped yet.
- `Battle` is currently implemented through `/arena`.
- `Agent` is the merge target for `/lab` and `/passport`.
- `Signals / Market` is currently implemented through `/signals`.

## Agent Hub States

The HTML references add one important clarification: users need both an active growth screen and a passive standby screen.

These should live inside `Agent`, not as a seventh top-level surface.

### Standby / Hangar
- The idle home for an owned character.
- Shows live companion presence, stage, streak, readiness, and quick next actions.
- Exists to reinforce attachment and status without becoming a fake maintenance chore.

### Train
- Doctrine, prompt, risk style, retained memory, and specialization controls.

### Record
- Stage, world history, battle outcomes, trainer card, share state, and rental readiness.

### Backtest / Review
- Version comparison, evaluation history, failure analysis, and promotion gating.

### Release Readiness
- Decide whether a model version is ready for:
  - manual use in `Terminal`
  - challenge use in `Battle`
  - public listing in `Signals / Market`

## Canonical Domain Objects

### Character
- The owned companion shell.
- Carries identity, theme, unlock path, and specialization framing.
- Must not be a cosmetic-only NFT with no operational meaning.

### Agent
- The acting trading entity bound to a character.
- May operate as an assistant, recommender, or automated executor depending on permissions and mode.

### Model Version
- The versioned artifact that can be deployed, compared, leased, or sold.
- Must be traceable to a doctrine, training history, and evidence set.

### Doctrine
- The explicit trading style: market regime preference, risk posture, time horizon, and signal interpretation logic.

### Training Memory
- Retained lessons from backtests, real trades, review cycles, World traversal, and Battle outcomes.
- The memory layer exists to improve future interpretation, not to create fake progression.

### Backtest Run
- A reproducible evaluation against historical data.
- Used to compare model versions before live deployment or listing.

### Trade Record
- The durable result of manual, assisted, or automated action.
- Feeds performance proof, learning, and monetization eligibility.

### Listing
- A public market object for sale, lease, copy-use, or strategy access.
- Must expose evidence, version, scope, and rights clearly.

### Trainer Card / Proof Card
- The public summary of performance, specialization, and identity.
- Used in `Agent` and `Signals / Market` for trust, promotion, and conversion.

## Product Loops

### 1. Acquisition Loop
`discover promise -> create/mint character-agent -> bind AI -> enter Terminal`

Why it exists:
- Gives the user a concrete starting identity.
- Makes agent ownership legible before advanced training exists.

### 2. Readiness Loop
`connect model -> choose doctrine -> run first validation -> unlock World`

Requirements:
- Users must understand exactly why `World` is locked or unlocked.
- Readiness must be evidence-bound, not a cosmetic checklist.

### 3. Trading Loop
`select chart -> select self/agent/model -> inspect evidence -> trade or dismiss -> log result`

Requirements:
- Users must see whether the operator is manual, assisted, or automated.
- The same market context should remain available to both human and AI views.

### 4. World / Battle Loop
`enter World -> traverse era -> trigger encounter -> resolve in Battle -> log reflection -> return`

Requirements:
- `World` is the main play surface, not a trading workstation clone.
- `Battle` is encounter resolution, not a detached minigame.

### 5. Training Loop
`review outcomes -> refine doctrine -> run backtest -> compare versions -> promote or reject`

Requirements:
- Improvement must be evidence-bound.
- Backtests and live outcomes should feed the same version history.

### 6. Monetization Loop
`prove specialization -> publish listing -> sell/lease/copy-enable -> earn -> reinvest into better characters/models`

Requirements:
- Listings need proof, scope, and rights clarity.
- Monetization without legible evidence becomes theater and hurts trust.

### 7. Social Proof Loop
`publish proof -> attract followers/buyers -> gather more usage -> improve reputation -> stronger distribution`

Requirements:
- “My AI is strong” must resolve into evidence, not empty badge inflation.
- Public bragging only works when `Agent` and `Signals / Market` expose durable proof.

### 8. Game / Progression Loop
`trade + train + prove -> unlock stronger identity, traits, cosmetics, and status -> deepen specialization`

Design rule:
- The game layer is a progression wrapper around real learning and trading evidence.
- It is not a separate idle pet game and not a detached fantasy battle economy.

## Game Layer Constraints

The ambiguous part today is the game loop. The safe answer is:

1. Tie progression to evidence.
   - character growth should come from outcomes, backtests, streaks, and discipline
2. Make specialization visible.
   - each character should feel more distinct as doctrine sharpens
3. Reward mastery, not chores.
   - no filler taps, fake hunger bars, or maintenance loops disconnected from trading value
4. Keep fantasy subordinate to trust.
   - if a visual theme conflicts with legibility or proof, proof wins

Useful game outputs:
- specialization tiers
- trait unlocks tied to proven strategy patterns
- rivalry/challenge framing in `Battle`
- shareable proof cards and ranked seasons

Avoid:
- pure gacha progression without operational depth
- fake combat that ignores actual model quality
- progression systems that can be farmed without improving decisions

## Monetization Model

Potential `[추정]` revenue lines:
- `[추정]` character primary sale
- `[추정]` agent/model listing take rate
- `[추정]` lease or subscription take rate
- `[추정]` auto-trade or copy-trade execution fee
- `[추정]` premium training or backtest capacity

Notes:
- Exact pricing is intentionally omitted here.
- Any number or fee assumption belongs in a separate business-model doc and must be marked `[추정]` until validated.

## Non-Negotiable Product Rules

1. Character ownership is the onboarding wedge, not a side collectible.
2. `Terminal` readiness is the gate to `World`.
3. Trading evidence is the source of truth for progression.
4. `Agent` owns standby, training view, proof, and monetization readiness.
5. Public discovery and monetization must stay distinct from `Terminal` execution.
6. A user should always know whether they are looking at:
   - raw market data
   - interpreted signal
   - trained model output
   - durable trade result
7. Companion standby is a presence state, not a separate product.
8. Game fantasy can amplify identity, but it cannot override proof.

## Read Next

- `docs/SYSTEM_INTENT.md`
- `docs/design-docs/six-surface-game-loop.md`
- `docs/PRODUCT_SENSE.md`
- `docs/product-specs/home.md`
- `docs/product-specs/create-agent.md`
- `docs/product-specs/terminal.md`
- `docs/product-specs/world.md`
- `docs/product-specs/agents.md`
- `docs/product-specs/signals.md`
