# Alpha Terminal Harness — Methodology (LLM + Multimodal)

Part of the Alpha Terminal harness package:
- `alpha-terminal-harness-engine-spec-2026-04-09.md`
- `alpha-terminal-harness-methodology-2026-04-09.md` (this file)
- `alpha-terminal-harness-html-dissection-2026-04-10.md`
- `alpha-terminal-harness-boundary-2026-04-10.md`
- `alpha-terminal-harness-i18n-contract-2026-04-10.md`
- `alpha-terminal-harness-rationale-2026-04-10.md`

Purpose:
- Dissect the provided Alpha Terminal HTML and the user's feature update notes.
- Define how those capabilities should be made executable through multimodal natural-language LLM calls inside the current CHATBATTLE repo.
- Keep the implementation aligned with the current `Terminal` surface, scanner engine, and DOUNI tool-calling architecture.

Related canonical docs:
- `README.md`
- `docs/SYSTEM_INTENT.md`
- `docs/product-specs/terminal.md`
- `docs/page-specs/terminal-page.md`
- `docs/FRONTEND.md`

Related implementation surfaces:
- `src/routes/terminal/+page.svelte`
- `src/routes/cogochi/scanner/+page.svelte`
- `src/routes/api/cogochi/analyze/+server.ts`
- `src/routes/api/cogochi/scan/+server.ts`
- `src/routes/api/cogochi/terminal/message/+server.ts`
- `src/lib/server/scanner.ts`
- `src/lib/server/douni/toolExecutor.ts`
- `src/lib/server/douni/tools.ts`
- `src/lib/engine/cogochi/layerEngine.ts`

## 1. Executive Summary

The provided Alpha Terminal HTML is not just a UI mock. It is a full browser-side scanner prototype that combines:
- UI shell
- data collection from public endpoints
- layer computation
- alpha scoring
- tabular ranking
- deep-dive inspection
- trade suggestion output

The current repo already contains a substantial portion of the new engine direction:
- 3-group symbol selection already exists in `src/lib/server/scanner.ts`
- L18 and L19 already exist in the current signal engine
- `analyze_market` already fetches 5m candles, 5m OI history, order book, force orders, kimchi, fear/greed, and BTC on-chain context
- `/terminal` already renders `L18` and `L19` in the modern Cogochi shell

The main missing piece is not raw analytics. The main missing piece is orchestration:
- the LLM must become the natural-language planner and UI conductor
- the scanner/runtime must remain deterministic and tool-backed
- the frontend must expose richer scanner and live-stream surfaces than the current `QuickPanel`

The correct architecture is:
- LLM as intent router and explanation layer
- typed tools as execution layer
- server modules as market-data and scoring authority
- terminal/scanner UI as projection layer

This means the HTML should not be ported line-for-line.
Its useful value is:
- information architecture
- scanner table semantics
- detail panel structure
- operational affordances

Its browser-side calculation pattern should not become the system authority.

## 2. Input Set Covered By This Report

This methodology combines four user-provided inputs:
- Alpha Terminal HTML prototype
- feature update notes about the "new bot"
- real-time whale tracking quant scanner concept
- funding arbitrage educational and dashboard references

It also respects the current product direction:
- `Terminal` remains optional but high-value
- the system is not supposed to regress into a generic trading terminal
- scanner and analysis should feed learning, doctrine, and later trust/copy surfaces

## 3. What The HTML Actually Contains

The HTML prototype contains these runtime blocks:

1. Global shell
- header
- market bar
- controls
- progress bar
- stats bar
- filter bar
- table
- deep-dive panel
- verdict box

2. Browser-side fetch and orchestration
- direct public API calls to Binance, Alternative.me, CoinGecko, Blockchain.info, mempool.space, Upbit, and Bithumb
- a custom client-side rate limiter
- batch scanning and stop/progress control

3. Layer computation inside the browser
- L1 Wyckoff
- L2 Flow
- L3 V-Surge
- L4 Order Book
- L5 liquidation estimate
- L6 on-chain
- L7 fear/greed
- L8 kimchi premium
- L9 actual forced liquidation
- L10 MTF
- L11 CVD
- L12 sector
- L13 breakout
- L14 BB squeeze
- L15 ATR

4. Result semantics
- total alpha score
- ranked table
- layer badges
- alert counts
- detail drawer
- simple trade reference box

## 4. User Update Notes: Functional Intent Breakdown

The user's update notes define the intended operating model more clearly than the original HTML.

### 4.1 Scanner selection logic

The desired selection logic is no longer "top volume only".

Desired scan universe composition:
- Group 1: top volume
- Group 2: top 24h movers
- Group 3: symbols near 24h breakout
- merge and dedupe before scoring

This intent is already partially implemented in the current repo through `selectSymbols3Group()`.

### 4.2 Newly emphasized layers

