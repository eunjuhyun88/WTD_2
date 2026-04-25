# Cogochi — Product PRD v1 (Layer A)

**Audience:** 제품 엔지니어, AI 에이전트 (Claude Code 등), 디자인/리서치 파트너
**Companion docs:** `core-loop-v1.md` (Layer B — surface 계약), `engine-runtime-v1.md` (Layer C — 엔진 런타임 + Retrieval Plane)
**이 문서의 역할:** "무엇을 왜 만드는가" 정본. 계약/엔진 세부는 Layer B/C에 위임.

---

## 0. 읽는 법

| 작업 | 진입 섹션 |
|---|---|
| 제품 정체성 확인 | §1 Thesis, §2 Identity Declaration |
| 왜 단순 "AI 차트툴"이 아닌지 | §2, §14 Positioning |
| 학습 루프 이해 | §3 Core Loop |
| 측정/성공 기준 | §4 NSM + Input Metrics, §17 Kill Criteria |
| 누구를 위해 만드나 | §5 Persona |
| 사업 가능성 | §6 Business Model + Gate |
| UI 구조 | §7 Surfaces, §8 Modes, §9 Intents, §10 Decision HUD, §11 Retrieval UX |
| 구현 범위 (페이지별) | §12 Surface detail |
| 엔진/계약 세부 | Layer B, Layer C 참조 |
| 무엇을 안 하나 | §18 Non-Goals |
| 원본 충돌 이력 | §19 |
| 변경 규칙 | §20 |

---

## 1. Product Thesis

### 1.1 한 줄 정의

> **Cogochi는 트레이더의 기억을 검색 가능한 연구 자산으로 바꾸는 패턴 리서치 OS다.**

한국어 요약: **"내가 본 패턴을 저장하고, 과거/현재 시장에서 다시 찾아주고, 판정을 학습해 정확도를 끌어올리는 엔진."**

### 1.2 Two-axis product

Cogochi는 두 축에서 동시에 가치를 만든다. 하나만으로는 약하다.

**Axis A — Detection (감지 축):** 전 종목의 현재 상태를 실시간 phase로 추적. "지금 뭐가 어디 phase에 있는가?" (Layer C Plane 1~5)

**Axis B — Retrieval (검색 축):** 저장된 패턴/자연어 질의에 대해 유사 사례를 과거·현재 전 종목에서 찾는다. "내가 저장한 이 setup이랑 비슷한 거 찾아줘." (Layer C Plane 7)

두 축은 **같은 feature store 위에서 직교**한다. 제품 차별화의 핵심은 Axis B — 이게 Surf/Minara/CoinGlass/TradingView 중 누구도 제대로 안 하고 있는 영역이다 (§14 참조).

### 1.3 핵심 믿음 (absolute, 흔들지 않음)

1. **패턴 semantics는 rule-first.** LLM이 판단하지 않는다. LLM은 파서와 심판만.
2. **Save Setup은 side action이 아니다. Canonical capture event다.** 유저가 저장하는 순간이 훈련 데이터가 생성되는 순간.
3. **측정 없이 배포 없다.** 모든 패턴은 4단계 validation ladder (backtest → walk-forward → paper → live)를 통과해야 실전 투입.
4. **검색 정확도가 제품 품질이다.** "비슷한 거 10개" 중 진짜 비슷한 게 6개 이상이어야 유저가 돌아온다.
5. **해자는 모델이 아니라 judgment ledger다.** 유저가 valid/invalid/near_miss 누른 데이터가 누적되는 것이 유일한 복제 불가 자산.

---

## 2. Product Identity Declaration

### 2.1 What Cogochi IS

1. **Pattern Research OS for crypto perpetuals**
   유저가 수동으로 복기한 setup을 구조화된 pattern object로 저장하고, 그 패턴을 전 종목 × 전 과거 구간에서 재현 검색하며, 결과를 ledger로 검증하고, 판정을 루프에 반영해 다음 탐지 품질을 올린다.

2. **Trader Memory Search Engine**
   "내가 이 차트 어디서 봤더라", "이거랑 비슷한 거 있었는데 기억 안 남" 같은 문제를 공식적으로 해결한다. 자연어 메모 → PatternDraft JSON → 유사 사례 top-K. (Layer C §16 Retrieval Plane)

3. **Labeling Flywheel**
   Tesla-style 수동 레이블 플라이휠. Save Setup 하나가 `capture` + `feature_snapshot` + `chart_snapshot` + `phase_path` + `user_note`를 한 번에 영속화한다. 이 데이터가 reranker 학습 라벨이 된다.

4. **Chart-first Terminal with phase-aware overlays**
   Bloomberg의 워크벤치 감각 + TradingView의 차트 감각 + OI/펀딩/CVD 같은 파생 데이터가 phase 판정 overlay로 차트 위에 표시된다.

### 2.2 What Cogochi is NOT (명시적 거부)

이 리스트는 **방어적**이다. 유저/투자자/에이전트가 Cogochi를 아래 카테고리로 오인할 때 바로 고칠 수 있어야 함.

| 카테고리 | 아님 이유 |
|---|---|
| ❌ "AI 시그널 SaaS" (Freeport, 3Commas, Cryptohopper) | 블랙박스 시그널 판매 아님. 투명한 증거(evidence) + 재현 가능한 검증 루프가 제품 |
| ❌ "AI 차트 분석 툴" | 차트 해석은 부산물. 진짜 제품은 "저장 → 검색 → 검증" 루프 |
| ❌ "트레이딩 봇" | Day-1에 자동 주문 실행 안 함. Phase 3+ 옵션 |
| ❌ "TradingView 대체" | 범용 차트툴 경쟁 안 함. niche는 "pattern research" |
| ❌ "투자 자문" | Regulatory 경계 밖 |
| ❌ "백테스트 툴" | 실시간 phase 추적이 본질. 과거 탐색은 retrieval의 부산물 |
| ❌ "데이터 터미널" (CoinGlass, Hyblock) | 데이터 보여주기 아님. 저장/검색/학습이 본질 |
| ❌ "초보자 교육 플랫폼" | Phase 1 유저는 숙련 트레이더만 (§5) |

### 2.3 카테고리 전쟁 선언

"AI trading" 카테고리에서 싸우면 **진다**. 그 판은 이미 True AI, Freeport, Walbi, 3Commas가 점령. 공통점: **all signals same for everyone, no labeling, no retrieval, no ledger.**

Cogochi가 이기는 판: **"Pattern Research / Retrieval OS"**. 이 카테고리에는 현재 직접 경쟁자가 없다 (§14 상세).

---

## 3. Core Product Loop — 5 Verbs

### 3.1 The 5 Verbs

**Capture → Scan → Judge → Train → Deploy**

```
Capture: Terminal에서 차트 관찰, 패턴 구성, Save Setup
  ↓
Scan: 저장된 pattern을 300 종목 × 6년치 데이터에서 retrieval + 실시간 phase 매칭
  ↓
Judge: 매칭 결과 각각에 대해 PnL 기반 outcome 판정 + 유저 verdict
  ↓
Train: 누적 verdict로 reranker/LightGBM 재학습 (Phase 2+: LoRA)
  ↓
Deploy: 검증된 pattern만 실시간 시그널러 승격 (Alert Policy)
```

### 3.2 각 verb의 surface 매핑

| Verb | 주 surface | 보조 surface | Layer B 객체 |
|---|---|---|---|
| Capture | `/terminal` | - | `capture` (§5.3) |
| Scan | `/lab` | `/dashboard` | `challenge`, `watch` (§5.4, §5.5) |
| Judge | `/dashboard` | `/lab` | `verdict`, `ledger_entry` (§5.8, §5.9) |
| Train | (internal, worker-control) | `/lab` 결과 표시 | `training_run` (Layer C §9) |
| Deploy | (internal, alert policy) | `/dashboard` alert inbox | `alert` (§5.6) |

### 3.3 두 개의 직교 루프

**Loop A — Surface orchestration (request/response):**
```
유저 요청 → app → engine-api → structured output → render
```

