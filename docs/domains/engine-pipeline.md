# Domain: Engine Pipeline

## Goal

Compute features, blocks, scans, scoring, and evaluation as the canonical backend path.

## Canonical Areas

- `engine/scanner`
- `engine/building_blocks`
- `engine/scoring`
- `engine/market_engine`
- `engine/ledger`

## Boundary

- Owns all business and research logic for market interpretation.
- Exposes results through stable contracts, not UI-coupled models.
