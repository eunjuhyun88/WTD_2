# Domain: Canonical Indicator Materialization

## Goal

Fix one engine-owned contract for:

- raw market ingestion fields
- derived feature definitions
- materialized feature stores
- search corpus signatures
- AI-facing compact projections

This document is not a claim that every field already exists. It is the
canonical target dictionary that `W-0122` fact slices, `W-0145` search/corpus
slices, `W-0142` runtime references, and future AI context builders must share.

## Design Rules

1. Indicator names are not enough. Every promoted metric must have a raw source,
   a formula, a storage home, and an owner plane.
2. `engine/` owns raw ingestion, feature computation, materialization, and
   bounded read models.
3. `app/` may render or proxy these outputs, but it does not define indicator
   semantics.
4. Search stores compact signatures, not full raw replay payloads.
5. AI consumes compact summaries and source ids, never raw provider payloads.

## Canonical Layers

### 1. Raw Stores

These are canonical target names. Implementations may begin as CSV/SQLite plus
cache-backed adapters, but the logical contract should stay fixed.

| Store | Grain | Required columns | Notes |
|---|---|---|---|
| `market_ohlcv_bars` | symbol + venue + timeframe + ts | `open`, `high`, `low`, `close`, `volume`, `quote_volume`, `trade_count` | Source of truth for price/volume structure |
| `market_perp_snapshots` | symbol + venue + timeframe + ts | `open_interest`, `funding_rate`, `long_short_ratio`, `long_liq_value`, `short_liq_value`, `liq_density` | Perp and liquidation raw layer |
| `market_orderflow_bars` | symbol + venue + timeframe + ts | `taker_buy_volume`, `taker_sell_volume`, `buy_sell_delta`, `cvd_raw` | Orderflow/tape layer |
| `market_macro_series` | source + ts | `fear_greed`, `btc_dominance`, `dxy_close`, `spx_close`, `vix_close`, `coinbase_premium` | Market environment layer |
| `market_onchain_series` | symbol + chain + ts | `active_addr`, `tx_count`, `mvrv`, `mvrv_zscore`, `puell_multiple`, `exchange_inflow`, `exchange_outflow`, `netflow` | Coin/chain-specific onchain layer |
| `market_dex_snapshots` | symbol + chain + ts | `dex_market_cap`, `dex_fdv`, `dex_liquidity_usd`, `dex_volume_h24`, `dex_buy_pct` | DEX/token-native market structure |
| `market_tokenomics_snapshots` | project + ts | `tvl`, `protocol_revenue`, `token_unlock_amount`, `unlock_ts`, `fdv`, `circulating_supply` | Token structure / IR layer |
| `market_entity_wallet_flows` | entity + wallet + chain + ts | `balance`, `netflow`, `exchange_inflow`, `exchange_outflow`, `tx_count` | Smart-money / MM / fund activity |

### 2. Bar Features

Bar features are calculated at the same cadence as a bar set and are the main
engine input for facts, scanner logic, and replay.

Canonical target store:

`feature_bar_snapshots(symbol, venue, timeframe, ts, feature_json)`

Required promoted bar features:

- price / structure
  - `price_change_1h`
  - `price_change_4h`
  - `price_change_24h`
  - `swing_pivot_distance`
  - `atr_pct`
  - `vol_regime`
  - `body_ratio`
  - `upper_wick_pct`
  - `lower_wick_pct`
- derivatives
  - `funding_rate`
  - `oi_change_1h`
  - `oi_change_24h`
  - `long_short_ratio`
- orderflow
  - `taker_buy_ratio_1h`
  - `taker_buy_ratio_24h`
  - `cvd_state`
  - `cvd_cumulative`
- volume / trend
  - `vol_zscore`
  - `vol_ratio_3`
  - `vol_ratio_24`
  - `obv_slope`
  - `vwap_ratio`
  - `bb_width`
  - `bb_squeeze`

### 3. Window Features

Window features are materialized over a bounded lookback and are the canonical
search / pattern / phase engine inputs.

Canonical target store:

`feature_windows(symbol, venue, timeframe, window_start_ts, window_end_ts, pattern_family, phase_guess, feature_json)`

Required promoted window features:

- price / structure
  - `price_dump_pct`
  - `price_pump_pct`
  - `higher_low_count`
  - `higher_high_count`
  - `range_high`
  - `range_low`
  - `range_width_pct`
  - `pullback_depth_pct`
  - `breakout_strength`
  - `compression_ratio`
- derivatives
  - `oi_change_pct`
  - `oi_zscore`
  - `oi_slope`
  - `oi_spike_flag`
  - `oi_hold_flag`
  - `oi_reexpansion_flag`
  - `funding_rate_zscore`
  - `funding_flip_flag`
  - `funding_positive_flag`
  - `funding_extreme_short_flag`
  - `funding_extreme_long_flag`
  - `ls_ratio_change`
  - `ls_ratio_zscore`
  - `liq_imbalance`
  - `liq_nearby_density`
