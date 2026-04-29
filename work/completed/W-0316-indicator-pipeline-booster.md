---
id: W-0316
title: 100-Indicator Data Pipeline (Pattern Discovery Booster)
wave: 4
priority: P1
effort: L
status: 🟡 Design Draft
issue: #659
created: 2026-04-30
---

# W-0316 — 100-Indicator Data Pipeline (Pattern Discovery Booster)

> Wave: 4 | Priority: P1 | Effort: L  
> Charter: In-Scope (data pipeline, engine)  
> Status: 🟡 Design Draft  
> Issue: #659  
> Created: 2026-04-30

## Goal

Wire all free data sources (12 existing fetchers + 4 new) into `ParquetStore` and extend `_build_perp_from_store` so pattern building blocks can select from 95/100 indicators as inputs. **Not a dashboard** — a pattern discovery input booster.

## Context

**Current state (2026-04-30):**
- `indicator_catalog.py`: live=41, partial=27, blocked=11, missing=21
- `LIBRARY_COMBOS` (12 patterns) rely on perp columns: `funding_rate`, `oi_raw`, `oi_change_1h`, `oi_change_24h`, `long_short_ratio`
- 4 building blocks fail silently because their data columns don't exist in perp: `coinbase_premium_positive`, `oi_exchange_divergence`, `dex_buy_pressure`, `spot_futures_cvd_divergence`
- 12 free fetchers already written in `engine/data_cache/` — **not yet wired** to ParquetStore or scanner
- Bybit 2yr OI backfill completed (BTC/ETH/SOL: 17,280 rows). Retry fix committed (`59111cff`).

**Truly blocked (5 indicators, Glassnode-exclusive):**
- SOPR, LTH-SOPR, Accumulation Trend Score, HODL Waves — methodology proprietary
- Arkham smart money labels — API key required, no free tier

## Scope

### Files Modified
```
engine/
  data_cache/
    parquet_store.py          # 7 new write_* / read_* methods
    backfill_async.py         # Phase 1+2 fetcher orchestration hooks
    fetch_defillama.py        # NEW — Phase 2
    fetch_binance_top_trader.py  # NEW — Phase 2
    fetch_blockchain_com.py   # NEW — Phase 2
    fetch_token_unlocks.py    # NEW — Phase 2
  research/
    pattern_scan/
      scanner.py              # _build_perp_from_store 10+ new columns
  market_engine/
    indicator_catalog.py      # status updates: partial/missing → live
```

### Phase 1 — Wire 12 Existing Free Fetchers (1-2 days)

| Fetcher | Source | API Key? | New ParquetStore dtype | Perp columns added |
|---|---|---|---|---|
| `fetch_onchain.py` | CoinMetrics Community | ❌ Free | `write_onchain` / `read_onchain` | `mvrv_zscore`, `active_addr`, `tx_count`, `puell_multiple` |
| `fetch_coinbase.py` | Coinbase public | ❌ Free | `write_coinbase_premium` / `read_coinbase_premium` | `coinbase_premium_pct` |
| `fetch_etf_flow.py` | Farside (scrape) | ❌ Free | `write_etf_flow` / `read_etf_flow` | `etf_flow_usd` |
| `fetch_macro.py` | Yahoo Finance yfinance | ❌ Free | `write_macro` / `read_macro` | `dxy`, `vix`, `gold_pct_chg` |
| `fetch_social.py` | alternative.me + CoinGecko | ❌ Free | `write_social` / `read_social` | `fear_greed_index`, `trending_rank` |
| `fetch_dexscreener.py` | DexScreener API | ❌ Free | `write_dex` / `read_dex` | `dex_volume_24h`, `dex_buy_pct` |
| `fetch_exchange_oi.py` | Bybit/OKX public | ❌ Free | `write_exchange_oi` / `read_exchange_oi` | `oi_bybit`, `oi_okx`, `oi_binance`, `oi_exchange_ratio` |
| `fetch_binance_liquidations.py` | Binance public | ❌ Free | `write_liquidations` / `read_liquidations` | `liq_long_usd`, `liq_short_usd`, `liq_ratio` |
| `fetch_coinalyze_oi.py` | Coinalyze free tier | ⚠️ Soft | (aggregated OI) | `oi_total_agg` |
| `fetch_coinalyze_ls.py` | Coinalyze free tier | ⚠️ Soft | (L/S ratio) | `ls_ratio_exchange` |
| `fetch_cme_cot.py` | CFTC public | ❌ Free | `write_cot` / `read_cot` | `cme_net_position` |
| `fetch_upbit.py` | Upbit public | ❌ Free | (Kimchi premium) | `kimchi_premium_pct` |

