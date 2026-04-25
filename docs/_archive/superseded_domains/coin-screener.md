# Domain: Coin Screener

## Goal

Define the engine-owned Screener lane that ranks Binance alpha + futures symbols before Pattern Engine timing logic runs.

Screener is not a timing engine.

Its job is:

1. reduce the symbol pool to structurally attractive names
2. keep the reasoning per criterion durable and inspectable
3. feed the downstream scan universe and alert priority

## Role In The Stack

```text
token universe / external enrichments
  -> screener raw metrics
  -> criterion scorers
  -> screener grade + reasons
  -> filtered universe
  -> Pattern Engine phase scan
  -> alerts / terminal / deferred screener surface
```

Pattern Engine answers:

- is timing improving now?

Coin Screener answers:

- is this symbol worth spending timing attention on at all?

## Boundary

### Owns

- symbol-level upstream ranking for the scan universe
- raw metric collection and freshness tracking for Screener criteria
- per-criterion score logic and weighted total score
- grade classification and downgrade rules
- read contracts for score breakdown, runs, and latest grade state

### Does Not Own

- exact trade timing
- app-local ranking heuristics
- manual UI sorting rules disconnected from engine scores
- model training or alert fanout semantics

## Runtime Placement

### `engine-api`

- serves read-only Screener routes
- may expose a narrow debug route for one-symbol recompute
- does not run heavy batch recomputation inline for public clients

### `worker-control`

- runs slow collectors and scheduled score recomputation
- writes durable Screener run output
- triggers filtered-universe refresh

### `app-web`

- renders grade lists and breakdowns
- links Screener output into `/terminal` and `/patterns`
- does not compute canonical criterion scores client-side

## Operating Model

Screener should operate as three coordinated layers.

### 1. Structural Score Layer

Slow-moving criteria, recomputed daily or on symbol discovery:

- market cap
- drawdown
- history / prior overpump risk
- supply concentration
- sector classification
- SNS activity
- events
- aster listing

This layer answers:

- if timing were ignored, is this still a name worth tracking?

### 2. Timing Overlay Layer

Fast criteria, recomputed every 15 minutes with current market state:

- pattern phase
- onchain / derivatives context
- bot activity

This layer answers:

- among structurally acceptable names, is the setup getting interesting now?

### 3. Confidence Layer

Trust metadata, recomputed whenever any criterion set changes:

- available weight coverage
- missing critical inputs
- stale-source penalties
- identity-resolution quality

This layer answers:

- how much should downstream consumers trust the structural and timing outputs?

This split keeps the engine cheap enough to run while still letting timing react fast without turning every grade change into a noisy timing artifact.

## Canonical Output Model

Screener must not collapse everything into one opaque grade.

The canonical per-symbol output is:

- `structural_score`
- `structural_grade`
- `timing_score`
- `timing_state`
- `confidence`
- `composite_sort_score`
- `action_priority`

Meaning:

- `structural_grade` is the durable "good symbol?" answer
- `timing_score` is the "interesting now?" answer
- `confidence` is the "how complete and trustworthy is this record?" answer
- `composite_sort_score` is only for ranking rows, not for replacing the split outputs
- `action_priority` is the downstream alert/surface priority class

## Symbol Pool And Universe Integration

### Source Pool

The source pool should start from the existing shared token-universe dataset:

- `engine/data_cache/token_universe.py`

That already gives:

- symbol
- base asset
- name
- market cap
- 24h volume
- OI
- sector
- display rank

This means Screener should not build a separate top-level futures universe index first.

### New Named Universe

Screener should add new named universe entries instead of mutating `binance_dynamic`.

Recommended names:

- `screened_ab` -> latest Screener run, grades `A` and `B`
- `screened_a` -> latest Screener run, grade `A` only

Fallback rule:

- if no fresh Screener run exists, `screened_ab` must fall back to `binance_dynamic`
- fallback must be explicit in logs and returned metadata

This avoids breaking current scanner behavior before Screener is trusted.

## Record Families

Production persistence can be SQLite first, but the logical record families must be explicit.

### Screener Asset Registry

Stable symbol identity plus external ids.

