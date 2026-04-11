# COGOCHI — Product Requirements Document

> **Version:** 1.0
> **Date:** 2026-04-11
> **Author:** CPO × AI Research Lead
> **Status:** Single source of truth for the Cogochi product
> **Audience:** next Claude session · engineering agents · you in 3 weeks
>
> **How to use this document:**
> - If you came here to understand what Cogochi is, read § 0 through § 5.
> - If you're implementing the home landing page, read § 16.
> - If you're touching the Python AutoResearch pipeline, read § 10.
> - If you're adding a new feature, check § 7 surface role + § 14 kill criteria first.
> - Everything else in `docs/` is operational/infra. This is the only product canonical.

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

### Day-1 active surfaces

| Route | Role | Priority | 1-line contract |
|---|---|---|---|
| `/terminal` | **Primary daily driver** | ★★★ | DOUNI와 같이 차트 보고 스캔 결과 받고 피드백 주는 작업실 |
| `/lab` | AutoResearch runner | ★★ | 주간 파인튜닝 돌리고 val 결과 보는 실험실. Weekly report here. |
| `/agent/[id]` | Ownership + history | ★ | 내 adapter 버전들 · 저장한 패턴들 · 적중률 히스토리 · archetype |
| `/create` | DOUNI onboarding | ★ | 5 step · 이름 · 아키타입 · 첫 패턴 · 첫 스캔 확인 |
| `/` | Landing page | ★ | 비로그인/첫방문용. H1 pitch · 4-step loop · 알파 가입. §16 detailed |
| `/scanner` | **Settings only** | · | 저장된 패턴 on/off · 알림 히스토리. 주 UI 아님, Terminal이 scan 경험을 소유 |
| `/dashboard` | Optional | · | DOUNI 상태 · 놓친 알림 · weekly report 프리뷰. 시간 부족하면 skip. |

### Phase 2 (later) surfaces
| Route | Role |
|---|---|
| `/market` | 검증된 어댑터 임대 (15% take rate) |
| `/copy` | Copy trading (archetype 기반) |

### Phase 3 (later) surfaces
| Route | Role |
|---|---|
| `/battle` | 역사 ERA 배틀 (HP / character animation / Memory Cards) · scaffolding already in `cogochi/battle_engine.py` |
| `/passport` | ERC-8004 on-chain track record |
| `/world` | BTC history traversal (v3 fusion concept) |

### Navigation

- **Desktop header:** `[Logo] [가격티커] TERMINAL · LAB · AGENT [Settings] [Connect]` — Terminal 첫 번째.
- **Mobile bottom nav:** `⌂ · ⚗ LAB · 💬 TERM · @ AGENT` — Terminal 강조.
- **Deep links:** `/terminal?symbol=BTCUSDT&tf=4h&from=scanner&alertId=xxx` 지원.

---

## § 8. Per-Surface Feature Spec

### § 8.1 `/terminal` — Primary "같이 보는" Surface

**Layout (desktop, 3-panel):**

```
┌─ LEFT 20% ──┬─ CENTER 55% ──────────┬─ RIGHT 25% ───┐
│ DOUNI chat   │ Chart (TradingView)    │ Scan results │
│ • avatar     │ • OHLC + volume        │ • pattern hit │
│ • dialogue   │ • 15-layer overlay     │ • alert card │
│ • reactions  │ • DOUNI callouts       │ • ✓/✗ buttons │
│ • prompt     │ • 📌 save pattern      │ • /lab link  │
│              │                        │               │
│              │                        │ ── history ──│
│              │                        │ • recent ✓/✗ │
│              │                        │ • daily count│
└──────────────┴────────────────────────┴───────────────┘
```

**Day-1 features (must-have):**
1. **Chart + indicator overlay** — TradingView Lightweight Charts, Binance WS 실시간, 15-layer 지표 토글
2. **DOUNI chat panel** — LLM 대화, 15-layer 상태를 컨텍스트로 사용, `cogochi/context_builder.py` 활용, personality via `cogochi/skill_registry.py`
3. **Scan results stream** — 백엔드 Scanner 알림이 Terminal 우측 패널에 라이브로 쌓임
4. **Pattern save** — "📌 이 조건을 패턴으로" 버튼. Condition 필드는 l1~l15 + alphaScore + regime
5. **Feedback** — 알림 카드마다 ✓/✗ 인라인. 1시간 후 auto-judge가 같은 DB row를 보강
6. **Deep link from scanner** — URL param `?from=scanner&alertId=xxx`로 차트 자동 로드 + 알림 시점 수직선 표시

