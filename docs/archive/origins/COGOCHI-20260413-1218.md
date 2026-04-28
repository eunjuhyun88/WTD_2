# COGOCHI — Product Requirements Document

> **Version:** 1.1 (2026-04-11 mid-transition patch)
> **Date:** 2026-04-11
> **Author:** CPO × AI Research Lead
> **Status:** Single source of truth for the Cogochi product
> **Audience:** next Claude session · engineering agents · you in 3 weeks

---

## ⚠️ 2026-04-11 Status Patch — READ THIS FIRST

This document is in **mid-transition** between two designs. When a section contradicts another, the section order below is authoritative:

| Authoritative (current Day-1 design) | Drifted (pre-pivot, preserved for reference) |
|---|---|
| § 7 Surface Model (3 Day-1 surfaces) | § 0, 4, 6 still describe DOUNI + 15-layer + scan feedback |
| § 8 Per-Surface Feature Spec (patched) | § 10 still describes the old `cogochi/*.py` monorepo layout |
| § 9 Character Layer (DEFERRED) | § 12 Journey State Machine still references DOUNI |
| § 11 Data Contracts (WTD klines + 28 features + Challenge) | § 17 Roadmap mentions archetype + adapter |
| § 16 Home landing (still valid layout, copy deltas noted in § 8.6) | § 18 Implementation Sequence lists old PR A-N |
|  | § 19 Open Questions mentions archetype veto |
|  | § 20 Appendix still shows `cogochi/*.py` + DOUNI paths |

**Core pivots (2026-04-11):**

1. **Backend = external repo `/Users/ej/Projects/WTD/`.** The `cogochi-autoresearch/` Python package there (with 29 building blocks, `wizard/`, `challenges/pattern-hunting/`) is the actual engine. The `cogochi/*.py` files in THIS repo are legacy monorepo leftovers.
2. **Character layer DEFERRED.** No DOUNI, no archetype, no Stage. See § 9.
3. **Day-1 = 3 surfaces only:** `/terminal` (observe + compose via search), `/lab` (evaluate + inspect + iterate), `/dashboard` (my stuff inbox) + `/` (landing). See § 7.
4. **Search query IS the wizard.** No 5-step svelte form. User types `btc 4h recent_rally 10% + bollinger_expansion`, parser maps to WTD blocks, one click saves as a challenge. See § 8.1.
5. **Data contracts = WTD klines (7 columns) + features (28 columns) + Challenge directory format.** 15-layer `SignalSnapshot` is dropped. See § 11.

**How to use this document (revised):**
- New to Cogochi? Read the **Status Patch above**, then § 7, § 8 (the 4 active-surface subsections), § 11.
- Touching `/terminal`, `/lab`, `/dashboard`? Read § 8.1 / § 8.2 / § 8.7 respectively. Ignore § 8.3–§ 8.5.
- Need product narrative / thesis? § 0–§ 5 are still useful as intent — just substitute "challenge" for "pattern/feedback/adapter" and ignore the character references.
- Touching the backend? Go to `/Users/ej/Projects/WTD/cogochi-autoresearch/` directly — § 10 is archival.
- Writing the home landing page? § 16 layout is still valid; § 8.6 has the 2026-04-11 copy deltas.
- Everything else in `docs/` is operational/infra. This is the only product canonical.

---

## § 0. Executive Summary

Cogochi는 **리테일 크립토 트레이더를 위한 per-user 파인튜닝 파이프라인**이다. 제품은 다섯 동사로 요약된다.

**Scan. Chat. Judge. Train. Deploy.**

1. 유저가 `/terminal`에서 DOUNI(파란 부엉이 AI 파트너)와 **같이 차트를 본다**
2. 백엔드 Scanner가 15-layer 지표로 24시간 시장을 훑고, 유저가 저장한 패턴이 매칭되면 Terminal/Telegram에 알림 띄운다
3. 유저는 ✓/✗로 피드백하거나 1H 후 자동 판정을 받는다 (Binance close-price)
4. 피드백 ~20개가 쌓이면 `/lab`이 **KTO + LoRA**로 Qwen2.5-1.5B를 **$0.07에** 파인튜닝한다
5. val gate (+2%p)를 통과한 어댑터는 다음 스캔/대화부터 자동 배포된다. 통과 못 하면 자동 롤백.

ChatGPT · AIXBT · TradingView 모두 글로벌 모델을 돌린다. Cogochi는 **유저 한 명당 하나의 LoRA 어댑터**를 굽는다. OPPU (EMNLP 2024)와 Per-Pcs (EMNLP 2024)를 크립토 패턴 인식에 처음 적용하는 시도다.

**검증 가능한 주장(H1):** "유저 피드백 20개 → 1회 LoRA 파인튜닝 → 적중률 +5%p." 검증되면 제품인 동시에 publishable research contribution이다. 검증 실패 시 kill criteria에 따라 전제를 재설계한다 (§14).

---

## § 1. Problem & Insight

리테일 크립토 트레이더 "진(Jin)"은 이미 차트를 볼 줄 안다. RSI도, CVD도, 펀딩비도, 와이코프도 안다. 그의 문제는 다른 것이다.

- **기억이 휘발된다.** 어제 본 "OI 누적 + 가격 횡보 + 거래량 감소" 패턴은 오늘 또 BTC에서 나왔는데, 그는 Telegram 방에서 딴 얘기 하고 있다.
- **시장은 24시간이다.** 잠들 때도, 일할 때도, 코인은 움직인다. 알림은 많지만 대부분 스팸이고, 내가 원하는 패턴은 잡히지 않는다.
- **AI는 나를 모른다.** ChatGPT에 "BTC 어때?"를 쳐봐야 전 인류 평균 답변이 나온다. 내가 3년간 쌓은 트레이딩 스타일은 반영되지 않는다.

**인사이트:** 이 세 문제는 하나의 파이프라인으로 동시에 풀린다. **패턴을 저장하면(기억) 스캐너가 24시간 찾고(시간) 내 피드백으로 내 모델이 파인튜닝된다(개인화).** 이 구조를 진짜로 실행하려면 (a) 실시간 스캐너, (b) 피드백 UI, (c) per-user LoRA 파인튜닝 파이프라인 — 셋 다 있어야 한다. 우리는 셋 다 만든다.

---

## § 2. Thesis

> **Cogochi는 트레이더와 그의 AI가 차트를 같이 보는 작업실이다. 네가 발견한 패턴을 AI가 기억하고, 네가 자는 동안 시장 전체에서 찾고, 네 피드백으로 점점 네 것이 된다.**

한 줄 피치: **"AI that learns you. Literally."**

---

## § 3. Persona — Jin (Phase 1 유일)

- **나이 · 배경:** 28세 · 크립토 선물 2~3년차
- **현재 도구:** TradingView 차트, Binance 선물, Telegram 시그널방, 가끔 ChatGPT
- **기술 수준:** RSI · CVD · 펀딩비 · 와이코프 개념 이해. 4H/1D 보고 손익비 계산함.
- **안 맞는 것:** 교육 모드(RSI가 뭔지 설명), 복잡한 설정, 데스크톱 전용, 학습 곡선 긴 인터페이스
- **원하는 것:** 내가 아는 걸 기억해주는 도구. 내가 잘 때 대신 봐주는 도구. 내 스타일을 배우는 도구.

**Anti-persona (Phase 1 제외):**
- 크립토 초보 ("RSI가 뭐예요?") — Phase 2 교육 모드로
- 알고리즘 트레이더 ("API만 주세요") — Phase 3 Export로
- 고빈도 스캘퍼 (초단위 의사결정) — 타깃 아님

---

## § 4. Value Proposition

| What Jin gets | How we deliver |
|---|---|
| **기억** — 패턴을 저장하면 잊지 않는다 | Terminal에서 📌 패턴 저장 · DB에 per-user patterns |
| **시간** — 자는 동안 시장 전체가 스캔된다 | Scanner 15-layer · APScheduler 15분 · Binance API |
| **개인화** — 내 AI가 점점 나를 닮는다 | per-user LoRA 어댑터 · KTO on ✓/✗ feedback · $0.07/run |
| **공존감** — 혼자 차트 보지 않는다 | DOUNI Terminal chat 패널 · 같이 보는 UX |
| **증거** — 내 패턴 적중률을 안다 | 자동 적중 판정 · 적중률 히스토리 · 적중률 추이 차트 |
| **투명성** — 성능 저하 시 자동 롤백 | val gate +2%p · 기록 공개 · kill criteria published |

---

## § 5. The H1 Research Claim (defensible bet)

```
CLAIM        20 피드백 → 1 LoRA 파인튜닝 → val hit-rate +5%p

BASE MODEL   Qwen2.5-1.5B-Instruct
METHOD       KTO (trl) · LoRA r=16, α=32, dropout=0.05
DATA         유저 피드백 (good/bad), pairing 불필요
EVAL         FIXED_SCENARIOS 200 cases · train 160 / val 40 · 4 regime strata
DEPLOY GATE  val hit-rate Δ ≥ +2%p · else rollback
COST         ~$0.07 per run · Computalot free credits · Together.ai fallback
TIME BUDGET  ≤ 8 min per run (Qwen 1.5B + LoRA r=16 on single A10)
PRIOR ART    OPPU (EMNLP 2024) · Per-Pcs (EMNLP 2024)
                 — per-user LoRA for language tasks
                 — we apply it to live crypto pattern recognition (first published)
```

**왜 KTO 우선?** KTO는 good/bad 단일 샘플로 학습한다. ORPO/DPO는 pair가 필요하다. 유저 피드백은 자연스럽게 single-label이다 ("이 알림 맞음/틀림"). Pair를 만들려면 artificial matching 로직이 필요해서 노이즈가 는다. KTO가 구조적으로 우리 데이터에 맞다.

**Fallback 순서:** KTO → ORPO (pair 만들 수 있을 때) → DPO (더 많은 데이터 쌓이면). `cogochi/autoresearch_service.py`의 `build_orpo_pair()`는 이미 ORPO fallback을 준비해둔 상태.

**Kill 조건:** 2회 재시도 후에도 val hit-rate Δ ≈ 0이면 H1 실패 선언 → 전제 재설계. FIXED_SCENARIOS가 너무 어려웠는지, 피드백이 너무 noisy했는지, 모델 크기가 부족했는지 순서대로 원인 분석.

---

## § 6. Core Learning Loop (Day-1, Terminal-centric)

```
       /terminal  ←────────────┐
       ├─ chart panel          │
       ├─ DOUNI chat panel     │
       ├─ scan results panel   │
       └─ pattern save · ✓/✗   │
              │                │
              ▼                │
       Scanner 15-layer background (APScheduler 15 min)
              │                │
              ▼                │
       Pattern match → in-Terminal alert + Telegram push
              │                │
              ▼                │
       User ✓/✗ (manual) OR 1H auto-judge (Binance close)
              │                │
              ▼                │
       Feedback pool per user  │
              │                │
              ▼                │
       /lab AutoResearch       │
       build_orpo_pair() →     │
       KTO Trainer →           │
       val gate +2%p           │
              │                │
              ▼                │
       per-user adapter swap   │
       (PEFT hot reload)       │
              │                │
              └────────────────┘
                 (next scan + next dialogue run the new adapter)

       /agent/[id] surfaces the adapter history & reflections (async companion)
```

**중요 원칙:** loop는 `/terminal`에서 시작해서 `/terminal`로 돌아온다. 유저는 피드백을 주기 위해 페이지를 바꿀 필요 없다. `/lab`과 `/agent`는 weekly report 확인용 비동기 surface다.

---

## § 7. Surface Model (Day-1 + Phase 2/3)

> **2026-04-11 patch:** product pivot. Day-1 collapses to **3 active surfaces + landing**. Character layer (DOUNI/archetype/stage) is deferred entirely (see § 9). Wizard, scanner cockpit, and agent HQ are folded into /terminal + /lab. The authoritative backend is now the external repo `/Users/ej/Projects/WTD/` (cogochi-autoresearch package + wizard + challenges/pattern-hunting).

### Day-1 active surfaces (3 + landing)

| Route | Role | Priority | 1-line contract |
|---|---|---|---|
| `/terminal` | **Observe + compose** | ★★★ | Chart + block-name search. **Search query IS the pattern composer.** One click saves the current query as a new challenge in WTD. |
| `/lab` | **Evaluate + inspect + iterate** | ★★★ | Challenge list + detail + Run button that streams `python prepare.py evaluate` stdout via SSE + SCORE card + instances table that deep-links back to /terminal. |
| `/dashboard` | **My stuff inbox** | ★★ | 3 sections: *My Challenges* (summary of /lab) · *Watching* (saved live searches from /terminal) · *My Adapters* (Phase 2+ placeholder). |
| `/` | Landing | ★ | Thesis + CTA into /terminal. Marketing only. See § 16 for layout — still valid but copy points to the new 3-surface flow. |

### Day-1 deferred / redirected surfaces

| Route | Previously | Status |
|---|---|---|
| `/create` | 5-step DOUNI onboarding (§ 8.4 old) | **DEFERRED.** No onboarding page in Day-1. New users land directly in /terminal. The WTD CLI `python -m wizard.new_pattern` remains as a power-user entry point. Character-creation flow returns in Phase 2+ if archetypes come back. |
| `/agent/[id]` | Character HQ + archetype + stage (§ 8.3 old) | **REDIRECTED to /lab.** Ownership + history now live in /lab's challenge list + detail pane. Stage/archetype badges are gone. |
| `/cogochi/scanner` | Live scan cockpit + deep-dive (§ 8.5 old) | **FOLDED into /lab.** /lab absorbs the "my challenges" list. The 1600-line legacy view in `src/routes/cogochi/scanner/+page.svelte` stays parked for later revival. |

### Phase 2 (later) surfaces
| Route | Role |
|---|---|
| `/market` | Verified adapter rental (15% take rate) |
| `/copy` | Copy trading (direction-aware, no archetypes yet) |
| `/training` | KTO/LoRA per-user fine-tuning UI on top of WTD challenge instances |

### Phase 3 (later) surfaces
| Route | Role |
|---|---|
| `/battle` | Historical ERA battle (HP / character / Memory Cards) — character layer revival |
| `/passport` | ERC-8004 on-chain track record |
| `/world` | BTC history traversal (v3 fusion concept) |

### Navigation (Day-1)

- **Desktop header:** `[Logo] [가격티커] TERMINAL · LAB · DASHBOARD [Settings] [Connect]` — Terminal first.
- **Mobile bottom nav:** `⌂ · 💬 TERMINAL · ⚗ LAB · @ DASHBOARD` — Terminal highlighted, 4 slots.
- **Deep links:**
  - `/terminal?symbol=BTCUSDT&tf=4h&q=recent_rally+bollinger_expansion` — seed the search input
  - `/terminal?slug=<challenge>&instance=<ts>` — jump to a specific match bar from a /lab instance row
  - `/lab?slug=<challenge>` — open the challenge detail + auto-select on list
  - `/terminal?mode=wallet&chain=<chain>&address=<0x...>` — start wallet investigation inside Terminal
  - `/passport/wallet/[chain]/[address]` — open the durable wallet dossier
- **Wallet intel rule:** wallet analysis is not a new top-nav item. Investigation starts in Terminal and durable evidence lives in Passport wallet dossier.

---

## § 8. Per-Surface Feature Spec

### § 8.1 `/terminal` — Bloomberg-Style Decision Cockpit

> **2026-04-13 rewrite.** PR #13 shipped the Bloomberg 3-column shell. This section now documents the implemented architecture and the full interaction model.

---

#### Mental model — Find → Validate → Act

Every user action in terminal maps to one of three phases:

| Phase | Panel | Role |
|---|---|---|
| **Find** | Main Board (center) | Fast scan — which asset, which setup |
| **Validate** | Detail Intelligence Panel (right) | Why now, entry, risk, catalysts, metrics |
| **Act** | Bottom Dock | Command input, AI stream, execution strip |

