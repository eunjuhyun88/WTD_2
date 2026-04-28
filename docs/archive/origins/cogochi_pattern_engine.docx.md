  
**COGOCHI**  
Pattern Engine & Auto-Research

Technical Design Document

Setup Capture → Pattern Detection → Auto-Scanning → Verdict Ledger

Version **2.0**  •  April 2026

Classification: **Internal / Confidential**

# **1\. Executive Summary**

Cogochi is not an AI trading app. It is a setup capture, surveillance, and verification system for crypto derivatives traders. The core product loop is: a trader defines a pattern from a real trade, the system watches all symbols for similar setups, and results are recorded to build a judgment ledger that compounds over time.

This document covers the full technical design of the Pattern Engine: from how a raw trading insight like the TRADOOR OI-reversal pattern gets decomposed into machine-readable phases, to how the Auto-Research scanner finds similar setups across 300+ Binance USDT-M perpetual symbols in real time.

| Core ThesisThe moat is not the AI model. Models are commoditized.The moat is the cumulative judgment ledger: pattern definitions, phase transitions,hit/miss records, and user-specific refinements that cannot be replicated. |
| :---- |

## **1.1 What This System Does**

| Layer | Function | Example |
| :---- | :---- | :---- |
| Pattern Object | Structure a trading insight as a multi-phase sequence | TRADOOR OI-reversal \= 5 phases |
| State Machine | Track every symbol's current phase in real time | PTBUSDT entered ACCUMULATION 3h ago |
| Auto-Research Scanner | Detect phase transitions across the full universe | Alert: 4 symbols in Phase 3 right now |
| Result Ledger | Record outcomes to measure pattern reliability | OI-reversal: 68% hit rate in uptrend BTC |
| User Refinement | Personalize thresholds per trader's judgment | Your version uses OI \> 18% (default 10%) |

## **1.2 Non-Goals**

* Signal service or trade alerts without verification history

* Autonomous trading execution or bot integration

* Generic AI chart analysis (commodity feature, easily replicated)

* Social/copy-trading platform

* News aggregation or sentiment analysis as a standalone product

# **2\. From Trade Diary to Pattern Object**

This section walks through the exact TRADOOR/PTB trade diary entries and shows how each observation translates into a machine-detectable condition. This is the methodology: every pattern in Cogochi originates from a real, documented trade.

## **2.1 The Raw Observation (TRADOOR Trade Diary)**

The following is a condensed version of the actual trade diary entry that initiated this pattern:

| Trade Diary: $TRADOOR (Nov 2024\)Step 1: Sudden \-5% dump with short funding rate maxed out. OI barely moved.    → Market makers opening shorts to push price down.Step 2: Price forms a wide arch (bungee zone). OI slowly decreases.    → Arch \= likely to retest lows. Do NOT enter here.Step 3: Second dump, \-8%. This time volume explodes AND OI spikes sharply.    → THIS is the real signal. Heavy short positioning by market makers.Step 4: Price sideways, making higher lows. Funding flips from negative to positive.    → Accumulation zone. Short stop-loss \= entry with tight risk.Step 5: OI spikes again while price breaks out. \+50% in 12 hours.    → Market makers flipped long (short squeeze \+ new longs). |
| :---- |

## **2.2 Translation: Diary → Structured Phases**

Each diary observation maps to a Phase with quantifiable entry/exit conditions:

| Phase | Name | Conditions | Action | Duration |
| ----- | :---- | :---- | :---- | :---- |
| **0** | **FAKE\_DUMP** | price\_change\_1h \< \-5% oi\_change\_1h \< 5% (small) funding\_rate \< \-0.001 (short extreme) volume\_ratio \< 2x average | **AVOID** | 1–4 hours |
| **1** | **ARCH\_ZONE** | sideways\_compression \= true bb\_width narrowing OI slowly decreasing Price forming parabolic arch | **WAIT** | 4–24 hours |
| **2** | **REAL\_DUMP** | price\_change\_1h \< \-5% oi\_change\_1h \> \+15% (large spike) volume\_ratio \> 3x (explosion) funding\_rate \< \-0.002 (extreme) | **WATCH** | 1–4 hours |
| **3** | **ACCUMULATION** | higher\_lows\_sequence \>= 3 funding flips negative → positive OI holds or grows (makers not exiting) price range \< 3% (tight sideways) | **ENTER** | 12–48 hours |
| **4** | **BREAKOUT** | OI spikes again (+10%+ in 4h) Price breaks above Phase 1 high Volume explosion Positive funding maintained | **LATE** | 4–12 hours |