**Loop B — Product learning (longitudinal):**
```
Trade review → pattern 저장 → engine scan + retrieval → candidate 발견
  → Save Setup (label) → outcome 기록 → user verdict → reranker 개선
  → 다음 탐지 품질 ↑
```

두 루프를 섞지 않는다. Loop A는 즉각 가치, Loop B는 compounding moat.

### 3.4 Validation Ladder (게이트)

모든 패턴은 순서대로 통과해야 실거래 시그널이 된다.

| Stage | 이름 | 질문 | 통과 기준 |
|---|---|---|---|
| 1 | 백테스트 | 과거에 돈 벌었나? | Expectancy > 0, MDD < 20%, Profit Factor > 1.2, N ≥ 30, Tail ratio ≥ 1, Sortino ≥ 0.5 |
| 2 | Walk-forward | 시간 지나도 유지되나? | 72개월 중 75%+ quarter 양의 expectancy |
| 3 | Paper trade | 실시간도 비슷? | 30일, 백테스트 대비 expectancy 괴리 < 30% |
| 4 | Small live | 수수료+슬리피지 넣고도 +? | 60일 실거래, 순 PnL > 0 |

각 단계가 다음의 진입 게이트. 미통과 시 다음 진행 불가.

---

## 4. North Star Metric + Input Metrics

### 4.1 NSM — Weekly Completed Research Sessions

**정의:** 한 주간, 한 명의 유저가 아래 세 단계를 모두 완료한 경우 1 session.
1. Terminal에서 pattern 구성 → Challenge 저장
2. Lab에서 evaluate 실행 → 결과 확인
3. 실시간 alert 수신 → verdict (valid/invalid/near_miss/too_early/too_late) 제출

**목표:**
- M3 (3개월): 500 sessions/week
- Kill: < 140 sessions/week

**왜 이 NSM인가:**
- Capture만 세면 저장 스팸으로 게이밍됨
- Alert만 세면 엔진이 돌아간다는 것만 증명
- **세 단계 묶음 = 루프가 실제로 닫혔다는 증거**

### 4.2 Input Metrics

| # | 지표 | M3 목표 | 관찰 의미 |
|---|---|---|---|
| I1 | WAA (Weekly Active Analysts) | 200 | 유입 |
| I2 | Sessions per WAA | 2.5 | 활성 밀도 |
| I3 | Verdict 제출률 | 30%+ of alerts | judgment ledger 누적 속도 |
| I4 | D7 Retention | 30%+ | 제품 stickiness |
| I5 | Per-user model expectancy delta | +5%p after 50 verdicts | 학습이 실제로 작동하는지 |

### 4.3 디버깅 트리

```
NSM 하락
  ├── I1 하락 → 유입 문제 → onboarding / GTM
  ├── I2 하락 → 가치 체감 부족 → retrieval 품질 / UX 마찰
  ├── I3 하락 → verdict UX 문제 → 동선 단축
  ├── I4 하락 → 장기 가치 부족 → I5 확인
  └── I5 정체 → ML/reranker 파이프라인 → negative set / SIGNAL_TO_RULES 재검토
```

### 4.4 Business Gate (6-KPI)

사업화 작업(가격/마케팅/확장)은 아래 모두 양수가 되기 전까지 **동결**한다.

1. `captures_per_day_7d > 0`
2. `captures_to_outcome_rate > 0.9`
3. `outcomes_to_verdict_rate > 0.5`
4. `verdicts_to_refinement_count_7d > 0`
5. `active_models_per_pattern[tradoor-oi-reversal-v1] >= 1`
6. `promotion_gate_pass_rate_30d > 0`

의미: **플라이휠이 구조적으로 닫혔다는 관측 증거.** 게이트 전 GTM은 비용만 만든다.

---

## 5. User — Phase 1: Jin (단일 페르소나)

### 5.1 Jin 프로필

| 항목 | 값 |
|---|---|
| 나이 | 28 |
| 경력 | 크립토 2-3년 |
| 거래소 | Binance/Bybit futures |
| 현재 지출 | TradingView $15-30/월, CoinGlass 가끔, Hyblock 체험 |
| AI 사용 | ChatGPT/Claude로 가끔 차트 해석 |
| 복기 습관 | 있음 (메모 앱/스크린샷) — 근데 다시 못 찾음 |
| 본업 | IT/금융/스타트업 |

### 5.2 JTBD

**"내 트레이딩 판단의 정확도를 수치로 증명하면서 높이고 싶다."**

분해:
- "수치로 증명" = ledger 필요
- "높이고 싶다" = 학습 루프 필요
- "내" = 개인화 필요 (generic 시그널 아님)

### 5.3 Top 3 Pain Points

| # | Pain | 심각도 | Cogochi가 푸는 방식 |
|---|---|---|---|
| 1 | "AI 분석이 매번 달라. 학습 안 됨" | Critical | rule-first engine + verdict ledger |
| 2 | "여러 도구 왔다갔다 귀찮음" (CoinGlass + TradingView + 노션) | Significant | 3-surface workbench |
| 3 | "복기 안 쓰면 안 남는데 쓰기 귀찮음. 써도 다시 못 찾음" | Significant | Save Setup = 구조화 capture, Retrieval로 재조회 |

### 5.4 Aha Moment

**"AI가 내가 저장한 패턴으로 6년치 데이터에서 유사 사례 287건 찾아줬고, 그 중 68%가 실제로 움직였다."**

첫 Aha는 `/lab`에서 첫 evaluate 실행 후 instances 테이블을 보는 순간. 두 번째 Aha는 alert를 받고 차트를 열었을 때 **"내가 저장한 그 패턴과 똑같이 생겼다"**는 확인.

### 5.5 Pro 전환 트리거

```
Free: 3 captures, 5 symbols scan, 1 alert/day
  ↓ (3개 소진 후)
"더 저장하고 싶다" / "더 많은 심볼 스캔하고 싶다"
  ↓
Pro $19/월
```

### 5.6 배제 페르소나 (Phase 1 out of scope)

| 페르소나 | 왜 배제 | 해제 시점 |
|---|---|---|
| 미나 (초보) | 교육 콘텐츠 필요, Cogochi는 tool | Phase 2+ |
| 덱스 (파워유저/퀀트) | API-only 원함, Cogochi는 UI-heavy | Phase 3+ (API 공개) |
| "RSI가 뭐야?" | Cogochi는 가르치지 않는다 | 영구 배제 |
| "봇 만들어줘" | Cogochi는 연구 도구, 자동매매 아님 | Phase 3+ |

---

## 6. Business Model + Gate

### 6.1 Pricing (Gate 통과 후 활성화)

| Tier | 가격 | 대상 | 가치 |
|---|---|---|---|
| FREE | $0 | 모두 | 검증 통과 패턴 실시간 phase, 공개 backtest |
| PRO | **$19/월** (or $190/년) | Jin | Save Setup 무제한, 전 종목 스캔, verdict ledger, Telegram alert |
| DESK (Phase 2+) | $2k-10k/월 | 팀/프롭 | 공유 pattern library, API, custom benchmark pack |

### 6.2 Unit Economics [estimate]

| 지표 | 값 | 근거 |
|---|---|---|
| ARPU Free | $0.40/월 | [assumption] light data API 비용 분산 |
| ARPU Pro | $23/월 | $19 base + 연결제 보정 |
| LTV Pro | $184 | 8개월, 월 churn 12.5% [estimate] |
| CAC | $15-30 | Twitter organic + referral [estimate] |
| LTV/CAC | 6.1-12.3x | 모델 내 범위 |
| Gross margin | 75-85% | 아래 고정비 기준 |
| **BEP** | **38 Pro users** | 월 고정비 ~$700 / ($19 × 38) |

### 6.3 월 고정비 [estimate]

Vercel $20 + Railway $75 + Supabase $25 + GPU $350 + 데이터 API $180 + 기타 $50 = ~$700/월

### 6.4 Sensitivity Matrix (Pro 전환율 × MAU)