The right panel is never empty. When nothing is selected it shows **Market Summary** (global regime, strongest assets, crowded side, top risks). Clicking any card, tag, or chart element updates the right panel in place — the tabs swap, the content loads, the panel width stays fixed.

---

#### Desktop shell

```
┌── TerminalCommandBar (40px) ─────────────────────────────────────────────┐
│  Symbol · TF · Flow Bias badge · Layout switch · CLR                     │
├── Left Rail (280px) ──┬─── Main Board (flex) ──────┬── Right Panel (380px)─┤
│                       │                             │                      │
│  TerminalLeftRail     │  WorkspaceGrid              │  TerminalContextPanel │
│  • Trending movers    │  (Focus / Hero+3 / 2×2)     │  5 tabs              │
│  • Quick chips        │                             │  Summary             │
│  • Market pulse       │  AssetInsightCard ×N        │  Entry               │
│                       │                             │  Risk                │
│                       │                             │  Catalysts           │
│                       │                             │  Metrics             │
├───────────────────────┴─────────────────────────────┴──────────────────── ┤
│  TerminalBottomDock                                                        │
│  Event tape · Command input · AI stream · Execution strip                  │
└────────────────────────────────────────────────────────────────────────────┘
```

Layout tokens: `--terminal-left-w: 280px`, `--terminal-right-w: 380px`, `--terminal-cmd-bar-h: 40px`.

---

#### AssetInsightCard — structure and depths

Every card in the main board follows this fixed section order:

```
CardHeader    symbol · asset type · exchange · TF ladder (15m↑ 1H↓ 4H→) · signal badge
PriceStrip    last price · abs change · pct change · range position · spread
MiniChart     candle/line + VWAP + key level + AI marker overlay
FlowMetricsRow  Vol ×N · OI ±% · Funding % · CVD state
SetupSummary  one-line verdict with bias dot
ActionBar     [View] [Entry] [Risk] [⊕ Pin]
```

Three display depths, selected by context:

| Depth | Used in | Shows |
|---|---|---|
| `mini` | 2×2 compare grid | Header + PriceStrip + MiniChart + 1-line summary |
| `standard` | Companion column in Hero+3 | Full card minus expanded action hints |
| `deep` | Focus / Hero slot | Standard + level strip + catalyst strip + expanded ActionBar |

---

#### Click → Tab mapping (fixed, non-negotiable)

| Click target | Right panel tab opens |
|---|---|
| Card body (anywhere except buttons) | **Summary** |
| `[View]` button | **Summary** |
| `[Entry]` button | **Entry** |
| `[Risk]` button / any risk tag | **Risk** |
| News headline | **Catalysts** |
| OI / Funding / CVD value | **Metrics** |
| Chart level or liquidation cluster | Related tab + section highlighted |

This mapping must never change without a documented decision. Predictability is the feature.

---

#### Right panel — Detail Intelligence Panel

Five tabs. Content is always derived from `analysisData` for the selected symbol. The panel never shows raw API response — it shows *conclusions*.

**Summary tab**
- `BiasCard` — LONG / NEUTRAL / SHORT with confidence dot
- `WhyNowBlock` — 2–3 sentence explanation of why this setup is active *now*
- `MultiTimeframeAlignment` — 15m / 1H / 4H / 1D direction arrows with confluence count
- `NextMoveCard` — one clear action sentence
- `InvalidationCard` — what breaks the thesis

**Entry tab**
- `EntryZoneCard` — best entry range, distance from current price, rationale
- `StopLossCard` — stop level, why it's placed there
- `TakeProfitCard` — TP1 / TP2 with basis
- `RRCard` — risk:reward ratio
- `VenueSuggestionCard` — spot vs perp, exchange, sizing notes
- `ExecutionChecklist` — Do now / Wait for / Do not chase above

**Risk tab**
- `RiskSummaryCard` — aggregate risk level
- `CrowdingCard` — long/short crowding signal
- `LiquidityRiskCard` — thin liquidity zones
- `StructureRiskCard` — near-resistance, weak spot support
- `TrapSignalsCard` — perp-led move without spot, fake breakout signals
- `AvoidActionsCard` — explicit "do not" list

**Catalysts tab**
- `NewsTimeline` — recent headlines sorted by recency
- `EventCalendar` — upcoming events (listings, unlocks, FOMC, CPI)
- `MacroSensitivityCard` — how sensitive this asset is to macro events

**Metrics tab**
- `OITrendPanel` — OI value + change + 7d percentile
- `FundingPanel` — funding rate + trend + extreme flag
- `CVDPanel` — cumulative volume delta trend
- `LiquidationMapPanel` — key liquidation clusters above/below price

**Every tab ends with this 3-line conclusion strip (non-negotiable):**
```
Bias:         Bullish continuation
Action:       Buy pullback into 83,700 support
Invalidation: Exit if 83,220 breaks on volume
```
If there is no data, show `—` for each line. Never omit the strip.

---

#### Default state (no asset selected)

Right panel shows **Market Summary**:
- Current regime (risk_on / risk_off / neutral)
- Strongest assets today
- Most crowded side (longs vs shorts)
- Top market risks

This ensures the panel is always useful, even before the user clicks anything.

---

#### Interaction flows

**Keyword chip flow** (e.g. "Buy Candidates"):
1. Main board: summary header (`12 matches, sorted by best alignment`) + cards
2. Right panel (before click): global top candidate, most crowded, best RR
3. User clicks BTC card → right panel updates to BTC Summary tab
4. User clicks `[Entry]` → right panel switches to Entry tab

**"Where to Buy" flow:**
1. Main board: list with entry zone, distance from price, RR, confidence
2. Right panel auto-opens **Entry tab** on any card click
3. Entry tab always shows: best entry range, why, invalidation, TP1/TP2, venue

**"What's Wrong" / Risk flow:**
1. Main board: warning cards only — tagged `Crowded longs`, `Weak spot`, `Near resistance`
2. Right panel auto-opens **Risk tab**
3. Risk tab: problem definition → evidence → what not to do → what to wait for

**Chart / tag drill-down:**
- Liquidation cluster click → **Metrics tab** at liquidation map section
- Funding hot tag click → **Metrics tab** at funding panel
- News badge click → **Catalysts tab**

---

#### Pin and Compare

- **Pin** (`[⊕]` button): locks the right panel to the current symbol. Other card clicks don't update it.
- **Compare**: click a second card while one is pinned → right panel shows side-by-side comparison of the two symbols on the Summary tab.
- Use case: pin BTC, click ETH → "why BTC over ETH" visible immediately.

---

#### BoardToolbar

Sits above the main board. Always visible. Fixed fields:

```
[Workspace name]  [Query chip]  [Symbol picker]  [Layout: Focus|Hero3|2×2]  [TF: 15m|1H|4H|1D]  [Sort ▾]  [Edit]  [Save View]
```

---

#### Mobile layout

Mode-based, not column-compressed:

| Mode | Trigger |
|---|---|
| **Workspace** | Default on mount — `MobileActiveBoard` full screen |
| **Command** | Tap input — `MobileCommandDock` expands |
| **Detail** | Tap "More" or any detail action — `MobileDetailSheet` slides up (5 tabs, same content as right panel) |

`MobileBottomNav` is hidden on terminal. `MobileCommandDock` uses normal flex flow (not `position: fixed`).

---

#### Implementation files

```
app/src/routes/terminal/+page.svelte           — shell, state, data fetching
app/src/components/terminal/workspace/
  TerminalCommandBar.svelte                    — top bar
  TerminalLeftRail.svelte                      — left 280px rail
  TerminalContextPanel.svelte                  — right 380px panel (5 tabs)
  TerminalBottomDock.svelte                    — bottom dock
  WorkspaceGrid.svelte                         — board layouts
  AssetInsightCard.svelte                      — card (mini/standard/deep)
  VerdictCard.svelte                           — hero/focus deep card
app/src/components/terminal/mobile/
  MobileActiveBoard, MobileCommandDock, MobileDetailSheet
```

Key prop contract: `onViewDetail?: (symbol: string, tab?: string) => void` — card action buttons pass the target tab name so the right panel opens to the correct tab directly.

---

#### Design invariants

1. Right panel width is fixed (380px). Only content changes, never layout.
2. Every click on the main board triggers a right-panel update. Nothing is a dead end.
3. Every right panel tab ends with Bias / Action / Invalidation.
4. Click → tab mapping is fixed and documented above. Do not invent new mappings.
5. Mobile never compresses desktop columns — it uses mode switching instead.

---

---

#### § 8.1-B Time-axis alignment — the board speaks one language

Every widget on the main board must operate on the **same timeframe reference**. Mixing 15m volume with 4H OI with 1D news creates noise, not signal.

**Default 3-frame ladder:**

| Role | Frame | Purpose |
|---|---|---|
| Execution TF | 15m | When to pull the trigger |
| Decision TF | 1H | Which direction is correct |
| Structure TF | 4H | Does the bigger picture support it |

The 1D serves as macro background context only — shown as a small badge, not a primary widget.

**Selected TF = board language.** When user switches to 4H:
- Chart shows 4H candles
- Volume bars are 4H
- OI/Funding change is 4H delta
- AI signals summarize 4H regime
- Level labels use 4H pivot points

Never mix frames in the same widget row without labeling which frame each number belongs to.

**What to emphasize by frame:**

| Frame | Primary focus |
|---|---|
| 1m / 5m | Spread, top-of-book, aggressive flow, microstructure, short-term liquidation |
| 15m / 1H | Intraday trend, volume anomaly, OI expansion, funding acceleration, session hi/lo |
| 4H / 1D | Structure, breakout/breakdown, swing levels, crowding, major liquidation bands |
| 1W | Regime, macro trend, positioning extreme, major S/R |

**TF alignment badge (required on every card and panel header):**
```
15m ↑  |  1H ↑  |  4H →
```
Arrows: ↑ bullish, ↓ bearish, → neutral/unclear. This is the fastest 3-second signal quality check.

**4-card compare mode alignment display:**
```
BTC    15m ↑ | 1H ↑ | 4H →    +2.8%  Vol 1.8x  OI +3.4%  Trend | Crowded
ETH    15m → | 1H ↑ | 4H ↑    +1.6%  Vol 1.2x  OI +1.1%  Breakout watch
SOL    15m ↓ | 1H ↓ | 4H →    -0.8%  Vol 2.1x  OI -0.9%  Weak / funding cool
TOTAL3 15m ↑ | 1H ↑ | 4H ↑   +2.1%  —         OI +2.0%  Best aligned
```
"Best aligned" = all 3 TFs agree direction.

---

#### § 8.1-C Comparison unit alignment

Same row = same unit. Never compare dollars to percentages in the same column.

**Standard display format:** `current value | relative context`

```
Vol   38.2M  | 2.4x avg
OI    +6.2%  | 1H rising
Funding 0.018 | 89 pctl
Spread  4bp   | thin
Range pos 82% | near highs
```

Unit system:

| Metric | Primary | Context |
|---|---|---|
| Price | Absolute | % change |
| Volume | Current (raw) | × avg multiple |
| OI | Absolute | % change |
| Funding | Rate (%) | Percentile (7d) |
| Volatility | ATR or realized vol | Regime label |
| Liquidity | Spread (bps) | Depth quality label |

**Fixed header strip on every asset panel:**
```
BTCUSDT  |  84,220  +2.8%
15m ↑  |  1H ↑  |  4H →
Vol 2.1x  |  OI +4.2%  |  Funding hot  |  Regime: Trend
```
This 3-line header must answer: Is it moving? Which frames? Is it crowded? What regime?

---

#### § 8.1-D Decision-axis layout (order matters)

Information is sequenced by judgment order, not by data category:

```
1. Market state      → regime, trend, compression
2. Movement strength → volume, vol anomaly, momentum
3. Positioning       → OI, funding, L/S ratio, basis
4. Risk level        → crowding, liquidation clusters, resistance overhead
5. Action            → entry zone, stop, TP, venue, invalidation
```

Single-asset panel order maps to this exactly:

```
[ Symbol ][ Timeframe ][ Regime label ]
Price / % change / Range position
Volume / OI / Funding / Spread
Main chart (candle + VWAP + key levels + AI markers)
Volume pane
OI / Funding pane  (toggle: CVD, Basis)
Liquidation map / Key levels
AI Verdict / Invalidation / Next action
```

**Bottom dock AI verdict format (3 required lines, always):**
```
Bias:         Bullish continuation
Why now:      OI rising with positive delta, price above VWAP
Risk:         Crowded longs, funding elevated
Invalidation: 83,480 reclaim failure
Next move:    Buy pullback or wait for breakout retest
```

---

#### § 8.1-E Widget priority table (P0 must ship before P1)

| Priority | Widget | Default frame | Quant role |
|---|---|---|---|
| **P0** | Price Header (symbol, price, %, regime) | 1H + 24H | Ground truth |
| **P0** | Main Chart (candle, VWAP, levels, AI markers) | Selected TF | Structure + timing |
| **P0** | Volume / Delta pane | Selected TF | Real vs noise |
| **P0** | OI / Funding pane | 15m, 1H | Positioning |
| **P0** | Key Levels (VWAP, S/R, daily range) | 4H, 1D | Where price reacts |
| **P0** | AI Verdict strip (Bias / Action / Invalidation) | 15m/1H/4H summary | Conclusion |
| **P1** | CVD / Aggression | 5m, 15m | Who is hitting |
| **P1** | Liquidation Map | 1H, 4H | Where price gets pulled |
| **P1** | Catalyst Feed | Live + 1D | Why it moves |
| **P1** | Relative Strength | 1H, 4H | Leader vs laggard |
| **P1** | TF Alignment Badge (15m/1H/4H arrows) | All 3 | Fast quality signal |
| **P2** | Basis / Spread | 15m, 1H | Market structure |
| **P2** | Market Breadth / Heatmap | 1H, 4H | Macro environment |
| **P2** | Realized Vol / ATR regime | Selected TF | Compression/expansion |

---

#### § 8.1-F 2-tier search system

The command dock serves two types of users simultaneously:

**Tier 1 — Quick keywords (preset queries)**
One tap → immediate result. No knowledge of indicators required. Maps user *intent* to a curated data view.

| Group | Keywords |
|---|---|
| Opportunity | Buy Candidates, Momentum, Breakout Watch, Mean Reversion |
| Risk | What's Wrong, Overcrowded, Funding Risk, Liquidation Risk |
| Execution | Where to Buy, Best Entry, Best RR, Thin Liquidity |
| Market Structure | High OI, Basis Divergence, Spot Leading, Perp Leading |
| Catalyst | News Driven, Unlock Risk, Macro Sensitive |

Each keyword triggers: matching symbol list sorted by relevance + why each triggered + 3–5 key metrics + action suggestion + risk flag.

**Tier 2 — Metric search (indicator-driven)**
User types a metric name, question, or combination. The board reconfigures automatically.

```
oi + funding          → OI pane + Funding panel, sorted by crowding score
liquidation cluster   → Liquidation map opens, sorted by nearest cluster to price
cvd vs price         → CVD pane visible, divergence flag highlighted
where to buy btc     → BTC Entry tab opens in right panel
why not buy sol      → SOL Risk tab opens in right panel
```

**Unified result format** — both tiers return the same output shape:

```
[ Summary ]   What is happening (1 line)
[ Matches ]   Sorted symbol list with mini-metrics
[ Why ]       Key indicator evidence (3–5 data points)
[ Action ]    Where to look, what to do
[ Risk ]      Invalidation / caution
```

**"Where to Buy" result format:**
```
Symbol:     BTC
Best entry: 83,650 – 83,820
Why:        VWAP retest + 1H support confluence
Distance:   -0.6% from current
Invalidation: 83,220 breaks on volume
TP1 / TP2:  84,800 / 86,200
R:R:        1:2.1
Venue:      Binance Perp (preferred) / Coinbase Spot (safer)
```

