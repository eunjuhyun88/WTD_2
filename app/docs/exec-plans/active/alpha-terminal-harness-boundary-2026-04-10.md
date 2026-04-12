# Alpha Terminal Harness — Boundary Decision (LLM vs Engine)

Status: draft
Date: 2026-04-10

Part of the Alpha Terminal harness package:
- `alpha-terminal-harness-engine-spec-2026-04-09.md`
- `alpha-terminal-harness-methodology-2026-04-09.md`
- `alpha-terminal-harness-html-dissection-2026-04-10.md`
- `alpha-terminal-harness-boundary-2026-04-10.md` (this file)
- `alpha-terminal-harness-i18n-contract-2026-04-10.md`
- `alpha-terminal-harness-rationale-2026-04-10.md`

Purpose: answer the question "Alpha Terminal HTML의 방법론을 가져오되, 어디까지가 API+수치계산이고 어디부터 LLM이 관여하는가". This is the single source of truth for that split. Every future implementation decision must cite it.

---

## 0. Core rule — one sentence

> **The engine owns every number. The LLM owns every sentence and every routing decision. They never swap roles.**

If a user-visible number cannot be traced to an engine contract ID (`raw.*`, `feat.*`, `event.*`, `state.*`, `verdict.*`), it does not ship.
If a user-visible sentence is hand-coded as a fixed string in the engine, it probably belongs to the LLM layer (or a template).

---

## 1. Alpha Terminal HTML is 100% deterministic — that's the good part

The source HTML contains **zero LLM**. Every score, every badge, every label, every verdict banner comes from explicit thresholds. This is its strength and the thing we want to port.

| Layer of the HTML | LLM involvement | Why |
|---|---|---|
| Public API fetches (Binance, Upbit, Bithumb, etc.) | 0% | pure network IO |
| Candle / depth / funding / OI parsing | 0% | deterministic extraction |
| 15 layer functions (`L1_wyckoff` … `L15_atr`) | 0% | threshold math |
| Alpha aggregation (`computeAlpha`) | 0% | weighted sum |
| Verdict banner text ("STRONG BULL — 강한 상승 편향") | 0% | hard-coded lookup by score band |
| Signal badges (`allSigs`) | 0% | hard-coded strings per threshold branch |
| Deep-dive panel content | 0% | template fill |
| Entry/TP/Stop/RR boxes | 0% | ATR × constants + Wyckoff C&E |

We keep this property. The CHATBATTLE port will have the same property at the engine level: all 15 layers' math lives server-side, fully deterministic, testable in isolation, runnable without a model.

**The LLM is added as a new layer *on top of* the deterministic engine. It does not replace any of the above.**

---