- orderflow
  - `cvd_delta`
  - `cvd_slope`
  - `cvd_divergence_price`
  - `taker_buy_ratio`
  - `absorption_flag`
  - `order_imbalance`
- volume
  - `volume_zscore`
  - `volume_percentile`
  - `volume_spike_flag`
  - `volume_dryup_flag`
- time / regime
  - `bars_since_event`
  - `signal_duration`
  - `trend_regime`
  - `volatility_regime`
  - `timeframe_alignment_score`

## Core Indicator Dictionary

Each indicator entry below is calculation-ready and directly usable in DB
schema, feature computation, search signatures, and AI explanation layers.

### Price / Structure

| indicator_name | category | raw_source | formula | used_in_phase | priority |
|---|---|---|---|---|---|
| `price_dump_pct` | price | `close` | `(close_t - close_t-n) / close_t-n` | `fake_dump`, `real_dump` | `P0` |
| `higher_low_count` | structure | `low` | consecutive lows where `low_t > low_t-1` | `accumulation` | `P0` |
| `range_width_pct` | structure | `high`, `low` | `(max(high_window) - min(low_window)) / mid_price` | `arch_zone`, `accumulation` | `P1` |
| `breakout_strength` | structure | `close`, `range_high` | `(close - range_high) / range_high` | `breakout` | `P0` |
| `pullback_depth_pct` | structure | `recent_high`, `current_low` | `(recent_high - current_low) / recent_high` | `accumulation` | `P1` |
| `compression_ratio` | structure | `range_width_pct`, `atr_pct` | normalized tightening of range vs volatility | `arch_zone`, `accumulation` | `P1` |

### OI / Derivatives

| indicator_name | category | raw_source | formula | used_in_phase | priority |
|---|---|---|---|---|---|
| `oi_change_pct` | derivatives | `open_interest` | `(oi_t - oi_t-n) / oi_t-n` | `fake_dump`, `real_dump` | `P0` |
| `oi_zscore` | derivatives | `open_interest` | `(oi - mean(window)) / std(window)` | `real_dump`, `breakout` | `P0` |
| `oi_slope` | derivatives | `open_interest` | linear regression slope over window | `accumulation`, `breakout` | `P1` |
| `oi_spike_flag` | derivatives | `oi_zscore` | `oi_zscore > threshold` | `real_dump` | `P0` |
| `oi_reexpansion_flag` | derivatives | `oi_change_pct` | rise -> cool-off -> rise pattern | `breakout` | `P0` |
| `oi_hold_flag` | derivatives | `open_interest` | post-spike OI drawdown below threshold | `accumulation` | `P0` |
| `liq_imbalance` | derivatives | `long_liq_value`, `short_liq_value` | `(short_liq - long_liq) / total_liq` | `breakout` | `P1` |
| `liq_nearby_density` | derivatives | `liquidation_map` | nearby liquidation value within price band | `breakout` | `P1` |

### Funding

| indicator_name | category | raw_source | formula | used_in_phase | priority |
|---|---|---|---|---|---|
| `funding_rate_zscore` | derivatives | `funding_rate` | `(funding - mean(window)) / std(window)` | `fake_dump`, `real_dump` | `P0` |
| `funding_extreme_short_flag` | derivatives | `funding_rate_zscore` | `funding_zscore < -threshold` | `fake_dump`, `real_dump` | `P0` |
| `funding_positive_flag` | derivatives | `funding_rate` | `funding_rate > 0` | `breakout` | `P1` |
| `funding_flip_flag` | derivatives | `funding_rate` | sign change between adjacent bars | `dump -> accumulation` transition | `P1` |

### Volume

| indicator_name | category | raw_source | formula | used_in_phase | priority |
|---|---|---|---|---|---|
| `volume_zscore` | volume | `volume` | `(volume - mean(window)) / std(window)` | `real_dump` | `P0` |
| `volume_spike_flag` | volume | `volume_zscore` | `volume_zscore > threshold` | `real_dump`, `breakout` | `P0` |
| `volume_dryup_flag` | volume | `volume`, `volume_ma` | `volume < volume_ma * threshold` | `arch_zone`, `accumulation` | `P1` |
| `volume_percentile` | volume | `volume` | percentile in lookback window | `all` | `P2` |

### Orderflow

| indicator_name | category | raw_source | formula | used_in_phase | priority |
|---|---|---|---|---|---|
| `cvd_divergence_price` | orderflow | `cvd`, `price` | slope mismatch of CVD vs price | `accumulation` | `P1` |
| `taker_buy_ratio` | orderflow | `taker_buy_volume`, `taker_sell_volume` | `buy / (buy + sell)` | `breakout` | `P2` |
| `absorption_flag` | orderflow | `price`, `volume`, `cvd` | one-sided flow with muted price movement | `accumulation` | `P1` |