**"What's Wrong" result format:**
```
Symbol:   SOL
Problem:  Price up, CVD flat, funding elevated
Risk:     Perp-led move without spot confirmation
Tags:     Crowded longs / Weak CVD / Near resistance
Do not:   Chase market buys above current
Wait for: Pullback hold + spot volume confirmation
          or deeper reset toward 155 support
```

**UI layout for search results:**
- Command dock: keyword chips row + search/command input
- Main board: results sorted by relevance (respects current board layout)
- Auto-sort: when keyword activates, board sort updates to match intent (e.g. "High OI" → sort by OI expansion desc)
- Auto-pane: relevant metric pane opens in chart (e.g. "High OI" → OI pane enabled)
- Right panel: auto-opens to matching tab on any card click

---

#### § 8.1-G Market maker / quant / exchange operator perspective

The terminal's fundamental question: *"Where is liquidity, who is driving, what is my risk, and should I act now?"*

**Data priority order — always render in this sequence:**

1. **Price + return** — current, 1m/5m/1H/24H change, range position, session hi/lo
2. **Liquidity + orderbook** — best bid/ask, spread, depth, book imbalance, absorption signals
3. **Volume + trade flow** — realized volume, aggressive buy/sell, delta, CVD, large prints
4. **Positioning** — OI, funding, L/S ratio, basis, perp vs spot divergence
5. **Volatility + regime** — realized vol, ATR, compression/expansion state, trend/range label
6. **Liquidation + key levels** — liquidation clusters, HVN/LVN, daily/weekly open, VWAP, anchored VWAP
7. **Catalysts** — news, events, unlock schedule, economic calendar, exchange actions
8. **Signal / model** — AI verdict, factor score, setup confidence, invalidation level
9. **Risk / execution** — current position, entry/stop/target, sizing, liquidation risk, PnL
10. **Market breadth** — sector heatmap, BTC dominance, stablecoin flow, exchange netflow

These 10 must be visible or one-click accessible. Anything decorative that pushes these off screen is wrong.

**Workspace presets (role-based):**

| Preset | Primary widgets |
|---|---|
| Market Maker | Spread, top-of-book, depth imbalance, inventory, short-term vol, toxic flow, large prints |
| Quant Directional | MTF trend, momentum, vol regime, volume expansion, OI/funding/basis, relative strength, signal score |
| Exchange Operator | OI concentration, liquidation clusters, ADL risk, volume by venue, crowded side, funding stress, suspicious flow |

Presets are saved workspace configurations — same data layer, different widget emphasis and sort order.

**What NOT to show prominently:**
- Long explanation text blocks
- More than 4 decorative gradient cards
- Duplicate KPIs (two widgets showing the same metric in different formats)
- Miniature charts below 80px height that can't be read
- Chat UI taking more than 25% of center width in default mode

The terminal is a **decision tool**, not a reading app. Raw market data leads, explanation supports.

---

#### § 8.1-H Desktop wireframe — exact proportions and zone specs

**Layout: 3 columns + bottom dock. Fixed zones, only content changes.**

```
┌──────────────────────────── Global Header (64-72px) ──────────────────────────────────┐
│  Brand · Global Nav · Wallet · Settings                                                │
├─────────────────────────── Terminal Command Bar (52-60px) ─────────────────────────────┤
│  [Workspace] [Symbol] [15m 1H 4H 1D] [Focus|2x2|Hero+3] [Buy Candidates▾] [Edit][Save]│
├─ Left Rail (280-320px) ─┬────────── Main Board (flex ~56%) ──────┬─ Right Panel (380-420px) ─┤
│                         │                                        │                           │
│  Quick Query chips      │  WorkspaceGrid                         │  Detail Intelligence      │
│  Watchlist              │  (Focus / 2x2 / Hero+3)               │  Panel                    │
│  Top Movers (by TF)     │                                        │  [5 tabs]                 │
│  Anomalies              │  AssetInsightCard ×N                   │                           │
│  Alerts                 │                                        │                           │
│                         │                                        │                           │
├─────────────────────────┴────────────────────────────────────────┴───────────────────────────┤
│  Bottom Dock (76-110px):  [Event tape]  [Command input]  [Execution / log strip]             │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Column proportions (1600px reference):**

| Column | % | px |
|---|---|---|
| Left Rail | 19% | ~300px |
| Main Board | 56% | ~900px |
| Right Panel | 25% | ~400px |

Main board gets the most space because it holds the chart. Left is scan-only so 300px is enough. Right needs ~400px for the 5 tabs without horizontal scroll.

---

**Zone 1 — Global Header (64-72px)**
- Brand, nav, wallet, settings
- Thinnest, most static layer — no live market data here
- All terminal operations happen in the Command Bar below

**Zone 2 — Terminal Command Bar (52-60px)**
```
[ Focus Board ] [ BTC ] [ 15m 1H 4H 1D ] [ Focus 2x2 Hero+3 ] [ Buy Candidates ▾ ] [ Edit ] [ Save View ]
```
- Workspace name = current board context label (editable inline)
- Symbol input = fast swap to any asset
- TF ladder = selected frame updates all widgets
- Layout switch = instantly reconfigures main board
- Query chips = preset intents that trigger board reload + sort

**Zone 3 — Left Rail (280-320px, full height, internal scroll)**

Sections in order:

1. **Quick Query** — keyword chips: `Buy Candidates · What's Wrong · High OI · Breakout · Short Squeeze · Where to Buy`
2. **Watchlist** — pinned symbols. Each row: `symbol · % · signal dot · 1-line state`
3. **Top Movers** — TF-specific, not generic. Labeled groups: "1H movers" / "4H movers" separately
4. **Anomalies** — OI spike, funding extreme, liquidation watch, CVD divergence
5. **Alerts** — user-set price triggers, AI-generated alerts, fill notifications

Left rail purpose: *"what to look at"* — narrow, scannable, no deep content here.

**Zone 4 — Main Board (flex, internal scroll per card)**

Three switchable layouts:

*Layout A — Focus (single asset deep view):*
```
┌─────────────────────── Hero Asset Panel ───────────────────────────┐
│  BTCUSDT  84,220  +2.8%  │  15m ↑ │ 1H ↑ │ 4H →  │  Vol 2.1x    │
│                                                                     │
│  [ Main Chart — candle, VWAP, key levels, AI markers ]             │
│  [ Volume pane ]                                                    │
│  [ OI / Funding pane — toggle: CVD / Basis ]                       │
├──────────────────────────┬──────────────────────────────────────────┤
│  Secondary Insight A     │  Secondary Insight B                    │
│  (key levels / news)     │  (signal summary / relative strength)  │
└──────────────────────────┴──────────────────────────────────────────┘
```
Use when: one asset needs deep attention.

*Layout B — 2×2 Compare (4 assets side-by-side):*
```
┌──────────────────────┬──────────────────────┐
│  BTC  (mini depth)   │  ETH  (mini depth)   │
│  price / TF / chart  │  price / TF / chart  │
├──────────────────────┼──────────────────────┤
│  SOL  (mini depth)   │  TOTAL3 (mini depth) │
│  price / TF / chart  │  price / TF / chart  │
└──────────────────────┴──────────────────────┘
```
Each mini card: symbol · price/% · TF ladder · mini chart · volume/OI/funding · 1-line summary.
Speed over depth. Click any card to open right panel or switch to Focus.

*Layout C — Hero+3 (most practical default):*
```
┌──────────────────── Large Hero Panel (60% height) ────────────────────┐
│  Main asset · deep chart · full pane set                              │
└───────────────────────────────────────────────────────────────────────┘
┌─────────────────┬─────────────────┬─────────────────┐
│  Asset B        │  Asset C        │  Asset D        │
│  (standard)     │  (standard)     │  (standard)     │
└─────────────────┴─────────────────┴─────────────────┘
```
Use when: watching one primary + 3 candidates simultaneously. Most real-world use case.

**Zone 5 — Right Panel (380-420px, fixed width, internal scroll)**

```
┌──────────────── Detail Header ──────────────────────────┐
│  BTCUSDT  ·  from: Buy Candidates  ·  [Pin] [Compare] [×]│
├──────────────── Tab Bar ────────────────────────────────┤
│  Summary  |  Entry  |  Risk  |  Catalysts  |  Metrics   │
├──────────────── Scrollable Content ─────────────────────┤
│                                                         │
│  [Tab-specific components]                              │
│                                                         │
├──────────────── Conclusion Strip (pinned bottom) ───────┤
│  Bias:         Bullish continuation                     │
│  Action:       Buy pullback 83,700                      │
│  Invalidation: Break 83,220 on volume                   │
└─────────────────────────────────────────────────────────┘
```

Rules:
- Width never changes. Content changes only.
- Conclusion strip is always visible at the bottom of every tab.
- Pin locks the current symbol. Compare shows side-by-side diff with the previously pinned symbol.
- Right panel never pushes or reflows the main board.

**Zone 6 — Bottom Dock (76-110px)**

Three horizontal sections:
```
│  [Event tape — alerts / fills / AI notices scrolling left →]             │
│  [Command input: "Ask AI or run command..."]                     [Send]  │
│  [Execution strip: last fill · system status · position summary]         │
```
- **Event tape** = Bloomberg-style live ticker. Alerts, fills, triggered conditions, AI notices.
- **Command input** = natural language + metric search. Keyword chips also available here.
- **Execution strip** = last action, system health, open position summary.

---

**Information density tiers:**

| Tier | What | Where | Always visible |
|---|---|---|---|
| **T1** | Symbol, price, % change, TF alignment badge, signal state | Card header, left rail row | Yes |
| **T2** | Chart, volume, OI/funding, key levels | Card body, main chart panes | When in board |
| **T3** | Explanation, catalysts, risk notes, venue advice | Right panel only | On demand |

T3 content never appears on cards. Cards stay T1+T2 scannable; right panel handles T3 depth.

---

**Default initial state:**

| Zone | Default |
|---|---|
| Left Rail | Buy Candidates / High OI / What's Wrong chips visible; watchlist populated |
| Main Board | Hero+3 — active pair as hero, 3 top movers as companions |
| Right Panel | Market Summary (global regime, strongest assets, crowded side, top risks) |
| Bottom Dock | Event tape running, command input focused |

---

**Standard click flow:**

```
Left: "High OI" chip       → Main board reloads, sorted by OI expansion desc
Card: SOL clicked          → Right panel opens Summary tab for SOL
Tag:  "Funding hot"        → Right panel switches to Metrics tab (funding section highlighted)
Btn:  [Entry]              → Right panel switches to Entry tab
Btn:  [Pin]                → SOL locked; other card clicks show Compare overlay
Btn:  [Compare] on ETH     → Right panel shows BTC vs ETH side-by-side diff
```

This flow is deterministic. Users build muscle memory quickly.

---

### § 8.1-I Adaptive Analysis Workspace

**이름:** Adaptive Analysis Workspace
**철학:** Bloomberg panel system + TradingView chart depth + Claude-style command input
**목적:** 한 종목 깊게 보기 · 여러 종목 비교 · 실시간 감시 · AI 해석 · 패널 편집을 한 화면 체계 안에서 처리

메인보드는 고정 페이지가 아니라 **workspace canvas**다. 사용자는 여기서 종목을 바꾸고, 패널을 추가하고, 1종목 집중과 4종목 동시 비교를 전환한다. terminal의 중심은 채팅이 아니라 **editable board**다.

#### 1. 전체 레이아웃

```
┌──────────────── Command Bar ────────────────────────────────┐
│ [ Workspace ] [ Symbol ] [ TF ] [ Layout ] [ Edit ] [ Save ]│
├──── Left Rail ────┬────── Main Board ──────┬── Right Rail ──┤
│ Watchlist          │ Editable chart grid    │ AI Summary      │
│ Movers             │ 1-up / 2-up / 2×2      │ Signals         │
│ Breadth            │ Focus / Compare /       │ Catalysts       │
│ Alerts             │ Monitor / Custom        │ Risk Checklist  │
├────────────────────┴────────────────────────┴────────────────┤
│ Bottom Dock: logs · fills · commands · alerts               │
└──────────────────────────────────────────────────────────────┘
```

#### 2. Main Board 모드

| 모드 | 레이아웃 | 사용 상황 |
|------|---------|-----------|
| **Focus** | 큰 차트 1개 + 보조 패널 2–3개 | 한 종목 깊게 — thesis 빌드, 진입 타이밍 |
| **Compare** | 2개 또는 4개 패널 동등 폭 | BTC/ETH/SOL/TOTAL3 동시 시그널 확인 |
| **Monitor** | 6–12개 compact tiles | 가격·변화율·신호만 빠르게 ambient 감시 |
| **Custom** | 사용자 저장 배치 | 반복 루틴: "my alts board", "macro morning" |

모드는 `localStorage`에 유지되고 재방문 시 복원된다.

#### 3. 패널 종류

각 슬롯은 패널 타입 하나를 담는다. 사용자는 패널마다 **종목을 독립적으로 지정**할 수 있다.

| 타입 | 내용 | 데이터 |
|------|------|--------|
| **Chart** | 캔들 · 오버레이 · 지표 · 드로잉 | OHLCV + 온체인 |
| **Signal** | 빌딩블록 상태 행렬, 트리거/컨펌 | 엔진 출력 |
| **AI Thesis** | 확신 요약 · 진입/무효 레벨 · 신뢰도 | Claude 분석 |
| **News-Catalyst** | 시장 관련성 랭킹 헤드라인 · 감성 배지 | 뉴스 파이프라인 |
| **Risk-Position** | P&L · 스탑 거리 · 사이즈 · 진입 대비 낙폭 | 포지션 트래커 |
| **Orderflow** | CVD · 델타 · 테이프 · 청산 피드 | WS 스트림 |
| **Macro-Breadth** | BTC 도미넌스 · 공포탐욕 · DXY · 펀딩 히트맵 | 시장 파이프라인 |
| **Log-Tape** | 시그널 발화 · AI 업데이트 · 가격 알림 순서 | 시스템 이벤트 |
| **Watchlist** | mini-spark + 신호 닷 compact 리스트 | 전역 워치리스트 |

#### 4. 종목 패널 기본 구조

**1개든 4개든 동일한 위계 — 눈이 헤매지 않는다.**

```
[ Symbol ]  [ TF ]  [ Signal State badge ]
──────────────────────────────────────────
Price  ·  24h %  ·  Volume  ·  OI delta
──────────────────────────────────────────
[ Main Chart ]
──────────────────────────────────────────
[ Key Indicators: RSI | OI | CVD ]
──────────────────────────────────────────
AI note: "4H structure intact, 1H reset needed"
──────────────────────────────────────────
[ Entry ]  [ Set Alert ]  [ Add to Watch ]
```

#### 5. 차트 요구사항

차트는 "예쁘게"가 아니라 **판단 도구**여야 한다.

**최소 요구:**
- 타임프레임: 1m / 5m / 15m / 1H / 4H / 1D / 1W
- 캔들타입: candlestick · line · area · volume-heavy mode
- 오버레이: EMA(9/21/50/200) · VWAP · Volume Profile · Fibonacci · Trendline
- 보조지표: RSI · MACD · Funding · OI · Long-Short Ratio · CVD
- 드로잉: horizontal line · range box · trend channel · notes/markers
- 이벤트 레이어: entry · exit · AI signal · news timestamp · liquidation zone
- 비교 보기: 종목 A vs B 상대 성과 overlay (% normalized)
- 멀티파인: 독립 보조지표 서브파인

**그려진 것은 심볼×TF 단위로 저장된다.**

#### 6. 4종목 동시 분석

