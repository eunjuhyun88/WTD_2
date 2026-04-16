# Source Summary: rsi-overbought-long-btc-4h

## Canonical Local Id

- `rsi-overbought-long-btc-4h`

## Current External Label

- `RSI > 70 Buy / Exit on Cross Below 70`

## Source Page

- source URL: `https://www.tradingview.com/script/wZIdSrBG/`
- author label: `Boubizee`
- published date observed on source page: `2025-12-29`
- source page status: TradingView marks the script as open-source
- TradingView publication UUID: `wZIdSrBG`
- TradingView publication id: `21177854`
- TradingView script id part: `PUB;eaf7ce6509f84bcb9f9f5725afa0ff6c`

## Known Inputs

- symbol: `BINANCE:BTCUSDT`
- timeframe: `4h`
- interval observed in SSR payload: `240`
- asset type observed in SSR payload: `spot`
- strategy side: `long-only`
- selection reason: simple deterministic rules, low hidden-state risk, suitable first replication pilot
- observed source description:
  - entry is described as buying when RSI closes above `70`
  - exit is described as closing when RSI crosses down below `70`
- observed indicator parameters from SSR payload:
  - RSI length observed: `14`
  - RSI threshold observed: `70`
- observed current chart-state strategy props from SSR payload:
  - pyramiding: `1`
  - calc_on_order_fills: `false`
  - calc_on_every_tick: `false`
  - backtest_fill_limits_assumption: `0`
  - default_qty_type: `cash_per_order`
  - default_qty_value: `100`
  - initial_capital: `100`
  - currency: `NONE`
  - slippage: `0`
  - commission_type: `percent`
  - commission_value: `0.04`
  - process_orders_on_close: `false`
  - close_entries_rule: `FIFO`
  - margin_long: `0`
  - margin_short: `0`
  - use_bar_magnifier: `false`
  - fill_orders_on_standard_ohlc: `false`
- observed script metainfo defaults from SSR payload:
  - default_qty_type default: `fixed`
  - default_qty_value default: `1`
  - initial_capital default: `1000000`
  - commission_type default: `percent`
  - commission_value default: `0`
  - margin_long default: `100`
  - margin_short default: `100`
- provenance of current knowledge:
  - user-provided article summary in the active thread
  - TradingView source page metadata and description
  - TradingView SSR init-data and publication-view bundle inspection

## Still Required Before Parity Run

- full PineScript source or equivalent explicit rule text
- exact RSI source price
- exact entry condition implementation details beyond the page summary
- exact exit condition and execution timing
- resolve whether parity should follow observed chart-state props or script metainfo defaults for sizing and fee settings
- backtest date range
- timezone/session assumptions
- trade export or screenshots for alignment evidence

## Current Status

This source pack now has canonical page metadata plus SSR-observed strategy settings, but it is not yet eligible for local parity implementation because the full executable source, exact execution semantics, and alignment evidence pack have not been captured.
