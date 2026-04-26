# Alpha Terminal Harness — Build Rationale (Trader + Engineer Dual Lens)

Status: draft
Date: 2026-04-10

Part of the Alpha Terminal harness package:
- `alpha-terminal-harness-engine-spec-2026-04-09.md`
- `alpha-terminal-harness-methodology-2026-04-09.md`
- `alpha-terminal-harness-html-dissection-2026-04-10.md`
- `alpha-terminal-harness-boundary-2026-04-10.md`
- `alpha-terminal-harness-i18n-contract-2026-04-10.md`
- `alpha-terminal-harness-rationale-2026-04-10.md` (this file)

Purpose:
- The other five docs describe *what* we build. This doc describes *why* we build it that way, viewed simultaneously from two vantage points: a working chart trader and a senior AI engineer.
- It captures the decision rationale that should inform every P0–P5 choice, surfaces the missing features the other docs don't name, and locks the thin-slice build order.
- When future work conflicts with any of the five spec docs, this rationale is the tiebreaker: **what would a trader actually use, and what would an engineer actually trust?**

Scope note:
- This is **not** another registry. No new contracts are introduced here.
- This is the opinion layer. Every claim should be testable against one of: a trader's glance test, an engineer's drift test, or a golden-test snapshot.

---

## 0. The two lenses — one sentence each

- **Trader lens**: *"Can I glance 50 symbols in under 2 seconds, decide which 3 matter, click one, and understand 'why' in under 5 seconds — without ever being lied to?"*
- **Engineer lens**: *"Can I prove that click UI and chat UI return the same numbers for the same market state, today and 3 months from now, with every threshold change tracked and every LLM output verifiable against tool responses?"*

If a feature satisfies only one lens, it gets deferred. If it satisfies both, it ships.

---

## 1. What the HTML got right (steal as-is)

A chart trader looking at the Alpha Terminal HTML should recognize several patterns as **already correct**. These are non-negotiable carryovers.

| # | HTML pattern | Why traders love it |
|---|---|---|
| 1 | Bloomberg-style dense table, 16 columns, narrow padding | Trained eyes need information density. Whitespace-heavy "clean" UI is information-poor and wastes the trader's peripheral vision. |
| 2 | Alpha score + colored bar + verdict label in one cell | The bar lets peripheral vision pre-classify the row in ~200ms before foveal reading even begins. |
| 3 | Wyckoff phase as a 3–4 char badge (`ACC` / `DIST`) | Structural state in glyph form beats a numeric score for decision speed. |
| 4 | `▲N / ▼N` signal count column | Bull/bear evidence tally at a glance. Costs 0.2 seconds of attention to read. |
| 5 | Deep-dive sections ordered: L1 Wyckoff → MTF → CVD → liquidation → flow → BB → ATR → breakout → sector → OB → regime | This matches the order in which a real trader mentally reads a chart. Do not reorder. |
| 6 | Entry / target / stop / RR as four side-by-side boxes | Four numbers, one row, immediate. Better than narrative prose. |
| 7 | Filter chips as immediate facet toggles (`BULL`, `BEAR`, `WYCKOFF`, `MTF`, `SQUEEZE`, `LIQ`, `EXTREME`) | Traders think in facets, not in free-text search. |
| 8 | Sparklines in OI and taker cells | Tiny embedded trend signal; no click needed to see direction. |
| 9 | Market bar at the top showing regime (F&G, kimchi, mempool, verdict counts) | One row, global context, always visible. |
| 10 | Stop/scan control and progress strip inline with the table | No modal, no page change, no loading screen. Scan feels like turning a dial. |

These carry over to the CHATBATTLE port **verbatim in layout**. The engine behind them changes (server-authoritative, registry-backed), but the information architecture stays.

---

## 2. What the HTML got wrong (must fix before it can be trusted)

These are the failures a working trader would find in the first week and stop using the tool over. Each one must be fixed before P4 ships.

### 2.1 Snapshot-only, no "video"