```
┌──────────────────┬──────────────────┐
│  BTC / Standard  │  ETH / Standard  │
│  Chart + Signal  │  Chart + Signal  │
├──────────────────┼──────────────────┤
│  SOL / Standard  │  TOTAL3 / Mini   │
│  Chart + Signal  │  Price + Spark   │
└──────────────────┴──────────────────┘
```

분석 깊이 3단계:

| 레벨 | 표시 항목 | 언제 |
|------|----------|------|
| **Mini** | 가격 · 변화율 · 작은 차트 · 핵심 신호 1줄 | Monitor 6-tile 이상 |
| **Standard** | 가격 · 차트 · 시그널 · 리스크 상태 | 2×2 Compare 기본 |
| **Deep** | 큰 차트 · thesis · catalysts · entries/exits · metrics | Focus 단독 |

2×2에서 패널 클릭 → 해당 종목이 **Focus Mode로 승격**.

#### 7. 편집 UX

**진입:** 메인보드 우상단 `[ Edit Workspace ]` → 편집 모드 (보더 강조, 드래그 핸들 표시)

편집 시 가능 기능:
- 패널 드래그 이동 (12-col grid 스냅)
- 패널 크기 조절 (우하단 핸들)
- 패널 타입 교체 (`[⋯]` → type picker)
- 종목 교체 (패널 헤더 심볼 클릭)
- 패널 추가 (`[+]` 빈 슬롯) / 제거 (`[×]`)

상단 도구모음: `[ Add Panel ]` `[ Layout ]` `[ Compare ]` `[ Save View ]` `[ Reset ]`

**종료:** `[ Done ]` 저장. `[ Cancel ]` 되돌리기.

**내장 프리셋 4종:**
1. `Single Asset Focus` — 차트 1 + AI Thesis + Risk (3-col)
2. `4-Asset Compare` — 2×2 차트 그리드, 공유 TF
3. `News + Chart` — 차트(70%) + News-Catalyst(30%) 나란히
4. `Signal Monitor` — Signal 패널 6개 compact

사용자 저장 커스텀 프리셋은 프로필에 저장.

**보드 상단 Control Bar:**
```
[ Focus Board ] [ BTC ] [ 4H ] [ Indicators ▾ ] [ Compare ] [ 2×2 ] [ Edit ] [ Save ]
```

#### 8. AI 통합 방식

AI는 오른쪽 채팅창에만 있으면 안 된다. **보드에 직접 주석처럼 들어간다.**

- 차트 위: entry zone box · breakdown line · invalidation level 마커 (별도 overlay 레이어, 토글 가능)
- 각 패널 헤더: **Conviction badge** `Bullish` / `Neutral` / `Risk` — AI 재분석 시 업데이트
- AI Thesis 패널: 신뢰도 % + 마지막 업데이트 타임스탬프 포함 전체 근거
- 패널마다: *Why this matters now* · *Next move* · *What invalidates this*
- Bottom Dock: `[ Ask AI ]` → 현재 보드 컨텍스트(심볼·TF·모드·보이는 패널) 자동 주입

AI 재분석 트리거: 종목 변경 · TF 변경 · `[ Refresh Analysis ]` 수동 버튼 · 주요 뉴스 이벤트 (자동, toast 표시)

**Bloomberg 슬롯 시스템 (Focus 모드 기본 배치):**

| 슬롯 | 기본 내용 | 교체 가능 대상 |
|------|---------|--------------|
| A | Primary Chart (선택 TF) | Any chart TF |
| B | Live Orderflow Tape | Log-Tape |
| C | News-Catalyst | Macro-Breadth |
| D | Risk-Position | Watchlist |
| E | Related Assets (Signal, 동일 섹터) | AI Thesis |
| F | AI Thesis | Signal |

종목이 바뀌어도 슬롯 구조는 유지된다.

#### 9. 모바일 설계

모바일은 데스크톱 축소판이 아니다. **single-active-panel** 구조:

```
┌─────────────────────────────────────┐
│ Symbol  Price  Quick Status          │  ← header
├─────────────────────────────────────┤
│                                     │
│         Active Panel                │  ← full height
│                                     │
├─────────────────────────────────────┤
│ Board │ Chart │ Signals │ News │ AI  │  ← segmented tabs
├─────────────────────────────────────┤
│         Command Dock                │  ← fixed bottom
└─────────────────────────────────────┘
```

- **Board** → 2×2 compact cards (Monitor mode)
- **Chart** → Chart 패널 전체 화면
- **Signals** → Signal 패널
- **News** → News-Catalyst 패널
- **AI** → AI Thesis 패널

4종목 비교: 2×2 compact grid 또는 가로 스와이프 (`BTC ← swipe → ETH`)

모바일 편집: 패널 추가/삭제 · 레이아웃 선택만 허용. 정교한 드래그-리사이즈는 desktop/tablet 전용.

#### 10. 스타일 방향

| 요소 | 값 |
|------|-----|
| 배경 | `#000000` |
| 패널 | `#0a0a0a` charcoal |
| 보더 | 얇고 선명 `rgba(255,255,255,0.07)` |
| 숫자·시간·티커 | monospace |
| 제목·설명 | sans-serif |

색 의미 고정 (절대 혼용 금지):
- `green` → positive / long
- `red` → negative / short / risk
- `amber` → warning / caution
- `blue` → info / market data
- `violet` → AI only

중요한 건 색이 많아 보이는 게 아니라 **색마다 기능이 고정**되는 것.

#### 11. 컴포넌트 구조

```
BoardShell
├── BoardToolbar          (Workspace name · Symbol · TF · Layout switch · Edit · Save)
├── WorkspaceGrid         (12-col responsive grid, drag-drop in edit mode)
│   └── PanelFrame        (slot A–F or custom, panel type router, depth: mini/std/deep)
│       ├── ChartPanel    (candles · overlays · indicators · drawing · AI annotation layer)
│       ├── SignalPanel   (빌딩블록 상태 행렬)
│       ├── ThesisPanel   (AI 확신 · entry/invalid markers)
│       ├── NewsPanel     (랭킹 헤드라인 + 감성)
│       ├── RiskPanel     (포지션 트래커)
│       ├── OrderflowPanel (CVD · tape · liquidations)
│       ├── BreadthPanel  (macro indicators)
│       ├── LogTapePanel  (이벤트 로그)
│       └── WatchlistPanel (compact 리스트)
└── PresetManager         (save/load/delete · built-in 4 + user custom)
```

이 구조는 나중에 dashboard · lab · passport까지 패널 시스템을 공유할 수 있도록 설계한다.

#### 12. 구현 우선순위

1. `WorkspaceGrid` — 12-col grid, 슬롯 시스템, 모드별 레이아웃 엔진
2. `ChartPanel` — 캔들 + TF selector + 기본 오버레이 (EMA, VWAP)
3. Focus mode — 단일 종목, 슬롯 A–F 기본 배치
4. 2×2 Compare mode — PanelFrame 배열, 공유 TF 컨트롤
5. Edit mode — 드래그/리사이즈/교체/추가/제거 UX
6. Chart overlays — 지표 서브파인 · 드로잉 도구 · AI annotation layer
7. Save preset / PresetManager
8. 나머지 패널 타입: Signal → Thesis → News → Risk → Orderflow → Breadth → LogTape
9. Mobile segmented tab layout

---

**Recommended terminal build order (full cockpit):**
1. `TerminalShell` — 4-zone grid with correct proportions
2. `TerminalCommandBar` — workspace, symbol, TF, layout, chips
3. `LeftRail` — query chips + watchlist sections
4. `MainBoard` + `AssetInsightCard` (all 3 depths)
5. `DetailPanel` — 5 tabs + conclusion strip
6. `BottomDock` — event tape + command input + execution strip
7. Layout switch (Focus ↔ 2×2 ↔ Hero+3)
8. Pin / Compare
9. Edit workspace / Save view (§ 8.1-I full spec)

---

### § 8.1-J Unified UI System Spec

**목표:** Home · Dashboard · Terminal · Lab · Passport · Wallet 전부를 하나의 제품처럼 보이게 만드는 통합 UX 시스템.
**기준:** Apple의 정돈 + Bloomberg/퀀트의 정보 위계 + Perplexity의 결론-근거-출처 구조.

#### Product Principles

1. **Black-first** — clean black/charcoal surfaces. decorative gradient 금지.
2. **Data-forward** — decoration 전에 판단. 빠르게 스캔 → 판단 → 실행.
3. **Consistent shell** — header · spacing · typography · surface 규칙이 전 페이지에서 동일.
4. **Evidence-native** — 모든 주장은 데이터와 출처에 가시적으로 연결된다.
5. **Responsive by role** — desktop = 병렬 분석, mobile = 집중 active board.

#### Design System

**색 의미 (전 페이지 고정, 혼용 금지):**

| 색 | 의미 |
|----|------|
| near-black `#000` | base background |
| dark charcoal `#0a0a0a` | raised surface |
| slightly lighter charcoal | utility surface |
| green | positive / long |
| red | negative / short / risk |
| amber | warning / caution |
| blue | info / market data |
| violet | AI/model only — 1가지 accent |

**타이포그래피:**

| 분류 | 폰트 | 사용처 |
|------|------|--------|
| UI text | sans-serif | 버튼 · 레이블 · 본문 |
| Data text | monospace | 수치 · 시간 · 티커 · 로그 |

**스케일:** Hero / Page Title / Section Title / Body / Meta / Mono

**레이아웃 토큰:**
- spacing: 8pt scale
- radius: 3종 (none / sm / md)
- border: thin, `rgba(255,255,255,0.07)`
- shadow: subtle only — 장식용 금지

#### Global Navigation

**원칙:** 상단 헤더 = 현재 화면 조작. 하단 메뉴 = 앱 전역 이동. **같은 메뉴 위아래 중복 금지.**

**Mobile Bottom Nav (5항목 고정):**
`Home` · `Terminal` · `Dashboard` · `Passport` · `More`

**More → Bottom Sheet (팝오버 금지):**
Lab · Settings · Language · Help · Notifications

**Header 규칙:**
- left: 뒤로가기 또는 메뉴
- center: 페이지 타이틀 또는 심볼
- right: 검색 · 알림 · 페이지별 액션
- collapsing tiny header 금지
- 컨텍스트 컨트롤용 secondary row 허용

#### Page Type Shell

**Standard Page** (Home · Dashboard · Passport · non-terminal Lab):
```
[ Global Header ]
[ Page Intro / Context Row ]
[ Primary Content ]
[ Bottom Nav ]
```

**Workspace Page** (Terminal):
```
[ Global Header ]
[ Terminal Command Bar ]
[ Workspace Content ]
[ Bottom Command Dock ]
```

일반 페이지: 선택적 FAB 1개 허용. Terminal: 일반 footer/floating menu 금지.

#### Terminal Desktop Layout & Ratios

```
[ Global Header ]
[ Terminal Command Bar ]
[ Left Rail ~19% ][ Main Board ~56% ][ Right Detail Panel ~25% ]
[ Bottom Dock ]
```

**Left Rail — 스캔:**
- Quick Queries: Buy Candidates · What's Wrong · High OI · Breakout · Short Squeeze · Liquidation · Where to Buy
- Watchlist · Top Movers · Anomalies · Alerts

**Terminal Command Bar 컨트롤:**
`[ Workspace ]` `[ Symbol ]` `[ TF Ladder ]` `[ Layout ]` `[ Compare ]` `[ Sort ]` `[ Edit ]` `[ Save View ]`

**Timeframe Ladder (기본):**

| TF | 역할 |
|----|------|
| 15m | Execution |
| 1H | Main Decision |
| 4H | Structure |
| 1D | Background |

TF 선택 시 동시 업데이트: chart · volume summary · OI/funding · signal · AI verdict

#### Asset Insight Card

Main Board 내 종목 패널 공통 구조:

```
CardHeader:  [ Symbol ] [ Venue/Type ] [ TF Alignment ] [ Signal State ]
PriceStrip:  Last Price · Abs Change · % Change · Range Position · Spread
MiniChart / MainChart:  candles/line · overlays · AI markers · levels
FlowMetricsRow:  Volume Anomaly · OI Change · Funding State · Delta/CVD
SetupSummary:  one-line conclusion
ActionBar:  [ View ] [ Entry ] [ Risk ] [ Pin ]
```

**Depth 3단계:**
- `Mini` — 가격 · 변화율 · spark · 신호 1줄
- `Standard` — 가격 · 차트 · 시그널 · 리스크 (2×2 기본)
- `Deep` — 큰 차트 · thesis · catalysts · entries/exits · metrics (Focus 전용)

**Main Board 정보 우선순위 (위에서 아래 순):**
1. Price / Return
2. Liquidity / Spread / Book Quality
3. Volume / Flow / Delta
4. OI / Funding / Positioning
5. Regime / Volatility
6. Key Levels / Liquidation
7. Catalysts
8. AI Verdict / Action / Invalidation

#### Right Detail Panel — 5 Tabs

**탭 → 카드 클릭 매핑 (고정):**

| 클릭 대상 | 열리는 탭 |
|----------|----------|
| 종목 카드 body | Summary |
| `[Entry]` 버튼 | Entry |
| Risk 태그 | Risk |
| 뉴스 | Catalysts |
| OI / Funding / CVD | Metrics |
| 차트 annotation | 관련 탭 + 해당 섹션 포커스 |

**Summary:** VerdictHeader · WhyPanel · MultiTimeframeAlignment · EvidenceGrid · CounterEvidenceBlock · SourceRow

**Entry:** entry zone · stop/invalidation · TP1/TP2 · RR · venue suggestion · execution checklist

**Risk:** crowding · thin liquidity · divergence · trap conditions · avoid actions

**Catalysts:** news timeline · event calendar · listing/delisting · unlocks · macro-sensitive events

**Metrics:** metric selector · OI · funding · CVD · basis · liquidation map · relative strength

모든 탭 하단: Bias / Action / Invalidation 결론 strip (고정)

#### Evidence & Source System

모든 분석 컴포넌트는 이 순서를 강제한다:

```
Verdict → Action → Evidence → Sources → Deep Dive
```

**핵심 컴포넌트:**

| 컴포넌트 | 역할 |
|---------|------|
| `VerdictHeader` | 최종 방향 · 확신도 |
| `ActionStrip` | 지금 할 것 |
| `EvidenceCard` | 단일 근거 아이템 |
| `EvidenceGrid` | 근거 모음 |
| `WhyPanel` | "왜 지금인가" 서술 |
| `CounterEvidenceBlock` | 반대 근거 |
| `SourcePill` | 인라인 출처 배지 |
| `SourceRow` | 패널 하단 출처 목록 |
| `CitationDrawer` | 클릭 시 출처 상세 |
| `FreshnessBadge` | 데이터 시간 |

**Source 카테고리 (색 고정):**
- `Market` — blue (Binance Spot · Hyperliquid OI)
- `Derived` — amber (Funding Agg · CVD · On-chain computed)
- `News` — neutral (CoinDesk · headline)
- `Model` — violet (Internal Model · AI output)

**SourcePill 표시 형식:** `[label]` · `[category]` · `[freshness]`
예: `Binance Spot · Live` / `Hyperliquid OI · 08:58` / `Internal Model · v2`

**CitationDrawer 표시 항목:** source name · type · updated time · raw values · timeframe · aggregation note · origin link (있을 경우)

#### Mobile Terminal Layout

```
[ Compact Header ]
[ Symbol Strip: symbol · price · % · 15m/1H/4H alignment · vol/OI ]
[ Quick Query Chips ]
[ Active Board: chart + 4 core metrics + 1-line action ]
[ Mini Compare Row: horizontal cards or 2×2 compact ]
[ Bottom Command Dock ]
```

**Mobile Active Board:** 큰 차트 · volume · OI · funding · key levels · action 1줄

**Mobile Compare:** compact 가로 카드 스크롤 또는 2×2 grid. 카드 탭 → Active Board로 승격.

