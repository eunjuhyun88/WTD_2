# Engine Spec

Status: canonical engine overview for the `engine/` package.

Purpose:
- Define what the engine is responsible for.
- Fix the core runtime/data contracts between modules.
- Separate research code from production engine behavior.

This file is intentionally shorter than the long design docs in `docs/design/`.
Those docs explain why. This file defines what exists, what each layer owns,
and what future code must preserve.

## 1. North Star

The engine exists to answer one question repeatedly and reproducibly:

`Given current market data, should we open a trade here, under this regime, with these risk rules?`

The engine is not a chat product, not a notebook, and not a generic ML sandbox.
It is a trading decision engine with six ordered layers:

1. Feature Engine
2. Signal Engine
3. Admission / Regime Engine
4. Execution Engine
5. Portfolio / Measurement Engine
6. Research Engine

Natural-language UX and LoRA sit above this engine, not inside its core.

## 2. Layer Map

### Layer 1. Feature Engine

Owner:
- [feature_calc.py](/Users/ej/Projects/wtd-v2/engine/scanner/feature_calc.py)

Input:
- OHLCV bars
- optional perp / market-context data

Output:
- feature table keyed by `(symbol, timestamp)`

Contract:
- Feature computation is past-only.
- A feature row must be usable both by backtests and realtime scans.
- Feature names are stable API for downstream models and blocks.

### Layer 2. Signal Engine

Owners:
- [lightgbm_engine.py](/Users/ej/Projects/wtd-v2/engine/scoring/lightgbm_engine.py)
- [block_evaluator.py](/Users/ej/Projects/wtd-v2/engine/scoring/block_evaluator.py)
- [ensemble.py](/Users/ej/Projects/wtd-v2/engine/scoring/ensemble.py)

Input:
- latest feature row
- optional block hits
- optional regime label

Output:
- `EntrySignal` candidate or neutral

Primary typed contract:
- [types.py](/Users/ej/Projects/wtd-v2/engine/backtest/types.py)

Rules:
- ML score and block score are both first-class.
- Ensemble may down-rank or reject a high ML score if structural blocks disagree.
- Signal generation never mutates portfolio state.

### Layer 3. Admission / Regime Engine

Owners:
- [portfolio.py](/Users/ej/Projects/wtd-v2/engine/backtest/portfolio.py)
- [regime.py](/Users/ej/Projects/wtd-v2/engine/backtest/regime.py)

Input:
- `EntrySignal`
- current portfolio state
- current regime label

Output:
- accepted or blocked signal
- stable block reason

Rules:
- This layer decides whether a signal may become a position.
- Reasons such as `max_concurrent`, `cooldown`, `daily_loss_halt`, `weekly_loss_halt` are part of the public audit surface.
- Regime skipping is an engine feature, not an ad hoc experiment hack.

### Layer 4. Execution Engine

Owner:
- [pnl.py](/Users/ej/Projects/wtd-v2/engine/scanner/pnl.py)

Input:
- entry bar
- direction
- stop / target / horizon
- execution-cost model

Output:
- `TradeResult`

Rules:
- `walk_one_trade` is the single-trade ground truth.
- Intrabar ordering policy must be explicit.
- Fees and slippage are modeled here, not in metrics.
- Same input must always produce the same output.

### Layer 5. Portfolio / Measurement Engine

Owners:
- [simulator.py](/Users/ej/Projects/wtd-v2/engine/backtest/simulator.py)
- [metrics.py](/Users/ej/Projects/wtd-v2/engine/backtest/metrics.py)
- [audit.py](/Users/ej/Projects/wtd-v2/engine/backtest/audit.py)

Input:
- accepted entry signals
- per-symbol market data
- risk config

Output:
- executed trades
- equity curve
- aggregate metrics
- gate verdict

Rules:
- Backtests are event-driven and portfolio-aware.
- Metrics must be based on realized trade paths, not only bar-range summaries.
- A strategy is promotable only if it passes measurement gates, not because one score looks good.

### Layer 6. Research Engine

Owners:
- [autoresearch_real_data.py](/Users/ej/Projects/wtd-v2/engine/autoresearch_real_data.py)
- [autoresearch_ml.py](/Users/ej/Projects/wtd-v2/engine/autoresearch_ml.py)
- [challenge/](/Users/ej/Projects/wtd-v2/engine/challenge)

Input:
- engine contracts from Layers 1-5

Output:
- improved block combinations
- improved ML configurations
- experiment logs

Rules:
- Research code may search over parameters and combinations.
- Research code must not redefine core execution truth.
- If research needs a new contract, the contract is promoted here first, then experiments use it.

## 3. Core Runtime Contracts

These are the minimum engine hand-offs that future code should preserve.

### 3.1 Entry Signal