The HTML takes a photograph of the market every scan. It has **no memory** of what changed since the last scan.

**Trader problem**: the single most profitable moment — the instant a symbol transitions from Phase B → C, or from Phase C → D — is invisible. By the time the trader opens the scanner, Alpha Score already shows `+62 BULL`, but there's no indication that this is hour 2 of the transition vs hour 20.

**Fix**: engine must store last-known state per symbol (Redis or equivalent), compute `phase_age` and `phase_transition_timestamp`, and surface a "fresh transition" filter and a new event family `event.structure.phase_changed`.

**Priority**: P3. Without this, the structure-first verdict is just a prettier snapshot.

### 2.2 L5 liquidation heuristic is false

HTML line 1091–1092:
```js
const liqLong  = currentPrice ? currentPrice*0.90 : null; // 10× long liq
const liqShort = currentPrice ? currentPrice*1.10 : null;
```

This assumes every long is 10× leveraged and every short is 10× leveraged. In reality leverage is distributed from 1× to 125×. The displayed "liquidation level" is a lie.

**Fix**: drop L5 entirely. Use only `L9_realLiq` force-order data as the liquidation authority. If Binance ever exposes true liquidation heatmaps, add that as a new raw source. Until then, no fiction.

**Priority**: P0 (remove) + P5 (real heatmap later).

### 2.3 L13 breakout uses 4H bars to approximate 7-day/30-day ranges

HTML line 1391:
```js
const c7  = candles.slice(-7*6);   // 7일 (4H 기준 6봉/일)
const c30 = candles.slice(-30*6);  // 30일
```

42 × 4H bars is 168 hours, which **is** 7 × 24 hours, so the math works on paper. But if the scanner timeframe changes to 1h or 1d, the slice count is wrong, and the "7-day high" silently becomes a different window. Worse, if the market has session gaps (rare on futures but non-zero), bar counting drifts from wall-clock time.

**Fix**: L13 sources `raw.symbol.klines.1d` exclusively. 7 days = last 7 daily bars. 30 days = last 30 daily bars. Never bar-count over non-daily series.

**Priority**: P0.

### 2.4 L10 MTF re-runs the same heuristic on each timeframe

HTML line 1265:
```js
const w = L1_wyckoff(candles);
```

MTF confluence is computed by running the same flawed Wyckoff heuristic on 1H, 4H, and 1D candles independently. If L1 is weak, L10 is three times as weak.

**Fix**: after P2 replaces L1 with a proper structure engine, MTF becomes "read the per-TF structure state and compare states", not "re-run the heuristic three times".

**Priority**: P2 (coupled to Wyckoff replacement).

### 2.5 Kimchi premium treated as a directional signal

HTML L8 says "kimchi ≥ +3% → bearish -7 score". This is too simple. Real kimchi regime reading needs:
- BTC dominance change
- Upbit KRW volume rotation
- Which coins are hot on Korean exchanges this week

A single kimchi threshold shorts Korean-market rallies that are actually legitimate for 8 months out of 12.

**Fix**: kimchi is a **context modifier**, never a primary signal driver. It modulates `verdict.confidence` (+/- 5–10%) but cannot flip `verdict.bias`. The HTML lets it contribute -10 directly, which is too much.

**Priority**: P3 (verdict refactor).

### 2.6 Hard-coded sector map

HTML lines 731–747. 60-odd symbols mapped to sector strings. Any new symbol defaults to `기타`. No way to update without editing HTML.

**Fix**: server-side sector registry, loadable from JSON, admin-editable. Default fallback uses CoinGecko category when available.

**Priority**: P0.

### 2.7 Hard-coded Korean strings inside the engine

Every `sigs.push({t: '…'})` is a Korean literal inside computation code. Impossible to internationalize without rewriting the layer functions.

**Fix**: engine emits `{id, slots}` event records only. Rendering happens in the i18n layer. See `alpha-terminal-harness-i18n-contract-2026-04-10.md` §5.

**Priority**: P0 (enforced by CI gate).