**Day-1 explicitly NOT in /terminal:**
- HP bar, battle mode (Phase 3)
- Memory card grid view (Phase 3)
- ERA REVEAL overlay (Phase 3)
- Doctrine weight slider UI (Phase 2)
- Wallet connect required (avoid forced signin)

**Reused existing code:**
- `src/routes/terminal/+page.svelte` (3000+ lines, v3 Bloomberg-style) → 교체 아님, **리팩터**: WarRoom 패널을 DOUNI chat으로 개명, Intel 패널을 Scan results 패널로 재배선
- `terminalLayoutController.ts` 재사용
- `cogochi/context_builder.py` · `cogochi/skill_registry.py` 그대로

**Critical UX rule:** 유저는 Terminal 바깥으로 나갈 필요 없이 스캔, 피드백, 패턴 저장 전부 할 수 있어야 한다. 이게 "같이 본다"의 정의다.

---

### § 8.2 `/lab` — AutoResearch Runner (async companion)

**Day-1 single-mode UI (dual mode in Phase 2):**

```
┌──────────────────────────────────────────────┐
│ MY AGENT (DOUNI)                Stage: CHICK │
│ current adapter: v4 (2026-04-09)  hit 61.3%  │
│                                              │
│ ── Feedback Pool ──────────────────────────  │
│ Unused: 14 samples                           │
│ Next autotune at 20 samples (6 needed)       │
│                                              │
│ [ Manual Fine-tune Now ($2 GPU credit) ]     │
│                                              │
│ ── Recent Runs ───────────────────────────── │
│ v4 (Apr 9) Δ +2.8%p  PASSED  current         │
│ v3 (Apr 2) Δ -1.2%p  FAILED  (rolled back)   │
│ v2 (Mar 26) Δ +3.1%p PASSED                  │
│ v1 (Mar 19) baseline                         │
│                                              │
│ ── Weekly Report ──────────────────────────  │
│ This week your adapter improved +2.8%p       │
│ from 23 feedbacks. Here's what it learned:   │
│ · CVD bearish divergence → increased recall  │
│ · Funding extreme long → stricter filter     │
└──────────────────────────────────────────────┘
```

**Day-1 features:**
1. **Pool counter** — 쌓인 피드백 수 + 다음 자동 파인튜닝까지 남은 수
2. **Manual trigger** — PRO 유저가 즉시 파인튜닝 돌리는 버튼 ($2 GPU credit)
3. **Run history** — 각 adapter 버전 · val Δ · PASSED/FAILED/ROLLED-BACK
4. **Weekly report** — 자연어 요약 + "what it learned" 패턴 설명 (Terminal에서 푸시됨)
5. **Backend:** `cogochi/autoresearch_service.py` 호출, Python worker가 KTO trainer 실행

**Day-1 NOT in /lab:**
- 백테스트 UI (v3 Run Again / Before-After delta) — Phase 2
- 벤치마크팩 선택 — Phase 2
- Doctrine weight slider — Phase 2
- Version diff 시각화 — Phase 2

---

### § 8.3 `/agent/[id]` — Ownership + History

**Day-1 features:**
1. **Identity header:** DOUNI avatar · name · Stage progress bar · archetype badge
2. **Saved patterns list:** 내가 저장한 모든 패턴 · 각 패턴의 적중률 · on/off toggle
3. **Adapter version history:** 연속된 어댑터 버전들 · 각각의 val 결과
4. **Reflection log:** 각 피드백에서 생성된 short reflection 텍스트 (`BattleContext.reflection` 재사용)

**Day-1 NOT:**
- Doctrine weight slider (Phase 2)
- Memory card grid (Phase 3)
- Trainer card sharing (Phase 2)
- Rental readiness toggle (Phase 2)

---

### § 8.4 `/create` — DOUNI Onboarding (5-step flow, ~5 min)

**Steps:**

1. **이름** (15 sec) — DOUNI 이름 입력, default "DOUNI"
2. **아키타입** (30 sec) — Oracle / Crusher / Guardian / Rider (4 cards)
3. **First dialogue** (2 min) — "BTC 4H" 프롬프트 유도 → 차트 로드 + DOUNI 자동 분석 2~3개
4. **First pattern save** (1 min) — ✓ 1개 이상 → 📌 패턴 저장 CTA 활성화 → 저장
5. **Scanner check** (30 sec) — `/scanner`로 이동, 방금 저장한 패턴이 [내 패턴] 탭에 활성화된 것 확인 → Telegram 연결 유도

