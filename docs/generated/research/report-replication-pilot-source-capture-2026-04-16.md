# Research report — replication-pilot-source-capture-2026-04-16

- **Strategy id**: `rsi-overbought-long-btc-4h`
- **Source pack**: `research/datasets/strategy-replication/rsi-overbought-long-btc-4h`
- **Ready for parity**: NO
- **Blocked items**: 10
- **Source URL present**: YES
- **Author label present**: YES
- **Placeholder Pine file**: YES

## File checks

- source-summary.md: present
- source-notes.md: present
- source-code.pine: present

## Blockers

- full PineScript source or equivalent explicit rule text
- exact RSI source price
- exact entry condition implementation details beyond the page summary
- exact exit condition and execution timing
- resolve whether parity should follow observed chart-state props or script metainfo defaults for sizing and fee settings
- backtest date range
- timezone/session assumptions
- trade export or screenshots for alignment evidence
- source-notes still mark the strategy as label-only
- source-code.pine is still a placeholder

## Interpretation

- source pack is not yet complete enough for parity implementation
- next work should replace missing provenance and placeholder logic before simulator work begins