| 전환율 | MAU 200 | MAU 500 | MAU 1,000 |
|---|---|---|---|
| 10% | $380 / -$320 | $950 / +$250 | $1,900 / +$1,200 |
| 20% | $760 / +$60 | $1,900 / +$1,200 | $3,800 / +$3,100 |
| 30% | $1,140 / +$440 | $2,850 / +$2,150 | $5,700 / +$5,000 |

숫자: MRR / 월 손익. **10%는 kill zone**, 20%+ viable, 30% healthy.

### 6.5 취약한 가정 3개 (반드시 검증)

1. **Pro 전환율 20%+** [assumption] — realistic base case는 10%. Kill if M3 < 5%.
2. **Month churn 12.5%** [estimate] — bear market 시 20%+. regime별 cohort 분석 필요.
3. **검색 정확도 60%+ (top-5 precision)** — 이게 안 나오면 I2/I3 동시 무너짐. Layer C §16.19 Slice 7 완료 기준.

### 6.6 시장 규모 (정직하게)

- **TAM**: 글로벌 크립토 선물 active retail trader ~5M (Binance 275M × futures active ~2%) [estimate from Binance public data]
- **SAM**: "수년 경력 + 자기 패턴 있는" 트레이더 ~500K (10%)
- **SOM Y1**: ~25K (SAM의 5% paying conversion) → 25K × $19 = ~$475K MRR [target upper bound]
- **현실적 Y1 target**: BEP 38명 → 1,000 Pro users 12개월

**YC 앱 문서의 $474B TAM은 trading bot market 전체**라서 framing 다름. Cogochi는 그 전체 시장을 먹지 않는다. Pattern research niche에서 25K의 10%만 먹어도 ARR $570K. (§19.3 충돌 해결 참조)

### 6.7 수익 모델 결정 (금지 목록)

- ❌ 성과 수수료 — regulatory + track record 부재
- ❌ Affiliate / paid ads — positioning 충돌
- ❌ 자동 봇 매매 fee — Phase 3+
- ❌ Influencer partnership — 신뢰 축 오염

GTM 채널은 **content only** (공개 reproducible report + GitHub).

### 6.8 Cold-start Strategy

게이트 전제: Save Setup = 수동 라벨. label 0에서 시작하면 retrieval 품질 0.

**Lane 1 — Founder bulk import**: 창업자 본인 매매 노트를 CSV bulk로 500 capture 시드 target. `/import` 내부 경로로.

**Lane 2 — Public reproducible reports**: 매 refinement run 결과를 reject 포함 공개 URL로 발행. 콘텐츠 + 신뢰 + labeler 유입의 단일 채널.

두 lane은 **제품의 일부**. 별도 프로젝트 아님.

---

## 7. Product Surfaces — 3 Surface + Landing

### 7.1 Day-1 Surface 맵

| Route | 역할 | 핵심 verb | Layer B 섹션 |
|---|---|---|---|
| `/` | Landing | 전환 CTA | - |
| `/terminal` | **관찰 + Capture** | Capture | Layer B §8.2 |
| `/lab` | **평가 + Scan + Train seed** | Scan, Judge (post-hoc) | Layer B §8.3 |
| `/dashboard` | **Alert inbox + Verdict** | Judge (live), Deploy 모니터링 | Layer B §8.4 |

### 7.2 Phase 2+ Deferred Surfaces

| Route | 역할 | 해제 조건 |
|---|---|---|
| `/market` | 검증된 adapter 임대 (15% take rate) | Gate 통과 + 3+ validated patterns |
| `/training` | Per-user LoRA fine-tuning UI | LightGBM baseline 대비 +5%p 입증 |
| `/battle` | Historical era battle | 엔터테인먼트 기능, Gate 후반 |
| `/passport` | ERC-8004 on-chain track record | Web3 integration 게이트 |

### 7.3 Navigation

데스크탑: `[Logo] [Ticker] TERMINAL · LAB · DASHBOARD [Settings] [Connect]`
모바일: `⌂ · TERMINAL · LAB · DASHBOARD`

### 7.4 Surface rules

- Surface는 engine artifact만 소비. 독립 계산 금지. (Layer C §11 App Contract Discipline)
- UI state는 `app/`, domain logic은 `engine/`. 재구현 금지.
- Vocabulary 통일: `capture`, `challenge`, `AutoResearch`, `instance`, `evaluate`, `watching`, `verdict`

---

## 8. Mode System — Observe / Analyze / Execute

### 8.1 왜 3모드인가

첨부 피드백 정확히 인용:

> "지금 한 화면에서 research / scan / execution / judgment가 **다 섞여 있다**. 이걸 3모드로 나눠야 한다."

현재 구현은 한 `/terminal`에 모든 게 떠 있어서 **정보 위계가 무너짐**. 3모드로 나누면 각 모드에서 **단 하나의 주 목적**만 만족하면 됨.

### 8.2 Mode 정의

| Mode | 목적 | 주 화면 영역 | 활성 verb |
|---|---|---|---|
| **Observe** | 빠르게 여러 종목 훑기 | 차트 70%, HUD 접힘, 하단 접힘 | - (관찰만) |
| **Analyze** | 한 종목 깊게 연구 | 차트 50%, HUD 25%, 하단 25% | Capture (저장), Judge (post-hoc) |
| **Execute** | 진입/손절/타겟 확정 | 차트 60%, Execution board 30% | - (Day-1 수동 실행) |

### 8.3 Mode 전환 규칙

- **Observe → Analyze**: 심볼 클릭 또는 "Analyze this" 키 (`A`)
- **Analyze → Execute**: Decision HUD에서 "Execute" 버튼 (Phase 1은 외부 거래소로 이동)
- **Execute → Observe**: 실행 완료 또는 취소

### 8.4 Mode별 Layout 매핑

```
Observe Mode:
┌──────────────────────────────────────────────┐
│         CHART 100% (symbols side-strip)      │
└──────────────────────────────────────────────┘

Analyze Mode:
┌──────────────────────────────┬──────────────┐
│         CHART 50%            │   HUD 25%    │
│                              │              │
├──────────────────────────────┴──────────────┤
│    Workspace (Phase Timeline / Evidence /   │
│    Compare / Ledger / Judgment)  25%        │
└──────────────────────────────────────────────┘

Execute Mode:
┌──────────────────────────────┬──────────────┐
│         CHART 60%            │  Execution   │
│  (with entry/stop/TP         │  Board 30%   │
│   annotations)               │              │
└──────────────────────────────┴──────────────┘
```

### 8.5 Mode state 영속

URL에 `?mode=observe|analyze|execute`. 새로고침 시 유지. Deep-link 가능.

### 8.6 Mode가 풀어주는 문제

| 기존 문제 (피드백 인용) | Mode로 해결 |
|---|---|
| "모든 UI가 지금 당장 트레이드하라고 소리친다" | Analyze와 Execute 분리 |
| "Execute board가 Analyze 단계에 먼저 보임" | Execute mode에서만 노출 |
| "Summary가 오른쪽과 하단 둘 다 중복" | Mode별 영역 단순화 |
| "scan과 deep analysis가 같은 화면" | Observe (scan) vs Analyze (deep) |

---

## 9. Intent System — 6 Intents → Visualization Templates

### 9.1 핵심 원리

첨부에서 인용:

> **"유저의 질문 의도를 기반으로, 적절한 시각화 템플릿을 선택하고, 핵심 신호만 강조해서 차트를 생성한다."**

유저는 `oi_change_1h 보여줘`가 아니라 `왜 떨어졌냐` / `지금 뭐냐` / `비슷한 거 찾아줘`라고 말한다. 제품은 **데이터를 다 그리지 않고**, **질문의 목적에 맞는 시각화**를 생성한다.

### 9.2 Pipeline

```
User Query → Intent Classifier (6 classes)
           → Pattern Context Resolver (현재 phase / phase_path / features)
           → Template Selector
           → Highlight Planner (primary 1 + secondary 2)
           → Chart Config Builder (ChartViewConfig)
           → Renderer
```

### 9.3 6 Intents