## **2.3 The Key Insight: Phase 0 vs Phase 2**

The most critical distinction in this pattern is between the FAKE dump (Phase 0\) and the REAL dump (Phase 2). Both look like crashes on a chart. The difference is entirely in the derivatives data:

| Metric | Phase 0 (Fake) | Phase 2 (Real) |
| :---- | :---- | :---- |
| Price drop | Similar (≥5%) | Similar (≥5%) |
| OI change | Small (\<5%) | **Large (\>15%)** |
| Volume | Below average | **3x+ explosion** |
| Funding | Negative | **Extreme negative** |
| Meaning | Retail panic, no real positioning | **Market makers opening heavy shorts** |
| What follows | Arch zone, further decline likely | Accumulation → Reversal |

This is why pure price-action tools cannot replicate this system. The signal is in the derivatives layer (OI \+ funding \+ volume confluence), not in candlestick shapes.

# **3\. Building Blocks: The Condition Library**

Every Phase condition maps to a building block: a pure function that takes the current feature vector and returns true/false. The engine evaluates 31 blocks per symbol per scan cycle. Five new blocks were designed specifically for this pattern:

## **3.1 New Blocks for OI-Reversal Pattern**

| Block | Logic | Required Features |
| :---- | :---- | :---- |
| oi\_spike\_with\_dump | price\_change \< threshold AND oi\_change \> oi\_threshold AND volume\_ratio \> vol\_threshold, all in same candle or within 2 candles | price\_change\_1h, oi\_change\_1h, volume\_ratio\_1h |
| higher\_lows\_sequence | Detect N consecutive swing lows where each is higher than the previous. Swing low \= local minimum within lookback window | close prices over lookback period (default 20 candles) |
| funding\_flip | Previous N candles had funding\_rate \< 0, current candle has funding\_rate \> 0\. Configurable lookback (default 8\) | funding\_rate time series |
| oi\_hold\_after\_spike | OI spike event occurred within last N candles AND current OI is still \>= spike\_retention% of spike-level OI | oi\_change\_1h (historical), current OI |
| sideways\_compression | Price range over window \< threshold% AND Bollinger bandwidth decreasing. Detects bungee/arch zones | high, low, bb\_width over window |

## **3.2 Block Evaluation Context**

Each block receives a Context object containing the pre-computed feature matrix. The block does NOT fetch data directly. This is critical for testability and performance:

class Context:  
    features: pd.DataFrame   \# 92 columns, 1 row per candle  
    params: dict              \# block-specific thresholds

def oi\_spike\_with\_dump(ctx: Context) \-\> pd.Series:  
    price\_drop \= ctx.features\['price\_change\_1h'\] \< ctx.params.get('price\_threshold', \-0.05)  
    oi\_spike   \= ctx.features\['oi\_change\_1h'\]     \> ctx.params.get('oi\_threshold', 0.10)  
    vol\_surge  \= ctx.features\['volume\_ratio\_1h'\]   \> ctx.params.get('vol\_threshold', 3.0)  
    return price\_drop & oi\_spike & vol\_surge

## **3.3 Existing Blocks (26 Pre-Existing)**

The engine already has 26 blocks covering: RSI extremes, Bollinger squeeze/expansion, SMA crossovers, volume spikes, OI thresholds, funding rate extremes, price momentum, trend strength, and various confirmation signals. The 5 new blocks bring the total to 31\.

# **4\. State Machine: Real-Time Phase Tracking**

The State Machine is the core runtime. It tracks every symbol's position within every active pattern and fires callbacks on phase transitions.

## **4.1 Architecture**

The flow operates as a continuous loop:

Every scan cycle (default: 15 minutes):

  for each symbol in dynamic\_universe (\~300 symbols):  
    features \= feature\_calc(symbol, timeframe)  
      
    for each active\_pattern (e.g., OI\_REVERSAL):  
      current\_phase \= state\_store\[symbol\]\[pattern\]  
      next\_phase\_conditions \= pattern.phases\[current\_phase \+ 1\]  
        
      if all(evaluate\_block(cond, features) for cond in next\_phase\_conditions.required):  
        if none(evaluate\_block(cond, features) for cond in next\_phase\_conditions.disqualifiers):  
          transition(symbol, pattern, current\_phase \-\> next\_phase)  
          fire\_callback(symbol, pattern, new\_phase)  \# alert, ledger write

      if current\_phase.timeout\_candles exceeded:  
        expire(symbol, pattern)  \# reset to Phase 0

## **4.2 State Transitions**

Each transition is recorded as a PhaseTransition event:

| Field | Type | Description |
| :---- | :---- | :---- |
| symbol | str | e.g., PTBUSDT |
| pattern\_id | str | e.g., tradoor\_oi\_reversal\_v1 |
| from\_phase | int | Previous phase index |
| to\_phase | int | New phase index |
| timestamp | datetime | Exact transition time |
| features\_snapshot | dict | All 92 features at transition moment |
| candles\_in\_phase | int | How long it stayed in previous phase |

This transition log is the raw material for the Result Ledger. Every transition is immutable once written.

## **4.3 Timeout and Expiry**

Patterns that stall are automatically expired. For the OI-Reversal pattern:

| Phase | Timeout | On Expiry |
| :---- | :---- | :---- |
| FAKE\_DUMP | 24 candles (24h on 1h tf) | Reset to idle |
| ARCH\_ZONE | 48 candles | Reset to idle |
| REAL\_DUMP | 24 candles | Reset to idle |
| ACCUMULATION | 72 candles | Log as EXPIRED, not MISS |
| BREAKOUT | 12 candles | Log result (hit or miss) |

# **5\. Auto-Research: How the Scanner Finds Patterns**

Auto-Research is the process of automatically detecting when any symbol enters a pattern phase. It operates in two layers: snapshot similarity (current state comparison) and sequence matching (multi-phase progression tracking).

## **5.1 Dynamic Universe**

The scanner must cover the full Binance USDT-M perpetual universe, not just a curated list of 30 large-cap symbols. Many actionable patterns (like PTB and TRADOOR) occur in mid/small-cap perpetuals.

| Tier | Criteria | Scan Frequency | Count (est.) |
| :---- | :---- | :---- | :---- |
| Core | Top 30 by market cap | Every 15 minutes | 30 |
| Active | 24h volume \> $5M | Every 30 minutes | \~100 |
| Watchlist | 24h volume \> $1M | Every 1 hour | \~200 |
| Cold | Below $1M volume | Not scanned | \~100+ |

The universe refreshes daily from Binance FAPI /fapi/v1/exchangeInfo \+ 24h ticker data. Symbols that newly cross a volume threshold are automatically promoted.

## **5.2 Layer A: Snapshot Similarity**

For each scan cycle, the scanner computes the feature vector (92 dimensions) for every symbol and compares it against saved challenge snapshots:

\# Existing implementation in challenge/scanner.py  
for symbol in universe:  
    current\_features \= feature\_calc(symbol, timeframe='1h')  
    for challenge in active\_challenges:  
        similarity \= cosine\_similarity(  
            normalize(current\_features),  
            normalize(challenge.feature\_vector)  
        )  
        if similarity \> 0.85:  
            candidates.append((symbol, challenge, similarity))  
This catches symbols that currently look like a saved pattern snapshot. Limitation: it only compares the current moment, not the trajectory.

## **5.3 Layer B: Sequence Matching (State Machine)**

The State Machine adds temporal awareness. Instead of asking "does this symbol look like TRADOOR right now?" it asks "is this symbol progressing through the same multi-phase sequence TRADOOR went through?"

Concrete example of what the scanner sees in real time:

| Symbol | Pattern | Current Phase | Since | Next Condition |
| :---- | :---- | :---- | :---- | :---- |
| **PTBUSDT** | OI-Reversal | **ACCUMULATION** | 3h ago | OI spike \+ price break above Phase 0 high |
| XYZUSDT | OI-Reversal | ARCH\_ZONE | 8h ago | Second dump with OI \> 15% |
| ABCUSDT | OI-Reversal | REAL\_DUMP | 1h ago | Higher lows sequence ≥ 3 |
| DEFUSDT | OI-Reversal | FAKE\_DUMP | 20h ago | Approaching timeout (24h) |

The trader sees this dashboard and can focus attention on PTBUSDT (already in ACCUMULATION \= entry zone) while ignoring DEFUSDT (stalling, likely to expire).

## **5.4 Layer C: LLM-Assisted Pattern Discovery (Future)**

When a symbol experiences a significant move (≥10% in 4 hours), the system can automatically generate a research report:

1. Capture: record the 48h feature timeline before the event

2. Analyze: LLM receives the chart image \+ feature data \+ OI/funding timeline

3. Describe: LLM outputs a structured pattern description in natural language

4. Tag: description is converted to building block conditions

5. Verify: system searches historical data for similar sequences

6. Propose: if hit rate \> threshold, propose as a new pattern template

This layer is future work. The prerequisite is having enough manually-labeled patterns in the Result Ledger to validate LLM-generated pattern proposals against.

# **6\. Result Ledger: The Judgment Database**

The Result Ledger is the most important long-term asset. It records what happened after each pattern was detected, creating an evidence base that grows more valuable over time.

## **6.1 Record Structure**

| Field | Type | Description |
| :---- | :---- | :---- |
| record\_id | UUID | Unique identifier |
| pattern\_id | str | Which pattern was matched |
| symbol | str | Which symbol |
| entry\_phase | int | Phase when the record was created (usually ACCUMULATION) |
| entry\_timestamp | datetime | When entry phase was reached |
| entry\_price | float | Price at entry phase |
| peak\_price | float | Highest price reached after entry |
| peak\_return\_pct | float | Maximum favorable excursion |
| exit\_price | float | Price at evaluation window close |
| exit\_return\_pct | float | Return at evaluation window close |
| verdict | enum | HIT / MISS / EXPIRED |
| btc\_trend | enum | UPTREND / SIDEWAYS / DOWNTREND |
| user\_override | enum | VALID / INVALID / null (user can override auto-verdict) |
| features\_at\_entry | JSON | Full 92-feature snapshot for reproducibility |

## **6.2 Verdict Logic**

The system automatically evaluates each record after the evaluation window closes:

Evaluation window: 72 hours after ACCUMULATION entry

HIT:     peak\_return\_pct \>= \+15%   (the setup worked)  
MISS:    exit\_return\_pct  \<= \-10%   (stopped out)  
EXPIRED: neither threshold reached   (inconclusive)  
Users can override automatic verdicts. This is critical: the same setup might be a HIT for one trader (who took profit at \+20%) and a MISS for another (who held through and got stopped). User overrides create personalized evaluation datasets.

## **6.3 Aggregate Statistics**

The Ledger automatically computes rolling statistics per pattern:

| Metric | Formula | Use |
| :---- | :---- | :---- |
| Hit rate | count(HIT) / count(HIT \+ MISS) | Core reliability metric |
| Avg return | mean(exit\_return\_pct) for HIT records | Expected value per entry |
| Avg loss | mean(exit\_return\_pct) for MISS records | Risk per entry |
| Expected value | hit\_rate \* avg\_return \+ miss\_rate \* avg\_loss | Is this pattern \+EV? |
| BTC-conditional hit rate | hit\_rate filtered by btc\_trend | Does this pattern only work in uptrends? |
| Decay analysis | hit\_rate over rolling 30-day windows | Is this pattern losing edge? |
| **Why This Is the Real Moat**Anyone can build OI detection or phase tracking. Nobody else has YOUR ledger.After 6 months: 500+ records, per-symbol stats, BTC-regime analysis, user overrides.This is cumulative data that cannot be replicated by copying features. |  |  |

# **7\. User Refinement: Personalized Pattern Variants**

Different traders read the same pattern differently. One trader might require OI to spike 20% (conservative), another accepts 8% (aggressive). The Refinement system allows per-user pattern variants without fragmenting the base pattern.

