# Arena Learning Loop

Purpose:
- Repo-local canonical summary of how Arena decisions become reusable learning data.

## Loop Overview

The loop is:
- play a game
- produce a `GameRecord`
- derive ORPO and memory artifacts
- feed those artifacts back into future AI behavior and player-facing insight

This is why Arena is not only a game surface. It is a structured decision capture system.

## ORPO Learning

### Pair generation

For each resolved game:
- identify winner and loser
- snapshot both decisions against shared context
- compute margin and quality

### Why quality matters

Higher-value pairs tend to have:
- meaningful score margin
- structured human reasoning
- enough deliberation to suggest signal over noise

Low-margin cases are not automatically useless:
- they may represent decision boundaries
- they are especially useful for fine-grained policy calibration

## RAG / Memory Loop

Each game can also produce a memory entry:
- pattern signature
- regime
- pair/timeframe
- compact decision summary
- outcome and quality
- generated lesson

At future game start:
- current context is embedded or signature-matched
- similar entries are retrieved
- AI confidence or caution can be adjusted

The player does not need to see the raw memory lookup for the loop to matter, but the repo should preserve the model so future agents can reason about it.

## Near-Miss / Boundary Learning

Near-miss cases matter because:
- winner and loser may have almost identical high-level direction
- small target/stop/risk differences can decide the result
- those cases often reveal the sharp edge of the policy

Local recommendation:
- treat these as `boundary` examples conceptually
- even if persistence keeps a simpler quality enum initially, the learning pipeline should preserve their special value

## Badge / Coverage Loop

Badges and missions are not only retention tools.
They can also shape data coverage:
- pair diversity
- timeframe diversity
- regime diversity
- reasoning depth
- battle-action depth

This means Passport and mission systems should be designed with data coverage in mind, not only cosmetic progression.

## Passport Feedback Loop

Passport is where the system can reveal:
- user strengths vs weaknesses
- contribution to AI learning
- areas of low coverage
- calibration drift

The strongest Passport implementations explain both:
- player progress
- and what kinds of data the player is contributing

## Design Implications

When changing Arena, Passport, or signal/trade conversion:
- check whether a durable learning artifact still exists
- check whether reasoning depth is preserved or degraded
- check whether contribution/coverage can still be explained later

## Source Docs

- `docs/design-docs/arena-domain-model.md`
- `docs/product-specs/arena.md`
- `docs/product-specs/passport.md`