| Intent | 트리거 예시 | Template |
|---|---|---|
| **WHY** | "왜 떨어졌냐", "뭐가 원인이냐" | `event_focus` |
| **STATE** | "지금 뭐 하는 자리냐", "지금 매집이냐" | `state_view` |
| **COMPARE** | "TRADOOR랑 비슷하냐", "PTB랑 뭐가 다르냐" | `compare_view` |
| **SEARCH** | "비슷한 거 찾아줘", "이런 패턴 종목 뭐 있냐" | `scan_grid` |
| **FLOW** | "세력 들어왔냐", "돈 흐름 어때" | `flow_view` |
| **EXECUTION** | "어디서 진입하냐", "손절 어디냐" | `execution_view` |

### 9.4 Template 정의 (6개)

#### 9.4.1 `event_focus` (WHY)

**언제:** "왜 X 됐냐?" 질문
**Primary:** price event candle (circle annotation)
**Secondary:** OI spike marker, funding extreme marker
**Muted:** volume, 나머지 panes
**Message:** "왜 여기서 움직였는가"

#### 9.4.2 `state_view` (STATE)

**언제:** 현재 상태 질문
**Primary:** phase zone overlay (ACCUMULATION 같은)
**Secondary:** higher_lows, OI hold line, breakout threshold
**Muted:** historical data 이전 구간
**Side summary:** phase + confidence + top 3 evidence
**Message:** "지금 어느 phase인가"

#### 9.4.3 `compare_view` (COMPARE)

**Layout:** split (좌: 현재, 우: reference)
**Primary:** 양쪽 price panel
**Secondary:** phase path diff strip (아래)
**Side summary:** similarity score, phase_match, main_diff
**Message:** "얼마나 비슷하고 뭐가 다른가"

#### 9.4.4 `scan_grid` (SEARCH)

**Layout:** grid 6-12 mini charts
**Per tile:** symbol, mini price chart, similarity score, current phase badge, one-line key signal
**Sort options:** confidence / similarity / breakout_proximity
**Message:** "어떤 종목이 후보인가"

#### 9.4.5 `flow_view` (FLOW)

**Primary:** OI panel (price 최소화)
**Secondary:** funding histogram, liquidation density strip
**Optional:** CVD
**Message:** "포지션 흐름이 어떻게 쌓였나"

#### 9.4.6 `execution_view` (EXECUTION)

**Primary:** price with entry/stop/TP annotations
**Secondary:** invalidation level, risk-reward box, breakout confirmation line
**Evidence:** 최소 3개 근거
**Warning:** 기본 화면에서 강하게 띄우지 말 것 — Execute mode에서만 primary

### 9.5 Highlight Rules (절대)

1. **하나의 요청 = 하나의 시각화.** 다중 차트 겹치기 금지 (compare_view 제외).
2. **강조는 항상 1개 primary + 2 secondary + 나머지 muted.**
3. **숫자는 숨기고 구조를 보여라.** raw value는 Analyze mode 하단 Evidence Table에서만.
4. **유저가 요청한 데이터를 그대로 다 그리면 안 된다.** 의도에 맞는 시각화만.

### 9.6 ChartViewConfig 스키마 (제품 관점)

```python
@dataclass
class ChartPanelConfig:
    panel_type: str           # price / oi / funding / cvd / volume / compare / feature_diff
    visible: bool = True
    emphasis: str             # "primary" / "secondary" / "muted"
    overlays: list[dict]      # zone, line
    markers: list[dict]       # circle, dot, label

@dataclass
class ChartViewConfig:
    template: str             # event_focus / state_view / compare_view / scan_grid / flow_view / execution_view
    title: str
    symbol: str
    timeframe: str
    layout: str               # single / split / grid
    panels: list[ChartPanelConfig]
    annotations: list[dict]
    side_summary: dict        # Decision HUD payload (§10)
```

엔진 구현 세부: Layer C에 포함될 "Presentation Plane" 확장으로 반영 필요 (§20 Change Policy로 이관).

### 9.7 Intent 추출 방식

**Day-1 (rule-based + LLM fallback):**
- 빠른 패턴 매칭: 키워드 ("왜", "지금", "비슷한", "찾아", "세력", "진입") → intent 매핑
- 매칭 실패 시 LLM classifier (JSON schema 출력)
- Intent vocabulary는 §16.5 signal vocabulary와 별개 (intent = 6개 고정)

**Phase 2+ (learned):**
- 유저 query log → intent classifier fine-tuning
- Per-user pattern에 따른 default intent 학습

### 9.8 Intent가 바꾸는 하단 Workspace

차트만 바뀌는 게 아니라 **하단 Workspace도 intent에 따라 재구성**:

| Intent | 하단 기본 섹션 |
|---|---|
| WHY | Evidence table + AI explanation panel |
| STATE | Phase timeline + evidence table |
| COMPARE | Feature diff table + similarity breakdown |
| SEARCH | Candidate grid + filter controls |
| FLOW | OI/funding/liq historical strip |
| EXECUTION | Entry/stop/TP calculator + risk-reward |

---

## 10. Decision HUD — 4-Card Rule

### 10.1 핵심 규칙

Analyze mode 오른쪽 HUD는 **정확히 4개 카드만**. 더 넣는 순간 정보 위계가 무너짐.

| 카드 순서 | 카드 | 내용 (최대) |
|---|---|---|
| 1 | **Current State** | Pattern family, Phase, Confidence, Bias |
| 2 | **Top Evidence** | 3 bullet (신호 단위) |
| 3 | **Risk** | 3 bullet (실패 시나리오 / macro 역풍) |
| 4 | **Actions** | 3 버튼: `Save Setup`, `Compare`, `Explain in AI` |

### 10.2 카드 상세

#### Card 1. Current State

```
Pattern: tradoor-oi-reversal-v1
Phase: ACCUMULATION
Bias: LONG (mid)
Confidence: 0.78
```

데이터 출처: Layer C §6 State Machine + §10 Alert Policy

#### Card 2. Top Evidence

```
✔ OI +18.2% spike 유지 (phase=REAL_DUMP 완료)
✔ Funding flip negative→positive 확인
✔ Higher lows 3개 형성
```

**자동 선택 규칙:** `current_phase`에 해당하는 `signals_required`가 모두 충족된 것 중 weight 상위 3개.

데이터 출처: Layer C §5 Building Blocks + §16.8 SIGNAL_TO_RULES

#### Card 3. Risk

```
⚠ Breakout 미확정 (breakout_strength 0.004 < threshold 0.01)
⚠ Low 깨지면 invalidation
⚠ BTC 4h 약세 구간
```

**자동 선택 규칙:** `signals_forbidden` 중 근접 위반 + macro regime + 다음 phase transition 조건 미충족.

#### Card 4. Actions

```
[Save Setup]  [Compare]  [Explain in AI]
```

- `Save Setup` → POST `/api/terminal/pattern-captures` (Layer B §5.3)
- `Compare` → Compare view 전환 (§9.4.3 template)
- `Explain in AI` → AI side panel slide-over (§11.3)

### 10.3 금지 목록 (HUD에 절대 안 넣음)

| 금지 항목 | 왜 | 어디로 | 
|---|---|---|
| Raw numeric table (OI=18.2, funding=-0.018 같은 표) | Primary decision surface 오염 | Analyze mode 하단 Evidence Table |
| Entry price / Stop / Target | Execute mode 전용 | Execute mode |
| Score number 단독 카드 | Current State에 통합 | Current State |
| Leader / Venue / Context | 메타데이터 | 헤더 또는 settings |
| Detail Panel + AI Detail 동시 노출 | 중복 | 버튼으로 slide-over |

### 10.4 설계 원칙

- **판단은 오른쪽, 근거는 하단, 실행은 별도 모드.**
- **4카드 초과 금지.** 5번째 카드 추가는 기존 4개 중 하나를 합치거나 버려야 가능.
- **카드 내 bullet 3개 초과 금지.** 인지 부하.

---

## 11. Retrieval UX — Parser / Search / Compare

### 11.1 왜 이 섹션이 필요한가