**Mobile Detail Sheet:** 데스크톱 Right Panel → bottom sheet 전환. 탭 동일: Summary · Entry · Risk · Catalysts · Metrics.

**Mobile Bottom Dock (Terminal 전용):** Scan · Board · Alerts · AI 또는 command input 우선 — 일반 footer 아님.

#### Standard Mobile Pages

Home · Dashboard · Passport · Lab:
- top header: 컨텍스트
- bottom nav: 앱 이동
- FAB: 진짜 primary action인 경우에만 1개

#### Implementation Order

1. Global tokens — colors · spacing · typography · surfaces
2. Typography + surface components
3. Header + bottom nav + More sheet system
4. Terminal shell (4-zone layout)
5. Terminal command bar
6. Main board workspace (§ 8.1-I)
7. Asset Insight Card (3 depths)
8. Right detail panel (5 tabs + conclusion strip)
9. Evidence / Source / Citation system
10. Mobile active board + detail sheet
11. Dashboard · Passport · Lab alignment

#### Success Criteria

- 어느 페이지를 봐도 같은 제품처럼 보인다
- Terminal: 빠른 스캔 → 깊은 검증 → 명확한 실행
- Mobile: 데스크톱 축소판이 아니라 독립적으로 작동
- 모든 추천/시그널에 가시적 근거와 출처가 붙는다
- query → summary → detail → action 흐름이 끊기지 않는다

---

### § 8.1-K Source-Native Evidence System

**핵심 원칙:** 터미널은 "AI 결론"이 아니라 "결론-근거-출처-검증"이 한 세트로 보이는 **source-native terminal**이어야 한다.

Perplexity가 강한 이유는 정보량이 아니라 이 4층 구조다:

```
먼저 답 (Conclusion)
바로 아래 근거 (Why + Evidence)
그 옆/아래 출처 (Sources — 항상 visible)
필요하면 더 깊게 (Deep Dive on demand)
```

이를 **Answer-First Architecture**라고 부른다. 카드든, 우측패널이든, 모바일 sheet든 예외 없이 이 순서를 강제한다.

#### 불변 규칙

1. 결론만 보여주지 않는다
2. 근거만 길게 늘어놓지 않는다
3. 출처를 숨기지 않는다 — 항상 visible, 스크롤 뒤로 사라지면 안 됨
4. 출처는 항상 클릭 가능해야 한다
5. 모든 분석 결과는 같은 구조를 따른다
6. 모든 정보가 같은 무게면 안 된다 — **Verdict > Action > Evidence > Sources > Deep Metrics** 시각 위계 강제

#### 컴포넌트 상세 스펙

---

##### VerdictHeader

```
[ Bullish / Neutral / Bearish ]  [ 선택 TF 기준 결론 1줄 ]  [ Sources 4 ]
Confidence: 74%  ·  Updated 12s ago
```

| 필드 | 내용 |
|------|------|
| Direction | Bullish / Neutral / Bearish |
| Label | "1H continuation" / "4H breakdown risk" 등 TF 기준 맥락 |
| Confidence | 0–100% — 엔진 출력 or 모델 확신도 |
| Updated | FreshnessBadge — live · N초 전 · delayed · stale |
| **Sources N** | 결론 문장 끝 인라인 배지. 숫자 클릭 → CitationDrawer 오픈. Perplexity citation UX의 터미널 번역. |

---

##### ActionStrip

결론 다음에 바로 따라오는 행동 지침. **설명이 아니라 동사.**

```
[ Buy pullback ]  [ Avoid breakout chase ]  [ Wait for retest ]
Invalidation: 83,220
```

항목당 최대 3개. 무효화 레벨은 항상 표시.

---

##### EvidenceCard

지표 1개 = 카드 1개. 형식 통일.

```
[ Metric Name ]
Current Value   Δ delta
Interpretation (1줄)
Sources: N
```

예:
```
Funding
0.018%   +12bp vs prev window
Crowded longs — elevated risk
Sources: 2
```

클릭 → 우측패널 Metrics 탭, 해당 metric 섹션으로 점프.

---

##### EvidenceGrid

EvidenceCard를 2×2 또는 3×2 그리드로 배치.

기본 항목 (우선순위 순):
`OI` · `Funding` · `Volume` · `CVD` · `Spread` · `Key Levels`

Focus 모드: 3×2 전체. Standard/Mini 카드: 2×2 핵심만.

---

##### WhyPanel

"왜 이 결론인가" 서술 2–4줄. 숫자가 아니라 해석.

```
Price is holding above VWAP while OI expands and delta stays positive.
Funding is elevated but not yet at liquidation-risk levels.
Structure has not broken — this remains a buying opportunity on pullback.
```

---

##### CounterEvidenceBlock

**Perplexity식 신뢰 보강에 필수.** 찬성 근거만 보여주면 신뢰되지 않는다.

```
✓ Bullish evidence          ✗ Against the trade
  above VWAP                  funding elevated
  strong volume               near prior daily high
  positive delta              thin ask-side book above 84k
```

두 칼럼 나란히. CounterEvidence는 회색/amber로 표시 — 빨간색 금지 (결론을 override하는 것처럼 오해 유발).

---

##### Chart as Evidence Canvas

차트는 단순 시각화가 아니라 **증거 캔버스**다. TradingView처럼 예쁘기만 하면 안 되고, Perplexity처럼 "왜"가 붙어야 한다.

차트 위에 직접 렌더링하는 마커:

| 마커 타입 | 표시 방식 | 색 |
|---------|---------|-----|
| Entry zone | 반투명 박스 (low~high) | green 10% fill |
| Invalidation level | 점선 수평 레이 | red |
| Liquidation cluster | 볼륨 스파이크 + 번개 아이콘 | amber |
| News event | 타임스탬프 수직 라인 + 아이콘 | gray |
| AI signal marker | 삼각형 또는 플래그 | violet |
| AI note | 차트 위 말풍선 텍스트 | violet dimmed |

**마커 클릭 동작 (고정):**
- Entry zone 클릭 → 우측패널 **Entry** 탭, 해당 구간 섹션으로 점프
- Invalidation 클릭 → 우측패널 **Risk** 탭
- Liquidation cluster 클릭 → 우측패널 **Metrics** 탭, Liquidation Map 섹션
- News marker 클릭 → 우측패널 **Catalysts** 탭, 해당 기사 포커스
- AI signal 클릭 → 우측패널 **Summary** 탭 + WhyPanel 포커스

AI annotation은 별도 overlay 레이어 (토글 가능). 사용자 드로잉과 분리되어야 한다.

---

##### SourcePill

출처는 이름만 보이면 약하다. 최소 3개 필드.

형식: `[ label ] · [ category ] · [ freshness ]`

예:
```
Binance Spot · Market · Live
Hyperliquid OI · Market · 08:58
Funding Agg · Derived · 1H
CoinDesk · News · 08:41
Internal Model · Model · v2
```

**카테고리 4종 (고정 — 혼용 금지):**

| 카테고리 | 해당 소스 예시 | 색 |
|---------|-------------|-----|
| **Market Data** | Binance Spot, Coinbase, Bybit, Hyperliquid | blue |
| **Derived Metrics** | OI aggregation, Funding calc, CVD, internal factor score | amber |
| **News** | CoinDesk, X, official announcements, 공식 채널 | neutral/gray |
| **AI Inference** | 내부 모델 결론, reasoning summary, confidence output | violet |

모든 소스가 같은 무게가 아니다. Market Data = 1차 검증, AI Inference = 해석 레이어임을 색으로 즉시 전달한다.

---

##### SourceRow

카드 또는 패널 하단의 SourcePill 모음. 항상 visible — 스크롤 뒤로 숨기면 안 됨.

```
[ Binance Spot · Live ]  [ Hyperliquid OI · 08:58 ]  [ Internal Model · v2 ]
```

---

##### CitationDrawer

SourcePill 클릭 시 슬라이드업 또는 사이드 drawer로 열림.

표시 항목:
```
Source:      Hyperliquid OI
Type:        Market / Perp OI
Updated:     08:58:14
Symbol:      BTC
Timeframe:   1H
Raw OI:      12.84B USD
Change:      +4.2%
Method:      venue-normalized aggregation across Hyp + Bybit + Binance Perp
Link:        [Open on Hyperliquid ↗]  (있을 경우)
```

이게 있어야 "AI가 말한 근거"가 아니라 "검증 가능한 데이터"가 된다.

---

##### FreshnessBadge

| 상태 | 표시 | 색 |
|------|------|-----|
| Live | `● Live` | green |
| Recent | `Updated 12s ago` | green-dim |
| Delayed | `Delayed ~30s` | amber |
| Stale | `Stale — last 4m ago` | red |

데이터 소스마다 독립적으로 붙는다. 패널 전체 freshness가 아니라 각 source별.

---

##### MetricPanel

특정 지표를 깊게 보는 Metrics 탭 내 상세 뷰.

구성:
- metric selector (드롭다운 또는 탭)
- 상세 차트 (TF 선택 가능)
- 현재 raw 수치
- delta / z-score / percentile
- calculation note
- CitationDrawer 진입 버튼

---

#### 카드 단위 완성 구조

메인보드 종목 카드는 이 순서로 흐른다:

```
┌─────────────────────────────────────────────────┐
│ VerdictHeader                                   │
│ BTCUSDT · 1H · Bullish continuation  Conf 74%  │
├─────────────────────────────────────────────────┤
│ ActionStrip                                     │
│ [ Buy pullback ]  [ Avoid chase ]               │
│ Invalidation: 83,220                            │
├─────────────────────────────────────────────────┤
│ EvidenceGrid (2×2)                              │
│  OI +4.2%      Funding hot                     │
│  Vol 2.1x      Above VWAP                      │
├─────────────────────────────────────────────────┤
│ WhyPanel                                        │
│ Price holding above VWAP, OI expanding,         │
│ delta positive. Funding elevated but not        │
│ at liquidation risk.                            │
├─────────────────────────────────────────────────┤
│ SourceRow                                       │
│ Binance Spot·Live  Binance Perp·Live  OI·08:58 │
└─────────────────────────────────────────────────┘
```

4개 동시에 띄워도 읽힌다. 구조가 고정돼 있기 때문.

#### 우측 패널 탭별 증거 구조

**Summary 탭:**
```
VerdictHeader
WhyPanel
EvidenceGrid (full 3×2)
CounterEvidenceBlock
SourceRow
```

**Entry 탭:**
```
entry zone (price range box)
stop level + invalidation
TP1 / TP2
Risk:Reward
venue suggestion
execution checklist
entry-related SourceRow
```

**Risk 탭:**
```
crowded side (long/short ratio)
thin liquidity zones (book depth)
divergence signals
counter-signals
avoid actions
risk SourceRow
```

**Catalysts 탭:**
```
news timeline (chronological, ranked by market relevance)
official announcements
SourcePills per headline
event calendar (unlocks, listings, macro)
```

**Metrics 탭:**
```
metric selector
상세 차트 (TF 선택)
raw numbers + z-score + percentile
calculation note
CitationDrawer entry
```

모든 탭 하단: `Bias · Action · Invalidation` 결론 strip 고정.

#### 모바일 압축 구조

모바일도 동일 시스템, 압축만 한다.

**Active Board:**
```
VerdictHeader
ActionStrip
Evidence chips (inline 1줄)
SourceRow (항상 visible)
Chart
```

**Detail Bottom Sheet:**
```
탭: Why · Evidence · Counter · Sources · Metrics
```

SourceRow는 본문에 항상 보인다. raw detail만 sheet로.

#### 구현 순서

1. `SourcePill` — 카테고리 색, freshness, click handler
2. `FreshnessBadge` — Live / Recent / Delayed / Stale 상태
3. `SourceRow` — pill 모음, 항상 visible
4. `EvidenceCard` — metric · value · delta · interpretation · source count
5. `EvidenceGrid` — 2×2 / 3×2 responsive
6. `VerdictHeader` — direction · label · confidence · freshness
7. `ActionStrip` — 동사 지침 · invalidation level
8. `WhyPanel` — 서술 해석
9. `CounterEvidenceBlock` — 찬반 2-col
10. `CitationDrawer` — source detail sheet/drawer
11. Metrics 탭 연결 — EvidenceCard 클릭 → MetricPanel 점프

---

### § 8.1-L Terminal Agent UI — "팀원의 작업실"

현재 Terminal UI는 "검색 결과창"이다. Agent UI는 **팀원의 작업실**이어야 한다.

```
┌─────────────────────────────────────────────────────────────┐
│  [AGENT STATUS BAR]  ● Monitoring 12 assets  ⚡ 2 alerts    │
├──── AGENT FEED ────┬──── AGENT WORKSPACE ────┬── REASONING ─┤
│                    │                          │ CHAIN         │
│ ● Alert:           │  현재 Agent가 분석 중    │               │
│ BTC OI +18% 30s    │  혹은 완료된 카드들      │ Step 1 ✓      │
│                    │                          │ MTF synth     │
│ ● Regime shift:    │  ┌───────────────────┐   │               │
│ risk_on_high       │  │ VERDICT CARD       │   │ Step 2 ✓      │
│                    │  │ BTC/USDT 4H       │   │ Regime: R-On  │
│ ● ETH setup        │  │ ██ BULLISH HIGH   │   │               │
│ forming            │  │                   │   │ Step 3 ✓      │
│                    │  │ Entry:  $96,200   │   │ Liq: $94K     │
│                    │  │ Stop:   $94,800   │   │               │
│                    │  │ T1:     $99,500   │   │ Step 4 →      │
│                    │  │ T2:     $103,000  │   │ News scan     │
│                    │  │                   │   │ in progress   │
│                    │  │ Conf: 73%         │   │               │
│                    │  │ Sources: 8        │   │               │
│                    │  └───────────────────┘   │               │
├────────────────────┴──────────────────────────┴───────────────┤
│  [INTENT DOCK]  "Goal"이지 "Question"이 아님                   │
│  Give the agent a goal…                                       │
│  "Find best long setup now"   "Monitor BTC alert @97k"        │
│  "Compare BTC vs ETH"         "What changed since 1H?"        │
└───────────────────────────────────────────────────────────────┘
```

#### 3개 신규 패널

**Agent Feed (Left Rail 하단):**
- Agent가 자율로 감지한 이벤트 스트림
- 포맷: `● [심볼] [이벤트 유형] [시간]`
- 클릭 → 해당 심볼 Main Board 포커스
- 현재 Left Rail의 Top Movers 영역을 점진적으로 대체

**Reasoning Chain (Right Panel — 분석 중일 때):**
- Agent가 현재 실행 중인 plan steps 실시간 표시
- 완료된 step: `✓` + 1줄 결과 요약
- 진행 중: `→` + 스피너
- 완료 후: Reasoning Chain → 5탭으로 전환 (Summary/Entry/Risk/Catalysts/Metrics)

**Intent Dock (Bottom Dock 교체):**
- 현재 "메시지 입력창" → "Goal 입력창"으로 reframe
- Quick goal chips: `Find best long` · `Monitor alert` · `Compare assets` · `What changed?`
- Goal 입력 시 Agent가 plan 수립 후 Reasoning Chain에 표시

#### Status Bar

```
● Monitoring 12 assets   ⚡ 2 unread alerts   Last scan: 8s ago   [Pause]
```

항상 visible. Terminal 최상단 (Command Bar 바로 아래).

---

### § 8.1-M Terminal P0/P1 Fix Spec — 현재 문제와 해결 설계

> **진단 요약 (CTO 관점):** 엔진은 잘 만들었고, UI 껍데기도 만들었는데, 두 개가 제대로 연결되지 않아서 지금은 **좋은 데이터를 가진 나쁜 표시**를 하고 있다.

#### 현재 데이터 흐름 갭