**`_build_perp_from_store` columns added (Phase 1):**
```
coinbase_premium_pct, dex_volume_24h, dex_buy_pct,
oi_bybit, oi_okx, oi_exchange_ratio,
liq_long_usd, liq_short_usd, liq_ratio,
mvrv_zscore, active_addr, fear_greed_index,
dxy, vix, kimchi_premium_pct
```

**Building blocks unlocked after Phase 1:**
- `coinbase_premium_positive` → uses `coinbase_premium_pct`
- `oi_exchange_divergence` → uses `oi_bybit / oi_okx / oi_binance`
- `dex_buy_pressure` → uses `dex_buy_pct`
- `spot_futures_cvd_divergence` → uses `liq_ratio` as proxy

### Phase 2 — 4 New Free Fetchers (3-5 days)

#### `fetch_defillama.py`
- **Source**: `https://api.llama.fi` (free, no key)
- **Endpoints**:
  - `/tvl/{protocol}` — protocol TVL series
  - `/overview/fees` — protocol revenue/fees (daily)
  - `/overview/dexs` — DEX volume by chain
  - `/bridges` — bridge inflows/outflows
  - `/overview/derivatives` — perps volume (dYdX, GMX, etc.)
- **New ParquetStore**: `write_defillama` / `read_defillama`
- **Perp columns**: `defillama_tvl`, `defillama_fees_24h`, `defillama_dex_vol`, `perps_volume_24h`

#### `fetch_binance_top_trader.py`
- **Source**: Binance public futures API (free, no key)
  - `GET /futures/data/topLongShortPositionRatio` — top trader position ratio
  - `GET /futures/data/globalLongShortAccountRatio` — global account ratio
- **New ParquetStore**: extends `write_longshort` with `source=binance_top`
- **Perp columns**: `top_trader_ls_ratio`, `global_account_ls_ratio`

#### `fetch_blockchain_com.py`
- **Source**: `https://api.blockchain.info` (free)
  - `/charts/miners-revenue` — miner revenue (BTC only)
  - `/charts/utxo-count` — UTXO count proxy for holder distribution
  - `/charts/hash-rate` — hashrate
- **New ParquetStore**: `write_blockchain_com` / `read_blockchain_com`
- **Perp columns (BTC-only)**: `miner_revenue_usd`, `utxo_count`, `hashrate`

#### `fetch_token_unlocks.py`
- **Source**: `https://api.token.unlocks.app/v1` or CryptoRank free
  - Scheduled unlocks within next 30 days
  - Cliff/vesting events by token
- **New ParquetStore**: `write_token_unlocks` / `read_token_unlocks`
- **Perp columns**: `unlock_usd_30d`, `unlock_pct_supply_30d`, `cliff_event_flag`

### `_build_perp_from_store` final shape (Phase 1+2)

```python
# Existing columns
funding_rate, oi_raw, oi_change_1h, oi_change_24h, long_short_ratio

# Phase 1 new
coinbase_premium_pct, dex_volume_24h, dex_buy_pct,
oi_bybit, oi_okx, oi_exchange_ratio,
liq_long_usd, liq_short_usd, liq_ratio,
mvrv_zscore, active_addr, fear_greed_index,
dxy, vix, kimchi_premium_pct

# Phase 2 new
defillama_tvl, defillama_fees_24h, defillama_dex_vol, perps_volume_24h,
top_trader_ls_ratio, global_account_ls_ratio,
miner_revenue_usd (BTC-only), utxo_count (BTC-only),
unlock_usd_30d, unlock_pct_supply_30d, cliff_event_flag
```

All missing symbols get NaN (existing pattern — already tested).

## Non-Goals

- Dashboard / UI display of indicators
- Real-time streaming (hourly batch cron is sufficient)
- Any Glassnode/Arkham paid integration
- Changing `scanner.py` pattern logic — only data plumbing

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| DeFiLlama API rate limit (10 req/min) | Medium | Low | Cached daily, sequential |
| Farside HTML scrape fragility | High | Low | ETF flow optional column, graceful NaN |
| Token unlock API free tier changes | Medium | Low | Flag as optional column |
| `_build_perp_from_store` NaN propagation | Low | Medium | All new columns default NaN, tested |
| ParquetStore write collision (concurrent) | Low | High | Symbol-level file locking (existing pattern) |