Cogochi의 **Axis B (검색 축)**는 엔지니어링으로는 Layer C §16에 구현. UX로는 여기 정의. 엔진이 있어도 UI가 없으면 유저가 못 쓴다.

### 11.2 유저 입력 경로 3가지

| 경로 | 예시 | 출력 |
|---|---|---|
| **Natural language** | "OI 급등 후 15분봉 우상향 횡보 후 급등" | PatternDraft (Layer C §16.3) |
| **Capture reference** | 저장된 capture 클릭 → "Find similar" | 그 capture의 `feature_snapshot` + `phase_path`를 seed로 |
| **Block composition** | Terminal 블록 검색 + AND 조합 | 직접 SearchQuerySpec 구성 |

### 11.3 AI side panel 역할 경계

```
AI Panel은:
✅ 파싱 결과 보여주기 (PatternDraft JSON을 자연어로)
✅ 검색 결과 설명 ("이 top-5가 비슷한 이유")
✅ 차이점 서사화 ("PTB와 비교: breakout timing earlier")
✅ Reframing 제안 ("이 시그널 빼면 200건 더 찾을 수 있음")

AI Panel은:
❌ phase 판정 자체
❌ similarity score 재계산
❌ scoring 결과 truth 선언
❌ 자유 서술 차트 분석
```

### 11.4 Retrieval 결과 화면

```
top-10 RetrievalHit
 ├─ 기본: scan_grid template으로 mini card
 ├─ 각 card: symbol, mini chart (30 bars), similarity 0.82, phase path match
 ├─ Click → Analyze mode, 해당 window 차트로 점프
 └─ Side panel: filter (timeframe / phase_match / outcome / regime)
```

### 11.5 Save Setup Modal (retrieval seed 생성)

Save Setup 버튼 클릭 시 모달:

```
┌ Save Setup ─────────────────────────────────┐
│ Pattern family:  [tradoor-oi-reversal-v1 ▾] │
│ Symbol/TF:       BTCUSDT · 15m (auto)       │
│ Current phase:   ACCUMULATION (auto)        │
│ Chart snapshot:  [auto-attached]            │
│ Feature snap:    [auto-attached, 92 cols]   │
│ Phase path:      fake_dump → real_dump      │
│                 → accumulation (auto)       │
│ User note:       [___________________]      │
│ Thesis tags:     [+ tag]                    │
│ Validity assume: [valid ▾]                  │
│ Expected next:   [breakout ▾]               │
│                                             │
│              [Cancel]  [Save]               │
└─────────────────────────────────────────────┘
```

저장되는 것 = `capture` 레코드 (Layer B §5.3) + optional `PatternDraft` (Layer C §16.3) → 이후 retrieval seed.

### 11.6 Verdict UX

Alert 도착 → dashboard inbox → 클릭 → Analyze mode 점프.

```
Verdict 버튼 (한 줄, 5개):
[Valid] [Invalid] [Near Miss] [Too Early] [Too Late]

Optional comment: [______________]
  "funding flip 없는데 accumulation으로 잡힘"
```

각 click은 Layer B §5.8 verdict 객체 생성. 즉시 reranker 학습 queue로 enqueue (Phase 2+).

### 11.7 Compare UX

첨부 피드백 인용:

> "Compare 없으면 엔진 가치가 반 토막. 최소 3개 지원: current vs seed / current vs saved case / current vs failure case"

Compare view 진입 경로:
- Decision HUD 카드 4 → `Compare` 버튼 → 자동 "current vs seed"
- Retrieval 결과 card 우클릭 → "Compare with current"
- Lab instances 테이블 → row 선택 → "Compare"

Compare view 구성 (§9.4.3 `compare_view` template):
- **좌:** current symbol price + phase overlay
- **우:** reference pattern price + phase overlay
- **하단:** feature diff table (top 10 features, primary divergence 마커)
- **Side summary:** similarity 0.82, phase_match "real_dump → accumulation", main_diff "breakout not confirmed"

---

## 12. Surface Detail

### 12.1 `/` — Landing

**목적:** Thesis + first action entry. 복잡한 소개 대신 바로 Terminal로.

| Section | Content |
|---|---|
| Hero | H1: "Find it again." / Sub: 패턴 저장 → 검색 → 판정 → 학습 / Start Bar placeholder: "What setup do you want to find?" |
| Primary CTA | `Open Terminal` |
| Secondary | `See How Lab Scores It` → /lab |
| Learning Loop | 5 verbs visual (Capture → Scan → Judge → Train → Deploy) |
| 3 Surfaces | Terminal (observe+capture) / Lab (evaluate+refine) / Dashboard (alert inbox) |
| Proof | 1개 proof panel. backtest 숫자 or sample retrieval 결과 |
| Final CTA | `Open Terminal` |

**비주얼:** black-toned, embossed logo watermark, 최소 카피. 3D 없음. 타이포가 대부분의 일을 함.

### 12.2 `/terminal` — 관찰 + Capture

**주 모드:** Observe (진입 시 기본), Analyze (심볼 클릭 시)

**Day-1 기능:**
- Symbol list (left rail) — 워치 심볼 + universe tier
- Chart (center) — Intent-aware ChartViewConfig 렌더
- Decision HUD (right, Analyze mode only) — 4 카드 (§10)
- Query bar (top) — 자연어 → intent 분류 → 시각화 전환
- Save Setup button (right rail) — capture 생성 모달

**세부 계약:** Layer B §8.2

**Intent 예시 실행:**
- 유저 입력: "BTC 왜 떨어졌냐"
- → intent = WHY → template = event_focus
- → 차트 마지막 dump candle highlighted + OI spike marker + funding extreme marker
- → HUD card 1: phase (현재 상태), card 2: evidence top 3, card 3: risk

### 12.3 `/lab` — 평가 + Scan + Train seed

**주 모드:** Analyze

**핵심 기능:**
- **My Challenges list** (left) — 저장된 capture에서 파생된 challenge, SCORE 기준 정렬
- **Challenge detail** (right) — blocks (trigger + confirmation + entry + disqualifier), match.py preview
- **Run Evaluate button** — SSE streaming 결과
- **Instances table** — 매칭된 과거 사례들, click → Terminal에서 해당 window로 점프
- **Retrieval panel** — "Find similar to this challenge" (Layer C §16.15 POST /retrieval/search)

**2가지 Challenge 유형:**

| 유형 | 기반 | 해석 가능성 |
|---|---|---|
| `pattern_hunting` | Block 조합 (rule-first) | 높음 (왜 매칭됐는지 명확) |
| `classifier_training` | LightGBM P(win) | 낮음 (feature importance만) |

**세부 계약:** Layer B §8.3

### 12.4 `/dashboard` — Alert Inbox + Verdict

**주 기능:**

| Section | Content |
|---|---|
| **Alert Inbox** | 미판정 alert list. 각 alert: symbol, pattern, phase, created_at, [Judge] 버튼 |
| **Judge modal** | Verdict 5버튼 (§11.6) + optional comment |
| **My Challenges summary** | 최근 5개 (→ /lab) |
| **Watching** | Terminal에서 저장한 live search (→ /terminal) |
| **Adapters (Phase 2+ placeholder)** | 빈 상태 |

**세부 계약:** Layer B §8.4

### 12.5 Deep-link 규칙

| From | To | URL |
|---|---|---|
| Dashboard alert click | Terminal Analyze mode at alert timestamp | `/terminal?symbol=X&ts=Y&mode=analyze&alert_id=Z` |
| Lab instance click | Terminal at that instance timestamp | `/terminal?symbol=X&ts=Y&mode=analyze` |
| Retrieval hit click | Terminal at hit window | `/terminal?symbol=X&ts=Y&mode=analyze&retrieval_hit=Z` |

---

## 13. Cold-start & Seed Data

### 13.1 The Zero-label Problem

Save Setup = label. Label 0 → retrieval 품질 0 → 유저 이탈. 이 death loop 피하려면 출시 전 **최소 500 capture**를 founder가 직접 시드.

### 13.2 Founder Bulk Import

