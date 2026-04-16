# Parity Hypothesis: rsi-overbought-long-btc-4h

## Goal

Define the provisional local implementation hypothesis for the first replication pilot without pretending that source capture is complete.

## Current evidence-backed assumptions

- market: `BINANCE:BTCUSDT`
- timeframe: `4h`
- side: `long-only`
- RSI length: `14`
- RSI threshold: `70`
- page description says entry occurs when RSI closes above `70`
- page description says exit occurs when RSI crosses down below `70`
- observed `process_orders_on_close=false` points toward next-bar execution, not same-bar-close fills

## Provisional local rule hypothesis

Until the actual Pine source is captured, the narrowest reasonable parity hypothesis is:

1. compute `RSI(close, 14)`
2. if flat and RSI on the signal bar is strictly greater than `70`, submit a long entry
3. if long and RSI crosses from `>= 70` to `< 70`, submit a full exit
4. fill market orders on the next bar open because observed `process_orders_on_close=false`
5. no short trades
6. no pyramiding beyond `1`

## Competing strategy-props hypotheses

The source evidence currently supports two conflicting settings bundles.

### Hypothesis A: current chart-state props

Use the values observed in the embedded `StudyStrategy` state:

- default_qty_type: `cash_per_order`
- default_qty_value: `100`
- initial_capital: `100`
- currency: `NONE`
- slippage: `0`
- commission_type: `percent`
- commission_value: `0.04`
- process_orders_on_close: `false`
- close_entries_rule: `FIFO`

### Hypothesis B: script metainfo defaults

Use the values observed in the script metainfo defaults:

- default_qty_type: `fixed`
- default_qty_value: `1`
- initial_capital: `1000000`
- currency: `NONE`
- slippage: `0`
- commission_type: `percent`
- commission_value: `0`
- process_orders_on_close: `false`
- close_entries_rule: `FIFO`

## Current recommendation

Do not run a canonical parity comparison under only one of these bundles yet.

If implementation must begin before full source capture, build the local strategy with a switchable config so both hypotheses can be tested once trade evidence is available.

## What would collapse the uncertainty

Any one of the following would materially reduce ambiguity:

- the plain Pine source from the open-source tab
- strategy settings screenshots showing Properties values
- a trade export from the displayed TradingView backtest
- evidence of the exact backtest window used on the publication page

## Status

This file is a research hypothesis, not an approved canonical implementation.
