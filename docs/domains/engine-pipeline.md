# Domain: Engine Pipeline

## Goal

Compute features, blocks, scans, scoring, and evaluation as the canonical backend path.

## Canonical Areas

- `engine/scanner`
- `engine/building_blocks`
- `engine/scoring`
- `engine/market_engine`
- `engine/ledger`
- `engine/challenge`
- `engine/api/routes/patterns.py`

## Boundary

- Owns all business and research logic for market interpretation.
- Exposes results through stable contracts, not UI-coupled models.

## Inputs

- market data and cached klines
- challenge definitions and block parameters
- evaluation requests from contract-safe app routes

## Outputs

- feature tables
- block matches and scanner results
- verdicts, scores, and challenge evaluation artifacts

## Related Files

- `engine/scanner/feature_calc.py`
- `engine/building_blocks/`
- `engine/challenge/types.py`
- `engine/scoring/verdict.py`
- `engine/api/routes/patterns.py`

## Non-Goals

- UI composition
- Svelte route concerns
- client-side session state