```
있는 것:                   UI까지 도달하는 것:
92개 engine features  →  6~7개만 표시 (86개 버려짐)
DEPTH_L2_20           →  ❌ UI 없음
AGG_TRADES_LIVE       →  ❌ UI 없음
FORCE_ORDERS          →  ❌ UI 없음
On-chain/MVRV         →  ❌ evidence에 표시 안 됨
```

`buildEvidence()`가 하드코딩으로 일부만 추출. KnownRawId에 20개 데이터소스가 정의되지만 end-to-end로 UI까지 흐르는 건 5개.

#### P0 버그 — 즉시 수정 필요

**P0-1: `buildAssetFromAnalysis()` 가짜 숫자**

```ts
// 현재 (오도하는 추정치):
changePct15m: (snap.rsi14 - 50) / 100,   // ❌ RSI로 15분 변동률 추정
changePct1h:  change24h / 24,             // ❌ 24h를 24로 나눔
changePct4h:  change24h / 6,             // ❌ 24h를 6으로 나눔
tf15m: tfAlign((snap.rsi14 - 50) / 100), // ❌ RSI로 방향 추정
tf4h:  tfAlign(snap.oi_change_1h ?? 0),  // ❌ OI 변화로 방향 추정

// 해결:
// analyze API에서 실제 OHLCV 기반 changePct(15m/1h/4h) 반환
// 없으면 null 표시, 추정치 표시 금지
```

**P0-2: `setActiveTimeframe()` 미호출**

```ts
// 현재: TF 버튼 클릭 → store 업데이트 안 됨 → API 재호출 없음
// 해결:
function handleTfChange(tf: string) {
  setActiveTimeframe(tf);   // ← 추가
  loadAnalysis(activeSymbol, tf);
}
```

**P0-3: worktree / main repo 빌드 분리**

- 개발 서버는 반드시 worktree 경로에서 실행: `npm --prefix /worktrees/mystifying-kapitsa/app run dev`
- 변경사항이 main repo 빌드에 포함되지 않는 문제 — worktree 완료 후 PR merge 전까지는 worktree 서버만 사용

#### P1 수정 — Right Panel 실질 내용

| 탭 | 현재 | 해결 |
|----|------|------|
| Entry | placeholder | entry zone · stop · TP1/TP2 · RR — `analysisData.entry` 필드에서 |
| Risk | placeholder | crowding · thin liquidity · divergence — `analysisData.risks[]`에서 |
| Metrics | 완전 비어 있음 | OI 패널 + Funding 패널 (기존 API 데이터 활용) |
| News | 미확인 | `/api/market/news` 응답을 `CatalystsTab`으로 렌더링 |

#### P1 수정 — Left Rail "Loading movers..."

- `/api/market/trending` 응답 형태 확인 후 `trendingData` → `TopMovers` 컴포넌트 연결
- 폴링은 이미 작동 중 — 렌더링 매핑 누락 가능성 높음

#### 86개 feature → UI 활용 로드맵

```
즉시 활용 가능 (API 이미 반환):
  vol_ratio_3, vol_regime, trend_strength → FlowMetricsRow 확장
  spread_pct, bid_ask_imbalance → PriceStrip 에 spread 표시
  rsi_slope, macd_histogram → chart indicator values

단계적 연결:
  DEPTH_L2_20 → Metrics 탭 OrderBook 패널
  AGG_TRADES  → Log-Tape 패널 (체결 테이프)
  FORCE_ORDERS → Liquidation 마커 (Chart Event Layer)
  On-chain    → Macro-Breadth 패널
```

#### 수정 우선순위 실행 순서

```
1. P0-1: buildAssetFromAnalysis() — 가짜 숫자 제거, null 처리
2. P0-2: setActiveTimeframe() 호출 추가
3. P1: Right Panel Entry/Risk 탭 실제 데이터 연결
4. P1: Left Rail TopMovers 렌더링 매핑 수정
5. P1: Metrics 탭 OI + Funding 패널 추가
6. P2: DEPTH/Tape/Liquidation UI 연결
```

---

### § 8.1A `/terminal` Wallet Intel Mode — Address-Led Investigation

**Why this exists:** 사용자는 Etherscan 스타일의 raw truth만 원하는 게 아니라, **주소가 누구인지 · 지금 무엇을 하고 있는지 · 그게 시장에서 왜 중요한지**를 한 흐름으로 보고 싶다. 이 모드는 Explorer truth, derived on-chain intelligence, market confirmation을 같은 surface로 묶는다.

**Entry triggers:**
1. Terminal input에 `0x...` 또는 ENS 입력
2. Scanner / alert / saved thesis에서 특정 wallet deep link 클릭
3. Passport dossier에서 `OPEN IN TERMINAL` 액션 클릭

**Desktop layout (investigation mode):**

```
┌─ LEFT 22% ────────────┬─ CENTER 53% ─────────────────┬─ RIGHT 25% ───────┐
│ AI Summary / Query     │ Main Investigation Canvas    │ Evidence Rail      │
│ • "이 주소는..."        │ • Tab A: Flow Map            │ • tx list          │
│ • 핵심 주장 3개         │ • Tab B: Token Bubble Graph  │ • labels           │
│ • follow-up prompt     │ • Tab C: Cluster View        │ • counterparties   │
│ • filters              │ • selected node detail strip │ • saved alerts     │
│                        │                              │                    │
│ ── Behavior Cards ───  │ ── Market Confirmation ──── │ ── Action Plan ──  │
│ • accumulation score   │ • token price chart          │ • watch/follow     │
│ • distribution score   │ • wallet event markers       │ • fade/ignore      │
│ • cex deposit risk     │ • CVD / OI / funding / vΔ    │ • risk notes       │
│ • holding horizon      │                              │ • scenario notes   │
└────────────────────────┴──────────────────────────────┴────────────────────┘
```

**Core tabs:**
1. **Flow Map** — source → split wallets → holding layer → final hub 를 시간순/금액순으로 보여준다.
2. **Token Bubble Graph** — 입력 주소와 엮인 토큰/컨트랙트/상대지갑 관계를 force graph로 탐색한다. 버블은 `token`, `wallet`, `contract`, `cex`, `bridge`, `cluster` 타입을 가진다.
3. **Cluster View** — 단일 주소가 아닌 동일 주체로 추정되는 지갑 묶음을 보여준다. "주소 하나"가 아니라 "세력 하나"를 이해하는 탭이다.

**V1 features (must-have):**
1. **Identity card** — chain, address, label confidence, first seen, last active, known tags
2. **Executive summary** — "이 주소는 무엇인가"를 한 문장으로 답하고, confidence + 근거 3개를 보여준다
3. **Flow map** — 분산/집결/브리지/CEX 입금 패턴을 레이어형 그래프로 시각화
4. **Token bubble graph** — 주소와 많이 엮인 토큰/컨트랙트/상대지갑을 bubble/graph로 탐색
5. **Market confirmation chart** — 선택 토큰 차트 위에 wallet 이벤트 마커를 겹치고 하단 pane에 `CVD`, `volume delta`, `OI`, `funding` 중 2~3개 표시
6. **Evidence rail** — tx hash, timestamp, counterparty, notional, action type을 raw evidence로 유지
7. **Action outputs** — `watch`, `follow`, `fade`, `ignore` 네 가지 행동 제안을 출력. 모든 주소에 TP/SL을 강제하지 않는다
8. **Save thesis / set alert** — "이 클러스터가 다시 CEX로 300k 이상 입금하면" 같은 패턴형 alert 저장

**Interpretation rules (non-negotiable):**
- **Explorer truth**와 **derived inference**를 시각적으로 분리한다. raw tx list는 근거이고, "distribution hub" 같은 문장은 해석이다.
- **CVD는 주소의 truth가 아니라 market confirmation**이다. 주소 행동을 시장 구조와 교차검증하는 layer로만 쓴다.
- 첫 화면은 tx list가 아니라 `Who → What → Why it matters → What to do` 순서여야 한다.
- 버블 그래프는 보조 탐색기다. 기본 탭은 항상 **Flow Map**으로 시작한다.

**V1 scope:**
- EVM chains only
- single address input
- automatic chain detect + manual override
- 1~2 hop cluster inference
- top token 기준 market overlay
- executive summary + flow map + token bubble + evidence rail

**Explicit non-goals (V1):**
- 3D graph / globe view
- non-EVM multi-chain normalization
- every wallet gets a trading plan with exact TP/SL
- "smart money score"를 모든 주소에 무조건 부여

---

### § 8.2 `/lab` — Challenge Workbench (list + detail + runner)

**Role:** the only place where challenges live. Replaces the old backtest builder UI, the character HQ, and the scanner cockpit — all at once.

**Layout (desktop, 2-pane):**

```
┌─ LAB ─────────────────────────────────────────────────────┐
│ ┌─ My Challenges ────┐  ┌─ Selected ─────────────────────┐│
│ │                     │  │                                 ││
│ │ ⭐ sample-rally      │  │ sample-rally-pattern            ││
│ │    0.0234  2h       │  │ long · binance_30 · 1h          ││
│ │ ⦿ cvd-div-funding   │  │ "10% rally over 3 days, BB ..." ││
│ │    -1.0    8h       │  │                                 ││
│ │ ⦿ bb-squeeze-long   │  │ ── Blocks ──                    ││
│ │    never run        │  │ trigger: recent_rally           ││
│ │                     │  │   pct=0.1  lookback_bars=72     ││
│ │ [+ new from         │  │ confirm: bollinger_expansion    ││
│ │    /terminal]       │  │ entry:   long_lower_wick        ││
│ │                     │  │ disq:    extreme_volatility     ││
│ │                     │  │                                 ││
│ │                     │  │ [ ▶ RUN EVALUATE ]              ││
│ │                     │  │                                 ││
│ │                     │  │ ── Live output ──               ││
│ │                     │  │ [prepare] warming...            ││
│ │                     │  │ ok BTCUSDT                      ││
│ │                     │  │ ---                             ││
│ │                     │  │ SCORE: 0.0234                   ││
│ │                     │  │ N_INSTANCES: 47                 ││
│ │                     │  │ POSITIVE_RATE: 0.68             ││
│ │                     │  │                                 ││
│ │                     │  │ ── Instances (47) ──            ││
│ │                     │  │ BTC  3/22 14:00  +4.2%  ✓      ││
│ │                     │  │ click → /terminal jump          ││
│ └─────────────────────┘  └─────────────────────────────────┘│
└───────────────────────────────────────────────────────────┘
```

**Day-1 features:**
1. **Left — My Challenges list** — filesystem scan of `WTD/challenges/pattern-hunting/*/`. Each row: slug + latest SCORE + last run time. Sort: recent run desc. Starred rows pinned top.
2. **Right — Selected challenge detail:**
   - Header: slug · direction · universe · timeframe · one-line description (from `answers.yaml::identity.description`)
   - Blocks section: parse `answers.yaml::blocks` → 4 cards (trigger / confirmations[] / entry / disqualifiers[])
   - Read-only view of `match.py` (copy button → open in editor)
3. **Run Evaluate button** — `POST /api/challenges/[slug]/run`. Server spawns `python prepare.py evaluate` in the challenge dir and pipes stdout/stderr via SSE to the client. Final `---` summary is parsed into the SCORE card.
4. **Instances table** — after run, read `<slug>/output/instances.jsonl` and render rows: `symbol · timestamp · upside · downside · outcome`. Click → `/terminal?slug=<slug>&instance=<ts>` to jump to the bar.
5. **[+ new from /terminal]** — deep link to `/terminal` (composer lives there).

**Day-1 backend bridges:**
- **Filesystem bridge:** `src/lib/server/challengesApi.ts` — `listChallenges()`, `getChallenge(slug)`, `readInstances(slug)`. Pure filesystem reads rooted at `process.env.WTD_ROOT`.
- **Subprocess bridge:** `src/lib/server/runnerApi.ts` — `streamEvaluate(slug): ReadableStream`. Spawns `uv run --project $WTD_ROOT/cogochi-autoresearch python prepare.py evaluate` with cwd = challenge dir.
- Both bridges are server-side only (`src/lib/server/**`).

**Day-1 NOT in /lab:**
- Backtest strategy builder UI (v3 tabs: strategy / result / order / trades) — old code parked at `src/routes/lab/+page.svelte` stays buildable but is unreachable without redirect
- Per-user LoRA adapter runner (Phase 2+, goes to /training)
- Weekly natural-language report (Phase 2+)
- Feedback pool counter + Manual Fine-tune button (Phase 2+, requires KTO pipeline)
- Character stage bar, archetype badge (permanently out)

**Critical UX rule:** /lab is where challenges LIVE. If you want to create a new one you go to /terminal. If you want to run or inspect one, you stay in /lab.

---

### § 8.3 `/agent/[id]` — **REDIRECTED to /lab (Day-1)**

This route is deprecated for Day-1. Ownership + history now live in `/lab`'s challenge list (left pane) + detail (right pane). The character layer that motivated this page (DOUNI identity, Stage progress, Archetype badge, Reflection log) is entirely out of Day-1 scope (see § 9).

**Day-1 behaviour:**
- Any existing `/agent` or `/agent/[id]` deep link should 302 → `/lab?slug=<id>` (treat the id as a challenge slug rather than an agent id).
- The 1187-line `src/routes/agent/[id]/+page.svelte` stays parked but is never linked.
- Saved patterns list, adapter version history, and reflection log are all absorbed by `/lab` as challenge rows / instance rows. No per-user agent object exists in Day-1.

**Returns in Phase 3** when the character layer (Stage / Archetype / Memory Card grid) comes back for `/battle` and `/passport`. Until then, treat "agent" = "challenge".

---

### § 8.4 `/create` — **DEFERRED (Day-1)**

No onboarding page in Day-1. The former 5-step DOUNI flow (name → archetype → first dialogue → first pattern → scanner check) depended on the character layer and on Supabase-side per-user agents — neither of which exists in Day-1.

**Day-1 behaviour:**
- New users land directly in `/terminal` with an empty state hint ("type a pattern like `btc 4h recent_rally 10% + bollinger_expansion` to start").
- The WTD CLI `python -m wizard.new_pattern` remains as the power-user entry point for authoring challenges outside the UI. It's fully functional and supported.
- The existing `src/routes/create/+page.svelte` (246 lines, 3-step wallet bridge) is left in place but unlinked; `/create` still resolves if visited directly.

**Returns in Phase 2+** if archetype/character flow comes back, OR as a lightweight "connect wallet + seed example patterns" bridge even without character.

---

### § 8.5 `/cogochi/scanner` (and `/scanner`) — **FOLDED into /lab (Day-1)**

Both scanner routes are deprecated for Day-1. The "my saved patterns" use case is served by `/lab`'s left-pane challenge list (each row = a saved challenge with its latest SCORE and enable/disable toggle). The live scan cockpit use case (deep dive, filter bar, scan table) is out of scope — real-time observation happens in `/terminal`, historical evaluation happens via `/lab`'s Run button.

**Day-1 behaviour:**
- `/scanner` stays as a 301 → `/terminal` redirect (already in `src/routes/scanner/+page.ts`).
- `/cogochi/scanner` (the 1634-line legacy cockpit at `src/routes/cogochi/scanner/+page.svelte`) is parked: buildable but unlinked from the Day-1 nav. Not deleted — may revive in Phase 2.
- `/lab` absorbs the three features that actually mattered from the old scanner:
  1. List of saved patterns (now "challenges") with their SCOREs
  2. On/off toggle (stored as a starred flag in the /lab list — not reevaluated)
  3. Deep link back into `/terminal` for the detail view

**Returns in Phase 2** only if a live-scanner cockpit is explicitly requested; most of its functionality is redundant with /terminal + /lab.

---

### § 8.6 `/` — Home Landing (detailed layout in § 16, copy deltas below)

Existing `src/routes/+page.svelte` (1186 lines) stays structurally intact — hero + learning loop + surfaces + footer. The layout rules in § 16 are still valid.

