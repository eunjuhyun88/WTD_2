# GameRecord Schema Overview

Status:
- derived local summary
- source of truth is the Arena domain model plus implementation types

## Primary Structure

```text
GameRecord
├── id / version / createdAt
├── context
├── human
├── ai
├── outcome
└── derived
```

## Field Groups

### `context`
- pair
- timeframe
- regime
- klines
- factors
- factorSignature
- detectedPatterns
- dataCompleteness

### `human`
- direction / confidence / entry / tp / sl
- `reasonTags` and optional text
- AI delta comparison
- thinking and revision metadata
- battle actions

### `ai`
- C02 result summary
- final decision
- RAG recall summary
- factor conflict summary

### `outcome`
- exit and price resolution
- winner and score decomposition
- consensus type

### `derived`
- ORPO pair
- RAG entry
- immediate feedback

## Invariants

1. Shared context should remain interpretable as common input to both sides.
2. Human reasoning should preserve structured tags where possible.
3. AI output should preserve inspectable decision provenance.
4. Derived artifacts should be reproducible from the game record.

## Related Docs

- `docs/design-docs/arena-domain-model.md`
- `docs/design-docs/learning-loop.md`
- `docs/product-specs/arena.md`