```json
{
  "symbol": "UBUSDT",
  "base_asset": "UB",
  "coingecko_id": "ub-token",
  "contract_address": "0x...",
  "chain": "bsc",
  "is_binance_alpha": true,
  "created_at": "2026-04-16T00:00:00Z"
}
```

### Screener Metric Snapshot

Raw criterion inputs with freshness and provenance.

```json
{
  "symbol": "UBUSDT",
  "run_id": "scr_20260416_0000",
  "metric_key": "market_cap",
  "source": "coingecko",
  "value": {
    "min_mc_usd": 12800000,
    "circulating_supply": 310000000,
    "lookback_days": 365
  },
  "freshness": {
    "observed_at": "2026-04-15T23:58:00Z",
    "ttl_seconds": 86400
  }
}
```

### Screener Criterion Score

One normalized score per criterion with an explanation stub.

```json
{
  "symbol": "UBUSDT",
  "run_id": "scr_20260416_0000",
  "criterion": "market_cap",
  "score": 85,
  "weight": 0.2,
  "status": "scored",
  "reason": "min_mc_usd within preferred 5M-30M band",
  "raw_refs": {
    "min_mc_usd": 12800000
  }
}
```

`status` should be one of:

- `scored`
- `unscored`
- `missing_source`
- `stale_source`
- `failed`

### Screener Listing

Latest per-symbol rollup used by routes and filtered universe loading.

```json
{
  "symbol": "UBUSDT",
  "run_id": "scr_20260416_1200",
  "structural_score": 84.0,
  "structural_grade": "A",
  "timing_score": 93.0,
  "timing_state": "accumulation_ready",
  "composite_sort_score": 87.6,
  "confidence": "high",
  "hard_filtered": false,
  "status": "scored",
  "grade_flags": ["pattern_accumulation", "supply_concentrated_ok"],
  "action_priority": "P0",
  "pattern_phase": "ACCUMULATION",
  "freshness": {
    "base_updated_at": "2026-04-16T00:05:00Z",
    "live_updated_at": "2026-04-16T12:00:00Z"
  },
  "coverage": {
    "available_weight": 0.88,
    "missing_criteria": ["events"],
    "stale_criteria": []
  }
}
```

### Screener Run

Top-level audit record for a batch recompute.

```json
{
  "run_id": "scr_20260416_1200",
  "mode": "overlay",
  "started_at": "2026-04-16T12:00:00Z",
  "completed_at": "2026-04-16T12:01:10Z",
  "symbols_considered": 286,
  "symbols_scored": 271,
  "symbols_filtered_hard": 15,
  "grade_counts": {
    "A": 12,
    "B": 47,
    "C": 212
  },
  "used_fallback_universe": false
}
```

## Criteria Rollout Matrix

The original 11 criteria should not land as one implementation unit.

### Sprint 1: Core, Low-Dependency

- market cap
- drawdown
- history
- supply concentration
- pattern
- onchain

These are enough to make Screener operational as an upstream filter.

### Sprint 2: Medium-Risk Enrichment

- SNS
- sector
- aster listing

### Sprint 3: High-Risk / Expensive Enrichment

- events
- bot activity
- KOL-specific overlays if ever added

## Score Aggregation Rules

The weighted sum should separate structural classification from timing classification.

### Structural Score

Recommended formula:

```text
structural_score_raw =
  market_cap * 0.24 +
  drawdown * 0.18 +
  supply * 0.18 +
  history * 0.12 +
  sns * 0.08 +
  sector * 0.07 +
  events * 0.08 +
  aster * 0.05
```

Rules:

- `bot activity` should not be part of structural score in Sprint 1; keep it as annotation until it proves reliable
- missing structural criteria should reduce trust, not silently behave like neutral conviction

### Timing Score

Recommended formula:

```text
timing_score_raw =
  pattern * 0.7 +
  onchain * 0.3
```

Rules:

- timing score is downstream of structural eligibility
- timing score should not rescue structurally weak symbols into the filtered universe by itself
- `BREAKOUT` can keep high timing energy but must map to a `late` timing state rather than a high-priority entry state

### Confidence / Coverage

Confidence is not a feeling score. It is a deterministic trust state from data coverage.

