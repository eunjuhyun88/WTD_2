# Source Notes: rsi-overbought-long-btc-4h

## Why this is the first pilot

- the state machine is likely one-position long-only
- the indicator logic is likely limited to one RSI calculation plus threshold checks
- the strategy should be easy to reason about bar-by-bar

## Known ambiguity points

1. SSR payload confirms RSI length `14` and threshold `70`, but the RSI source price is still unknown.
2. The public page says entry is `RSI > 70` and exit is cross-down below `70`, but the exact PineScript expressions are still unknown.
3. Two settings layers conflict:
   chart-state props suggest `cash_per_order=100`, `initial_capital=100`, `commission=0.04%`;
   script metainfo defaults suggest `fixed=1`, `initial_capital=1000000`, `commission=0`.
4. `process_orders_on_close` is observed as `false`, which points toward next-bar execution, but this should still be confirmed against the actual source.
5. The page is marked open-source, but source capture should still respect TradingView house rules and record provenance carefully.

## Additional findings from SSR inspection

- The page embeds a publication payload for `wZIdSrBG` and a strategy metainfo record `StrategyScript$USER;41018f2ed87d4f429d06a2336e6180f3@tv-scripting-101`.
- The SSR payload includes strategy-property definitions and current chart-state inputs.
- The SSR payload includes an encoded `text` blob under inputs, but not plain executable Pine source in the captured HTML.

## Replication warning

Do not implement this strategy from the label alone. Current evidence is strong enough to narrow the hypothesis, but the source pack still needs the actual script or an equivalent authoritative rule description before parity implementation.