The update makes these layers strategically important:
- L18: 5m short-term momentum
- L19: OI acceleration

These layers matter because they solve a real weakness of slow timeframe-only scanners:
- they catch "starting now" behavior
- they let the system detect squeeze and new-position expansion before the slower layers fully confirm

### 4.3 Existing layer behavior changes

The update notes also redefine how some layers should work:
- L3 should be anchored to 5m signal behavior, not the selected display timeframe
- L13 should use 1d context for 7d/30d breakout truth
- OI change must combine short-term and slower windows
- CVD should prioritize shorter horizon execution pressure

The critical architectural implication:
- UI timeframe is not equal to engine timeframe
- some layers are display-relative
- some layers are fixed-horizon
- some layers are hybrid-horizon

### 4.4 Additional runtime concepts from the user's message

The user also wants the system to support:
- real-time whale flow detection
- rolling 1-minute market radar
- CVD breakout logs
- micro-squeeze detection
- order-book imbalance
- funding arbitrage explanation and discovery
- a product narrative that turns these into a personal AI trading agent loop

These are not just UI additions.
They require:
- event streaming
- separate fast-path analytics
- distinct tool families
- explicit LLM routing rules

## 5. Current Repo Status: What Already Exists

## 5.1 Present and aligned

Already implemented or partially implemented:
- 3-group symbol selection in `src/lib/server/scanner.ts`
- L18 and L19 in `src/lib/engine/cogochi/layerEngine.ts`
- L18 and L19 types in `src/lib/engine/cogochi/types.ts`
- L18 and L19 rendering in `/terminal`
- `analyze_market` tool already fetches:
  - selected timeframe candles
  - 1h candles
  - 1d candles
  - 5m candles
  - 5m OI history
  - order book depth
  - force orders
  - fear/greed
  - BTC on-chain and mempool for BTC
  - kimchi inputs
- server scanner API already exists
- DOUNI already emits SSE tool events and per-layer events

## 5.2 Missing or incomplete

Still missing or underpowered:
- scanner-first table UX comparable to the HTML
- explicit LLM tool for scanner-table workflows
- explicit live stream tool family for whale/radar/CVD logs
- multimodal routing policy for chart screenshot or uploaded terminal image input
- funding arbitrage tool family
- explanation/pedagogy mode for novice questions
- durable "scan workspace" state model
- UI event contract that distinguishes:
  - one-shot analysis
  - batch scan
  - long-running live watch

## 6. Why The HTML Must Not Be Ported As-Is

The HTML is useful as a design and workflow reference, but not as the runtime authority.

Reasons:
- It performs public fetches directly from the browser.
- It duplicates logic that already exists server-side in this repo.
- It hardcodes domain computation that is now partially superseded by the current Cogochi engine.
- It mixes UI, fetch, orchestration, and scoring in a single page script.
- It would conflict with the current type and tool architecture if copied into the repo wholesale.

Correct extraction rule:
- keep the workflow and screen semantics
- discard the browser-side authority model

## 7. Target Product Behavior

The user should be able to use natural language and multimodal context like:
- "지금 막 튀기 직전 코인 위주로 스캔해줘"
- "L18/L19 가중치가 강한 코인만 보여줘"
- "고래틱 + 오더북 불균형 + 마이크로 스퀴즈 겹치는 종목 추려줘"
- "이 차트 이미지 기준으로 지금 뭐가 위험한지 설명해줘"
- "펀딩피 아비트라지 초심자 모드로 설명하고, 지금 가능한 종목 있으면 찾아줘"
- "지금 스캔 결과에서 솔라나 상세 패널 열고 진입 참고까지 보여줘"

The user should not have to know:
- which API to hit
- which timeframe belongs to which layer
- whether the system needs one-shot analysis or live subscription

The LLM should decide the tool plan.
The tools should execute deterministically.
The UI should project structured results.

## 8. Core Architectural Principle

The LLM is not the market engine.

The LLM should do:
- intent classification
- task decomposition
- tool selection
- stateful follow-up
- explanation and summarization
- multimodal interpretation of user-provided images or screenshots

The tool/runtime layer should do:
- data fetching
- scoring
- stream subscription
- alert generation
- scan batching
- persistence

If the LLM is allowed to synthesize market signals directly from prose without tool execution:
- the system becomes non-deterministic
- reproducibility collapses
- UI state and explanation drift apart
- trust features become impossible to audit

## 9. Recommended Tool Taxonomy For Multimodal Natural-Language Operation

The current DOUNI tool set is a good base, but it is too coarse for the requested capability set.

Recommended tool families:

### 9.1 Analysis tools

`analyze_market`
- purpose: single-symbol deterministic analysis
- input:
  - `symbol`
  - `timeframe`
  - `detail_mode` = `summary | full | trader | novice`
  - `focus` = `general | l18_l19 | breakout | funding | whale`
