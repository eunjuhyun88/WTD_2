# STOCKCLAW System Intent

Purpose:
- Repo-local condensed brief for product intent and architectural invariants.
- Read this before opening larger design docs.
- Use it to keep `StockClaw` terminal intelligence and `Cogochi` character progression inside one product model.

Primary source:
- `docs/design-docs/six-surface-game-loop.md`

Supporting sources:
- `docs/design-docs/arena-domain-model.md`
- `docs/design-docs/learning-loop.md`

## Product Thesis

STOCKCLAW is a character-anchored trading system.

Users do not just read signals. They:
- create an agent
- connect and train its brain in `Terminal`
- deploy it into `World`
- resolve encounters in `Battle`
- grow, share, and record it in `Agent`

The product must feel like one loop, not a dashboard plus a separate tamagotchi game.

## Final Surface Model

- `Home`
  - explains the full loop quickly and routes into the first meaningful action
- `Create Agent`
  - shell selection, minting, AI binding, and starter setup
- `Terminal`
  - brain console, doctrine, validation, world readiness
- `World`
  - BTC-history map, traversal, era state, encounter triggers
- `Battle`
  - whale encounter, rounds, intervention, result, reflection
- `Agent`
  - merged growth hub for record, training view, proof, share, and rental

Implementation bridge:
- `Create Agent` maps to target route `/create` and is not shipped yet.
- `World` maps to target route `/world` and is not shipped yet.
- `Battle` currently maps to `/arena`.
- `Agent` will merge the current `/lab` and `/passport` responsibilities.
- `/signals` remains secondary and is not part of the primary six-surface IA.

## Non-Negotiable Invariants

1. Same data, different interpretation.
   - Human and AI should reason over the same market context whenever possible.
   - The value comes from interpretation quality, not hidden information asymmetry.

2. Character ownership must have operational meaning.
   - A character is not just a collectible skin.
   - It must anchor specialization, training history, and deployable agent identity.

3. Progression must be evidence-bound.
   - Trading outcomes, backtests, and learning records drive advancement.
   - Cosmetic progression can reinforce identity but cannot replace proof.

4. The game layer wraps real learning.
   - Game progression should make trading, training, and specialization more motivating.
   - It must not drift into a detached idle system with fake value.

5. `World` and `Terminal` stay separate.
   - `World` is the main play map.
   - `Terminal` is the brain console and readiness gate.

6. Durable actions must produce legible records.
   - Product actions should be understandable as user behavior, system behavior, and future learning data.
   - World, Battle, Terminal, and Agent flows must remain compatible with proof and memory systems.

7. Create Agent is a strong first-run ceremony.
   - Minting, AI binding, and starter setup belong in one guided flow.

8. `frontend` is the canonical implementation target.
   - Do not land new behavior by copying changes into sibling clone folders.
   - New work happens once in the canonical tree.

9. Server-authoritative domains stay server-authoritative.
   - Ownership, holdings, rental state, quick trades, tracked signals, and durable history cannot rely on client-local truth.
   - Local storage is cache, offline support, or optimistic staging only.

10. `priceStore` is the canonical live-price owner on the client.
   - Route or feature stores may consume live prices.
   - They should not redefine market truth.

11. Route state is transient.
   - Route state owns view mode, local selections, temporary UI state, and flow control.
   - It should not become a hidden persistence or replication layer.

12. Archive is history, not authority.
   - Old audits and archived plans explain how the code got here.
   - They do not override newer canonical docs.

## Surface Intent

### Home
- Explain the full loop in one screen:
  - create an agent
  - train it in Terminal
  - deploy it into World
  - fight in Battle
  - grow it in Agent
- Do not force deep setup before the user understands the value exchange.

### Create Agent
- First-run activation ceremony.
- Must end with one usable result: an agent that can enter `Terminal`.

### Terminal
- Brain console and readiness gate.
- Must make setup completion explicit enough to unlock `World`.

### World
- Main play surface.
- Must reinterpret chart context as traversable world state, not as a full trading workstation.

### Battle
- Encounter-only focused surface.
- Should sharpen doctrine and proof, not become isolated arcade filler.

### Agent
- Growth, proof, trainer card, share, and rental hub.
- Absorbs selected responsibilities from the current `Lab` and `Passport` routes.

## Architecture Heuristics

- Prefer a small number of canonical documents over many overlapping summaries.
- Promote stable rules into `README.md`, `AGENTS.md`, or the relevant canonical doc.
- Keep dated root docs as working references, not authority.
- Keep execution plans dated and task-specific.
- Archive superseded plans instead of leaving them mixed with active ones.
- Make future agent runs able to answer `where do I start?` within one or two file opens.

## When To Open The Larger Docs

- Open `docs/design-docs/six-surface-game-loop.md` when you need the final target IA and player loop.
- Open `docs/design-docs/unified-product-model.md` when you need domain objects, progression, proof, or monetization context behind the six-surface IA.
- Open `docs/design-docs/arena-domain-model.md` when you need the local Arena/Arena War semantic model.
- Open `docs/design-docs/learning-loop.md` when you need ORPO, RAG, Passport contribution, or boundary-learning semantics.
- Open `docs/references/active/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md` when you need the current structural baseline for refactor work.
- Open surface-specific docs from `docs/README.md` only after this intent brief matches the task.