```text
coverage_ratio = available_weight / expected_weight

if identity_resolution_failed:
  confidence = "low"
elif coverage_ratio >= 0.85 and critical_inputs_fresh:
  confidence = "high"
elif coverage_ratio >= 0.65:
  confidence = "medium"
else:
  confidence = "low"
```

Important:

- confidence must be stored separately from structural score and timing score
- low confidence can cap grade promotion or suppress high-priority alerts

### Structural Grade Thresholds

- `A` -> `structural_score >= 80`
- `B` -> `60 <= structural_score < 80`
- `C` -> `< 60`

### Timing State Mapping

Recommended timing states:

- `cold`
- `watch`
- `setup_forming`
- `accumulation_ready`
- `late`

Example mapping:

- `FAKE_DUMP` -> `watch`
- `ARCH_ZONE` -> `setup_forming`
- `REAL_DUMP` -> `setup_forming`
- `ACCUMULATION` -> `accumulation_ready`
- `BREAKOUT` -> `late`

### Composite Sort Score

The app will still need one sortable number, but that number must not replace the split output model.

Recommended formula:

```text
composite_sort_score =
  structural_score * 0.7 +
  timing_score * 0.3
```

This is for ordering rows only.

### Hysteresis

To avoid alert flapping near thresholds:

- enter `A` at `structural_score >= 82`
- leave `A` only when `structural_score < 76`

Equivalent hysteresis windows should be defined for timing-state promotions if needed.

### Hard Filters

Hard filters should short-circuit grade assignment and mark the symbol `excluded`.

Initial hard filters:

- minimum market cap floor violated (`min_mc_usd > 100M`)
- extreme drawdown risk (`drawdown > 95%`)
- explicit blacklist hit
- source identity incomplete for a required core criterion

Important:

- `excluded` is not the same as grade `C`
- excluded symbols should not enter `screened_ab`

### Missing Data Policy

Do not silently insert neutral 50 scores for missing sources.

Instead:

- score only available criteria
- normalize by `available_weight`
- apply a confidence downgrade if too much weight is missing

Example:

```text
structural_score = weighted_sum / available_weight

if available_weight < 0.70:
  structural grade ceiling = B
if available_weight < 0.50:
  status = insufficient_data
```

This prevents expensive missing criteria from making weak symbols look deceptively strong.

## Criterion-Specific Notes

### Market Cap

- compute from circulating supply, not FDV
- use a lookback window version in the metric record so reruns are reproducible

### Drawdown

- use canonical ATH/ATL inputs stored in metric snapshots
- store both drawdown and current recovery-from-low so downgrade logic is auditable

### History

- history score is not redundant with drawdown
- drawdown asks "how broken did it get?"
- history asks "has this already had its main post-bottom repricing?"

### Supply Concentration

- known Binance treasury addresses must be a versioned allowlist
- concentration scoring should expose both `raw_top10_pct` and `adjusted_top10_pct`

### Pattern

- Pattern Engine should be treated as a live overlay input only
- Screener should read phase state; it should not duplicate the phase machine

### Onchain

- for now this means engine-accessible derivatives context such as funding, OI trend, and L/S ratio
- name can remain `onchain` for user vocabulary, but implementation should record actual source type

## Manual Override Plane

Some Screener inputs are operational truth, not discoverable truth.

These should live in explicit override tables, not hardcoded inside scorer functions.

### Required Override Families

1. `symbol_blacklist`
   - symbols or projects that should be excluded regardless of computed score
   - examples: known washed majors, names the strategy explicitly does not want

2. `wallet_allow_deny`
   - known Binance treasury wallets
   - known team wallets that should be ignored or counted specially in concentration scoring

3. `asset_identity_override`
   - manual symbol to contract/coingecko identity fixes
   - required when ticker collisions or chain ambiguity break collector joins

4. `criterion_override`
   - one-off criterion score clamps or forced statuses with an operator reason
   - use sparingly and audit every change

### Override Contract

Every override row should carry:

- `scope`
- `target`
- `action`
- `reason`
- `author`
- `created_at`
- `expires_at` if temporary

Override application must be visible in Screener listing flags and detail routes.

## Scheduler Model

Recommended jobs:

1. `screener_base_refresh`
   - cadence: daily
   - recomputes slow criteria and rewrites latest listings

2. `screener_overlay_refresh`
   - cadence: every 15 min
   - recomputes pattern/onchain overlays only