### Dependencies
- Existing: `fetch_onchain.py`, `fetch_coinbase.py` etc. all functional
- Bybit OI retry fix already merged (`59111cff`)
- `_build_perp_from_store` NaN placeholder fix already merged (`74de3b52`)

### Rollback
- All new ParquetStore dtypes are additive — no schema migration
- `_build_perp_from_store` is graceful (try/except + NaN default per dtype)
- Old `ALL_COMBOS` (7 simple patterns) unaffected

## AI Researcher 관점

### Data Impact
- **95/100 live** (up from 41): meaningful — pattern combos can now condition on macro regime (DXY/VIX), on-chain health (MVRV/active addr), DEX pressure, exchange OI divergence, miner activity
- **MVRV Z-Score**: academic basis — Glassnode 2019, Checkmate 2020 — high Z = overvaluation (Sharpe suppressor), low Z = accumulation zone (Sharpe booster)
- **Coinbase Premium**: systematic signal — Kim et al. 2022 showed premium >0.3% precedes BTC rallies within 48h
- **Fear & Greed**: sentiment momentum — contrarian below 20, momentum above 80 — validates RSIOversold/RSIOverbought combos

### Statistical Validation
- New columns enter `_build_perp_from_store` as raw signals — no pre-filtering
- Pattern building blocks gate on these columns individually with their own thresholds
- NaN handling: all new columns → NaN when data absent → building block fires `False` (safe default)

### Failure Modes
- API outage → cached stale data used → NaN after TTL expiry → building block disabled (safe)
- Perp join misalignment (hourly vs daily data) → forward-fill with 24h cap in `_build_perp_from_store`

## Implementation Plan

### Phase 1 (1-2 days)
1. `parquet_store.py`: add `write_onchain`, `write_coinbase_premium`, `write_etf_flow`, `write_macro`, `write_social`, `write_dex`, `write_exchange_oi`, `write_liquidations` + corresponding `read_*` methods
2. `scanner.py` `_build_perp_from_store`: add 8 new `try/except` blocks, one per dtype, each joining NaN-filled columns if source absent
3. `indicator_catalog.py`: update status for newly live indicators
4. Tests: `test_parquet_store_dtypes.py` — round-trip write/read for each new dtype; `test_build_perp_completeness.py` — all 12 LIBRARY_COMBOS no KeyError

### Phase 2 (3-5 days)
5. `fetch_defillama.py`: TVL, fees, DEX vol, perps vol
6. `fetch_binance_top_trader.py`: top trader L/S + global L/S
7. `fetch_blockchain_com.py`: BTC miner/UTXO (symbol-gated — skip non-BTC)
8. `fetch_token_unlocks.py`: unlock calendar with 30d lookahead
9. Wire Phase 2 fetchers into `backfill_async.py` schedule
10. Extend `_build_perp_from_store` Phase 2 columns
11. `indicator_catalog.py`: final status pass — target ≥95 live

## Exit Criteria

- [ ] AC1: `indicator_catalog.py` `status=live` count ≥ 95/100
- [ ] AC2: 4 building blocks unlocked — no `KeyError` in cycle scan for any live symbol
- [ ] AC3: `ParquetStore` round-trip tests pass for all 7 new Phase 1 dtypes
- [ ] AC4: `_build_perp_from_store` integration test: all 12 `LIBRARY_COMBOS` fire without exception on 10 sample symbols
- [ ] AC5: CI green
- [ ] AC6: `pattern_object_combos.py` `LIBRARY_COMBOS` scan completes with 0 `context build failed` errors (KeyError class)

## Open Questions

- [ ] [Q-1] `fetch_token_unlocks.py` — token.unlocks.app free tier: rate limit unclear. Fallback: CryptoRank `/api/v0.1.8/currencies` which has free public unlock data.
- [ ] [Q-2] Coinalyze API key: required for full OI aggregation. If unavailable, use `oi_bybit + oi_binance` sum as proxy.
- [ ] [Q-3] `_build_perp_from_store` join strategy for daily vs hourly: reindex to hourly + ffill(24) or resample? Decision: ffill with `limit=24` bars (24h cap).