### 2.8 Alpha score dominates verdict

HTML line 1554–1558 bands the verdict purely by alpha score sum. A symbol with Wyckoff distribution Phase D but a high CVD absorption score can end up `BULL BIAS` because the arithmetic happens to land above +25.

**Fix**: verdict is **structure-first**. Alpha score becomes a ranking helper only, not the oracle. See `alpha-terminal-harness-engine-spec-2026-04-09.md` §8.3 "Flat score policy".

**Priority**: P3.

### 2.9 `#period` conflates display timeframe and engine timeframe

A user changing the period dropdown from 4H to 1H silently changes the bar count for OI history, L/S ratio, and taker ratio — while keeping the same thresholds. This is the most common hidden-coupling bug in scanners. The same "extreme" threshold evaluated at different windows means different things.

**Fix**: engine timeframe is fixed per feature (see engine spec §4.1). Display timeframe only affects the chart the user looks at; it never changes what the engine computes.

**Priority**: P0.

### 2.10 No mobile view

HTML is desktop-only. Real trader phone usage is ~60% of total session time (car, café, waking up, bed). Dense 16-column tables do not fit a phone.

**Fix**: two renderers sharing the same contracts —
- Desktop: full dense table
- Mobile: summary card view showing Alpha bias, structure state, top reason, freshness. One tap to open a single-symbol deep dive.

**Priority**: P4 (alongside UI/LLM unification).

---

## 3. What's missing entirely (must add)

These are features the HTML never had but a working trader needs. They are not "nice to have" — they're the difference between using the tool for a week vs. abandoning it.

| # | Missing feature | Why it matters | Target phase |
|---|---|---|---|
| M1 | **Fresh phase transition filter** | The most profitable moment is the instant a structure changes. Without this, the scanner ranks stale bulls the same as fresh ones. | P3 |
| M2 | **Structure break alerts** | When price loses a Wyckoff Phase D support or reclaims a failed resistance, the trader needs to know within seconds. Snapshot scanners hide this. | P5 (alerts) |
| M3 | **Whale tick overlay** | `$100k+` single-trade ticks on a symbol are the rawest aggression signal available. Add `⚡` badge to any row that had a whale tick in the last 5 min. | P5 (live watch) |
| M4 | **Funding payout countdown** | On extreme FR, the exact hours to the next funding event dictates entry timing. | P0 (trivial: store `nextFundingTime` from premiumIndex) |
| M5 | **Watchlist with always-top-pin** | One-click add. Watchlisted symbols always render in a separate band above the main table. | P0 (UI only) |
| M6 | **Mobile summary view** | See 2.10. | P4 |
| M7 | **Backtest win-rate per setup archetype** | Alpha score +62 means nothing without "historically, +62 setups moved ≥5% within 3 days N% of the time". | P6 or later |
| M8 | **CVD divergence strength score**, not just a flag | HTML reports "absorption detected" as a boolean. Traders need to know if it's a strong absorption or marginal. | P1 |
| M9 | **"Why did this change since last scan?" diff view** | After a rescan, a dim highlight on rows whose verdict, phase, or top reason changed. Answers "what's new?" without re-reading the whole table. | P4 |
| M10 | **Invalidation level as a 1st-class field**, distinct from ATR stop | Wyckoff-structural invalidation is the **primary** risk level; ATR stop is a tighter alternative. HTML conflates them. | P3 |
| M11 | **"Just show me what to do with SOL" mode** | Single-symbol chat shortcut that returns: current structure, top 3 reasons, primary invalidation, entry zone, and one counter-reason. Nothing else. | P4 |
| M12 | **`skipped` tracking** for symbols the trader dismissed | If the user swiped away SOL at +45, don't re-pop it at +48 unless something material changed. | P4 |

---

## 4. Engineer-side failure modes (what we must make impossible)

Each of these is a real way the system can silently drift and destroy trust. Each needs a concrete countermeasure baked into P0 architecture.