**경로:** `/import` (internal route)
**형식:** CSV
```csv
symbol,timeframe,timestamp,pattern_family,phase_path,user_note,thesis
TRADOORUSDT,15m,2024-11-22T09:30:00Z,oi_reversal,"fake_dump,real_dump,accumulation,breakout","세력 숏 털기","이 구간이 real_dump"
```
**목표:** 출시 전 500 capture

### 13.3 Public Reproducible Reports

**경로:** `/reports/{run_id}` (public URL)
**내용:** refinement run마다 발행. **reject 포함.**
```
Report: 2026-04-15 refinement run
Pattern: tradoor-oi-reversal-v1
Candidates evaluated: 1,247
Passed stage 1: 23
Rejected: 1,224 (reasons: MDD>20% ×412, N<30 ×318, regime_fail ×494)
Top candidate: BTCUSDT 2026-03-14 — similarity 0.84, outcome HIT
Full feature diff + chart: [link]
```

**왜 공개하나:**
- 신뢰 (black-box 시그널 vs 투명한 research)
- SEO / 콘텐츠 마케팅
- Founder 이외 라벨러 유입 경로

### 13.4 Seed 품질 체크

출시 전 self-audit:
- [ ] 500+ capture
- [ ] 최소 10 pattern family (다양성)
- [ ] Positive / negative / near-miss 비율 5:3:2
- [ ] 최소 20 reproducible reports 공개

---

## 14. Competitive Positioning

### 14.1 경쟁자 맵

| Competitor | 카테고리 | 강점 | 우리 대비 공백 |
|---|---|---|---|
| **TradingView** | 범용 차트 | 드로잉, 인디케이터 다양 | Pattern flywheel 없음. OI/펀딩 통합 얕음. Retrieval 없음 |
| **CoinGlass** | 데이터 터미널 | OI/펀딩/liq 데이터 최고 | 패턴 프레임워크 없음. 학습 루프 없음 |
| **Hyblock** | Orderflow 터미널 | Real-time orderflow | Pattern capture 없음. 복기 자산화 없음 |
| **CryptoQuant / Glassnode** | 온체인 데이터 | on-chain metrics | Perp 통합 얕음. 탐지 프레임워크 없음 |
| **Surf AI (agents.asksurf.ai)** | AI research summarizer | 데이터 요약 + 설명 잘함 | Retrieval 아닌 summarization. phase DB 없음. sequence matching 없음 |
| **Minara** | AI CFO for Web3 | 50+ data source, agent factory, 온체인 실행 | Per-user 학습 없음. 트레이딩 패턴 검증 프레임워크 없음 |
| **Freeport (YC W26)** | Twitter → signals | Narrative signals | 같은 시그널 모두에게. No personalization |
| **True AI** | AI crypto trading | Funded ($30M @ $250M) | Generic model. No per-user learning |
| **3Commas, Cryptohopper** | Rule bots | 안정적 실행 | Fixed rules. No scoring/retrieval |
| **TrendSpider** | Pattern auto-detect | 자동 인식 + 200+ 인디 | Stock focus. Crypto perp 미약. No user label loop |

### 14.2 Cogochi의 포지션

```
                 AI pattern learning / 개인화
                           ↑
                           │
 Signal SaaS (Freeport,    │        Cogochi ★
 True AI, Walbi)           │       (retrieval + ledger +
                           │        phase state)
    ←──────────────────────┼──────────────────────→
    Generic (all users     │      Personalized (your
    same signal)           │       labels → your model)
                           │
 Rule bots (3Commas,       │   CoinGlass, Hyblock
 Cryptohopper)             │   (data terminal, no learning)
                           │
                 Data terminal / 학습 없음
```

Cogochi는 **"AI learning + personalized"** 사분면에 혼자 있다.

### 14.3 Wedge (기존 플레이어들이 비워둔 단일 영역)

**Chart-first terminal + 구조화 pattern capture + OI/펀딩 인지 phase 모델 + retrieval + 사용자 라벨 회수 플라이휠**

이 5개 조건을 동시에 만족하는 제품은 현재 없음. 개별 조각은 다 있지만, 플라이휠로 연결한 제품은 없음.

### 14.4 Moat Design (해자 3층)

1. **User Save Setup labels** — 경쟁사가 수집 불가능한 trader intent 라벨
2. **Reproducible reject-inclusive reports** — 실패 가설도 영구 URL. 외부 검증 가능성 = 신뢰 자산
3. **5-phase state model + validation ladder** — 실매매 검증된 분류 체계. 문서 공개해도 moat 유지 (데이터가 없으면 복제 불가)

### 14.5 "왜 지금인가" (timing)

1. **AI trading 카테고리가 펀딩됨** — True AI $30M, Freeport YC. 시장 validated.
2. **Personalization 비용이 떨어짐** — LightGBM CPU infer, LoRA $0.07/run. 2년 전 $50+. Per-user model economically viable.
3. **Information overload 악화** — Twitter/Telegram/Discord/on-chain/macro/KOL. Filter가 절실.
4. **모든 도구가 "same signal for all"** — 개인화는 "obvious next step" 인데 아무도 안 함.

### 14.6 Surf AI에 대한 답변 (첨부 인용)

> "https://agents.asksurf.ai 이런 게 이미 있는데 진짜 엔진이 특별하게 잘 찾아야겠는데"

**답:** Surf는 "데이터 + AI 요약 엔진" (설명형). Cogochi는 "패턴 검색 엔진" (retrieval형). 완전히 다른 구조.

| 축 | Surf | Cogochi |
|---|---|---|
| 본질 | 요약/해석 | 검색/비교 |
| 핵심 알고리즘 | LLM summarization | Sequence matching + reranker |
| 학습 루프 | 없음 | Verdict → reranker |
| Phase state model | 없음 | 5-phase + state machine |
| Negative set | 없음 | 필수 수집 (Layer C §16.16) |
| Moat | 데이터 수집량 | Label 누적량 |

**"잘 설명하는 AI" vs "잘 찾아주는 엔진".** 설명보다 검색이 훨씬 어렵고 훨씬 가치 있다.

---

## 15. Technical Architecture Summary

### 15.1 제품 관점 6-layer 요약 (Layer B/C 위임)

```
Layer 6 — Natural language (LoRA per-user) .............. Phase E (deferred)
Layer 5 — Measurement (PnL, stage gate) ................. Day-1
Layer 4 — Execution/Risk (portfolio, simulator) ......... Day-1 (paper)
Layer 3 — Regime filter (BTC macro) ..................... Day-1 (stub → v1)
Layer 2 — Signal engines (pattern_hunting + classifier) . Day-1
Layer 1 — Features (92 cols) ............................ Day-1
Layer 0 — Data (Parquet cache, Binance WS) .............. Day-1
```

세부 구현: Layer C `engine-runtime-v1.md` §2 Plane Architecture 참조.

### 15.2 Retrieval Plane (Layer C §16)

Cogochi의 "검색 축"은 Layer C Plane 7로 엔지니어링:
- Parser (자연어 → PatternDraft)
- QueryTransformer (signal vocabulary → feature rules)
- Candidate Generation (SQL hard filter)
- Sequence Matcher (phase path alignment)
- Reranker (LightGBM + user judgment)
- LLM Judge (optional, top-K 검증)
- Final similarity: `0.35 × feature + 0.40 × sequence + 0.15 × outcome_context + 0.10 × text_chart`

### 15.3 Tech Stack 요약

| Layer | Tech |
|---|---|
| Frontend | SvelteKit 2 + Svelte 5 + TypeScript 5 + TradingView Lightweight Charts |
| Backend | Python 3.12 FastAPI (Railway) |
| Database | Supabase (PostgreSQL) |
| Cache | Redis (5min kline prefetch) |
| ML | LightGBM (signals), mlx-lm LoRA (Apple Silicon) / peft+trl (CUDA) |
| Scanner | FastAPI + APScheduler, 800 weight/min safety margin |
| Data | Binance REST/WS, Parquet cache, Coinglass/Coinalyze (perp) |
| Alerts | FCM + Telegram Bot + HMAC-SHA256 |
| Infra | Vercel (frontend) + Railway (API) + S3/R2 (model storage) |

