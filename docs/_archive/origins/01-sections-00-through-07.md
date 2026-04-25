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