| # | Failure mode | How it happens | Countermeasure |
|---|---|---|---|
| F1 | **Scope creep via LLM** | Someone lets the LLM "reason about" a threshold just once. Six months later the LLM is computing features. | LLM physically walled off; tool contracts only; no access to engine internals; numeric token validation post-generation. |
| F2 | **Hidden threshold drift** | Someone changes `BB_SQUEEZE_RATIO` from 0.65 to 0.6 and no existing test catches it. Three weeks later live results shift silently. | All thresholds live in `config/thresholds.ts` with version history. Golden-test snapshots break on any output diff. Diff requires explicit justification in PR. |
| F3 | **Stale data displayed as fresh** | An upstream API goes soft-fail (returns last good value). Frontend renders it without staleness indication. Trader makes a bad call. | Every contract response carries `freshness: {as_of, stale}`. UI dims stale values. Any stale value in LLM narration must be called out. |
| F4 | **Concurrent scans stepping on each other** | User triggers scan, then changes params, triggers again before first finishes. Results interleave. | Every scan gets a session ID. First scan aborts on session change. UI shows "aborted" state explicitly. |
| F5 | **Rate-limit cascading** | Binance 429 → retries → 418 → IP ban. | Circuit breaker pattern: on 429, pause all `fapi` requests for N seconds (exponential). Surface to UI as "Binance rate limit — resuming in 12s". |
| F6 | **Bilingual number drift in LLM** | LLM rounds `-0.0823%` to "약 -0.08%" in Korean, keeps exact in English. Click UI and chat UI disagree. | Numeric token validator: every number in LLM reply must appear verbatim in tool response. Reject otherwise. |
| F7 | **LLM context bloat** | Verdict blocks in prompt grow to 3k tokens per turn. 10-turn session = 30k tokens. | Stage C prompt receives **summary blocks only**. Detail fetched on demand via follow-up tool calls. Hard token budget per turn. |
| F8 | **Threshold magic numbers scattered across files** | Changing one requires grep, risks missing occurrences. | All thresholds imported from `config/thresholds.ts`. Lint rule forbids numeric literals in feature code outside a small allowlist (0, 1, standard math constants). |
| F9 | **Frontend silently computing** | Future dev adds a `Math.round(score / 5) * 5` in the Svelte renderer for display. Now frontend and backend round differently. | Frontend is dumb renderer only. All bucket classification, color mapping, and label choice happens server-side. Contract response includes display metadata. |
| F10 | **"Layer N" terminology bleeding into engine code** | Developer names a function `L2_flow` matching HTML. Couples engine naming to HTML file layout. Months later we can't move things. | Engine uses `features/`, `events/`, `state/`, `verdict/` directory structure. "Layer" is a doc-level historical term, not a code symbol. |

---

## 5. Architecture preferences the engineer would push

Concrete structural choices to make the system defensible and testable.

### 5.1 Pure function engine, not OOP layers

Every feature, event, and state reducer is a pure function: `(inputs) => outputs`. No `Date.now()`, no `fetch`, no globals, no mutation. A clock is injected if time is needed. This makes:
- golden tests trivial (freeze inputs → snapshot outputs)
- unit tests fast (no I/O)
- parallelization safe (no shared state)
- debugging linear (call graph = data dependency graph)

### 5.2 Orchestrator separate from computation

The batch scanner orchestrator is the only thing that talks to Binance. It fetches, hands data to pure functions, collects results, writes to a store. No feature function ever calls `fetch` itself. Swapping REST for websocket later means changing the orchestrator, not the engine.

### 5.3 Batch scanner and live watcher are separate subsystems

They share pure feature functions but have different orchestration, storage, and lifecycle semantics:
- **Batch**: 60-second refresh cycle, full universe, REST poll, Redis snapshot
- **Live**: per-symbol subscription, websocket stream, rolling window buffer, different UI

Do not fuse them. A single "real-time scanner" is a mistake. Batch results are stable and comparable; live results are volatile and streaming. Mixing them causes UX confusion ("why did the score just flicker?").

### 5.4 Frontend is a dumb renderer

