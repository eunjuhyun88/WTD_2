# Binance Perp Futures Data Ingest Pipeline

Data foundation for the W-0414 Meta-rule Trading Framework.
Fetches OHLCV, open interest, and funding rate from Binance USDT-M futures.

## Universe

20 symbols across 3 tiers (all USDT-M perpetuals):

| Tier | Symbols |
|------|---------|
| TIER1 (5) | BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT |
| TIER2 (10) | DOGE, ADA, AVAX, LINK, TRX, DOT, MATIC, TON, SHIB, LTC |
| TIER3 (5) | NEAR, ATOM, UNI, ETC, XLM |

Timeframes: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`

## Output Layout

```
data_cache/research/binance/
└── {SYMBOL}/
    ├── {tf}.parquet          # OHLCV klines
    ├── oi_{period}.parquet   # Open interest history
    └── funding.parquet       # Funding rate history
```

### Schema

**OHLCV** (`{tf}.parquet`):
| Column | Type | Description |
|--------|------|-------------|
| ts_ms | int64 | Open time (UTC milliseconds) |
| open | float64 | Open price |
| high | float64 | High price |
| low | float64 | Low price |
| close | float64 | Close price |
| volume | float64 | Base asset volume |
| quote_volume | float64 | Quote asset volume |
| trades | int64 | Number of trades |
| taker_buy_volume | float64 | Taker buy base volume |
| taker_buy_quote | float64 | Taker buy quote volume |

**Open Interest** (`oi_{period}.parquet`):
| Column | Type | Description |
|--------|------|-------------|
| ts_ms | int64 | Timestamp (UTC ms) |
| open_interest | float64 | Sum open interest (contracts) |
| sum_open_interest_value | float64 | Sum OI in USD |

**Funding Rate** (`funding.parquet`):
| Column | Type | Description |
|--------|------|-------------|
| ts_ms | int64 | Funding time (UTC ms) |
| funding_rate | float64 | Funding rate (8h interval) |
| mark_price | float64 | Mark price at funding |

## CLI

### Backfill (full historical)

```bash
# Single symbol, 1h bars, last 30 days
python -m engine.research.ingest.backfill --symbol BTCUSDT --tf 1h --days 30

# With verification output
python -m engine.research.ingest.backfill --symbol BTCUSDT --tf 1h --days 30 --verify

# Open interest (5m period, 7 days)
python -m engine.research.ingest.backfill --symbol BTCUSDT --oi-period 5m --days 7

# Funding rate (30 days)
python -m engine.research.ingest.backfill --symbol BTCUSDT --funding --days 30

# All 20 universe symbols at once
python -m engine.research.ingest.backfill --all-symbols --tf 1h --days 30

# Combined: OHLCV + OI + funding in one run
python -m engine.research.ingest.backfill \
    --symbol BTCUSDT --tf 1h --oi-period 5m --funding --days 30
```

### Incremental (cron-friendly)

```bash
# Append new 1h bars for all symbols since last stored timestamp
python -m engine.research.ingest.incremental --all-symbols --tf 1h

# TIER1 only
python -m engine.research.ingest.incremental --tier 1 --tf 1h

# Update OI + funding for a single symbol
python -m engine.research.ingest.incremental \
    --symbol BTCUSDT --oi-period 5m --funding
```

### Cron examples

```cron
# 1h OHLCV update every hour
5 * * * * cd /path/to && python -m engine.research.ingest.incremental --all-symbols --tf 1h

# 5m OI update every 5 minutes (TIER1 only)
*/5 * * * * cd /path/to && python -m engine.research.ingest.incremental --tier 1 --oi-period 5m

# Funding update every 8 hours
0 */8 * * * cd /path/to && python -m engine.research.ingest.incremental --all-symbols --funding
```

## Rate Limiting

Binance USDT-M weight budget: 1200 units/minute. This client:
- Tracks consumed weight per rolling 60-second window
- Sleeps automatically when approaching 1100 weight units
- On HTTP 429: sleeps 65 seconds and retries once
- klines requests use weight=10 (limit=1500 per request)

## Tests

```bash
cd engine
python -m pytest research/ingest/tests/ -v
```

All tests use recorded fixtures — no live HTTP calls.