**2026-04-11 copy deltas (Day-1 pivot):**
- Hero CTA primary: `START A CHALLENGE` → `/terminal` (not `/onboard`)
- Hero CTA secondary: `SEE HOW IT SCORES` → `/lab`
- Remove any copy referencing DOUNI / adapter / Stage / Archetype / onboarding
- Proof panel timeline stages: `COMPOSE` · `EVALUATE` · `INSPECT` · `ITERATE` (not `PATTERN/SCAN HIT/VERDICT/DEPLOY`)
- Surfaces section: `Terminal (compose) · Lab (evaluate) · Dashboard (my stuff)`. Drop `Agent`.
- Footer: fix `return-actions` links to point at `/dashboard` and `/lab` only

**Body scroll fix (separate from pivot):**
- Remove `:global(body) { height: 100%; overflow: hidden auto; }` at the top of the `<style>` block. Home must scroll at window level.
- Normalize responsive breakpoints to `1200px` / `768px` / `480px` (was `1180/960/720/540`).

See § 16 for the fuller approved layout (mostly still valid, just re-label the timeline and CTAs per above).

---

### § 8.7 `/dashboard` — My Stuff Inbox (3 sections)

Lightweight return page — 3 stacked sections, one column, no fancy layout. Reads from WTD filesystem + browser local state. No character greeting, no DOUNI name, no morning hype copy.

```
┌─ Dashboard — my stuff ──────────────────────────┐
│                                                  │
│ 1. MY CHALLENGES                                 │
│    sample-rally-pattern    SCORE 0.0234  2h ago │
│    cvd-div-funding-hot     SCORE -1.0    8h ago │
│    bb-squeeze-long         never run             │
│    [+ new from /terminal]                       │
│                                                  │
│ 2. WATCHING                                      │
│    BTC 4H  recent_rally + bb_expansion  ✓ live  │
│    ETH 1H  cvd_bearish + funding_hot    ✓ live  │
│    SOL 4H  volume_spike                 paused  │
│    [+ add from /terminal]                       │
│                                                  │
│ 3. MY ADAPTERS (Phase 2+ placeholder)           │
│    No adapters yet. Adapter training (KTO/LoRA) │
│    comes in Phase 2 via /training.              │
│                                                  │
│ [ OPEN /terminal ]  [ OPEN /lab ]               │
└──────────────────────────────────────────────────┘
```

**Day-1 features:**
1. **MY CHALLENGES** — summary of `/lab` list. Top 5 by latest run time. Clicking a row → `/lab?slug=<slug>`. `[+ new]` → `/terminal`.
2. **WATCHING** — saved live searches from `/terminal`. Day-1 storage: `localStorage["cogochi.watches"]` (array of `{slug, query, createdAt, lastEvaluatedAt}`). Day-2+ promotes to `WTD/watches/*.json` filesystem for cross-device sync.
3. **MY ADAPTERS** — placeholder. Empty state copy explaining Phase 2+ scope. No data source yet.

**Data sources:**
- Challenges: `GET /api/challenges` (filesystem read, same as /lab)
- Watches: client-side `localStorage` (Day-1)
- Adapters: empty array (Phase 2+)

**Day-1 NOT:**
- DOUNI greeting or any character copy
- Missed alerts stream (requires live scanner backend — out of scope)
- Weekly Δ / Feedback pool counter (requires per-user KTO pipeline — Phase 2+)
- Morning recap auto-generation

---

### § 8.8 `/passport/wallet/[chain]/[address]` — Wallet Dossier

**Role:** Terminal이 조사하는 surface라면, Passport wallet dossier는 **저장 가능한 정적 기록 / 공유 가능한 증거 페이지**다.

> **Terminal investigates. Passport remembers.**

**Canonical contract:**
- Terminal은 빠른 탐색과 차트/CVD 연동을 소유한다
- Passport dossier는 저장된 thesis, evidence snapshot, cluster history, alert history를 소유한다
- 동일 주소에 대한 canonical URL은 `/passport/wallet/[chain]/[address]`

**Dossier layout:**

```
┌──────────────────────────────────────────────┐
│ Wallet Dossier Header                        │
│ address · chain · labels · confidence        │
│ [Open in Terminal] [Save Thesis] [Share]     │
├──────────────────────────────────────────────┤
│ 1. Executive Summary                         │
│ 2. Saved Theses / prior analyst notes        │
│ 3. Cluster history timeline                  │
│ 4. Evidence snapshots (tx / counterparties)  │
│ 5. Alert history + outcomes                  │
│ 6. Related tokens / related wallets          │
└──────────────────────────────────────────────┘
```

**Must-have features:**
1. **Stable identity header** — chain/address/labels/known aliases
2. **Saved theses** — "distribution hub", "smart-money accumulation" 같은 과거 판단과 작성 시점
3. **Cluster history** — 집결/분산/브리지/CEX 입금 같은 주요 상태 변화의 시계열
4. **Evidence snapshots** — investigation 시점의 raw evidence를 immutable snapshot으로 저장
5. **Alert outcomes** — 저장한 wallet alert가 실제로 몇 번 발생했고 결과가 어땠는지
6. **Open in Terminal CTA** — dossier에서 즉시 interactive investigation mode로 복귀

**Non-goals:**
- Passport dossier가 live market chart를 소유하지 않는다
- dossier는 chat-first가 아니다. conversation은 Terminal이 소유한다

---

## § 9. DOUNI × Archetype — **DEFERRED (not in Day-1)**

> **2026-04-11 patch:** the entire character layer (DOUNI name, avatar, growth Stage, Archetype personality filter) is removed from Day-1 scope. Day-1 is a clinical pattern-composer + challenge workbench without character framing. The rationale: users judged the character layer as noise on top of what they actually wanted — compose a pattern, evaluate it, iterate. The character design below is preserved for reference and will return in Phase 2+/3 if marketplace or battle surfaces revive.

### Archived design (for Phase 2+/3 revival)

The original design had two orthogonal axes:

**Stage (growth):** `EGG → CHICK → FLEDGLING → DOUNI → ELDER`, unlocked by feedback count + LoRA pass count + marketplace eligibility. Purpose was to gate advanced features (lab method selection, LoRA rank control, market listing).

**Archetype (personality / runtime filter):** `Oracle | Crusher | Guardian | Rider`. Runtime rule was a scan-alert filter (e.g. Guardian blocks LONG alerts during funding overheat). Mapped to `cogochi/battle_engine.py::guardian_veto()` for the Phase 3 battle system.

### What replaces it in Day-1

| Role character layer was filling | Day-1 replacement |
|---|---|
| Per-user identity / ownership | Per-user filesystem namespace under `WTD/challenges/pattern-hunting/<slug>/`. No character object. |
| Stage-gated feature unlock | No gates. All Day-1 features available from the start. |
| Archetype alert filter | User writes filters directly via `disqualifiers` blocks in their challenge composition (e.g. `extreme_volatility`, `volume_below_average`, `extended_from_ma`). |
| `/agent/[id]` character HQ | Folded into `/lab` challenge list + detail. |
| `/create` step 2 archetype pick | Removed — there is no `/create` in Day-1. |

**Returns when:** marketplace (`/market`) or battle (`/battle`) surfaces are revived. Until then, treat every reference to "DOUNI", "archetype", or "Stage" elsewhere in this doc as archival.

---

## § 10. AutoResearch Pipeline (Python layer)

위치: `cogochi/` 모노레포 내부.

### 현재 repo에 있는 파일

```
cogochi/
├── __init__.py
├── autoresearch_service.py   ← ORPO pair builder + hill climb
├── battle_engine.py          ← BattleContext state machine (Phase 3 scaffold)
├── context_builder.py        ← LLM context assembler
└── skill_registry.py         ← DOUNI personality / skill routing
```

### User-provided local files (outside git)

```
prepare.py            ← dataset prep from Supabase feedback
finetune.py           ← KTO trainer (trl) entry
autoresearch_loop.py  ← hill climb search loop
battle_collector.py   ← Phase 3 battle data collector
```

### Key existing functions (reuse, don't duplicate)

- `build_orpo_pair(battle_result, assembled_context)` → cases A/B/C/D in `autoresearch_service.py`. Takes generic "decision_result" shape; Day-1 scanner feedback can feed this directly (no rename needed).
- `BattleContext` dataclass in `battle_engine.py` → has all fields for both Scanner feedback and Phase 3 Battle: `scenario_id`, `snapshot`, `candles`, `memories`, `outcome`, `trainer_action`, `reflection`, `pnl`
- `guardian_veto(ctx)` → archetype filter primitive. Day-1 uses it for Scanner alert filtering.

### Missing (to be built in next PRs, NOT the home landing PR)

1. **Scanner 15-layer implementation** — `cogochi/scanner/layers/*.py` (l1 wyckoff, l2 funding, ..., l15 atr)
2. **APScheduler job** — `cogochi/scanner/scheduler.py`
3. **Telegram bot** — `cogochi/alerts/telegram_bot.py`
4. **KTO trainer script** (user-provided) — `finetune.py`
5. **FIXED_SCENARIOS dataset** — `cogochi/eval/fixed_scenarios.json` (200 cases)
6. **val gate + adapter swap** — `cogochi/deploy/adapter_swap.py`

### Build order (Step 0-5)

```
Step 0: Infrastructure           — Supabase schema · env setup
Step 1: Data Collection          — patterns.json · scanner stub · Telegram alerts · FIXED_SCENARIOS
Step 2: Data Formatting          — KTO JSONL · ORPO JSONL builders
Step 3: Training Search Loop     — hill climb · LoRA config · KTO training
Step 4: Evaluation               — FIXED_SCENARIOS val · stratified hit-rate
Step 5: Deploy                   — adapter swap · version manager · rollback
```

---

## § 10A. Cogochi Agent Architecture — Chatbot → Agent 전환

> **현재 상태:** `/api/cogochi/analyze`는 PERCEIVE + ACT만 한다. THINK · PLAN · OBSERVE · REFLECT가 없다. 이게 chatbot과 agent의 차이다.

### 핵심 패러다임 전환

```
현재 (Chatbot):          목표 (Agent):
User asks               Agent perceives
    ↓                       ↓
Claude responds         Agent plans
    ↓                       ↓
Done                    Agent acts (multi-tool)
                            ↓
                        Agent observes outcome
                            ↓
                        Agent reflects → loops
```

**Chatbot**: Reactive · stateless · single-shot
**Agent**: Proactive · stateful · multi-step · goal-directed

---

### 1. Agent Core Loop — ReAct + Perception

```
PERCEIVE ──→ THINK ──→ PLAN ──→ ACT ──→ OBSERVE ──→ REFLECT
    ↑                                                   │
    └───────────────────────────────────────────────────┘

Trigger: Market event | User goal | Time-based | Alert
```

---

### 2. 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                  ORCHESTRATOR AGENT                       │
│  Goal decomposition → Sub-agent delegation → Synthesis    │
└──────────────────────┬───────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ MARKET      │  │  RISK       │  │ MACRO       │
│ AGENT       │  │  AGENT      │  │ AGENT       │
│             │  │             │  │             │
│ feature     │  │ correlation │  │ on-chain    │
│ calc (92)   │  │ liquidation │  │ dominance   │
│ MTF synth   │  │ drawdown    │  │ regime      │
│ pattern     │  │ sizing      │  │ sentiment   │
│ detect      │  │ stop calc   │  │ news        │
└─────────────┘  └─────────────┘  └─────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│            MONITOR AGENT (autonomous)                │
│  every 30s: watchlist scan → anomaly detect → alert  │
└─────────────────────────────────────────────────────┘
```

---

### 3. Tool Library — Atomic Tools (현재 1개 → 10개)

```python
# 현재 (monolithic):
analyze(symbol, tf) → {snapshot, ensemble, verdict}

# Agent 도구 체계:
tools = [
    scan_market(criteria, limit),         # "OI 급증 + RSI 60~70인 심볼"
    compute_features(symbol, tf),          # raw 92개 feature
    fetch_orderbook(symbol),               # L2 depth, imbalance
    fetch_liquidations(symbol, window),    # 청산 히트맵
    fetch_news(symbol, limit),             # 뉴스 + 감성
    check_correlation(sym_a, sym_b, tf),  # 상관관계 분석
    check_regime(macro_window),            # 거시 레짐
    compare_assets(symbols[]),             # 멀티 에셋
    synthesize_verdict(evidences[]),       # 증거 → 판단
    set_alert(symbol, condition, fn),      # 모니터링 등록
]
```

Agent는 이 도구들을 **계획하고 순서대로 실행하며 중간 결과를 보고 다음 단계를 결정**한다.

---

### 4. Planning Layer

```
User Goal: "BTC 지금 들어가도 돼?"

현재 (single-shot):
→ analyze(BTCUSDT, 4h) → verdict

Agent (multi-step plan):
Step 1: compute_features(BTC, [15m, 1h, 4h, 1d])   # MTF 컨텍스트
Step 2: check_regime()                               # 거시 환경
Step 3: fetch_liquidations(BTC, 4h)                 # 청산 레벨
Step 4: fetch_orderbook(BTC)                        # 즉각적 유동성
Step 5: check_correlation(BTC, ETH, 4h)             # 알트 동조화
Step 6: fetch_news(BTC, 10)                         # 카탈리스트
Step 7: synthesize_verdict([1..6의 결과])            # 종합 판단
→ entry: $X±Y, stop: $Z, target: $A/$B, confidence: H/M/L
```

Planning layer는 Claude `tool_use` + 중간 결과 보고 기반으로 구현.

---

### 5. Memory System

| 레이어 | 저장소 | 내용 |
|--------|--------|------|
| **Working Memory** | in-context | 현재 세션 심볼 · 레짐 · 사용자 질문 이력 |
| **Episodic** | Supabase | 과거 verdict + 실제 가격 결과 → accuracy tracking |
| **Semantic** | vector store | 사용자 risk tolerance · 선호 TF · 선호 setup 타입 |
| **Procedural** | learned rules | "OI spike + RSI 80+ → 먼저 liquidation 체크" |

Episodic memory 예시:
- `2026-04-05 BTC bullish 판단 → +3.2%` ✓
- `2026-04-03 ETH short 판단 → -1.1%` ✗
→ Agent 자체 accuracy tracking · 자기 교정 루프

---

### 6. Proactive Monitor Agent

```
현재: User asks → Agent responds
Agent: Agent perceives → Agent proactively notifies

every 30s:
  for symbol in watchlist:
    features = compute_features(symbol)
    if anomaly_detected(features):
      alert = generate_alert(symbol, features)
      push_to_terminal(alert)   ← 사용자가 묻기 전에

Anomaly types:
  OI 5분 안에 +15% 이상
  Funding rate 극단치 (>0.05% or <-0.03%)
  Volume spike (3x 평균 대비)
  Liquidation cascade 시작
  레짐 전환 감지
  사용자 설정 price alert
```

---

### 7. 구현 로드맵

| Phase | 기간 | 내용 |
|-------|------|------|
| **Phase 1** | 1–2주 | monolithic `analyze()` → 10개 atomic tool 분리. Planning layer (tool_use). Reasoning chain UI. |
| **Phase 2** | 2–3주 | Supabase episodic memory. Monitor agent 백그라운드 루프. Alert push (SSE). |
| **Phase 3** | 3–4주 | Orchestrator + Specialist sub-agents. Market/Risk/Macro 병렬. |
| **Phase 4** | 장기 | Verdict vs actual price tracking. Procedural memory 업데이트. 자기 교정. |

**Phase 1이 가장 임팩트 크고 현재 엔진과 바로 연결 가능.**

> 지금은 92개 feature를 가진 **고급 계산기**다. Agent는 그 계산기를 **스스로 사용법을 결정하는 시스템**이다.

---

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

## § 12. Journey State Machine

```
no-agent     → /create
  ↓ DOUNI created
no-pattern   → /terminal (guided: "save your first pattern")
  ↓ first pattern saved