**Success metric:** 첫 패턴 저장까지 완료율 60%+. 30% 미만 → 플로우 재설계 (kill criteria).

---

### § 8.5 `/scanner` — Settings Only (not a primary UI)

**Day-1 single feature: Saved Patterns Management**

```
┌──────────────────────────────────────┐
│ MY PATTERNS                          │
│                                      │
│ ⦿ CVD divergence + funding overheat  │
│   hits: 11/15 (73%)  on [●─────]     │
│   [edit] [delete]                    │
│                                      │
│ ⦿ Wyckoff distribution + vol drop    │
│   hits: 4/7 (57%)   on [●─────]      │
│                                      │
│ ⦿ FR extreme + OI accumulation       │
│   hits: 0/1 (-)     off [─────○]     │
│                                      │
│ [+ Add pattern from Terminal]        │
│                                      │
│ ── Alert History ────────────────── │
│ (last 20 alerts with their feedback) │
└──────────────────────────────────────┘
```

**NOT in /scanner:**
- Live charting (Terminal owns that)
- Pattern authoring UI (Terminal authors, /scanner manages)
- Deep dive panel (Phase 2, at Scanner feedback → Terminal deep link)

---

### § 8.6 `/` — Home Landing (detailed spec in § 16)

See § 16 below. Six MacWindow sections + Phase 2/3 footer.

---

### § 8.7 `/dashboard` — Optional Day-1

If time-constrained this PR, skip `/dashboard` and land onboarding directly to `/terminal`. Otherwise:

```
┌──────────────────────────────────┐
│ 🐦 {DOUNI name}  Stage: CHICK    │
│ "좋은 아침! 어젯밤 BTC +2.3%"     │
│                                  │
│ ── Missed Alerts (3) ──────────  │
│ BTC 1H  볼밴수축  LONG  방금      │
│ ETH 4H  CVD div   SHORT  2h ago  │
│ SOL 4H  CVD div   SHORT  5h ago  │
│                                  │
│ ── This Week ────────────────── │
│ Feedbacks: 14/20 (next autotune) │
│ Adapter: v4 · hit 61.3%          │
│ Weekly Δ: +2.8%p                 │
│                                  │
│ [ OPEN TERMINAL → ]              │
└──────────────────────────────────┘
```

---

## § 9. DOUNI × Archetype (two orthogonal axes)

DOUNI는 **두 축**이 직교로 만나는 캐릭터다. 하나는 성장(Stage), 하나는 성향(Archetype).

### Axis 1: Stage (성장)

| Stage | Trigger | Unlock |
|---|---|---|
| EGG | 생성 직후 | Terminal access, 1 pattern, 5 symbols |
| CHICK | first feedback | 10 symbols, 15 indicators |
| FLEDGLING | first LoRA pass | full market scan, 40 indicators |
| DOUNI | 3+ successful LoRA versions | Lab method selection, LoRA rank control |
| ELDER | Phase 2 marketplace ready | Market listing, Model export |

**Rule:** Stage가 낮아도 기본 성능은 100%. 높으면 보너스. 낮다고 벌칙 없음. Duolingo streak ≠ Cogochi stage.

### Axis 2: Archetype (성향, 런타임 필터)

`cogochi/battle_engine.py`의 `guardian_veto()` 참조. Day-1에서 archetype은 **Scanner 알림 필터**로 작동한다 (Phase 3에서는 Battle veto로도 확장).

| Archetype | 성향 | Runtime rule (Scanner filter) |
|---|---|---|
| **Oracle** | 역추세 · divergence 감지 | CVD divergence 우선 알림, breakout 알림 디프리오 |
| **Crusher** | 모멘텀 · 돌파 편향 | Vol surge · breakout 우선, reversal 디프리오 |
| **Guardian** | 리스크 관리 · ATR/청산 | 펀딩 과열 시 LONG 알림 차단, high-vol 경고 우선 |
| **Rider** | 추세 추종 · MTF align | HTF align BULL/BEAR일 때만 알림, range 디프리오 |

**선택 시점:** `/create` step 2. 나중에 `/agent/[id]`에서 변경 가능 (단, adapter는 다시 학습해야 함).

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

### SignalSnapshot (15 layers + composite)