- output:
  - `SignalSnapshot`
  - chart overlays
  - derived cards
  - explanation hints

`compare_symbols`
- purpose: compare 2-5 symbols under the same analysis frame
- output:
  - comparable layer matrix
  - leader ranking
  - strongest differential signals

### 9.2 Scanner tools

`scan_market`
- purpose: batch market scan
- input:
  - `mode` = `three_group | custom | sector | movers | breakout`
  - `limit`
  - `symbols`
  - `filters`
  - `sort`
  - `min_alpha`
  - `emphasize_layers`
- output:
  - ranked row DTO list
  - counts for market bar and stats strip
  - scan summary

`open_scan_detail`
- purpose: return full detail payload for one scanner row
- input:
  - `symbol`
  - `scan_context_id`
- output:
  - deep-dive panel DTO
  - verdict DTO
  - trade-reference DTO

### 9.3 Live-stream tools

`start_live_market_watch`
- purpose: start a live session
- input:
  - `watch_profile` = `whale_radar | cvd_breakout | micro_squeeze | all`
  - `symbols` or `universe`
  - `duration_hint`
- output:
  - `watch_id`
  - SSE stream events

`stop_live_market_watch`
- purpose: stop a live session

`get_live_watch_snapshot`
- purpose: pull current buffered radar and log state

These tools should power the user's requested:
- 1-minute rolling radar
- CVD breakout log
- advanced high-end stream

### 9.4 Education and strategy tools

`explain_strategy`
- purpose: novice-friendly explanation mode
- input:
  - `topic` = `funding_arbitrage | squeeze | kimchi | cvd | orderbook | wyckoff`
  - `audience` = `beginner | intermediate | advanced`
  - `include_risks`
- output:
  - structured explanation blocks

`scan_funding_arb`
- purpose: funding arbitrage opportunity scan
- input:
  - `venue_scope`
  - `min_spread`
  - `min_liquidity`
  - `show_risk_flags`
- output:
  - dashboard rows
  - explanation notes
  - disqualifiers

### 9.5 Memory and training tools

`save_pattern`
- keep

`submit_feedback`
- keep

`query_memory`
- keep

`save_scan_thesis`
- new
- purpose: store a thesis created from scan + detail + user confirmation

## 10. Multimodal Input Methodology

Natural-language-only execution is not enough for the user's goal.
The system should accept multimodal context and transform it into tool plans.

Supported multimodal input types:
- plain text
- uploaded chart screenshot
- uploaded scanner screenshot
- copied HTML or UI fragment
- route-local state snapshot
- previously opened symbol/detail context

Recommended processing flow:

1. Input normalization
- detect whether the user provided:
  - instruction
  - chart image
  - UI screenshot
  - HTML fragment
  - prior analysis context

2. Intent classification
- classify into one or more task categories:
  - single analysis
  - scan
  - live watch
  - educational explanation
  - funding arbitrage
  - save/feedback/memory
  - UI control

3. Execution plan generation
- produce a short hidden tool plan
- decide whether this is:
  - request/response
  - request + UI open action
  - request + live session

4. Tool execution
- call deterministic tool(s)
- stream progress events
- emit typed result payloads

5. UI projection
- update:
  - market bar
  - scanner table
  - deep-dive panel
  - chart state
  - live logs

6. Natural-language explanation
- LLM explains what happened in user-facing language
- explanation must always be grounded in tool output

## 11. UI Composition Methodology

The HTML should be decomposed into reusable scanner UI modules inside the current terminal/scanner surface.

Recommended UI decomposition:

`TerminalHeaderBar`
- current symbol
- price
- alpha summary
- compact market context strip

`ScannerControlBar`
- scan mode
- top N
- custom symbols
- presets
- min alpha
- start/stop
- progress

`ScannerMarketBar`
- fear/greed
- kimchi
- USD/KRW
- on-chain status
- bucket counts

`ScannerTable`
- sortable rows
- row badges
- fast selection
- search/filter

`ScannerDetailDrawer`
- layer-level detail
- verdict
- entry reference
- linkout

`LiveWatchPanel`
- 1-minute rolling radar
- CVD breakout log
- advanced stream

`FundingArbPanel`
- educational top strip
- opportunity table
- risk flags

These modules should not own data-fetch authority.
They should receive typed DTOs from route-level orchestration.

## 12. Route And State Strategy

Recommended route/state split:

### Route surfaces

`/terminal`
- primary conversational and analysis surface
- scanner desk can live as a switchable mode or tab

`/cogochi/scanner`
- dedicated heavy scanner workspace
- better place for table-first and live watch density

### State authority

Route-local state:
- active scanner workspace
- sort/filter/search
- open detail symbol
- active watch session
- current progress

