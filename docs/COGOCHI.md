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

### § 8.1 `/terminal` — Observe + Compose (search query is the wizard)

**Core idea:** the existing bottom search input in `terminal/+page.svelte` becomes the pattern composer. User types a natural-language / semi-structured query; a client-side parser maps tokens → WTD block chain; the chart highlights matched bars; one button saves the current query as a new challenge in WTD.

**Shell model:** Terminal is a working surface for `find -> read -> judge -> save`, not a permanent wall of small panels. Desktop defaults to **Scanner Rail + Multimodal Workspace**. The center is a **single result-first multimodal canvas**: search, streamed output, and any needed chart render all belong there. The **Inspector** opens only from an explicit deeper-detail action from that center flow. No DOUNI chat panel, no character avatar, no archetype/stage, no 15-layer overlay.

**Day-1 features (must-have):**
1. **Block-name search** — bottom input `<input class="query-input">` already exists (line ~1030). New client parser `src/lib/terminal/blockSearchParser.ts` converts input string → `ParsedQuery { symbol?, timeframe?, direction?, blocks: ParsedBlock[], confidence }`.
2. **Preview overlay** — when parsed successfully, the active chart surface keeps a client-side preview card and highlights the evaluated bars locally. Single-symbol mode renders that preview inside the board itself; compare queries render an inline multi-chart compare block whose local cards each retain the parsed-query preview and project lightweight highlights on their own charts, while `TV` mode stays summary-only.
3. **Save-as-challenge button** — reuse the existing `showPatternModal` (line ~1049). Modal now asks for `name` only (slug); direction / universe / timeframe / outcome are inferred from the parsed query + defaults. On Save:
   - `POST /api/wizard` with body `{slug, description, blocks, direction, timeframe}`
   - Server writes `WTD/challenges/pattern-hunting/<slug>/{answers.yaml, match.py, prepare.py, program.md}` via subprocess `python -m wizard.new_pattern --answers <tmp>` (composer.py is SSOT).
   - Toast: `Saved ${slug}` with action `Open in Lab` → `/lab?slug=<slug>`.
4. **Deep link consumption** — `?symbol=...&tf=...&q=...` seeds the search input on mount. `?slug=...&instance=...` jumps to a specific instance row's bar.
5. **Live market view** — existing chart + data-feed behavior preserved. No new 15-layer overlay.
6. **Compare block mutation** — explicit compare queries such as `compare BTC ETH SOL 4h recent_rally` render an inline compare board inside `/terminal`; follow-up natural-language mutations update that same board in place rather than opening a separate detail surface.

**Interaction rules:**
- scanner single click previews the symbol in the Multimodal Workspace and keeps Inspector closed
- scanner double click or send query runs the AI stream and appends summary/results in the Multimodal Workspace
- single-symbol analysis renders as a mutable asset board, not a fixed one-off chart: users can flip the active symbol between dense `Board`, compact `Strip`, and `TV` views inside the same workspace
- parsed-query previews belong inside that asset board, not only in the bottom input hint: `Board` mode can float the preview over the chart and highlight the evaluated bars, `Strip` keeps the same preview in the side context area plus compact chart highlights, and `TV` keeps the summary in the context rail
- compare intents such as `compare BTC ETH SOL 4h` or `BTC vs ETH 1h` render as an inline multi-chart compare block in the Multimodal Workspace, not a separate page or Inspector-first flow
- compare blocks behave like dense quant boards, not static cards: the same result can flip between `Grid`, `Focus`, `Single`, and `TV` layouts so users can inspect many charts or one dominant chart without leaving `/terminal`
- once a compare block is selected, follow-up commands such as `SOL도 추가해`, `BTC랑 ETH만 남겨`, or `1h로 바꿔` mutate that same block instead of creating a fresh detail surface
- research/detail blocks stay inline in the Multimodal Workspace; the Inspector opens only from an explicit `More detail` action
- closing Inspector returns desktop to the 2-panel shell
- mobile is mode-based: `Scanner`, `Workspace`, `Insight`; it must not squeeze desktop columns into a narrow viewport

**Day-1 parser (keyword-first):**
- Single dictionary mapping EN + KO phrases → WTD block names + default params. See `~/.claude/projects/.../memory/patterns.md` for the NL→block table.
- Number extraction: `10%` → `0.10`, `5x` → `5.0`, `3 days` / `3일` → `72` bars (1h) or `18` bars (4h).
- Confidence `high` if at least 1 trigger was found; `low` otherwise. Day-1 only uses keyword parser; LLM fallback is Phase 2.

**Day-1 explicitly NOT in /terminal:**
- DOUNI chat panel / character personality / archetype / stage
- 15-layer indicator overlay (use WTD's 28 feature columns instead — see § 11)
- Wallet connect forced signin
- Any v3 Bloomberg artifacts (WarRoom, Intel panel, HP bar, memory cards, ERA reveal)

**Reused existing code:**
- `src/routes/terminal/+page.svelte` — keep layout, wire new handlers into the existing `inputText` + `handleSend` + `showPatternModal` state.
- `src/lib/terminal/*` — new parser module only.
- No Python changes in this repo; the backend is WTD (separate repo).

**Critical UX rule:** The user types, sees matching bars on their chart, hits save, and moves on. No forms, no 7-step wizard, no character dialogue.

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