3. `screener_discovery_refresh`
   - cadence: daily
   - checks for newly listed symbols, missing ids, and missing enrichment rows

4. `screener_notification_refresh`
   - cadence: every 15 min after overlay refresh
   - emits grade-entry and high-priority state changes

## Route Contracts

### Read Routes

`GET /screener/runs/latest`

- returns latest run metadata and grade counts

`GET /screener/listings?grade=A&limit=50&sort=composite_sort_score`

- returns latest symbol listings with structural grade, timing state, confidence, and per-criterion score stubs

`GET /screener/assets/{symbol}`

- returns one symbol's latest listing, criteria breakdown, freshness, overrides applied, and linked pattern status

`GET /screener/universe?min_grade=B`

- returns the current filtered symbol set and fallback state

### Internal / Worker Routes

`POST /internal/screener/runs/base`

- trigger daily recompute

`POST /internal/screener/runs/overlay`

- trigger live overlay recompute

These should not be public browser routes.

## Alert Integration

Screener should generate priority classes, not only raw event types.

### Event Types

1. `grade_entered_a`
   - symbol newly crossed into structural grade `A`

2. `grade_dropped_from_a`
   - symbol fell below structural grade `A`

3. `a_or_b_accumulation`
   - symbol is `A` or `B` and Pattern Engine entered `ACCUMULATION`

4. `confidence_dropped`
   - confidence fell below the threshold required for high-priority alerting

### Priority Matrix

Recommended downstream mapping:

- `P0` -> `A` + `accumulation_ready` + `confidence=high`
- `P1` -> `A` + `setup_forming` + `confidence>=medium`
- `P1` -> `B` + `accumulation_ready` + `confidence=high`
- `P2` -> `A` + `late`
- `P2` -> `B` + `setup_forming`
- `P3` -> everything else retained only for browsing

The combined `A + accumulation_ready + confidence high` case is the real product target.

## Surface Integration

### First Surface Priority

Before a dedicated page exists, app surfaces should be able to consume:

- top `A` listings
- per-symbol breakdown
- `Open Terminal` action
- current phase and freshness badges

Practical first mount points:

- `/patterns`
- `/terminal` side panel
- dashboard optional alerts section

### Deferred Dedicated Surface

A dedicated `/screener` page can come later once:

- engine output is stable
- grade churn is sane
- alert flow proves that Screener is worth daily use

## Evaluation And Uplift Loop

Screener quality must be measured by downstream Pattern Engine usefulness, not by aesthetic score distributions.

### Baseline Comparison

At minimum, compare:

- `binance_dynamic`
- `screened_ab`
- optionally `screened_a`

### Required Outcome Metrics

1. pattern hit rate uplift
   - how often screened symbols reach desired downstream outcomes versus baseline universe

2. alert precision uplift
   - proportion of high-priority alerts that become valid followable setups

3. universe reduction ratio
   - how much scan load drops relative to baseline

4. missed-opportunity rate
   - how many strong downstream outcomes were excluded by Screener

5. top-N ranking quality
   - whether highest-ranked screened names outperform lower-ranked screened names on downstream setup quality

### Evaluation Record

Each evaluation window should write:

- universe compared
- evaluation dates
- downstream pattern slug or family
- sample size
- uplift metrics
- conclusion (`promote`, `hold`, `rollback`)

Do not switch the live scanner from `binance_dynamic` to `screened_ab` permanently without this comparison.

## Failure Modes

- if CoinGecko is stale, base criteria should remain stale but live overlay may continue
- if pattern state is unavailable, Screener should keep the last base run and mark overlay stale
- if no latest Screener run exists, `screened_ab` must fall back to `binance_dynamic`
- if enrichment coverage is too low, symbols should be downgraded or marked insufficient, not auto-promoted

## Verification Minimum

Sprint 1 should pass all of:

- unit tests for each core scorer
- integration test for `screened_ab` fallback to `binance_dynamic`
- run-level test proving structural grades, timing states, and `excluded` counts are deterministic
- scanner test proving the configured universe can switch from `binance_dynamic` to `screened_ab`
- offline evaluation report showing `screened_ab` versus `binance_dynamic` on downstream Pattern Engine usefulness