## **7.1 Refinement Flow**

1. User runs the base pattern (tradoor\_oi\_reversal\_v1) for 2+ weeks

2. User marks results as VALID or INVALID through the verdict UI

3. After 10+ judgments, the system analyzes the override distribution

4. System proposes threshold changes: "Your VALID hits have avg OI spike of 18%. Raise threshold from 10% to 15%?"

5. If accepted, a personal variant is created: tradoor\_oi\_reversal\_v1\_\[user\_id\]

6. Personal variant gets its own ledger, separate from the global pattern stats

## **7.2 Refinement Data Structure**

{  
  "base\_pattern\_id": "tradoor\_oi\_reversal\_v1",  
  "user\_id": "trader\_alpha",  
  "variant\_id": "tradoor\_oi\_reversal\_v1\_trader\_alpha",  
  "overrides": {  
    "phase\_2": {  
      "oi\_spike\_with\_dump": {  
        "oi\_threshold": 0.18     // was 0.10  
      }  
    },  
    "phase\_3": {  
      "higher\_lows\_sequence": {  
        "min\_count": 4            // was 3  
      }  
    }  
  },  
  "judgments": 14,  
  "personal\_hit\_rate": 0.71,  
  "created\_at": "2026-04-13T00:00:00Z"  
}

# **8\. Data Pipeline: From Binance to Feature Vector**

The data pipeline is the foundation that makes everything above work. Every chart indicator visible on TradingView is computed independently from the same Binance data source.

## **8.1 Data Sources**

| Source | Endpoint | Data | Frequency |
| :---- | :---- | :---- | :---- |
| Binance FAPI | /fapi/v1/klines | OHLCV candles | Per scan cycle |
| Binance FAPI | /fapi/v1/openInterestHist | Historical OI | Per scan cycle |
| Binance FAPI | /fapi/v1/fundingRate | Funding rate history | Every 8 hours |
| Binance FAPI | /fapi/v1/exchangeInfo | Symbol universe | Daily |
| Binance FAPI | /fapi/v1/ticker/24hr | Volume for universe tiers | Daily |

## **8.2 Feature Calculation Pipeline**

The feature calculator produces 92 columns per candle per symbol. This is the shared substrate for all blocks, patterns, and challenges:

| Category | Features (count) | Examples |
| :---- | :---- | :---- |
| Price action | 18 | close, high, low, price\_change\_1h/4h/24h, atr, range |
| Moving averages | 10 | sma5, sma20, sma60, sma150, sma200, ema12, ema26 |
| Momentum | 12 | rsi14, macd, macd\_signal, macd\_histogram, stoch\_k, stoch\_d |
| Volatility | 8 | bb\_upper, bb\_lower, bb\_width, bb\_pctb, atr\_pct, keltner |
| Volume | 10 | volume, volume\_sma, volume\_ratio, obv, vwap, mfi |
| Derivatives | 16 | oi, oi\_change\_1h/4h/24h, funding\_rate, funding\_ma, long\_short\_ratio |
| Trend | 8 | adx, di\_plus, di\_minus, aroon\_up, aroon\_down, supertrend |
| Cross-asset | 10 | btc\_correlation, btc\_trend, eth\_dominance, total\_market\_oi |

All features are computed from raw Binance data. No TradingView dependency. The values match TradingView's display because both use the same underlying data and standard indicator formulas.

## **8.3 Why TradingView Data Is Not Needed**

A common question: why not scrape TradingView? The answer is that TradingView is a closed rendering platform. It computes indicators internally and does not expose values through any API. However, since both TradingView and our engine consume the same Binance FAPI data, the computed values are identical.

| Data EquivalenceTradingView RSI(14) for PTBUSDT 1h \= Our engine RSI(14) for PTBUSDT 1hBoth use the same Binance klines. Same formula. Same result.The difference: our values are programmatically accessible for pattern matching. |
| :---- |

# **9\. App Layer: Terminal → Chart → Challenge**

The app layer connects the user-facing terminal to the pattern engine. The critical missing piece was the chart and the Save Setup action.

## **9.1 Terminal Chart (ChartBoard)**