## 2. Pipeline diagram — where the boundary sits

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │  STAGE A — DETERMINISTIC ENGINE  (no LLM, no prose, only numbers)   │
 │                                                                     │
 │  1. raw fetch         Binance/Upbit/Bithumb/mempool/etc.            │
 │                       ↓                                             │
 │  2. raw registry      raw.global.*, raw.scan.*, raw.symbol.*        │
 │                       ↓                                             │
 │  3. feature engine    feat.struct.*, feat.flow.*, feat.cvd.*, …     │
 │                       ↓                                             │
 │  4. event detector    event.wyckoff.sos, event.flow.fr_extreme_*, … │
 │                       ↓                                             │
 │  5. structure engine  state.acc_phase_c, state.dist_phase_d, …      │
 │                       ↓                                             │
 │  6. verdict engine    verdict.bias, .confidence, .top_reasons[],    │
 │                       .counter_reasons[], .invalidation, .entry,    │
 │                       .stop, .targets[], .rr_reference              │
 │                                                                     │
 │  OUTPUT: fully-typed blocks. Every number has a contract ID.        │
 │  Every reason is a reference to an event/state, not free prose.     │
 └─────────────────────────────────────────────────────────────────────┘
                                  ↓
 ┌─────────────────────────────────────────────────────────────────────┐
 │  STAGE B — CONTRACT CACHE / TOOL LAYER  (still no LLM)              │
 │                                                                     │
 │  Typed tool contracts, deterministic:                               │
 │    scan.get_table                                                   │
 │    scan.get_symbol_overview                                         │
 │    scan.get_symbol_raw   / features / events / structure / verdict  │
 │    scan.compare_symbols                                             │
 │    scan.get_global_context                                          │
 │    scan.start/stop/get_live_watch                                   │
 │    scan.explain_decision  (returns cached evidence chain, not prose)│
 │                                                                     │
 │  These can be invoked by UI clicks OR by the LLM. Same outputs.     │
 └─────────────────────────────────────────────────────────────────────┘
                                  ↓
 ┌─────────────────────────────────────────────────────────────────────┐
 │  STAGE C — LLM  (router + narrator, never calculator)               │
 │                                                                     │
 │  C1. intent classification     "Strong Bull만 보여줘" → rank intent │
 │  C2. parameter extraction      symbol, tf, focus, filters, top_n    │
 │  C3. tool planning             pick 1-N tools from Stage B          │
 │  C4. multimodal parsing        chart image → {symbol, tf, focus}    │
 │  C5. ambiguity resolution      "이거"의 referent 결정                │
 │  C6. narration / formatting    verdict block → Korean sentences     │
 │  C7. pedagogy mode             novice-friendly explanation of terms │
 │  C8. comparison assembly       merge multiple verdict blocks        │
 │                                                                     │
 │  RULE: the LLM quotes contract values verbatim. It does not         │
 │  re-derive thresholds, re-weight layers, or invent new signals.     │
 └─────────────────────────────────────────────────────────────────────┘
                                  ↓
                           UI projection layer
                         (table / deep-dive / chat)
