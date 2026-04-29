## § 11. Data Contracts

> **2026-04-11 patch:** the 15-layer `SignalSnapshot` structure is dropped entirely. Real data contracts come from the WTD backend (`/Users/ej/Projects/WTD/cogochi-autoresearch/`) and are grounded in what actually runs. `Pattern` → `Challenge`, `Feedback` → `Instance`, `ModelVersion` → Phase 2+.

### 11.1 klines DataFrame (7 columns)

Raw OHLCV from Binance spot, cached at `WTD/cogochi-autoresearch/data_cache/cache/{SYMBOL}_{TIMEFRAME}.csv`. Fetched via `data_cache.load_klines(symbol, timeframe)`.

```
index: pd.DatetimeIndex (UTC)
columns:
  open                      float
  high                      float
  low                       float
  close                     float
  volume                    float
  taker_buy_base_volume     float
```

Only `1h` is supported as of Phase E1. See `WTD/cogochi-autoresearch/data_cache/fetch_binance.py`.

### 11.2 features DataFrame (28 columns)

Computed from klines by `scanner.feature_calc.compute_features_table(klines, symbol, perp=None)`. First `MIN_HISTORY_BARS` (~500) rows are dropped as warmup. Past-only (no look-ahead).

```
FEATURE_COLUMNS = (
  # Trend
  "ema20_slope", "ema50_slope", "ema_alignment",
  "price_vs_ema50",
  # Momentum
  "rsi14", "rsi14_slope", "macd_hist", "roc_10",
  # Volatility
  "atr_pct", "atr_ratio_short_long", "bb_width", "bb_position",
  # Volume
  "volume_24h", "vol_ratio_3", "obv_slope",
  # Structure
  "htf_structure",  # "uptrend" | "downtrend" | "range"
  "dist_from_20d_high", "dist_from_20d_low", "swing_pivot_distance",
  # Microstructure (perp — real data, Phase E1)
  "funding_rate", "oi_change_1h", "oi_change_24h", "long_short_ratio",
  # Order flow
  "cvd_state",           # "buying" | "selling" | "neutral"
  "taker_buy_ratio_1h",
  # Meta
  "regime",              # "risk_on" | "risk_off" | "chop"
  "hour_of_day", "day_of_week",
)
```

The perp columns (`funding_rate`, `oi_change_*`, `long_short_ratio`) fall back to neutral defaults when the perp layer is unavailable. See `data_cache.load_perp` and `fetch_binance_perp.py`.

### 11.3 Context wrapper (passed to every block)

```python
@dataclass(frozen=True)
class Context:
    klines: pd.DataFrame     # 7-column OHLCV, may start before features.index[0]
    features: pd.DataFrame   # 28-column feature table (post-warmup)
    symbol: str              # diagnostics only
```

Every block function has the same signature:

```python
def block(ctx: Context, *, param1=default, param2=default, ...) -> pd.Series[bool]
```

All tunable parameters are keyword-only after `*`. Returns a bool Series aligned to `ctx.features.index`. See `WTD/cogochi-autoresearch/building_blocks/` for the 29 implemented blocks (post Phase E1).

### 11.4 Challenge (user-saved pattern, replaces old `Pattern`)

A challenge is a **directory on disk**, not a DB row:

```
WTD/challenges/pattern-hunting/<slug>/
├── answers.yaml       # canonical wizard output — THE spec
├── match.py           # auto-generated, user/LLM editable
├── prepare.py         # auto-generated, DO NOT MODIFY
├── program.md         # agent instructions / README
├── pyproject.toml     # uv project
└── output/
    └── instances.jsonl   # evaluation results (one JSON object per match bar)
```

`answers.yaml` schema:

```yaml
version: 1
schema: pattern_hunting
created_at: 2026-04-11T08:22:23Z
identity:
  name: sample-rally-pattern           # slug
  description: 10% rally over 3 days, Bollinger expansion, enter on long lower wick.
setup:
  direction: long                       # long | short
  universe: binance_30
  timeframe: 1h
blocks:
  trigger:
    module: building_blocks.triggers
    function: recent_rally
    params:
      pct: 0.1
      lookback_bars: 72
  confirmations:
    - module: building_blocks.confirmations
      function: bollinger_expansion
      params:
        expansion_factor: 1.5
        ago: 5
  entry:
    module: building_blocks.entries
    function: long_lower_wick
    params:
      body_ratio: 1.5
  disqualifiers:
    - module: building_blocks.disqualifiers
      function: extreme_volatility
      params:
        atr_pct_threshold: 0.1
outcome:
  target_pct: 0.06
  stop_pct: 0.02
  horizon_bars: 24
```

Composition rule: `pattern = trigger ∧ conf₁ ∧ ... ∧ confₙ ∧ entry ∧ ¬disq₁ ∧ ... ∧ ¬disqₘ`. Wizard constraints: trigger=1, confirmations 0-3, entry 0-1, disqualifiers 0-3.

### 11.5 Instance row (replaces old `Feedback`)

One row in `<slug>/output/instances.jsonl`:

```json
{
  "symbol": "BTCUSDT",
  "timestamp": "2026-03-22T14:00:00+00:00",
  "entry_price": 67250.5,
  "upside": 0.042,
  "downside": 0.008,
  "outcome": 0.034
}
```

`outcome = upside - downside` over `horizon_bars` forward. No manual labeling — evaluation is deterministic on historical data.

### 11.6 Evaluate stdout (final SCORE contract)

Final block that `prepare.py evaluate` prints to stdout (parsed by `/lab` UI):

```
---
SCORE: <float>
N_INSTANCES: <int>
N_SYMBOLS_HIT: <int>
MEAN_OUTCOME: <float>
POSITIVE_RATE: <float>
TOTAL_SECONDS: <float>
```

SCORE formula: `mean_outcome × positive_rate × coverage`, where `coverage = n_symbols_hit / n_universe`. If `n_instances < MIN_INSTANCES` (default 30), `SCORE = -1.0`.

### 11.7 ModelVersion / Adapter — **DEFERRED (Phase 2+)**

No per-user LoRA adapters in Day-1. The KTO/LoRA training pipeline, `ModelVersion` table, and deploy-gate mechanics return with `/training` surface in Phase 2+. Day-1 does NOT fine-tune models; it only composes + evaluates patterns.

---