### 15.4 데이터 계층

| Source | Category | Why |
|---|---|---|
| Binance WS (spot + futures) | OHLCV, aggTrade (→ CVD) | primary |
| Binance fapi | OI, funding, L/S ratio, liquidation | perp context |
| Coinglass / Coinalyze | 파생 히스토리 | backfill |
| 업비트/빗썸 | 김치프리미엄 | cross-market signal |
| Glassnode / CryptoQuant | 온체인 (고래, 거래소 flow) | Phase 2+ |
| alternative.me | Fear/Greed | macro |

---

## 16. 12-Week Roadmap

### 16.1 전체 phase

| Phase | 주차 | 목표 | Gate |
|---|---|---|---|
| Phase 0 | W-8 to W-4 | CLG 시드 500 capture import | 500+ capture in DB |
| Phase 1 | W1-W4 | Terminal + Capture + 기본 retrieval | First successful retrieval query |
| Phase 2 | W5-W8 | Lab + Scan + Judgment | First full loop closed (capture → scan → alert → verdict) |
| Phase 3 | W9-W12 | Dashboard + Training seed | Reranker retrained on user verdicts |

### 16.2 주별 세부

**W1-2: Engine 연결 + Terminal 기초**
- `/terminal` 3-pane layout
- Query bar + intent classifier (rule-based)
- Chart rendering (Intent template 6개 중 state_view + event_focus)
- Feature pipeline: Layer 0 → Layer 1 → Layer 2 connected
- Gate: 실데이터 기반 현재 phase 출력 가능

**W3-4: Retrieval Parser + Capture**
- Signal vocabulary 24개 고정 (Layer C §16.5)
- Parser (LLM function calling, JSON schema)
- Save Setup modal → `capture` 레코드 영속
- PatternDraft schema (Layer C §16.3)
- Gate: 자연어 메모 → PatternDraft JSON 정확도 80%+

**W5-6: Lab + Sequence Matcher**
- `/lab` 3-section layout (list + detail + instances)
- Candidate Generation (SQL hard filter)
- Sequence Matcher (phase_path alignment)
- Final similarity scoring (weight 초기값)
- Gate: "BTCUSDT 2026-03 타임스탬프 → top-10 similar windows" < 90s

**W7-8: Alert + Judgment**
- Alert policy (Layer C §10)
- `/dashboard` alert inbox
- Verdict 5버튼 UX
- Telegram/FCM delivery
- Ledger 레코드 저장 (verdict, outcome)
- Gate: First full loop closed (500+ capture → scan → first valid alert → first verdict)

**W9-10: Reranker + Refinement**
- LightGBM Ranker 학습 pipeline
- User verdict → reranker training queue
- Negative set 자동 수집 (§16.16)
- Refinement loop: new weights → re-evaluate
- Gate: Pre/Post reranker precision 비교, +5%p 향상

**W11-12: 안정화 + 베타**
- Stripe integration (Pro $19/mo)
- 안정화 (인프라, 에러 핸들링)
- Beta 20명 초대 (한국 크립토 커뮤니티)
- Public reproducible reports 자동 발행
- Gate: NSM 140+, D7 30%+, Pro 전환 10%+

### 16.3 Phase별 검증 게이트 (kill 포함)

| 시점 | 질문 | Kill if |
|---|---|---|
| W4 | 파싱 + 저장 자연스럽나? | 5명 중 3명 미만 재방문 |
| W6 | Retrieval 결과가 유용? | 클릭률 < 30%, top-5 precision < 50% |
| W8 | Scan → Alert → Verdict 루프 닫힘? | Verdict 제출률 < 15% |
| W10 | Reranker 개선? | Pre/post precision delta < 0 |
| W12 | PMF 초기 증거? | NSM < 140, D7 < 20% |

---

## 17. Kill Criteria

### 17.1 제품 Kill

| 시점 | 조건 | 의미 | 액션 |
|---|---|---|---|
| Internal test | 3명 중 0명 재방문 | 온보딩/가치 체감 실패 | UX 재설계 |
| M3 | NSM < 140/week | 루프 미작동 | 제품 방향 재검토 |
| M3 | D7 < 20% | Stickiness 실패 | Onboarding + retrieval 품질 재점검 |
| M3 | Alert 클릭률 < 30% | Alert 품질 실패 | Phase detection threshold 재조정 |

### 17.2 Retrieval Quality Kill (Layer C §16 의존)

| 시점 | 조건 | 액션 |
|---|---|---|
| W6 | top-5 precision < 50% on human-labeled eval | SIGNAL_TO_RULES 매핑 재검토 |
| W10 | Pre/post reranker delta < 0 | Negative set 품질 점검 |
| M3 | Per-pattern active models = 0 | Pattern 정의 자체 재검토 |

### 17.3 ML Kill

| 시점 | 조건 | 액션 |
|---|---|---|
| D14 | lgb-long-v1 expectancy > 0 만드는 param 없음 | Classifier track 보류 |
| D16 | Walk-forward 75% quarter 미달 | Regime-specific 전략 피벗 |
| Phase E | LoRA < LightGBM baseline | LoRA 보류 |

### 17.4 비즈니스 Kill

| 시점 | 조건 | 액션 |
|---|---|---|
| M3 | Pro 전환 < 5% | 가격 조정 or 제한 정책 변경 |
| M6 | MRR < $1,000 | Pivot or Kill |
| M6 | Business Gate 6개 중 < 4개 양수 | Freeze 유지, Cold-start 재설계 |

### 17.5 Strategic Kill

첨부에서 인용:

> "Kill Criteria: Backtest expectancy goes negative when adding realistic slippage + fees → strategy doesn't work"

- Slippage + fees 포함 expectancy negative → 전략 자체 문제, 패턴 재수집
- User feedback로 signal 품질 개선 안 됨 (50 verdicts 후) → personalization thesis 실패

---

## 18. Non-Goals / Phase 2+ Deferred

### 18.1 Day-1 명시적 Non-Goals

| 항목 | 왜 | 어디로 |
|---|---|---|
| 자동 주문 실행 | Regulatory + execution quality 증명 필요 | Phase 3+ |
| 모바일 native app | PWA로 대체 | Phase 2+ (W-0087 freeze) |
| Cogochi personality (DOUNI 캐릭터) | Phase 1 Jin은 캐릭터 불필요, UI 노이즈 | Phase 2+ (W-0067 freeze) |
| RAG 서버 | 현재 retrieval로 충분 | Phase 2+ (W-0084 freeze) |
| Per-user LoRA | LightGBM baseline 확인 후 | Phase E (Layer C §9) |
| 다중 거래소 주문 연결 | Binance 1개로 고정 Day-1 | Phase 2+ |
| Multi-chain wallet | Minara 영역 | Phase 3+ |
| 50+ data source 직접 빌드 | Binance + Coinglass로 충분 | Phase 3+ (partnership) |
| 온체인 트레이드 실행 | Phase 3+ (Elsa x402 등) | Phase 3+ |
| API-only 유저 | 덱스 페르소나 Phase 3 | Phase 3+ |
| 초보자 교육 UI | 미나 페르소나 Phase 2 | Phase 2+ |
| `/market` (adapter 임대) | Gate 후 | Phase 2 |
| `/training` (LoRA UI) | LoRA > LightGBM 증명 후 | Phase 2+ |
| `/battle`, `/passport` | 엔터테인먼트/web3 | Phase 3+ |

### 18.2 Freeze List (Business Gate 통과 전 동결)

- W-0087 Mobile 추가 개선
- W-0067 Cogochi personality 확장
- W-0084 RAG 서버 라우트
- Personalization UX (UI-level)
- W-0045 Karpathy skills install
- W-0026 Memkraft memory integration
- 다수 contract boundary 정리 (traffic 발생 후)

**이유:** Flywheel이 닫히지 않으면 위 작업들이 표면적(maintenance cost)만 만든다.

### 18.3 영구 배제 (Never)