### Time / Regime

| indicator_name | category | raw_source | formula | used_in_phase | priority |
|---|---|---|---|---|---|
| `bars_since_event` | time | `ts`, `event_ts` | current bar index minus event bar index | `all` | `P1` |
| `signal_duration` | time | `condition_flag` | consecutive true bars | `all` | `P1` |
| `trend_regime` | regime | `price`, `slope`, `volatility` | rule/score-based regime enum | `all` | `P1` |
| `volatility_regime` | regime | `ATR`, `price` | `ATR / price` bucketed regime | `breakout` | `P2` |

## Phase Engine Input Sets

These are the canonical minimal feature bundles for the TRADOOR/PTB-style
pattern family.

### `fake_dump`

- `price_dump_pct`
- `funding_extreme_short_flag`
- `oi_change_pct`
- `volume_zscore`

### `real_dump`

- `price_dump_pct`
- `volume_spike_flag`
- `oi_spike_flag`

### `accumulation`

- `higher_low_count`
- `oi_hold_flag`
- `pullback_depth_pct`
- `volume_dryup_flag`

### `breakout`

- `breakout_strength`
- `oi_reexpansion_flag`
- `funding_positive_flag`
- `volume_spike_flag`

## Search Corpus Signature

`CorpusWindowSignature` should store compact retrieval keys only.

Canonical required fields:

- identity
  - `symbol`
  - `venue`
  - `timeframe`
  - `window_start_ts`
  - `window_end_ts`
- structure
  - `price_dump_pct`
  - `higher_low_count`
  - `range_width_pct`
  - `breakout_strength`
- derivatives
  - `oi_change_pct`
  - `oi_zscore`
  - `oi_hold_flag`
  - `oi_reexpansion_flag`
  - `funding_rate_zscore`
  - `funding_positive_flag`
  - `funding_extreme_short_flag`
- volume / orderflow
  - `volume_zscore`
  - `volume_dryup_flag`
  - `cvd_divergence_price`
  - `taker_buy_ratio`
- regime / labels
  - `trend_regime`
  - `volatility_regime`
  - `pattern_family`
  - `phase_guess`

Rules:

1. corpus signatures are window-level summaries, not raw series dumps.
2. anything needed for exact replay should remain in raw/cache truth, not in
   the signature.
3. search ranking should use the same canonical feature names as
   `feature_windows`.

## AI Projection Contract

AI should not read raw tables. It reads compact projections built from facts,
search, and runtime references.

Canonical compact projection fields:

- `symbol`
- `timeframe`
- `phase_guess`
- `top_features`
  - e.g. `price_dump_pct`, `oi_zscore`, `funding_rate_zscore`, `volume_zscore`
- `phase_evidence`
  - concise list of matched feature conditions
- `risk_flags`
  - e.g. `liq_nearby_density_high`, `funding_flip_recent`
- `source_refs`
  - ids for fact snapshot, search run, runtime capture

Rules:

1. AI receives feature summaries, not provider-native payloads.
2. feature names must be identical to materialized engine names.
3. if a feature is not materialized or bounded, AI should not be asked to rely
   on it.

## Rollout Priority

### P0 — Must materialize first

- `price_dump_pct`
- `higher_low_count`
- `breakout_strength`
- `oi_change_pct`
- `oi_zscore`
- `oi_spike_flag`
- `oi_hold_flag`
- `oi_reexpansion_flag`
- `funding_rate_zscore`
- `funding_extreme_short_flag`
- `volume_zscore`
- `volume_spike_flag`

### P1 — Reduces false positives

- `range_width_pct`
- `pullback_depth_pct`
- `compression_ratio`
- `oi_slope`
- `funding_flip_flag`
- `volume_dryup_flag`
- `liq_imbalance`
- `liq_nearby_density`
- `cvd_divergence_price`
- `bars_since_event`
- `signal_duration`
- `trend_regime`

### P2 — Alpha expansion

- `volume_percentile`
- `taker_buy_ratio`
- `absorption_flag`
- `volatility_regime`
- wallet/entity flow scores
- token unlock pressure scores
- macro/event interaction scores

## Immediate Implementation Order

1. `W-0122`
   - promote P0/P1 fields that already have raw engine inputs into bounded fact
     contracts and indicator catalog entries
2. `W-0145`
   - materialize `feature_windows` and `CorpusWindowSignature` using the same
     feature names
3. `W-0142`
   - allow runtime captures and research contexts to reference these feature ids
     and phase bundles
4. `W-0143`
   - build `AgentContextPack` from compact projections only

## Non-Goals

- define UI archetypes or rendering behavior
- promise immediate provider coverage for every field listed here
- force one physical database engine in this document