All classification, bucketing, color mapping, label selection, and verdict banding happens server-side. Contract responses include `rendered` metadata so the frontend just fills spans. This guarantees click UI and chat UI show identical outputs.

### 5.5 "Harness" = Stage B tool contracts + Stage C LLM + validation gates

Per the boundary decision doc, the harness wraps the engine. It does not compute. It routes, validates, narrates, and formats. Nothing else.

### 5.6 Golden test snapshots are the primary correctness regime

Not unit tests. Golden tests. Ten canonical market snapshots, each paired with the expected verdict/feature/event output. Every engine change re-runs them. Any diff requires explicit justification in the PR description.

Suggested snapshot set:
1. Phase C spring + SOS fresh (strong bull, fresh transition)
2. MTF triple bear with BB big squeeze (strong bear setup)
3. BB big squeeze + ultra-low ATR with mixed flow (neutral wait)
4. Extreme positive FR + long liquidation cascade (strong bear trigger)
5. Fake breakout / UTAD rejection (reversal setup)
6. Kimchi extreme + on-chain whale outflow (contextual warning, not a primary signal)
7. Neutral range with no coherent structure (should output `NEUTRAL` confidently)
8. Stale data scenario (freshness flag must fire)
9. All-data-missing edge case (graceful degradation)
10. Symbol not in futures universe (rejection path)

### 5.7 "Grounded" rather than "harnessed"

Naming nit: the LLM layer is better described as *grounded generation* than as a harness. Harness implies test rig; grounding implies every token traces back to a verified source. Both terms are fine; `harness` is our package prefix now, but the internal code module should be called `grounded-narrator/` or similar, not `llm-harness/`.

---

## 6. The decision matrix — trader needs vs. engineer constraints

| Topic | Trader wants | Engineer constraint | Decision |
|---|---|---|---|
| Glance speed | 50 symbols in 2 seconds | 100 symbols × 9 APIs ≈ 45s serialized | Background 60s refresh cycle + Redis cache. UI always shows "last refreshed N seconds ago". Real-time is a lie for all but top 20. |
| Structure-first | Wyckoff phase is the backbone | Current L1 is a snapshot heuristic | Replace L1 with event-sequence structure engine in P2. Verdict banding depends on structure state first, alpha score second. |
| Phase transition recency | "Fresh transitions" filter | Needs previous-scan state storage | Redis stores per-symbol last state. Diff computed per scan. `feat.transition.age_minutes`. |
| Break alerts | Stop-level crossings must alert within seconds | Alerts require a stateful subsystem | P5 deliverable bundled with live watch. Until then, display current invalidation line prominently and leave alerting to users. |
| Mobile | 60% of trader session time is on phone | Dense desktop table doesn't fit mobile | Two renderers sharing one contract: desktop full, mobile summary card. P4. |
| Chat UI | Useful for follow-up, filtering, "why" questions | Not faster than a table for scanning | Chat is a side panel. Table is the main surface. LLM is narrator, not primary UI. |
| Backtest / win-rate | "How often does this setup work?" | Requires historical DB | Defer to P6. Use `verdict.confidence` as a proxy until then. |
| Whale tick / radar | Highest-value signal in live trading | Websocket = separate subsystem | P5 live watch. Batch scanner gets a "last whale tick timestamp" badge only, from cached stream state. |
| Threshold hard-coding | "If these numbers change, my edge changes" — needs trust | Easy to scatter across files | `config/thresholds.ts` + version history. Lint rule prevents literal magic numbers in feature code. P0 mandatory. |
| Stale data | A single stale value at the wrong moment destroys trust for the whole product | Upstream APIs go soft-fail silently | Every response carries `freshness`. Stale values dimmed in UI. LLM must mention staleness. CI golden test for stale-data scenario. |
| LLM narration tone | Should sound like a trader, not a textbook | Numeric fidelity required | Tone guided by `verdict.confidence` bucket. Technical terms stay English (Wyckoff, CVD, FR, OI). Connector words Korean when locale=ko. No hedging beyond confidence bounds. |
| Prediction questions | "Will it go up tomorrow?" is the wrong question | LLM must not answer it | Redirect to structure: "prediction을 드릴 수는 없지만 현재 구조와 수급은 …". Template this redirect. |
| Alpha score visibility | Useful for ranking, not for decisions | Must not dominate verdict | Keep column in the table for sort stability. Do not show in the primary verdict banner. |
| Bilingual mixing | EN technical + KO connectors feels natural | Must not drift numerically between locales | Dictionary-backed labels, numeric validator, golden test for bilingual parity. |