| 항목 | 왜 |
|---|---|
| 성과 수수료 | Regulatory + track record 부재 |
| Affiliate / paid ads | Positioning 충돌 |
| Influencer partnership | 신뢰 축 오염 |
| KOL 그룹 운영 | Cogochi는 tool, 시그널 방이 아님 |
| 블랙박스 시그널 | Reproducibility 원칙 위반 |

---

## 19. 원본 간 충돌 / 해결

이 문서 통합 중 발견한 원본 간 불일치와 채택 결정. Layer B §9 / Layer C §15 스타일과 동일.

### 19.1 Surface route — `/terminal`·`/lab`·`/dashboard` vs `/training`·`/performance`

- **v6 / v6_integrated 일부**: `/training`, `/performance` 언급
- **v7 + surfaces.md + Layer B §7**: `/terminal`, `/lab`, `/dashboard` (Day-1 canonical)

**해결:** **Layer B + v7 + surfaces.md 정본 = `/terminal` / `/lab` / `/dashboard`.** `/training`은 Phase 2+ deferred (§18.1). `/performance`는 기능으로만 살려서 `/dashboard` 내 섹션으로 흡수 (alert inbox 옆).

### 19.2 Pricing — $19 vs $29 vs $29/$79 vs $49-99

| 문서 | Pro 가격 |
|---|---|
| cogochi-v7.md §6 | $19/월 |
| WTD_Cogochi_Final_Design_v1.md §10 | $29/월 |
| YC S26 application v2 | $29 Pro / $79 Trader |
| business-viability-and-positioning.md | Pro $49-99 / Desk $2k-10k |

**해결:** **$19/월 Pro 단일 tier 채택** (v7 정본). 근거:
1. Jin 페르소나 = TradingView $15-30/월 쓰는 유저. $19는 TradingView와 비슷/약간 저렴으로 포지셔닝.
2. BEP 38명 (v7 §6.2) 충족 가능한 최저가.
3. $49-99는 DESK tier로 흡수 (Phase 2+).
4. $29/$79 two-tier는 결정 부담 증가 → Phase 2에서 Trader tier 도입 검토.

### 19.3 TAM — $28B vs $474B

- **v7 §6**: TAM ~$28B (크립토 AI 에이전트 시총)
- **YC application v2**: Trading bot market $474B (Mordor Intelligence 2025)

**해결:** **TAM = 크립토 선물 active retail trader 기반 계산** (§6.6):
- TAM: ~5M 유저 × $19/월 avg spend = $1.1B/year addressable
- SAM: ~500K (경력 trader) × $19 × 12 = $114M/year
- SOM Y1: ~25K × $19 × 12 = $5.7M ARR upper bound
- 현실 Y1 target: 1,000 Pro × $19 × 12 = $228K ARR

**$474B는 trading bot 전체 시장 (Mordor). Cogochi는 그 전체를 겨냥하지 않음.** 비교용으로만 유지, 투자 pitch에서만 사용 가능.

### 19.4 LoRA per-user vs LightGBM-first

- **YC application v2**: per-user LoRA가 핵심 차별화
- **WTD_Cogochi_Final_Design_v1.md**: "LLM never judges, LightGBM이 판단"
- **cogochi-v7.md §15**: Layer 6 LoRA는 Phase E

**해결:** **Phased approach**:
- Day-1: LightGBM (signals) + rule-first pattern definitions
- Phase 2 (D16 walk-forward pass 후): Per-pattern LoRA for chart reasoning
- **LLM은 parser + judge만.** 판단 자체 안 함.

YC pitch에서 "per-user LoRA"가 강조된 건 시장 차별화 메시지. 실제 구현 순서는 LightGBM → LoRA. 이건 충돌이 아니라 **단계 명시 부재로 생긴 혼동.** §16 로드맵에 반영.

### 19.5 페르소나 — Jin 단일 vs "every trader"

- **YC application v2**: "every trader"
- **v7 §5 + v6**: Jin 1명만 (미나 Phase 2, 덱스 Phase 3)

**해결:** **Jin 1명 Phase 1 단일 페르소나** (v7 정본). YC의 "every trader"는 market framing. 제품 결정은 Jin 중심.

### 19.6 Capture → Challenge 관계

- **v6 / WTD final design**: capture와 challenge를 혼용
- **Layer B §5.3 vs §5.4 + Layer C §15.10**: 명확히 분리 (capture = 저장된 증거, challenge = evaluated hypothesis)

**해결:** **Layer B 정본 분리 유지.** Layer A에서 표기 일관성 유지. Retrieval seed는 "capture의 similarity_seed 필드에 PatternDraft 저장" 구조 (Layer C §15.14).

### 19.7 AutoResearch Layer 수 — 3 vs 5 vs 6

- **첨부 피드백**: 3 AutoResearch layers (feature / sequence / LLM)
- **v6 / v6_integrated**: 5 methodologies
- **v7 §15**: 6-layer backend (Layer 0-6)

**해결:** **서로 다른 축**:
- "3 AutoResearch Layers" = retrieval 내부 계층 (Layer C §16.17)
- "5 Methodologies" = Paradigm Framework (feature similarity 내부)
- "6-layer backend" = Layer 0 (data) → Layer 6 (LoRA) full stack

충돌 아님. 각 문서에서 축 명시 필수.

### 19.8 Pattern family 명명

- **v6 / v7**: `tradoor-oi-reversal-v1`
- **WTD**: `tradoor_ptb_style`
- **Layer C §16.3**: `oi_reversal` (family) + `tradoor_ptb_style` (label)

**해결:** **Layer C 정본 2-level 네이밍:**
- `pattern_family`: 큰 분류 (예: `oi_reversal`)
- `pattern_label`: 구체 이름 (예: `tradoor_ptb_style`)
- `pattern_slug`: API용 unique ID (예: `tradoor-oi-reversal-v1`)

### 19.9 변동 데이터 (패턴 수, 블록 수)

- **v6**: 16 patterns, 29 blocks
- **v7 §23**: 15-layer scanner
- **Layer C §5 + §7.6**: 29 blocks, 92 features

**해결:** **Layer C §12 Implementation Status에만 기록**. Layer A에서는 "세부는 Layer C 참조" 명시. 변동 시 Layer C §12만 갱신.

### 19.10 "Minara와의 관계" 서술

- **v6**: 경쟁자
- **v7 §2**: "적이 아니라 보완재"

**해결:** **v7 정본 = Phased relationship**:
- Phase 1: 독립. 기능 겹침 없음.
- Phase 2: 잠재적 통합. Minara API를 데이터 소스로.
- Phase 3: 생태계. Cogochi per-user 모델 Minara Agent Factory 실행.

즉, Minara는 **카테고리 다름** (AI CFO vs Pattern Research OS).

---

## 20. Change Policy

1. **제품 정체성 (§1~§2, §14)은 핵심 변경 불가.** 변경 시 ADR 필수.
2. **Layer B 계약이 Layer A UX와 충돌하면 Layer B가 우선.** Layer A는 Layer B surface를 반영해야 함.
3. **Layer C 엔진이 Layer A의 retrieval UX를 제약하면 Layer A 수정.** 엔진이 맞출 수 없는 UX는 만들지 않는다.
4. **Intent 6개 (§9.3) 추가/제거는 breaking change.** Template 변경은 ADR.
5. **Decision HUD 4카드 규칙 (§10)은 절대 확장 금지.** 5번째 카드 추가 = 기존 하나 합치거나 버려야.
6. **Surface 추가/삭제는 Layer B + Layer A 동시 편집.** 병렬 문서 금지.
7. **Pricing/tier 변경 시 §6 Business Model + §19.2 충돌 기록 업데이트.**
8. **Phase 2+ → Day-1로 승격 (§18)**은 Business Gate 통과 후에만.
9. **Non-Goals (§18)는 선언. 추가는 자유롭지만 제거는 ADR.**
10. **Kill Criteria (§17) 완화는 금지.** 강화는 자유.

---

*Cogochi Product PRD v1.0 | 2026-04-25 | Layer A canonical. 제품 정체성의 정본. Layer B (surfaces) + Layer C (engine) 참조로 엔지니어링 세부 위임.*