scanning     → /terminal + /scanner (waiting for alerts)
  ↓ first feedback ✓/✗
active       → /terminal full experience
```

**Gated pages:**

| State | /terminal | /scanner | /lab | /market |
|---|---|---|---|---|
| no-agent | 🔒 | 🔒 | 🔒 | 🔒 |
| no-pattern | ✅ guided | 🔒 "save pattern first" | 🔒 "no data yet" | 🔒 |
| scanning | ✅ | ✅ | 🔒 "no feedbacks yet" | 🔒 |
| active | ✅ | ✅ | ✅ | 🔒 Phase 2 |

---

## § 13. Pricing & Plan Gates

| Plan | Price | Patterns | Symbols | Sessions/day | AutoResearch | Telegram | Notes |
|---|---|---|---|---|---|---|---|
| **FREE** | $0 | 3 | 5 | 3 | 1/month | ❌ | Alpha access via waitlist |
| **PRO** | $19/mo | ∞ | all | ∞ | weekly auto + manual | ✅ | GPU credits $2/run for extra |
| **Phase 2 Take Rate** | — | — | — | — | — | — | 15% on Market listings |

**Upgrade touchpoints:**
1. 패턴 3개 소진 → "Pro면 무제한"
2. 오늘 세션 3회 소진 → "내일 기다릴래, Pro 할래?"
3. 이번 달 AutoResearch 완료 → "피드백 30개 쌓였는데, 다음 달에..."

---

## § 14. Kill Criteria (published publicly on home page)

| Name | Threshold | Action |
|---|---|---|
| **H1 FAIL** | val Δ ≈ 0 after 2 retries | Pause fine-tune · redesign patterns or FIXED_SCENARIOS |
| **FEEDBACK DRY** | < 20 feedbacks in 2 weeks | Rethink scanner precision / pattern definitions / Telegram UX |
| **DEPLOY GATE** | new val < baseline + 2%p | Auto rollback to previous adapter |
| **REGRESSION** | any val hit-rate drop > 3%p after deploy | Immediate adapter revert · log incident |

**Product-level kill:**

- Scanner alert click-through rate < 30% at M3 → redesign scanner
- First-pattern-save completion < 30% at M3 → redesign onboarding
- WAA < 140 at M3 → rethink target persona or core loop

---

## § 15. Metrics (NSM + Inputs)

**NSM (North Star):** Weekly Completed Analysis Sessions

- Definition: (Terminal analysis completed → verdict submitted → result confirmed) + (Scanner alert received → chart viewed → ✓/✗ submitted)
- M3 target: 500 sessions/week
- Kill: < 140/week

**Input metrics (M3 targets):**

| # | Metric | Target |
|---|---|---|
| I1 | WAA (Weekly Active Analysts) | 200 |
| I2 | Sessions per WAA | 2.5 |
| I3 | Scanner alert feedback rate | ≥ 30% |
| I4 | D7 retention | ≥ 30% |
| I5 | Avg pattern hit-rate delta (before vs after AutoResearch) | ≥ +5%p |

---

## § 16. Home Landing Page (implementation spec)

### 2026-04-12 refinement

Home now follows this combined direction:

- **clean hierarchy first**: one thesis, one proof story, one visible next action
- **immediate start second**: the user should feel they can begin work from Home, not just read about the product

The practical result:

- no builder/copier split
- no onboarding-first framing
- no card explosion above the fold
- one strong hero + one start bar + one proof panel

### Current contract

Home is **not** a route explainer and not a game lobby.  
Its job is to make the product thesis legible in one screen:

1. **This AI learns your judgment**
2. **It proves itself before asking for trust**
3. **There is a clear first move for a new user and a quiet return path for an existing one**

The approved visual direction is:

- mostly black field
- embossed, low-contrast Cogochi background mark
- one premium proof panel, not multiple floating cards
- no 3D logo
- no floating orbit cards
- no global market dock on the home route
- minimal above-the-fold copy
- action surface visible immediately
- stronger spacing and hierarchy than the current dense mixed layout

### Sections (current approved implementation)

**1. Hero — thesis first**

- Eyebrow: `COGOCHI`
- H1: the strongest single statement on home
  - Cogochi is the AI that learns how this user judges the market
- Sub copy:
  - save a pattern
  - let the scanner watch while the user is away
  - judge hits
  - deploy a better adapter
- Primary interaction: a **start bar**
  - prompt: `What setup do you want to track?`
  - submit routes into `/terminal`
  - helper example chips can prefill likely intents
- Primary CTA:
  - `Open Terminal`
  - `/terminal`
- Secondary CTA:
  - `See How Lab Scores It`
  - `/lab`
- Tertiary return action:
  - `Return to Dashboard`
  - quiet text-link treatment only
- Hero visual:
  - one device-like proof panel
  - panel shows the learning loop as evidence, not decoration
  - examples:
    - pattern captured
    - scanner hit
    - verdict logged
    - adapter improved / rolled back
- Background:
  - black-toned WebGL / ASCII field
  - large but quiet Cogochi logo watermark
  - motion stays low and ambient, never dominant
- Supporting data rail:
  - short proof claims
  - per-user adapter
  - proof-before-trust
  - rollback if worse
- Above-the-fold priority:
  - thesis
  - start bar
  - proof panel
  - supporting proof rail
  - nothing else should compete with those 4 elements

**2. Learning Loop**

- First scroll section appears quickly after hero; avoid a large dead gap
- 4-step sequence:
  - `01 Capture`
  - `02 Scan`
  - `03 Judge`
  - `04 Deploy`
- Purpose:
  - explain the product mechanism, not just the route map
  - show how judgment turns into infrastructure
  - make the H1 claim feel operational instead of abstract

**3. Surfaces**

- 3-card grid with crisp role language:
  - `Terminal` — where the user sees and judges signals
  - `Lab` — where the model improves and gets evaluated
  - `Dashboard` — where saved work and recent runs wait
- This section is for orientation only; it must not overpower the hero

**4. Final CTA**

- a quiet closing section at the bottom of the landing page
- repeats the 3-surface loop in compressed form
- offers:
  - `Open Terminal`
  - `Open Lab`
  - `Return to Dashboard`

### Layout rules

- Desktop hero: left thesis + start bar, right proof panel
- Tablet/mobile hero: stack vertically, copy first, then start bar, then proof panel
- The first content section must start within one natural scroll from hero
- Home must feel quieter than `/terminal`
- Accent color can appear as a restrained signal line, not as a page wash
- The logo watermark should read like an embossed background mark, not a foreground object
- Typography should do most of the work; cards support the message rather than carrying it alone
- If something competes with the H1 for attention, remove or weaken it
- the start bar should feel like a working surface, not like decorative chrome
- one decisive desktop screen should explain the product and offer a first move without forcing a long read

### Content rules

- Home speaks in product truth, then mechanism, then route
- Avoid long research explanations, jargon blocks, or feature inventories
- Avoid route-first copy before the thesis is understood
- Avoid builder/copier framing in Day-1
- Existing-user return paths should exist, but stay visually secondary
- Copy should feel assured, compressed, and premium. No hype phrasing and no dashboard-ish labels as hero copy

### Interaction rules

- The start bar must work with or without typed input
- Empty submit routes to `/terminal`
- Filled submit routes to `/terminal` carrying the prompt into the initial compose state
- Helper chips should be examples, not tabs or navigation detours
- Home should make starting feel immediate while keeping the visual tone restrained

### Future extension note

- If pricing / claim / waitlist sections return later, they should be reintroduced under the same black mono system and must not override the thesis + proof + first move structure

### Shader tuning (exact numbers)

`src/lib/webgl/ascii-trail-shaders.ts` COMPOSITE_FRAG ambient block:

```glsl
// before
float ambientAlpha = clamp(
  0.024 + ambientFocus*0.072 + ambientSweep*0.02 + ambientRibbon*0.018,
  0.0, 0.11);
vec3 col = ambientPal * ambientAlpha;

// after — ~4–5× reduction, keep background mostly black
float ambientAlpha = clamp(
  0.004 + ambientFocus*0.016 + ambientSweep*0.004 + ambientRibbon*0.003,
  0.0, 0.024);
vec3 col = ambientPal * ambientAlpha * 0.7;
```

`src/components/home/WebGLAsciiBackground.svelte` CSS filter:

```css
/* before */ filter: saturate(1.45) brightness(1.14) contrast(1.08);
/* after  */ filter: saturate(1.15) brightness(1.02) contrast(1.10);
```

Expected result: mouse-still state ≥ 95% black; mouse-move state shows ASCII trail in rose/sage/gold/ember with clear contrast.

---

## § 17. Phase 2/3 Roadmap (summary)

### Phase 2 (M3~M6)

- `/market` — verified adapters listed, 15% take rate, no subscription
- `/copy` — copy trade based on archetype + adapter + live positions
- `/lab` dual-mode unlock (Backtest + AutoResearch)
- Doctrine weight slider UI in `/agent/[id]`
- Education mode in Terminal (Persona: Mina)

### Phase 3 (M6+)

- `/battle` — HP + ERA reveal + Memory Cards + character animation
- `cogochi/battle_engine.py` + `build_orpo_pair()` already wired; UX is the gap
- `/passport` — ERC-8004 on-chain track record
- `/world` — BTC history traversal
- API / Model Export (Persona: Dex)

---

## § 18. Implementation Sequence (Week 1-4 after canonical lands)

**Week 1:** docs/COGOCHI.md merged · next PR starts

- PR A: Home landing implementation (MacWindow, 6 sections, shader tune) — 2 days
- PR B: `/terminal` refactor (3-panel → Day-1 shape) — 3 days
- PR C: `/scanner` settings page stub (pattern list + on/off) — 0.5 day
- PR D: `/lab` AutoResearch runner UI (pool counter + history + report) — 2 days

**Week 2:** Python pipeline gaps

- PR E: `cogochi/scanner/` 15-layer (reuse existing factor engine where possible) — 5 days
- PR F: `cogochi/alerts/telegram_bot.py` — 2 days
- PR G: `cogochi/eval/fixed_scenarios.json` (200 cases, stratified) — 3 days

**Week 3:** KTO pipeline

- PR H: `finetune.py` + `prepare.py` (KTO + LoRA runner) — 3 days
- PR I: val gate + adapter swap + version manager — 2 days
- PR J: Weekly report generation (natural language) — 2 days

**Week 4:** Alpha launch prep

- PR K: `/create` 5-step onboarding — 2 days
- PR L: Journey state gates + tooltips — 1 day
- PR M: Closed alpha waitlist email flow + 20-seat gate — 1 day
- PR N: Kill criteria monitoring dashboard (internal) — 1 day

**Alpha launch:** End of Week 4. 20 seats. Goal: H1 testable by end of Week 6 (assuming 1-2 feedbacks/day/user).

---

## § 19. Open Questions (tracked)

1. **KTO vs ORPO in existing Python code.** `cogochi/autoresearch_service.py` has ORPO. § 5 says "KTO first". Refactor timeline?
2. **Memory Card generation from Scanner.** v3 generates cards from Battle only. Should Scanner feedback also mint cards? (Likely yes — same adapter, same data.)
3. **Archetype veto for non-GUARDIAN.** Only `guardian_veto()` exists. Do we add `oracle_boost()`, `crusher_aggression()`, `rider_filter()`?
4. **Dashboard scope.** `/dashboard` is "optional Day-1". Ship it or skip?
5. **Repo split.** Keep `cogochi/*.py` in monorepo forever, or split to `cogochi-autoresearch/` at M3?
6. **Publishing the H1 claim.** When do we write the methodology paper? Alpha end? M3?
7. **Jin-only persona stance.** If we get signups from non-Jin users during alpha, do we expand or hold?

---

## § 20. Appendix — Repo Layout & Boundaries

```
crazy-beaver/                          (this worktree)
├── CLAUDE.md                          Read First = docs/COGOCHI.md
├── ARCHITECTURE.md                    20-line root redirect → docs/COGOCHI.md § 20
├── README.md                          project README
├── AGENTS.md                          agent discipline
│
├── docs/
│   ├── COGOCHI.md                     ← single product canonical (this doc)
│   ├── README.md                      10-line pointer to COGOCHI.md
│   ├── DESIGN.md, FRONTEND.md, ...    operational / infra (untouched)
│   ├── AGENT_*.md                     agent discipline (untouched)
│   ├── design-docs/
│   │   ├── index.md                   rewritten: points to COGOCHI.md
│   │   └── core-beliefs.md            stable agent principles
│   └── (no product-specs/, no page-specs/ — all moved out)
│
├── src/                               SvelteKit frontend
│   ├── routes/
│   │   ├── +page.svelte               Home landing (next PR)
│   │   ├── terminal/+page.svelte      Primary surface (next PR refactor)
│   │   ├── lab/+page.svelte           AutoResearch runner (next PR)
│   │   ├── agent/[id]/+page.svelte    Ownership + history
│   │   ├── create/+page.svelte        DOUNI onboarding
│   │   ├── scanner/+page.svelte       Settings only (next PR)
│   │   ├── dashboard/+page.svelte     Optional
│   │   └── api/
│   │       ├── waitlist/              alpha signup
│   │       ├── autoresearch/          (next PR) bridge to Python
│   │       └── scanner/               (next PR) pattern CRUD
│   ├── components/home/
│   │   ├── MacWindow.svelte           (next PR)
│   │   ├── TerminalMiniPreview.svelte (next PR)
│   │   └── WebGLAsciiBackground.svelte (exists)
│   └── lib/webgl/ascii-trail-shaders.ts (shader tune in next PR)
│
├── cogochi/                           Python AutoResearch service
│   ├── __init__.py
│   ├── autoresearch_service.py        build_orpo_pair() — reused for Scanner feedback
│   ├── battle_engine.py               Phase 3 scaffolding
│   ├── context_builder.py             LLM context assembler
│   ├── skill_registry.py              DOUNI personality
│   ├── scanner/                       (to build) 15-layer + APScheduler
│   ├── alerts/                        (to build) Telegram bot
│   ├── eval/                          (to build) FIXED_SCENARIOS
│   └── deploy/                        (to build) adapter swap
│
└── (user-local, outside git)
    ~/Downloads/기타_문서/
    ├── Cogochi_MasterDesign_v5_FINAL.md
    ├── Cogochi_v5_FlowPatch.md
    ├── COGOCHI_DESIGN_PATCH_v4.1.md
    ├── COGOCHI_BUILD_PLAN.md
    ├── CLAUDE_1.md                    AutoResearch spec
    ├── PIPELINE.md                    Step 0-5 build plan
    ├── cogochi_user_acquisition.html
    └── cogochi-v3-archive-2026-04-11/ ← v3 docs moved here this PR
        ├── README.md
        ├── design-docs/
        ├── product-specs/
        ├── page-specs/
        ├── SYSTEM_INTENT.md
        ├── PRODUCT_SENSE.md
        └── ARCHITECTURE.md
```

### Boundary rules

1. **Frontend boundary:** `src/routes/**/*.svelte` (except `src/routes/api/**`), `src/components/**`, `src/lib/stores/**`, `src/lib/api/**`, `src/lib/services/**`
2. **SvelteKit server boundary:** `src/routes/api/**/+server.ts`, `src/lib/server/**`
3. **Python AutoResearch boundary:** `cogochi/**/*.py`. Never import from `src/`. Communicates with SvelteKit via HTTP API (`src/routes/api/autoresearch/`) or filesystem (Supabase, `~/.cache/cogochi_autoresearch/`).
4. **No Python in frontend, no TypeScript in Python.** Clean separation.
5. **Never commit `.agent-context/`, `~/.cache/cogochi_autoresearch/`, or local v3 archive folders.**

---

*End of `docs/COGOCHI.md` v1.0. If this document becomes stale, the fix is to edit it in place — do not create parallel v2/v3 files. The whole point of this doc is to BE the single source of truth.*