---

## 7. The thin-slice build order (Day 1 → Day 5)

The decision is **no more spec documents**. The next deliverable is running code. Five focused days, each producing a concrete artifact that the next day depends on.

### Day 1 — UX mockup with fake data

**Deliverable**: `src/routes/terminal/alpha/+page.svelte` + `src/lib/fixtures/alpha-scan-sample.ts`

- 20 fixture rows covering the full verdict spectrum (strong bull to strong bear, with one squeeze, one MTF triple, one extreme FR, one stale-data row, one missing-data row).
- Full 16-column table with colors, badges, sparklines, filter chips.
- Market bar at the top with fixture globals.
- Deep-dive panel opens on row click, renders the 9 sections from fixture data.

**Success test**: developer sits a friend who trades daily in front of the screen. Give them the fixture story. Measure: can they name the 3 most interesting rows in under 5 seconds? If no, rework layout before writing any engine code.

**Engine code written this day**: 0 lines.

### Day 2 — Three features + golden tests

**Deliverable**: `src/lib/engine/features/{wyckoff,flow,cvd}.ts` + `src/lib/engine/test/golden/` with 3 scenarios.

- Pure functions. No fetch, no state, no Date.now.
- Input shapes match `raw.symbol.*` from the engine spec.
- Golden test: freeze a BTC candle fixture, assert the output.
- Three scenarios from the §5.6 list: Phase C spring, MTF triple bear, BB big squeeze.

**Success test**: running `npm run test:golden` passes. Any threshold change (simulate by editing `config/thresholds.ts`) breaks the snapshots loudly.

### Day 3 — One tool contract, one real symbol

**Deliverable**: `src/routes/api/alpha/verdict/+server.ts` implementing `scan.get_symbol_verdict` for BTCUSDT only. Real Binance data.

- Orchestrator fetches from Binance.
- Calls Day 2 feature functions.
- Composes a `verdict` block with top_reasons, invalidation, entry/stop/targets, freshness.
- Day 1 mockup's deep-dive panel fetches from this endpoint for BTC; other rows still use fixtures.

**Success test**: open the page, click BTC row, see real numbers within 2 seconds. Click another row, see fixture numbers. The distinction is obvious and intentional.

### Day 4 — LLM narrator + dual-path parity

**Deliverable**: `src/lib/harness/narrator.ts` + chat side panel that calls the same `scan.get_symbol_verdict` endpoint.

- System prompt includes §4 forbidden list from boundary doc, `{{locale}}` slot.
- Numeric token validator: extract every number from LLM reply, assert presence in tool response.
- Parity test: for BTC, compare the deep-dive panel's numeric display with the LLM chat answer. All numbers must match byte-for-byte.

**Success test**: asking "BTC 지금 어때" in the chat returns a Korean narration whose every number matches the deep-dive panel. Asking "how's BTC" returns the equivalent English narration with identical numbers. Golden bilingual test passes.

### Day 5 — Remaining 12 features, full scan

**Deliverable**: `src/lib/engine/features/*.ts` for the remaining 12 features (OI / L·S / taker / vsurge / order book / real liq / kimchi / onchain / fear-greed / mtf / breakout / bb / atr / sector) + `scan.get_table` tool contract.

- Each feature function has at least one golden test scenario.
- Full scan of top 30 symbols runs end-to-end.
- Day 1 mockup now shows real data across all rows.