```typescript
{
  // 15 layers (backend only)
  l1:  { phase: "ACCUM|DIST|MARKUP|MARKDOWN|REACCUM|REDIST", score: number },
  l2:  { fr: number, oi_change: number, ls_ratio: number, score: number },
  l3:  { v_surge: boolean, score: number },
  l4:  { bid_ask_ratio: number, score: number },
  l5:  { basis_pct: number, score: number },
  l6:  { exchange_netflow: number, score: number },
  l7:  { fear_greed: number, score: number },
  l8:  { kimchi: number, score: number },
  l9:  { liq_1h: number, score: number },
  l10: { mtf_confluence: "BULL|BEAR|MIXED", score: number },
  l11: { cvd_state: "BULLISH|BEARISH|BULLISH_DIV|BEARISH_DIV|NEUTRAL", score: number },
  l12: { sector_flow: string, score: number },
  l13: { breakout: boolean, score: number },
  l14: { bb_squeeze: boolean, bb_width: number, score: number },
  l15: { atr_pct: number },

  // Composite
  alphaScore: number,   // -100 ~ +100
  regime: "UPTREND|DOWNTREND|VOLATILE|RANGE|BREAKOUT",

  // Meta
  symbol: string,
  timeframe: string,
  timestamp: number,
  hmac: string,          // server-signed for anti-tamper
}
```

### Pattern (user-saved)

```typescript
{
  id: string,
  user_id: string,
  name: string,                      // auto-generated or user-edited
  direction: "LONG" | "SHORT",
  conditions: [
    { field: "l11.cvd_state", op: "eq", value: "BEARISH_DIVERGENCE" },
    { field: "l2.fr", op: "gt", value: 0.0010 },
    { field: "l1.phase", op: "eq", value: "DISTRIBUTION" },
  ],
  active: boolean,
  created_at: timestamp,
  hit_count: number,
  miss_count: number,
  void_count: number,
}
```

### Feedback (KTO sample)

```typescript
{
  id: string,
  user_id: string,
  pattern_id: string,
  alert_id: string,
  snapshot: SignalSnapshot,
  verdict: "HIT" | "MISS" | "VOID",  // manual or auto
  verdict_source: "manual" | "auto_1h_close",
  p0_price: number,                  // price at alert
  p1_price: number,                  // price 1H later
  p1_change_pct: number,
  created_at: timestamp,
  reflection: string | null,         // LLM-generated short note
}
```

### ModelVersion (adapter)

```typescript
{
  id: string,
  user_id: string,
  base_model: "Qwen/Qwen2.5-1.5B-Instruct",
  adapter_path: string,              // ~/.cache/cogochi_autoresearch/adapters/...
  parent_version: string | null,     // previous version
  training_config: {
    method: "KTO" | "ORPO" | "DPO",
    lora_r: number,
    lora_alpha: number,
    learning_rate: number,
    num_samples: number,
  },
  val_metrics: {
    hit_rate_before: number,
    hit_rate_after: number,
    delta_pp: number,
    per_regime: { [regime: string]: { before, after, delta } },
  },
  status: "training" | "passed" | "failed" | "deployed" | "rolled_back",
  created_at: timestamp,
  deployed_at: timestamp | null,
}
```

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

### Sections (current approved implementation)

**1. Hero — thesis first**

- Eyebrow: `COGOTCHI`
- H1: the strongest single statement on home
  - Cogochi is the AI that learns how this user judges the market
- Sub copy:
  - save a pattern
  - let the scanner watch while the user is away
  - judge hits
  - deploy a better adapter
- Primary CTA: start as builder
  - `/onboard?path=builder`
- Secondary CTA: inspect proof / copier path
  - `/market`
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
- Entry chooser:
  - builder and copier stay visible above the fold
  - existing-user actions stay secondary and text-level

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
  - `Agent` — where doctrine, memory, and record persist
- This section is for orientation only; it must not overpower the hero

### Layout rules

- Desktop hero: left thesis + right proof panel
- Tablet/mobile hero: stack vertically, copy first
- The first content section must start within one natural scroll from hero
- Home must feel quieter than `/terminal`
- Accent color can appear as a restrained signal line, not as a page wash
- The logo watermark should read like an embossed background mark, not a foreground object
- Typography should do most of the work; cards support the message rather than carrying it alone
- If something competes with the H1 for attention, remove or weaken it

### Content rules

- Home speaks in product truth, then mechanism, then route
- Avoid long research explanations, jargon blocks, or feature inventories
- Avoid using Terminal as the hero CTA
- Builder and Copier should both remain visible above the fold
- Existing-user return paths should exist, but stay visually secondary
- Copy should feel assured, compressed, and premium. No hype phrasing and no dashboard-ish labels as hero copy

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