```

**Stage A + B are the same codebase that powers click UI.** When the user clicks a row, the UI calls Stage B contracts directly — no LLM hop. When the user types natural language, Stage C routes to the same Stage B contracts. Both paths return byte-identical numbers.

---

## 3. What the LLM IS allowed to do (C1–C8)

| # | Role | Example | What it produces |
|---|---|---|---|
| C1 | Intent classification | "솔라나 숏쪽인가" → `drill`/`symbol=SOLUSDT`/`focus=flow` | intent enum + slots |
| C2 | Parameter extraction | "Top 20 USDT pair에서 BB 스퀴즈만" → `top_n=20`, `facet=SQUEEZE` | structured tool call args |
| C3 | Tool planning | "왜 BULL이야" → 1. `get_symbol_verdict` 2. `get_symbol_structure` | ordered tool invocation list |
| C4 | Multimodal parsing | chart screenshot → `{symbol:BTCUSDT, tf:4h, focus:wyckoff}` | parsed request |
| C5 | Ambiguity resolution | "이거 위험해?" after SOL deep-dive → SOL 지시 | resolved referent |
| C6 | Narration / formatting | verdict block → "솔라나는 Strong Bull. 이유는 …" | Korean/English prose grounded in block |
| C7 | Pedagogy | "와이코프가 뭐야" → explain term, then show current state | explanation + inline engine data |
| C8 | Comparison assembly | "BTC vs ETH 누가 더 강해" → compare two verdict blocks | side-by-side narrative |

Rule for C6 narration specifically:
- The LLM **quotes** contract values. It does not round, recompute, or paraphrase the number.
- It may reorder reasons by importance, drop low-signal ones, or translate them into user-friendly wording, but the reason IDs stay.
- If a number is missing or stale, it says so instead of guessing.

---

## 4. What the LLM is NOT allowed to do

| # | Forbidden action | Why | Instead |
|---|---|---|---|
| F1 | Compute market math in prose ("ATR is about 2.3% so stop around…") | drifts from engine | read `feat.atr.pct` + `feat.atr.stop_long` |
| F2 | Re-weight layers ("I think Wyckoff should matter more here") | breaks reproducibility | engine's `verdict.confidence` is final |
| F3 | Invent new events ("looks like a head-and-shoulders to me") | unauditable | only reference registered events |
| F4 | Guess missing data ("probably around 40k TX") | fabrication | say "data stale" + engine freshness flag |
| F5 | Convert between timeframes ("1h means 12 × 5m") | hidden assumption | engine owns TF authority |
| F6 | Recompute alpha score ("sum of layers = 62") | conflicts with engine | quote `verdict.bias` + legacy alpha |
| F7 | Interpret chart pixels as data ("this candle looks red") | misreads image | image only → intent slots, then call tools |
| F8 | Execute trades, place orders, sign transactions | out of scope | explanation and references only |
| F9 | Make up tickers ("check BANANAUSDT") | hallucination | validate against futures universe first |
| F10 | Offer conviction language beyond engine's confidence | overpromising | bound tone to `verdict.confidence` |

These are enforced by:
1. **Tool contracts return structured data, not prose.** The LLM receives JSON blocks; it cannot hallucinate a number without inventing a contract ID.
2. **System prompt explicitly forbids F1–F10** with reference examples.
3. **Output validation**: every numeric token in the LLM's reply is checked against the set of numbers in the tool response blocks. Drift = auto-regenerate or fall back to template.
4. **Freshness markers** are required in every answer that quotes a value.

---

## 5. Atom-level classification — Alpha Terminal HTML

For every HTML atom in the dissection worksheet, which stage does it live in?

### 5.1 Stage A (deterministic engine)

- All 21 network calls (N1–N21)
- All 15 layer functions (F3–F17)
- `loadGlobal()`, `fetchSymbol()`, `computeAlpha()` (F1, F2, F18)
- All threshold constants (§4 of worksheet) — now lifted to config registry
- All score banding (`aC()`, `aL()`, verdict band 60/25/-25/-60)
- All numeric outputs: FR, OI Δ, pricePct, ratios, premiums, sat/vB, counts
- Force-order liquidation aggregation
- ATR stop/TP computation
- Wyckoff C&E target computation
- MTF alignment detection
- BB squeeze/expansion state
- Sector mean alpha aggregation

### 5.2 Stage B (tool contracts — deterministic, same path for click + LLM)

- `scan.get_table` (replaces `renderTable()` state pipeline)
- `scan.get_symbol_overview` (table row for one symbol)
- `scan.get_symbol_raw` (inspect normalized raw fields)
- `scan.get_symbol_features` (inspect feat.*)
- `scan.get_symbol_events` (active/inactive events)
- `scan.get_symbol_structure` (state machine output + evidence chain)
- `scan.get_symbol_verdict` (verdict block = what the verdict box shows)
- `scan.get_global_context` (market bar blocks)
- `scan.compare_symbols`
- `scan.start/stop/progress` (scan orchestration)
- `scan.get_registry_config` (debug — read thresholds)
- `scan.explain_decision` — **returns structured evidence chain, not prose**. (The LLM turns it into prose in Stage C.)

### 5.3 Stage C (LLM — narration + routing only)

What the LLM receives: JSON blocks from Stage B.
What the LLM emits: sentences that cite the blocks.

- Intent classification of user utterance → Stage B tool selection
- Parameter filling for the tool call
- Receiving Stage B response
- Selecting which reasons/events/features to highlight given user's focus
- Formatting into Korean/English sentences
- Pedagogy detours ("와이코프란…") with inline engine values
- Multimodal image → intent slot extraction (not data extraction)
- Multi-turn ambiguity resolution
- Comparison narrative assembly across multiple verdict blocks

### 5.4 Neither stage — UI chrome

- Header branding, watermark, version badge, live indicator, progress bar visual, filter button active-state, sparkline SVG, order-book mini viz, scrollbar styling, panel open/close animation, localStorage watchlist, preset buttons.

These need no LLM and no engine contract. Pure presentation.

---

## 6. Concrete utterance → pipeline walk-throughs

### 6.1 "BTC 지금 어때"

1. **C1 intent**: `symbol_overview`
2. **C2 extract**: `symbol=BTCUSDT`, `focus=general`
3. **C3 plan**: `scan.get_symbol_overview(BTCUSDT)` + `scan.get_symbol_verdict(BTCUSDT)`
4. **Stage B** returns: `{bias:"BULL", confidence:0.62, structure_state:"state.acc_phase_c", top_reasons:[ev.spring, ev.sos_candidate, ev.cvd.absorption_buy], counter_reasons:[ev.flow.fr_hot], entry_zone:"64200-64800", stop:62900, targets:[67500, 69200], rr_reference:2.1, freshness:{as_of:"2026-04-10T14:02Z", stale:false}}`
5. **C6 narration**: "BTC는 현재 BULL (confidence 62%). Phase C accumulation에서 spring이 찍혔고 CVD는 매수 흡수. FR이 다소 hot한 건 경계 요인. 진입 참고 64,200~64,800 / 손절 62,900 / 목표 67,500~69,200. (14:02 UTC 기준, 데이터 신선)"
6. LLM **never** recomputed a threshold. Every number came verbatim from Stage B.

### 6.2 "Strong Bull만 보여줘"

1. **C1**: `rank`
2. **C2**: `bias_min=STRONG_BULL`, no symbol
3. **C3**: `scan.get_table({bias_min:"STRONG_BULL", sort:"alpha_desc"})`
4. **Stage B** returns rows + count aggregation.
5. **C6**: "Strong Bull 5개 나왔어요. 1위 SOL (+72), 2위 INJ (+68) …" with one-line reason per row (top_reasons[0] only to keep concise).
6. UI client **also** renders the table from the same `scan.get_table` response. LLM answer and table are byte-identical in the numbers they reference.

### 6.3 "와이코프가 뭐야 그리고 지금 SOL은 어느 phase야"

1. **C1**: `pedagogy + drill`
2. **C2**: `term=wyckoff`, `symbol=SOLUSDT`, `focus=wyckoff`
3. **C3**: `scan.get_symbol_structure(SOLUSDT, focus=wyckoff)`
4. **C7 pedagogy**: LLM writes ~3-4 sentences on Wyckoff basics (this is *general knowledge*, not market data — allowed).
5. **C6 narration** of engine output: "SOL은 현재 `state.acc_phase_b`. ST를 3회 찍었고 (27시간 범위 안), climax volume 2.1×, 최근 spring 후보는 아직 없음. Phase C 진입 조건: spring 또는 깊은 지지 테스트 + 흐름 확인."
6. The general Wyckoff explanation is OK because it's not market data. The SOL-specific numbers all come from Stage B.

### 6.4 "(차트 캡처 업로드) 이거 지금 진입 가능?"

1. **C4 multimodal parse**: vision extracts symbol label / timeframe indicator from the chart image → `{symbol:ETHUSDT, tf:1h, focus:exec}`. **Note: vision extracts METADATA from the image, not price data.** It does not read candle values.
2. **C3**: `scan.get_symbol_verdict(ETHUSDT)` + `scan.get_symbol_structure(ETHUSDT, tf_emphasis=1h)`
3. **Stage B** returns verdict block.
4. **C6**: "ETH 1h 기준 NEUTRAL (confidence 34%). 구조가 `range_unresolved`라 지금 진입은 권장 안 함. 1h SOS 확인 전까지 관망. 만약 진입한다면 엔진 참고: entry 3,240~3,260 / stop 3,180 / target 3,340."
5. If vision cannot reliably extract the symbol, LLM asks: "이미지에서 심볼이 안 보여요. 어떤 페어인지 알려주세요."

### 6.5 FAILURE case — user asks something the engine can't answer

> "이 종목 내일 오를까?"

1. **C1**: `prediction` — **not a supported intent**
2. LLM response: "가격 예측은 드릴 수 없어요. 대신 현재 구조와 수급을 보여드릴게요." → route to `symbol_overview`
3. No fabricated prediction. No fake confidence. No "I think".

### 6.6 FAILURE case — stale data

1. Stage B returns `freshness.stale=true` on mempool data.
2. **C6** must mention: "온체인 쪽은 지금 데이터가 오래됐어요 (5분 전). 나머지는 신선."
3. LLM does **not** hide staleness to sound confident.

---

## 7. Enforcement mechanisms

How we prevent LLM drift in practice:

| Mechanism | What it blocks | How |
|---|---|---|
| **Structured tool responses** | F1, F6 (recomputing math) | LLM cannot emit a number it didn't receive |
| **System prompt forbiddens list** | F1–F10 | explicit rules in router system prompt |
| **Numeric token validation** | F1, F4 (fabricating values) | post-generation regex check: every number token must appear in tool responses or be flagged |
| **Reason ID whitelist** | F3 (inventing events) | reasons must reference `event.*` IDs present in response |
| **Freshness required in citations** | F4 (stale guessing) | if tool response has `freshness`, narrated answer must mention it when tool data is stale |
| **Symbol universe check** | F9 (hallucinated tickers) | tool rejects unknown symbols before LLM can cite them |
| **Confidence-bounded tone** | F10 (overpromising) | LLM language template scaled by `verdict.confidence` buckets |
| **Tool-first policy** | F1 | system prompt says "If a user asks anything market-specific, you MUST call a tool first." |

---

## 8. What this means for implementation order

The engine is the root of the tree. The LLM is a leaf. Build root → leaf.

| Phase | Deliverable | LLM role |
|---|---|---|
| **P0 raw + feature registry** | Stage A steps 1–3 | none |
| **P1 event registry + explainability** | Stage A steps 4 | none |
| **P2 precision Wyckoff structure engine** | Stage A step 5 | none |
| **P3 verdict engine refactor** | Stage A step 6 | none |
| **P3.5 tool contract layer** | Stage B | none — pure API |
| **P4 UI/LLM exposure unification** | Stage C | LLM wired to Stage B; click UI also wired to Stage B; both paths must return identical numbers on golden tests |
| **P5 live watch** | Stage A/B additions for streams | Stage C gets live subscription routing |

**LLM work must not start before P3.5.** There is nothing for it to narrate before the verdict block schema exists. If we try to wire LLM to a half-baked engine, we'll be tempted to let it "fill gaps" with prose — exactly F1.

---

## 9. Anti-patterns to refuse

The following are all real temptations we must refuse:

| Anti-pattern | Why we refuse |
|---|---|
| "Let the LLM pick which layers matter for this user" | breaks reproducibility; use `focus` slot + deterministic reason ranking |
| "Let the LLM rewrite the verdict message for better tone" | drifts numeric citations; use template with slots |
| "Let the LLM compute a quick sanity check" | splits authority between engine and prose |
| "Let the LLM cache the user's prior answers and reuse them" | stale authority; always re-call Stage B on ambiguous references |
| "Let the LLM infer which timeframe the user means when unclear" | ambiguity is for user confirmation, not LLM guessing |
| "Let the LLM chain-of-thought the Wyckoff phase" | structure is STRUCT engine's job, not LLM's; LLM quotes it |
| "Let the LLM decide risk level when confidence is low" | risk is bounded by `verdict.confidence`; LLM cannot override |
| "Let the LLM make up new sector names" | sector taxonomy is registry-owned |

---

## 10. TL;DR — answering the user's question directly

> "LLM이 관여할 거 아닐 거도 잘 분류하고 api로 호출하고 수치계산하고 그리고 llm이 판단하는 거나 제공하는 건가?"

**답:**

1. **LLM이 관여하지 않는 것** (Stage A + B, 전체 엔진):
   - 모든 API 호출 (Binance, Upbit, mempool 등 21개)
   - 모든 수치 계산 (15개 layer function, alpha 합산, ATR 손절, Wyckoff C&E 목표)
   - 모든 임계값 판정 (FR extreme, BB squeeze, MTF alignment, spring/UTAD, CVD absorption)
   - 모든 verdict 분류 (STRONG_BULL / BULL / NEUTRAL / BEAR / STRONG_BEAR 밴드)
   - 모든 entry/stop/target 수치
   - 이건 Alpha Terminal HTML의 로직을 거의 그대로 가져오고, 서버 사이드로 올리고, 하드코딩 threshold를 config registry로 뽑아내는 작업

2. **LLM이 관여하는 것** (Stage C, 엔진 위에 얹는 얇은 층):
   - **라우팅**: "지금 막 튀기 직전 코인" 같은 자연어 문장을 `scan.get_table({focus:breakout})` 같은 typed tool 호출로 번역
   - **파라미터 추출**: symbol, timeframe, focus, top_n, filter를 문장에서 뽑기
   - **멀티모달 파싱**: 차트 이미지 → `{symbol, tf, focus}` 추출 (가격 데이터 추출 아님)
   - **내러티브 조립**: 엔진이 돌려준 verdict block을 한국어 문장으로 풀어내기 (숫자는 그대로 인용, 재계산 금지)
   - **교육 모드**: "와이코프가 뭐야" 같은 일반 지식 설명 + 현재 엔진 값 연결
   - **비교**: 여러 symbol의 verdict block을 받아 나란히 설명
   - **명확화**: 모호하면 되묻기 (LLM이 혼자 추측 금지)

3. **LLM이 절대 하지 않는 것** (§4 표):
   - 수치 재계산, 신규 이벤트 창작, 시간대 환산, 없는 데이터 추측, 주가 예측, 트레이드 실행

4. **왜 이렇게 분리하는가**:
   - Alpha Terminal HTML이 원래 100% deterministic인 것이 강점이다. 재현 가능하고, 디버깅 가능하고, 클릭 UI와 챗 UI가 같은 숫자를 보여줄 수 있다.
   - LLM은 숫자를 만드는 게 아니라, 사용자의 말을 엔진이 알아들을 수 있는 tool call로 번역하고, 엔진이 뱉은 구조화된 결과를 사람이 읽을 수 있는 문장으로 포장하는 것만 한다.
   - 이걸 어기면 클릭으로 본 BTC 점수와 챗으로 물어본 BTC 점수가 달라진다. 그 순간 신뢰는 끝난다.

5. **메서드olog 적용 순서**:
   - P0~P3.5까지는 LLM 없이 엔진/계약만 만든다.
   - P4에서 LLM을 엔진 위에 얹는다. LLM은 Stage B tool들을 호출할 뿐이다.
   - P5에서 live watch 스트림이 추가되면 LLM은 subscription 라우팅도 맡는다.

---

## 11. Open decisions (need confirmation before P0)

1. **Prediction refusal policy**: do we refuse "오를까?" type questions entirely, or gently redirect to structure? (Worksheet assumes redirect.)
2. **Pedagogy scope**: is C7 (explain terms) always allowed, or only when user explicitly asks "뭐야"? (Worksheet assumes on-request only to reduce noise.)
3. **Confidence-to-tone mapping**: exact mapping from `verdict.confidence` buckets to Korean adverbs ("확실히" / "가능성이 있다" / "애매하다")? Needs locked table before P4.
4. **Multimodal baseline**: do we require vision to extract symbol from image label reliably, or always ask the user to confirm? (Worksheet prefers ask-to-confirm for safety.)
5. **Comparison ceiling**: max how many symbols per `compare_symbols` call? (Spec says 2-5.)
6. **Stage B response caching**: TTL per tool contract?
7. **Numeric validation strictness**: reject every LLM number not in tool response, or allow whitelist (dates, percentages derived from engine pct)?