**Success test**: a trader friend uses it for 20 minutes. Notes what they like and what they hate. Those notes become the P4 backlog.

### What Days 1–5 deliberately skip

- MTF confluence that reads per-TF structure (too coupled to P2 structure engine rewrite)
- Phase transition recency (needs Redis state store)
- Mobile view (comes in P4 after desktop is stable)
- Live watch / websockets / whale tick (P5)
- Backtest win-rate (P6)
- Advanced breakout alerting (P5)
- Sector registry admin UI (P4+)
- Full threshold registry CRUD UI (debug panel in P4)

These are all known, tracked, and deferred on purpose. The thin slice must not try to include them.

---

## 8. The trader's gut check — the bar for "does this ship"

A scanner is only worth using if, in the first week, a working trader can answer all of these with "yes":

1. Does it load in under 3 seconds?
2. Can I see 50 symbols in one screen without scrolling horizontally (desktop)?
3. Within 1 second of loading, can I tell which 3 rows matter most today?
4. Do the numbers ever lie? (Is staleness always called out?)
5. When I click a row, does the "why" answer arrive in under 5 seconds?
6. When I ask the chat "just tell me about SOL", does the answer sound like a trader, not a textbook?
7. Does it refuse to answer "will it go up?" and redirect me to structure instead?
8. If I check again 30 minutes later, is it obvious what changed?
9. Does the mobile view let me do a decent glance during a coffee break?
10. Does the tool respect my time, or does it ask me questions I don't want to answer?

If the answer to any of these is "no", the trader stops using it. Every P0–P5 decision should be measurable against this list.

---

## 9. The engineer's gut check — the bar for "does this stay shipped"

A system this complex stays alive only if the engineer can answer all of these with "yes":

1. Can I delete any feature function and know exactly which golden tests will break?
2. Can I change a threshold and see its blast radius in under 10 seconds?
3. If the LLM ever emits a number that didn't come from a tool response, does CI block the PR?
4. If Binance rate-limits us, does the circuit breaker catch it before IP ban?
5. If an upstream API goes soft-fail, does staleness propagate all the way to the UI text?
6. Can a new dev add a feature in a day without reading all six harness docs?
7. Are `ko` and `en` dictionary keys guaranteed to match? (CI gate.)
8. Is there a single place to read all thresholds and their version history?
9. Is there a snapshot of "last known good" state so I can diff after a change?
10. Is the orchestrator the only place that does I/O?

If the answer to any of these is "no", technical debt accumulates until the system becomes unmaintainable. Every architectural decision should be measurable against this list.

---

## 10. What this rationale does NOT decide

Open questions that belong to their respective docs, not this one:

- Exact threshold numbers — `alpha-terminal-harness-engine-spec-2026-04-09.md` §9
- Specific LLM forbiddens wording — `alpha-terminal-harness-boundary-2026-04-10.md` §11
- Dictionary key shapes and slot templates — `alpha-terminal-harness-i18n-contract-2026-04-10.md` §11
- Network atom replacement priorities — `alpha-terminal-harness-html-dissection-2026-04-10.md` §9

If a future decision has to be made and two docs disagree, this rationale is the tiebreaker: pick the option that better serves both the trader's glance test and the engineer's drift test.

---

## 11. Next action (not a spec, a commit)

The next commit on this branch must not be another markdown file. It must be either:

**Option A (recommended)**: `src/routes/terminal/alpha/+page.svelte` + `src/lib/fixtures/alpha-scan-sample.ts` — Day 1 mockup with fake data. Zero engine code. Purely UX validation.

**Option B**: `src/lib/engine/features/wyckoff.ts` + `src/lib/engine/test/golden/phase-c-spring.test.ts` — Day 2 first pure function with golden test. Zero UI.

**Option A is strictly better** because a bad UX kills the product regardless of engine quality, and a UX mockup is cheaper to throw away than an engine rewrite. Engine work should only begin after the mockup's glance-test passes.

Either way: **no more spec documents until the thin slice runs end-to-end**.