Shared durable state:
- saved patterns
- user feedback
- watchlists
- pinned scan sessions

Server-authoritative state:
- scan session data
- cached live events
- historical signal evidence
- future copy/performance proof artifacts

## 13. SSE Event Contract Recommendation

The current SSE shape is a good start, but it should be extended to support batch scanner and live watch UX cleanly.

Recommended event categories:
- `tool_call`
- `tool_result`
- `analysis_layer_result`
- `scan_progress`
- `scan_row`
- `scan_complete`
- `panel_update`
- `live_watch_started`
- `live_watch_event`
- `live_watch_snapshot`
- `live_watch_stopped`
- `error`

This lets the frontend render progressively instead of waiting for giant final blobs.

## 14. Detailed Mapping: User Requests To Tool Plans

### 14.1 "지금 막 튀는 코인 보여줘"

Expected plan:
- call `scan_market(mode=three_group, emphasize_layers=[L18,L19], sort=alphaScore)`
- project rows into `ScannerTable`
- optionally auto-open top row detail
- explain why top 3 ranked

### 14.2 "고래틱 + 오더북 불균형 있는 종목만"

Expected plan:
- call `start_live_market_watch(watch_profile=whale_radar)`
- if live session already exists, call `get_live_watch_snapshot`
- filter events by:
  - whale tick
  - order book imbalance
  - squeeze overlap
- explain only matched symbols

### 14.3 "이 차트 이미지로 판단해줘"

Expected plan:
- multimodal model inspects uploaded image
- infer symbol/timeframe if possible
- if confidence is low, ask a constrained clarification
- call `analyze_market` rather than hallucinating from image alone
- use image only as a hint, not as source of truth

### 14.4 "펀딩피 아비 설명하고 지금 가능한 종목 찾아줘"

Expected plan:
- call `explain_strategy(topic=funding_arbitrage, audience=beginner, include_risks=true)`
- call `scan_funding_arb(...)`
- return:
  - plain explanation
  - current opportunities
  - why some rows are invalid despite high APY

## 15. Gap Analysis Against The Current DOUNI Tool Set

Current tools are enough for:
- single analysis
- simple social lookup
- simple scan
- chart control
- save/feedback/memory

Current tools are not enough for:
- live whale tracker
- radar session control
- funding arbitrage scan
- scan-detail handoff
- rich scanner table workflows
- novice explanation mode tied to real market output

This means the right next step is not "rewrite prompt".
The right next step is:
- add tool granularity
- add UI event types
- add scanner projection DTOs

## 16. Implementation Phases

### Phase 0: Report-to-contract freeze
- freeze the target DTOs and event types
- define which features are deterministic tools vs explanation-only

### Phase 1: Scanner contract extraction
- formalize `ScanRowDTO`
- formalize `ScannerSummaryDTO`
- formalize `ScanDetailDTO`
- formalize `LiveWatchEventDTO`

### Phase 2: Tool expansion
- extend `scan_market`
- add `open_scan_detail`
- add `start_live_market_watch`
- add `stop_live_market_watch`
- add `get_live_watch_snapshot`
- add `scan_funding_arb`
- add `explain_strategy`

### Phase 3: UI projection
- build `ScannerControlBar`
- build `ScannerTable`
- build `ScannerDetailDrawer`
- build `LiveWatchPanel`
- wire into `/terminal` or `/cogochi/scanner`

### Phase 4: Multimodal routing
- add image/screenshot-aware routing
- add prompt policy for symbol/timeframe inference
- prevent image-only hallucinated trading advice

### Phase 5: Persistence and learning loop
- store scan sessions
- store user confirmations
- link strong patterns into memory and doctrine

## 17. Concrete Definition Of Done

This effort is done only when all of the following are true:
- a user can ask for a 3-group scanner in natural language
- the LLM calls deterministic scan tools instead of inventing results
- the UI renders a sortable scanner table with row detail
- the system can open a symbol detail panel from a natural-language request
- the system can run a live watch session for whale/radar/CVD style streams
- the system can explain funding arbitrage in beginner mode and pair it with live tool output
- image input can influence tool choice without replacing tool-backed truth
- terminal/scanner UI and LLM explanation remain synchronized through typed events

## 18. Recommended Immediate Next Step

The highest-leverage next implementation slice is:
- define scanner and live-watch DTO contracts
- then add tool endpoints around those contracts

Without that layer, prompt work alone will not make the requested experience reliable.

## 19. Bottom Line

The user's requested system is achievable in this repo without replacing the current engine.

The repo already has the hard part partially in place:
- 3-group scan selection
- L18/L19 engine support
- 5m-enriched analysis path
- SSE-based LLM tool execution

What is still needed is a disciplined bridge:
- richer tools
- richer UI projections
- multimodal intent routing
- explicit separation between deterministic market computation and LLM narration

That bridge is the implementation target.