The terminal's center panel renders a multi-pane chart using TradingView's Lightweight Charts library (open-source, MIT). This is not TradingView the platform; it is TradingView's open rendering engine fed with our own Binance data.

| Panel | Content | Data Source |
| :---- | :---- | :---- |
| Main | Candlestick \+ SMA 5/20/60/150/200 | Binance klines \+ feature\_calc |
| Sub 1 | Volume bars (colored by direction) | Binance klines |
| Sub 2 | RSI 14 with 30/70 bands | feature\_calc |
| Sub 3 | Open Interest (absolute \+ % change) | Binance OI history |
| Sub 4 | Funding Rate timeline | Binance funding rate |

## **9.2 Save Setup Flow**

When a trader sees a pattern on the chart, they click Save Setup. This triggers the following sequence:

1. User clicks candle on chart (or current candle by default)

2. System captures: symbol \+ timestamp \+ timeframe

3. Engine computes full 92-feature vector for that exact moment

4. User adds optional tags (e.g., "oi\_spike\_with\_dump", "arch\_zone")

5. User adds optional note (free text, e.g., "Looks like TRADOOR Phase 2")

6. POST /api/engine/challenge/create with features \+ tags \+ note

7. Challenge is saved. Instantly appears in /lab. Scanner begins matching.

8. Within 15 minutes: Top 5 similar symbols returned

## **9.3 Pattern Status Bar**

The terminal footer displays a live status bar showing all symbols currently in Phase 3 (ACCUMULATION) or later. This is the primary alert surface:

┌───────────────────────────────────────────────────────────────────┐  
│  ⚠ PATTERN ALERTS                                                      │  
│  PTBUSDT   OI-Reversal  ACCUMULATION  3h ago   higher\_lows: 4  ✓        │  
│  XYZUSDT   OI-Reversal  REAL\_DUMP     1h ago   oi\_spike: \+22%            │  
└───────────────────────────────────────────────────────────────────┘

# **10\. End-to-End Example: Finding the Next TRADOOR**

This section walks through the complete system flow using a concrete example.

## **10.1 Day 1: Pattern Definition**

Trader reviews TRADOOR post-mortem. Opens Cogochi terminal, loads TRADOOR 1h chart. Scrolls to the dump event on Nov 25\. Clicks Save Setup on the Phase 2 candle. Tags: oi\_spike\_with\_dump, volume\_explosion. Note: "Real dump, OI \+22%, vol 4.3x. Entry was in Phase 3 after higher lows." Challenge saved. Engine computes 92-feature vector. Challenge ID: ch\_tradoor\_001.

## **10.2 Day 1–7: Scanner Running**

State Machine initializes OI-Reversal pattern across 300 symbols. Every 15–60 minutes (based on tier), it evaluates blocks. On Day 3, PTBUSDT hits Phase 0 (FAKE\_DUMP): price \-6%, OI \+3%, low volume. System logs it but does not alert (Phase 0 \= AVOID). On Day 4, PTBUSDT enters Phase 1 (ARCH\_ZONE): sideways compression detected. Still no alert.

## **10.3 Day 5: Real Signal**

PTBUSDT hits Phase 2 (REAL\_DUMP): price \-8%, OI \+19%, volume 3.8x, funding \-0.003. State Machine transitions to Phase 2\. Alert fires: "PTBUSDT entered REAL\_DUMP — OI-Reversal pattern". Trader opens chart, sees the derivatives data confirms. Waits for Phase 3\.

## **10.4 Day 6: Entry Zone**

12 hours later: PTBUSDT higher\_lows\_sequence \= 3, funding flips to \+0.0002. State Machine transitions to Phase 3 (ACCUMULATION). Alert: "PTBUSDT entered ACCUMULATION — entry zone". Trader enters position with tight stop below Phase 2 low. Ledger creates a new record with entry\_price and entry\_timestamp.

## **10.5 Day 8: Result**

PTBUSDT breaks out \+47% over 14 hours. State Machine transitions to Phase 4 (BREAKOUT). Ledger auto-computes: peak\_return \= 47%, verdict \= HIT. OI-Reversal pattern global hit rate updates: now 5/7 \= 71%. Trader marks VALID. Personal variant stats update.