Current contract:
- [EntrySignal](/Users/ej/Projects/wtd-v2/engine/backtest/types.py)

Meaning:
- "The signal engine proposes a trade at this bar."

Required fields:
- `symbol`
- `timestamp`
- `direction`
- `predicted_prob`
- `source_model`

Non-goals:
- No stop/target sizing here.
- No portfolio admission decision here.

### 3.2 Trade Result

Current contract:
- [TradeResult](/Users/ej/Projects/wtd-v2/engine/scanner/pnl.py)

Meaning:
- "If we open this trade under these execution assumptions, this is what actually happened."

Required fields:
- entry / exit times and prices
- gross pnl
- fee and slippage totals
- realized pnl
- exit reason
- bars to exit

### 3.3 Executed Trade

Current contract:
- [ExecutedTrade](/Users/ej/Projects/wtd-v2/engine/backtest/types.py)

Meaning:
- "This trade was actually admitted by the portfolio and closed."

This is the unit aggregated by measurement code.

### 3.4 Backtest Result

Current contract:
- [BacktestResult](/Users/ej/Projects/wtd-v2/engine/backtest/simulator.py)

Meaning:
- "Full run output for one strategy/model configuration."

Required outputs:
- `trades`
- `equity_curve`
- `metrics`
- `block_reasons`

## 4. Module Responsibilities

### scanner/

What it owns:
- feature computation
- realtime scanning
- alert dispatch
- single-trade execution truth

What it must not own:
- portfolio accounting
- experiment search logic

### backtest/

What it owns:
- risk config
- position state
- simulator loop
- portfolio-level metrics
- audit / calibration

What it must not own:
- live data fetching
- feature engineering

### scoring/

What it owns:
- ML scoring
- block scoring
- ensemble combination
- label/feature matrix helpers for training

What it must not own:
- trade execution truth

### challenge/

What it owns:
- experiment-space definition
- search-space mutation helpers

What it must not own:
- silent changes to execution semantics

### api/

What it owns:
- stable external interface

What it must not own:
- business logic duplicates of scanner/backtest/scoring

### observability/

What it owns:
- structured logs and audit visibility

It is mandatory because the engine must explain:
- why a signal was emitted
- why a signal was blocked
- why a strategy passed or failed a gate

## 5. Golden Execution Flow

The canonical live path is:

1. Fetch latest bars.
2. Compute latest features.
3. Score each symbol with ML + blocks + ensemble.
4. Emit neutral or directional signal.
5. Check admission rules against current portfolio and regime.
6. If admitted, construct execution plan from risk config.
7. Open position.
8. Manage position until target / stop / timeout.
9. Record realized trade.
10. Update portfolio metrics and monitoring state.

The canonical research path is:

1. Load historical bars.
2. Build signals under a candidate rule/model.
3. Run portfolio backtest.
4. Measure realized performance.
5. Compare against gates and baselines.
6. Keep, reject, or mutate candidate.

## 6. Promotion Gates

No strategy/model should move "up" a layer unless it clears the lower layer.

### Research candidate → strategy candidate

Must clear:
- enough executed trades
- positive expectancy
- acceptable drawdown
- profit factor gate
- walk-forward pass rate

### Strategy candidate → live signaler

Must clear:
- paper-trade or replay stability
- no major audit gaps
- bounded block reasons
- reproducible config hash

### Live signaler → user-facing product

Must clear:
- stable realtime operation
- alert quality acceptable
- no hidden execution assumptions

## 7. What The Engine Optimizes For

Primary:
- honest realized PnL measurement
- reproducibility
- auditability
- separation of signal, execution, and portfolio concerns

Secondary:
- precision at useful thresholds
- strategy search speed
- modularity for new data/features

Not primary:
- natural-language fluency
- chat UX
- one-number leaderboard scores without path-aware validation

## 8. What Must Stay Stable

These should change only with an ADR-level decision:

- meaning of `EntrySignal`
- meaning of `TradeResult`
- intrabar ordering policy
- fee/slippage accounting placement
- portfolio admission reason taxonomy
- stage gate semantics

## 9. Immediate Next Engineering Steps

From the current repo state, the highest-value engine work is:

1. Close the remaining contract gaps between realtime scan output and backtest input.
2. Introduce explicit engine-level types for:
   - `SignalDecision`
   - `ExecutionPlan`
   - `TradeVerdict`
   - `PortfolioVerdict`
3. Ensure API routes reuse engine contracts rather than rebuilding local shapes.
4. Keep LoRA and natural-language layers outside the engine core until Layers 1-5 are fully stable.

## 10. One-Line Summary

The engine is a path-aware, portfolio-aware trading decision system.
Its job is not to "guess charts"; its job is to turn market data into
auditable trade decisions and to prove whether those decisions survive
realistic execution constraints.
