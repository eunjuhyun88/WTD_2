# PRODUCT_SENSE

Purpose:
- Product-facing constraints that should shape implementation decisions.
- Intended for agents making UI, flow, or feature-scope choices.

## Core Product Heuristics

1. Explain the product in one screen.
   - Users should grasp the loop quickly:
     - create an agent
     - train it in Terminal
     - deploy it into World
     - fight in Battle
     - grow it in Agent

2. Fast legibility beats lore density.
   - Cosmic tone and game flavor are useful only if the user still understands what to do.

3. Same data, different interpretation.
   - Human-vs-agent value comes from reasoning quality, not hidden information asymmetry.

4. Every surface must answer one primary question.
   - `Home`: should I start?
   - `Create Agent`: how do I activate my agent?
   - `Terminal`: is this brain ready?
   - `World`: where is my agent now?
   - `Battle`: how do I handle this encounter?
   - `Agent`: how is my agent growing?

5. Gameplay must reinforce evidence.
   - Character growth, rank, or status should come from trades, backtests, or proven discipline.
   - Fake grind that does not improve trust or outcomes should be removed.

6. Action surfaces must feel trustworthy.
   - If a feature touches money, ownership, licensing, or ranking, server authority and validation win over convenience.

7. Social proof must stay evidence-backed.
   - “My AI is strong” works only if users can inspect track record, specialization, or version history.

8. `World` and `Terminal` must not collapse into one screen.
   - `World` is play.
   - `Terminal` is preparation, doctrine, and brain control.

## Acceptance Questions

Before shipping a surface change, answer:
- Does this make the primary job clearer or noisier?
- Does the user understand what they can own, improve, or monetize here?
- Is the state ownership obvious?
- Does the user understand what is transient vs durable?
- Is this progression earned by evidence or simulated by UI theater?
- Does this keep `Create Agent -> Terminal -> World` gating legible?
- If an agent reads the repo later, can it reconstruct the intended behavior?

## Source Docs

- `docs/SYSTEM_INTENT.md`
- `docs/design-docs/six-surface-game-loop.md`
- `docs/design-docs/unified-product-model.md`
- `docs/product-specs/index.md`
- `docs/design-docs/learning-loop.md`