# **11\. Implementation Status & Sprint Plan**

## **11.1 Current Status**

| Component | Status | Files |
| :---- | :---- | :---- |
| Feature calc (92 cols) | **DONE** | engine/feature\_calc.py |
| 26 existing blocks | **DONE** | engine/building\_blocks/ |
| 5 new blocks | **DONE** | engine/building\_blocks/confirmations/ |
| Challenge CRUD API | **DONE** | engine/api/routes/challenge.py |
| 4-strategy scanner | **DONE** | engine/challenge/scanner.py |
| Pattern types \+ library | **DONE** | engine/patterns/types.py, library.py |
| State Machine | **DONE** | engine/patterns/state\_machine.py |
| Pattern scanner | **DONE** | engine/patterns/scanner.py |
| Result Ledger | **DONE** | engine/ledger/store.py, types.py |
| Pattern API routes | **DONE** | engine/api/routes/patterns.py |
| Dynamic universe | **DONE** | engine/universe/dynamic.py |
| ChartBoard (Svelte) | **DONE** | app/components/terminal/ChartBoard.svelte |
| SvelteKit API proxies | **DONE** | app/routes/api/patterns/ |
| PatternStatusBar | **DONE** | app/components/terminal/PatternStatusBar.svelte |
| Save Setup UI \+ flow | **NOT STARTED** | — |
| Result Ledger UI | **NOT STARTED** | — |
| User Refinement engine | **NOT STARTED** | — |
| LLM auto-pattern discovery | **NOT STARTED** | — |
| Telegram alert integration | **NOT STARTED** | — |

## **11.2 Sprint Priorities**

| Sprint | Duration | Deliverable | Why First |
| :---- | :---- | :---- | :---- |
| 1 | 3 days | Save Setup UI: candle click → challenge create | Without this, the entire pipeline has no input |
| 2 | 2 days | Result Ledger UI: verdict display, override buttons | Without verdicts, no judgment data accumulates |
| 3 | 3 days | Live scanner deployment \+ Telegram alerts | Without alerts, patterns are detected but nobody sees them |
| 4 | 2 days | Refinement engine: threshold proposals | Turns 10+ verdicts into personalized variants |
| 5 | 5 days | LLM auto-discovery prototype | Requires Ledger data as training signal |

# **12\. Strategic Context: Why This Architecture**

## **12.1 The Moat Thesis**

The system is deliberately designed so that the defensible value accumulates in the data layer, not the model layer or the UI layer:

| Layer | Replaceable? | Accumulates Value? | Our Strategy |
| :---- | :---- | :---- | :---- |
| LLM / AI model | YES | No | Use best available (buy, don't build) |
| UI / chart | YES | No | Use open-source (Lightweight Charts) |
| Infra / hosting | YES | No | Standard cloud |
| Pattern library | Partially | Yes | Curated from real trades, not generated |
| Judgment ledger | **NO** | **YES** | Every verdict makes it thicker |
| User refinements | **NO** | **YES** | Personal variants locked to user history |
| Challenge history | **NO** | **YES** | Setup-specific track records |

## **12.2 Product Identity (One Sentence)**

| Cogochi is a setup capture, surveillance, and verification systemthat turns a trader's pattern intuition into machine-tracked,evidence-backed judgment records that compound over time. |
| :---- |

## **12.3 What Cogochi Is Not**

* **Not an AI trading bot** — does not execute trades

* **Not a signal service** — does not tell you what to buy

* **Not a chart analysis tool** — the chart is a means, not the product

* **Not a social platform** — no copy-trading, no leaderboards

* **Not a research paper** — research follows product-market fit, not the other way around

## **12.4 Success Metrics**

| Metric | Target (6 months) | Why It Matters |
| :---- | :---- | :---- |
| Active patterns in library | ≥10 | Breadth of pattern coverage |
| Ledger records | ≥500 | Statistical significance for hit rate claims |
| User verdict overrides | ≥100 | Refinement engine activation threshold |
| Repeat users (weekly) | ≥50 | Product-market fit signal |
| Paying users | ≥10 | Revenue validation |

*— End of Document —*