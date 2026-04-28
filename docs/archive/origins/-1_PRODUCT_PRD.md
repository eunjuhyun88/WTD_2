# -1 — Product PRD (Why & What)

**Owner:** Founder / CPO
**Audience:** 모든 agent, 신규 onboarding 인력, 외부 파트너
**Depends on:** 없음 (이 문서가 entry point)
**Read before:** `00_MASTER_ARCHITECTURE.md` 와 그 이하 모든 문서

> **이 문서의 역할은 "왜 만드는가, 누구를 위해, 무엇을 팔지 않는가"의 정본.**
> 엔지니어링 세부는 `00`~`07`에 위임. 이 문서가 흔들리면 나머지 7 문서가 방향을 잃는다.

---

## 0. 읽는 순서

| 작업 | 진입 섹션 |
|---|---|
| 제품이 뭔지 한 줄 | §1 |
| 무엇을 팔지 않는지 | §2 |
| 누구를 위한 건지 | §3 |
| 사업이 되는가 | §4 |
| 어떻게 돈 받는가 | §5 |
| 누구와 싸우는가 | §6 |
| 어떻게 살아남는가 (해자) | §7 |
| 표면(surface) 매핑 | §8 |
| 모드/HUD/인텐트 (UX 정본) | §9 |
| 운영 게이트 (KPI) | §10 |
| 성공/실패 판정 | §11 |
| Non-Goals | §12 |
| 원본 충돌 해결 이력 | §13 |
| Change Policy | §14 |

---

## 1. Product Definition

### 1.1 한 줄 정의

> **Cogochi는 트레이더의 감각을 패턴 객체로 저장하고, 시장 전체에서 상태기계로 추적하고, 결과 ledger로 검증해, 실행 가능한 시그널로 승격시키는 엔진이다.**

`00_MASTER_ARCHITECTURE.md` §1.1과 동일. 흔들지 않는다.

### 1.2 제품 카테고리 확정

**✅ Pattern Research Operating System (Trader Memory OS)**

이 카테고리는 현재 직접 경쟁자가 없다. CoinGlass/Hyblock는 데이터 터미널, Surf는 요약 엔진, TradingView는 범용 차트, 시그널 그룹은 블랙박스. 어느 것도 "내가 본 패턴을 저장하고 다시 찾고 검증한다"를 제품의 본질로 두지 않는다.

### 1.3 두 축 (양쪽 다 있어야 제품)

```
Axis A — Detection (감지)
  Plane L1-L4: feature → state machine → 현재 phase 추적
  답하는 질문: "지금 이 종목 뭐 하고 있는가?"

Axis B — Retrieval (검색)
  Plane L5: candidate → sequence match → rerank → judge
  답하는 질문: "내가 저장한 이거랑 비슷한 거 있나?"
```

두 축은 같은 feature store 위에서 직교한다. 어느 한 쪽만 있으면:
- A만: 또 하나의 스캐너. CoinGlass와 차별 없음.
- B만: 검색 엔진은 살아 있지만 actionable하지 않음.

**둘이 결합되어야 "기억할 수 있고, 다시 찾을 수 있고, 검증되는" 워크벤치가 된다.**

### 1.4 흔들지 않는 5가지 믿음

1. **Pattern semantics는 rule-first.** AI가 phase를 판정하지 않는다. AI는 parser와 judge만. 이유: 재현성, 감사 가능성, 학습 데이터 레버리지.
2. **Save Setup은 side action이 아니라 canonical capture event.** 유저가 저장하는 그 순간이 훈련 데이터를 만드는 순간이다.
3. **측정 없이 배포 없다.** 모든 패턴은 4단계 validation ladder (in-sample → walk-forward → paper → live) 통과해야 실전 투입.
4. **검색 정확도 = 제품 품질.** Top-5 precision이 60% 이상 안 나오면 유저는 두 번째 검색을 안 한다.
5. **해자는 모델이 아니라 judgment ledger.** 유저가 valid/invalid/near_miss 누른 데이터가 누적되는 것이 유일한 복제 불가 자산.

`00_MASTER_ARCHITECTURE.md` §2의 7개 설계 원칙과 정합한다.

---

## 2. What Cogochi is NOT

방어적 선언. 잘못된 카테고리 인식이 발견되면 이 표 즉시 인용.

| 카테고리 | 아님 이유 | 잘못 인식되면 |
|---|---|---|
| ❌ AI 시그널 SaaS | 블랙박스 시그널 판매 아님. 투명한 evidence + 재현 가능 검증이 본질 | Freeport / 3Commas와 동일하게 평가됨 |
| ❌ AI 차트 분석 툴 | 차트 해석은 부산물. "저장→검색→검증" 루프가 본질 | "또 하나의 ChatGPT 차트 plugin" |
| ❌ 트레이딩 봇 | 자동 주문 실행은 Phase 3+ 별도 track | 규제 리스크 + 성과 수수료 모델 압박 |
| ❌ TradingView 대체 | 범용 차트 경쟁 안 함. niche는 pattern research | 기능 parity 압박 (그리기 도구, 200+ 인디 등) |
| ❌ 투자 자문 | Regulatory boundary 밖 | KYC/라이선스 요구 |
| ❌ 백테스트 툴 | 실시간 phase 추적이 본질, 과거 탐색은 retrieval의 부산물 | 정적 도구로 인식 |
| ❌ 데이터 터미널 (CoinGlass/Hyblock) | 데이터 보여주기 아님. 저장/검색/학습이 본질 | 데이터 source 경쟁에 끌려 들어감 |
| ❌ 초보자 교육 플랫폼 | Phase 1 유저는 숙련 트레이더만 | "RSI가 뭐예요" 질문에 대응해야 함 |

`00_MASTER_ARCHITECTURE.md` §1.3의 Non-Goals와 정합.

---

## 3. User — Phase 1: Jin (단일 페르소나)

> **Phase 1은 진(Jin) 한 명만.** 미나(초보)는 Phase 2, 덱스(파워유저/API-only)는 Phase 3.

### 3.1 Profile

| 항목 | 값 |
|---|---|
| 나이 | 28 |
| 경력 | 크립토 2-3년 |
| 거래소 | Binance/Bybit perpetual futures |
| 현재 지출 | TradingView $15-30/월, CoinGlass 가끔 |
| AI 사용 | ChatGPT/Claude로 가끔 차트 해석, 결과 매번 다름에 불만 |
| 복기 습관 | 있음 (스크린샷, 메모 앱) — 다시 못 찾음 |
| 본업 | IT/금융/스타트업 |

### 3.2 JTBD

> **"내 트레이딩 판단의 정확도를 수치로 증명하면서 높이고 싶다."**

분해:
- "수치로 증명" → ledger 필요
- "높이고 싶다" → 학습 루프 필요
- "내" → 개인화 필요 (generic 시그널 거부)

### 3.3 Top 3 Pain

| # | Pain | 심각도 | Cogochi가 푸는 방식 |
|---|---|---|---|
| 1 | "AI 분석이 매번 달라. 학습이 안 됨" | Critical | rule-first engine + verdict ledger |
| 2 | "여러 도구 왔다갔다 귀찮음" (TradingView+CoinGlass+노션) | Significant | 3-surface workbench |
| 3 | "복기 안 쓰면 안 남는데 쓰기 귀찮음. 써도 다시 못 찾음" | Significant | Save Setup canonical capture + Retrieval |

### 3.4 Aha Moment

**"AI가 내가 저장한 패턴으로 6년치 데이터에서 유사 사례 287건 찾아줬고, 그 중 68%가 실제로 움직였다."**

첫 Aha = `/lab` evaluate 첫 실행 후 instances 테이블 확인. 두 번째 Aha = alert 받고 차트를 열었을 때 "내가 저장한 그 패턴과 똑같이 생겼다"는 인식.

### 3.5 Pro 전환 트리거

```
Free: 3 captures, 5 symbols, 10 parser calls/month
  ↓ (3개 소진)
"더 저장하고 싶다" / "전 종목 스캔하고 싶다"
  ↓
Pro $29/월
```

### 3.6 배제 페르소나

| 페르소나 | 왜 배제 | 해제 시점 |
|---|---|---|
| 미나 (초보) | 교육 콘텐츠 필요. Cogochi는 tool, 강사 아님 | Phase 2+ |
| 덱스 (파워유저/퀀트) | API-only 원함. Cogochi는 UI-heavy | Phase 3+ (`07_IMPLEMENTATION_ROADMAP.md` Track B) |
| "RSI가 뭐야?" | 영구 배제 | — |
| "봇 만들어줘" | Cogochi는 연구 도구, 자동매매 아님 | Phase 3+ on-chain track |

---

## 4. Business Viability (냉정 평가)

### 4.1 시장별 viability

| 세그먼트 | 평가 | 근거 |
|---|---|---|
| 대중형 SaaS | **약함** | CoinGlass / Hyblock / TrendSpider가 데이터 터미널 시장 포화 |
| 고급 개인 트레이더 | **강함** | ARPU $30-100, niche, retention 우월 |
| 팀/데스크 워크스페이스 | **가장 강함** | ARPU $200-1000+, 공용 pattern library가 lock-in |
| 엔진 marketplace upstream | Phase 3+ | Cogochi L1 protocol과 별도 track |

### 4.2 시장 규모 (정직)

- **TAM**: 글로벌 크립토 선물 active retail trader ~5M (Binance 275M × futures active ~2%) [estimate]
- **SAM**: "수년 경력 + 자기 패턴 있는" 트레이더 ~500K (10%)
- **SOM Y1**: ~25K paying conversion (5% of SAM) → $25K × $29 × 12 ≈ **$8.7M ARR upper bound**
- **현실 Y1 target**: BEP 38명 → 1,000 Pro users 12개월 → **$348K ARR**

YC application의 "$474B trading bot market" 인용은 framing 용도. **Cogochi는 그 전체를 겨냥하지 않음.**

### 4.3 취약한 가정 3개 (반드시 검증)

1. **Pro 전환율 20%+** [assumption] — realistic base case는 10%. Kill at M3 if < 5%.
2. **Monthly churn 12.5%** [estimate] — bear market 시 20%+. Regime별 cohort 분석 필수.
3. **검색 정확도 top-5 precision 60%+** — 안 나오면 retention/conversion 동시 무너짐. `07_IMPLEMENTATION_ROADMAP.md` Slice 6 Gate.

---

## 5. Pricing & Tier Plan

### 5.1 Tier (Business Gate 통과 후 활성화)

| Tier | 가격 | 대상 | 핵심 가치 |
|---|---|---|---|
| FREE | $0 | 모두 | 검증 통과 패턴 실시간 phase, parser 10/mo, capture 5/day |
| **PRO** | **$29/월** (or $290/년) | Jin 페르소나 | Save Setup 무제한, 200 search/day, Telegram alert, verdict ledger |
| TEAM (Phase 2+) | $199-999/월 | 팀/데스크 | 공유 pattern library, API, custom benchmark pack |
| FINE-TUNE (Phase 3+) | $99/유저/월 | Pro의 advanced | Personal LoRA adapter, chart interpretation model |

`06_DATA_CONTRACTS.md` §7.2 Rate Limits 표와 정합.

### 5.2 Unit Economics [estimate]

`07_IMPLEMENTATION_ROADMAP.md` §5.3 Cost Model 인용:

| Component | Per active user / month |
|---|---|
| LLM parser | $1.50 |
| LLM judge (optional) | $1.20 |
| Storage (DB + feature history) | $0.50 |
| Compute (scan cycles) | $1.00 |
| **Total cost** | **~$5/user** |

Pro $29 → **gross margin ~83%**. 이 이하로 떨어지면 tier 재설계.

### 5.3 BEP

월 고정비 ~$700/월 (Vercel + Railway + Supabase + GPU + 데이터 API + 기타) [estimate]

```
BEP = $700 / ($29 × 0.83) = ~30 Pro users
```

보수 추정으로 **38 Pro users**.

### 5.4 수익 모델 결정 (영구 금지)

| 항목 | 왜 금지 |
|---|---|
| ❌ 성과 수수료 | Regulatory + track record 부재 |
| ❌ Affiliate / paid ads | Positioning 충돌 |
| ❌ Influencer partnership | 신뢰 축 오염 |
| ❌ KOL 유료방 | Cogochi는 tool, 시그널 방이 아님 |
| ❌ 블랙박스 시그널 | Reproducibility 원칙 위반 |

GTM 채널은 **content only**: 공개 reproducible report + GitHub.

### 5.5 Cold-start Strategy

플라이휠은 라벨 0에서 시작. 두 lane:

**Lane 1 — Founder bulk import**
창업자가 본인 매매 노트를 CSV bulk로. 출시 전 **500 capture 시드** target. 경로: `/import` (internal).

**Lane 2 — Public reproducible reports**
매 refinement run 결과를 reject 포함 공개 URL로 발행. 콘텐츠 + 신뢰 + labeler 유입의 단일 채널.

두 lane은 **제품의 일부**. 별도 프로젝트 아님.

---

## 6. Competitive Positioning

### 6.1 Map

```
                AI pattern learning / 개인화
                          ↑
                          │
 Signal SaaS              │       Cogochi ★
 (Freeport, True AI,      │      (retrieval + ledger +
  Walbi)                  │       phase state machine)
                          │
   ←──────────────────────┼──────────────────────→
   Generic                │       Personalized
   (all users same)       │      (your labels → your model)
                          │
 Rule bots                │   CoinGlass, Hyblock,
 (3Commas, Cryptohopper)  │   TradingView (data terminal,
                          │    학습 없음)
                          ↓
                Data terminal / 학습 없음
```

Cogochi는 **AI learning + personalized** 사분면에 혼자 있다.

### 6.2 직접 경쟁자 표

| Competitor | 강점 | 우리 대비 공백 |
|---|---|---|
| **TradingView** | 드로잉, 200+ 인디 | Pattern flywheel 없음. Retrieval 없음 |
| **CoinGlass** | OI/펀딩/liq 데이터 최고 | 패턴 프레임워크 없음. 학습 루프 없음 |
| **Hyblock** | Real-time orderflow | Pattern capture 없음. 복기 자산화 없음 |
| **Surf AI** | 데이터 요약 + 설명 잘함 | Retrieval 아닌 summarization. phase DB 없음. sequence matcher 없음 |
| **Minara** | 50+ data source, agent factory | Per-user 학습 없음. 트레이딩 패턴 검증 프레임워크 없음 |
| **Freeport (YC W26)** | Twitter narrative signals | 같은 시그널 모두에게. No personalization |
| **True AI ($30M raise)** | AI crypto trading 펀딩 받음 | Generic model. No per-user learning |
| **3Commas / Cryptohopper** | 안정적 실행 | Fixed rules. No scoring/retrieval |
| **TrendSpider** | 자동 인식 + 200+ 인디 | Stock focus. Crypto perp 미약. No user label loop |

### 6.3 Wedge

**Chart-first terminal + 구조화 pattern capture + OI/펀딩 인지 phase 모델 + 4-stage retrieval + 사용자 라벨 회수 플라이휠**

이 5개 조건을 동시에 만족하는 제품은 현재 없음. 개별 조각은 있지만 플라이휠로 연결한 곳은 없음.

### 6.4 Surf AI에 대한 직답

질문: "Surf같은 게 이미 있는데 진짜 엔진이 특별하게 잘 찾아야겠는데"

**답:** Surf는 데이터 요약 엔진 (설명형). Cogochi는 패턴 검색 엔진 (retrieval형). 완전히 다른 구조.

| 축 | Surf | Cogochi |
|---|---|---|
| 본질 | 요약/해석 | 검색/비교 |
| 핵심 알고리즘 | LLM summarization | Sequence matching + reranker (`03_SEARCH_ENGINE.md`) |
| 학습 루프 | 없음 | Verdict → reranker (Stage 3) |
| Phase state model | 없음 | 5-phase (`01_PATTERN_OBJECT_MODEL.md` §8) |
| Negative set | 없음 | 필수 수집 (`03_SEARCH_ENGINE.md` §8) |
| Moat | 데이터 수집량 | Label 누적량 |

**"잘 설명하는 AI" vs "잘 찾아주는 엔진".** 설명보다 검색이 훨씬 어렵고 훨씬 가치 있다.

---

## 7. Moat Design

### 7.1 3-Layer Moat (`00_MASTER_ARCHITECTURE.md` §8 정합)

#### Layer 1 — Data moat (개인 라벨)
- Save Setup → pattern object + feature snapshot + chart snapshot + phase path + user note
- User verdict (valid / invalid / near_miss / too_early / too_late)
- Near-miss / failure cluster
- 경쟁사가 수집 불가능한 trader intent label

#### Layer 2 — Sequence moat (알고리즘)
- Phase order는 벡터검색으로 복제 어려움
- `03_SEARCH_ENGINE.md` §4 Phase-Path Edit Distance 알고리즘
- 경쟁사(Surf, CoinGlass)는 요약/데이터만, sequence matcher 없음

#### Layer 3 — Feedback loop moat (시간)
```
user judgment
  → reranker training data
  → better candidates (NDCG@5 ↑)
  → better judgment
  → ...
```
이 루프가 **90일 돌면** 신규 경쟁사는 따라올 수 없다. 라벨이 시간 순서로 누적된 것을 시간 외로 만들 수 없기 때문.

### 7.2 약점 (인정)

- **첫 90일은 moat 없음.** Cold-start 두 lane (§5.5)이 그 공백을 메꾼다.
- **Pattern definition 자체는 공개 가능.** 데이터가 없으면 복제 어려움 (rule은 따라할 수 있지만, ledger가 없으면 검증 불가).

---

## 8. Surfaces — 3 Surface + Landing

### 8.1 Day-1 Surface 매핑

| Route | 역할 | 핵심 verb | Engine 책임 |
|---|---|---|---|
| `/` | Landing | 전환 CTA | — |
| `/terminal` | **관찰 + Capture** | Capture | `06_DATA_CONTRACTS.md` §3.4 Capture Endpoint |
| `/lab` | **평가 + Scan + Train seed** | Scan, Judge (post-hoc) | `02_ENGINE_RUNTIME.md` §3 Scanner |
| `/dashboard` | **Alert inbox + Verdict** | Judge (live), Deploy 모니터링 | `06_DATA_CONTRACTS.md` §3.5 Verdict Endpoint |

### 8.2 5 Verbs와 Surface

`00_MASTER_ARCHITECTURE.md`의 product loop:

```
Capture (terminal) → Scan (lab) → Judge (dashboard) → Train (worker, internal) → Deploy (alert policy, internal)
```

5 verbs는 사용자가 직접 보는 행위 단위, 7-Layer는 시스템 책임 단위. 두 축은 직교.

### 8.3 Phase 2+ Deferred Surface

| Route | 역할 | 해제 조건 |
|---|---|---|
| `/market` | 검증된 adapter 임대 (15% take rate) | Business Gate 통과 + 3+ validated patterns |
| `/training` | Per-user LoRA fine-tuning UI | LightGBM baseline 대비 +5%p 입증 |
| `/battle` | Historical era battle | 엔터테인먼트 기능 |
| `/passport` | ERC-8004 on-chain track record | Web3 track 게이트 통과 |

Day-1에 절대 안 만든다. Business Gate (§10.4)가 우선.

### 8.4 Surface Rules

`05_VISUALIZATION_ENGINE.md` §10 Component Library와 정합:
- Surface는 engine artifact만 소비. 독립 계산 금지.
- UI state는 `app/`, domain logic은 `engine/`. 재구현 금지.
- Vocabulary 통일: `capture`, `challenge`, `pattern`, `phase`, `instance`, `evaluate`, `verdict`, `watching`

---

## 9. UX Foundations (Mode / Intent / HUD)

> **이 섹션은 UX 정본.** `05_VISUALIZATION_ENGINE.md`가 엔지니어링 명세, 이 §9가 제품 결정.

### 9.1 3-Mode 분리 (Observe / Analyze / Execute)

#### 왜 3-Mode인가

`05_VISUALIZATION_ENGINE.md` §1 진단 인용: "Analyze / Execute / Summary / Evidence가 동일 위계로 소리침". 한 화면에서 여러 작업 단계가 동시에 활성화되는 게 근본 결함.

#### 모드 정의

| Mode | 목적 | 주 영역 비율 | 활성 verb |
|---|---|---|---|
| **Observe** | 빠르게 여러 종목 훑기 | 차트 100%, HUD/workspace 접힘 | (관찰만) |
| **Analyze** | 한 종목 깊게 연구 | 차트 50% / HUD 25% / workspace 25% | Capture, Judge (post-hoc) |
| **Execute** | 진입/손절/타겟 확정 | 차트 60% / Execution board 30% | (Day-1 외부 거래소로 이동) |

#### 모드 전환

- Observe → Analyze: 심볼 클릭 또는 키 `A`
- Analyze → Execute: Decision HUD `Execute` 버튼
- Execute → Observe: 실행 완료 또는 취소

URL: `?mode=observe|analyze|execute` (deep-link 가능, 새로고침 시 유지)

### 9.2 6 Intent → 6 Template

`05_VISUALIZATION_ENGINE.md` §2~§3 정합:

| Intent | 자연어 예시 | 검색 유발 | Template |
|---|---|---|---|
| WHY | "왜 떨어졌냐" | No | event_focus |
| STATE | "지금 매집이냐" | No | state_view |
| COMPARE | "TRADOOR랑 비슷?" | Yes | compare_view |
| SEARCH | "비슷한 거 찾아줘" | Yes | scan_grid |
| FLOW | "세력 들어왔냐" | Maybe | flow_view |
| EXECUTION | "진입 어디?" | No | execution_view |

#### Highlight Rules (절대)

1. **하나의 요청 = 하나의 시각화.** 다중 차트 겹치기 금지 (compare_view 제외).
2. **강조는 항상 1개 primary + 2 secondary + 나머지 muted.**
3. **숫자는 숨기고 구조를 보여라.** Raw value는 Analyze mode 하단 Evidence Table에서만.
4. **유저가 요청한 데이터를 그대로 다 그리면 안 된다.** Intent에 맞는 시각화만.

`05_VISUALIZATION_ENGINE.md` §4 Highlight Planner와 정합.

### 9.3 Decision HUD — 5-Card Rule

`05_VISUALIZATION_ENGINE.md` §7 정합. **Analyze mode 오른쪽 HUD는 정확히 5개 카드.**

| 카드 # | 내용 | 최대 항목 |
|---|---|---|
| 1 | **Pattern Status** (Pattern, Phase, Confidence) | — |
| 2 | **Top Evidence** (현재 phase의 충족 signal 상위 3) | 3 |
| 3 | **Risk** (실패 시나리오 / macro 역풍) | 3 |
| 4 | **Next Transition** (advance / invalidation 조건) | 2 |
| 5 | **Actions** (Save Setup / Compare / Explain in AI) | 3 버튼 |

#### 금지 목록 (HUD에 절대 안 넣음)

| 금지 항목 | 어디로 가야 하나 |
|---|---|
| Raw numeric table (OI=18.2, funding=-0.018 같은 표) | Analyze mode 하단 Evidence Table |
| Entry/Stop/Target 가격 | Execute mode |
| Score number 단독 카드 | Card 1 Pattern Status에 통합 |
| Leader / Venue / Context | 헤더 또는 settings |
| Detail Panel + AI Detail 동시 노출 | 슬라이드오버 (버튼) |

### 9.4 Layout Rule — IDE-style Split Pane

`05_VISUALIZATION_ENGINE.md` §6 정합.

```
┌────────────────────────────────────────────┬──────────────────┐
│         MAIN CHART (70%)                   │   DECISION HUD   │
│  candles + OI/funding/CVD panes           │   (20% fixed)    │
├────────────────────────────────────────────┴──────────────────┤
│       ANALYZE WORKSPACE (bottom 30%, resizable)              │
│  Phase Timeline | Evidence | Compare | Ledger | Judgment    │
└────────────────────────────────────────────────────────────────┘
```

- Divider drag 가능 (좌우/상하)
- Min size: HUD 240px, main 400px
- Double-click: reset to default
- Persistence: localStorage + user profile
- Mobile: split disabled, collapse buttons로 대체

### 9.5 Free-Form Floating Canvas는 잘못된 방향

피드백 인용:
> "free-move canvas는 사용자가 원했던 IDE split-pane이 아니다."

**결정:** Free-form floating canvas 폐기. IDE split-pane이 정본.

---

## 10. Operating Gates & Metrics

### 10.1 NSM — Weekly Completed Research Sessions

**정의:** 한 주에 한 명의 유저가 아래 셋을 모두 완료한 경우 1 session.
1. Terminal에서 pattern 구성 → Challenge 저장
2. Lab에서 evaluate 실행 → 결과 확인
3. 실시간 alert 수신 → verdict 제출

**M3 목표:** 500 sessions/week
**Kill:** < 140 sessions/week

**왜 이 NSM인가:** 세 단계 묶음 = 루프가 실제로 닫혔다는 증거. Capture 단독, Alert 단독은 게이밍 가능.

### 10.2 Input Metrics (`07_IMPLEMENTATION_ROADMAP.md` §5.1과 정합)

| # | 지표 | M3 Green | M3 Yellow | M3 Red (kill) |
|---|---|---|---|---|
| I1 | Weekly Active Analysts | ≥ 200 | 100-199 | < 100 |
| I2 | Sessions per WAA | ≥ 2.5 | 1.5-2.4 | < 1.5 |
| I3 | Save conversion (view → save) | ≥ 20% | 10-19% | < 10% |
| I4 | Verdict rate (alert → judgment) | ≥ 30% | 15-29% | < 15% |
| I5 | D7 retention | ≥ 30% | 15-29% | < 15% |
| I6 | Hit rate delta (post-refinement) | ≥ +5%p | +2-4%p | < +2%p |

Red 상태 2주 지속 → 해당 slice 재설계.

### 10.3 디버깅 트리

```
NSM 하락
  ├── I1 ↓ → 유입 문제 → onboarding/GTM
  ├── I2 ↓ → 가치 체감 부족 → retrieval 품질 / UX 마찰
  ├── I3 ↓ → capture UX 마찰 → friction 제거
  ├── I4 ↓ → verdict UX 문제 → 동선 단축
  ├── I5 ↓ → 장기 가치 부족 → I6 확인
  └── I6 정체 → ML/reranker 파이프라인 → negative set / SIGNAL_TO_RULES 재검토
```

### 10.4 Business Gate (6-KPI)

사업화 작업 (가격 변경/마케팅/확장)은 아래 모두 양수가 되기 전까지 **동결**.

1. `captures_per_day_7d > 0`
2. `captures_to_outcome_rate > 0.9`
3. `outcomes_to_verdict_rate > 0.5`
4. `verdicts_to_refinement_count_7d > 0`
5. `active_models_per_pattern[oi_reversal_v1] >= 1`
6. `promotion_gate_pass_rate_30d > 0`

의미: 플라이휠이 구조적으로 닫혔다는 관측 증거. 게이트 전 GTM은 비용만 만든다.

### 10.5 Engine Health (`07_IMPLEMENTATION_ROADMAP.md` §5.2 정합)

| Metric | Target | Alert |
|---|---|---|
| Scan latency p99 | < 5s | > 30s |
| State conflict rate | < 1% | > 5% |
| Parser schema compliance | ≥ 95% | < 80% |
| Sequence matcher hit@5 | ≥ 60% | < 40% |
| Reranker NDCG@5 vs baseline | ≥ +0.05 | < +0.02 |
| Outcome job SLA | ≤ 1h past window | > 6h past |

---

## 11. Success / Kill Criteria

### 11.1 M3 Success (3 months from launch)

`07_IMPLEMENTATION_ROADMAP.md` §11 인용:

- ✅ Core loop closed: capture → scan → candidate → verdict → refinement
- ✅ Durable state plane (Slice 2)
- ✅ Parser in production with 95%+ schema compliance (Slice 3)
- ✅ 4-stage search pipeline (at least stage 1-3)
- ✅ 6-template visualization router (Slice 7)
- ✅ 200+ weekly active analysts
- ✅ 500+ verdicts in ledger
- ✅ Reranker deployed (shadow → primary)
- ✅ Hit rate delta ≥ +5%p post-refinement

**Miss any 2 → re-evaluate category positioning or kill.**

### 11.2 Slice별 Kill Criteria

`07_IMPLEMENTATION_ROADMAP.md` §2 인용:

| Slice | Kill Trigger |
|---|---|
| 1 — Contract Cleanup | 2주 초과 시 middleware 추가로 blast radius 줄이기 |
| 2 — Durable State | 7일 후 state conflict rate > 10% → 단일 worker sharding |
| 3 — AI Parser | 100 sample 후 schema compliance < 80% → schema 간소화 |
| 4 — Save Setup Capture | M1까지 Save conversion < 10% → onboarding 재설계 |
| 5 — Split Ledger | Migration 5%+ row drop → 재설계 |
| 6 — Search Engine | Manual eval < 40% → feature set 점검 |
| 7 — Visualization Router | Time-to-decision 악화 → 단일 template + HUD로 roll back |
| 8 — Verdict Loop | 2주간 verdict rate < 15% → UX fundamentally wrong |
| 9 — Reranker | NDCG improvement < 0.02 → feature set 재검토 |
| 10 — Personal Variants | Pro user variant 생성률 < 10% → 가치 검증 실패 |
| 11 — Multi-TF Search | 3 TF normalize precision < 50% → scope 좁힘 |

### 11.3 Strategic Kill (영구)

- Slippage + fees 포함 expectancy negative → 전략 자체 문제. 패턴 재수집.
- 50 verdict 후 user feedback로 signal 품질 개선 안 됨 → personalization thesis 실패.
- M6 MRR < $1,000 → Pivot or Kill (`07_IMPLEMENTATION_ROADMAP.md` §5.1 Red 기준).

---

## 12. Non-Goals

### 12.1 Day-1 명시적 Non-Goals (`07_IMPLEMENTATION_ROADMAP.md` §10 정합)

| 항목 | 어디로 |
|---|---|
| TradingView feature parity | 영구 |
| Mobile native app | Phase 2+ (responsive web으로 충분) |
| On-chain 자동매매 실행 | Phase 3+ (별도 track) |
| Multi-exchange aggregation (Binance perp 외) | Phase 2+ |
| Voice agent interface | Phase 3+ |
| Customer-facing LLM chat (parser 외) | 영구 |
| Real-time collaborative editing | Phase 3+ |
| Customer billing UI | 영구 (Stripe 사용) |
| Own fine-tuning infrastructure | Phase 3+ (Anthropic/OpenAI fine-tune API 사용) |
| Cogochi personality (DOUNI 캐릭터) | Phase 2+ (Phase 1 Jin은 캐릭터 불필요) |
| RAG 서버 | Phase 2+ (현재 retrieval로 충분) |
| Per-user LoRA | Phase E (LightGBM baseline 입증 후) |
| `/market` adapter 임대 | Phase 2 (Business Gate 통과 후) |
| `/training` LoRA UI | Phase 2+ |
| `/battle`, `/passport` | Phase 3+ |
| 50+ data source 직접 빌드 | Phase 3+ (partnership) |
| API-only 유저 (덱스 페르소나) | Phase 3+ |

### 12.2 Freeze List (Business Gate 통과 전 동결)

- W-0087 Mobile 추가 개선
- W-0067 Cogochi personality 확장
- W-0084 RAG 서버 라우트
- Personalization UX (UI-level)
- W-0045 Karpathy skills install
- W-0026 Memkraft memory integration
- 다수 contract boundary 정리 (traffic 발생 후)

이유: Flywheel이 닫히지 않으면 위 작업들이 표면적(maintenance cost)만 만든다.

### 12.3 영구 배제 (Never)

- 성과 수수료 모델
- Affiliate / paid ads
- Influencer partnership / KOL 유료방
- 블랙박스 시그널 SaaS
- 초보자 교육 컨텐츠 직접 제작

---

## 13. 원본 충돌 해결 이력

이 문서 작성 중 발견한 원본 간 불일치와 채택 결정. 향후 문서 변경 시 이 표 참조.

### 13.1 Plane 수 — 6 vs 7

- **이전 `engine-runtime-v1.md`**: 6 Plane + Retrieval append (총 7)
- **`00_MASTER_ARCHITECTURE.md` §3**: L1~L7 (7-Layer)

**해결:** **7-Layer 정본 채택.** Refinement Plane을 별도 L7로 분리하는 게 깔끔. `engine-runtime-v1.md` deprecated.

### 13.2 Pricing — $19 vs $29

- **이전 Layer A (`product-prd-v1.md`)**: $19/월
- **`07_IMPLEMENTATION_ROADMAP.md` §5.3**: $29/월 BEP 계산
- **`04_AI_AGENT_LAYER.md` §10**: $29 cost model 기준 83% margin

**해결:** **$29/월 정본 채택.** 7-Doc cost model이 일관되게 $29 가정. 변경 시 $5 cost / $29 = 17% 비율 유지를 깨야 함. Jin 페르소나 (TradingView $15-30/월) 범위와도 정합.

### 13.3 Reranker 학습 임계 — 100 vs 50

- **이전 Layer A**: 100+ verdict 후 reranker 학습
- **`04_AI_AGENT_LAYER.md` §8 Phase B**: 200+ parser drafts 수집 후
- **`07_IMPLEMENTATION_ROADMAP.md` Slice 9**: 50+ verdicts 후 (Slice 8 완료 조건)

**해결:** **50+ verdicts 정본 채택** (Slice 9 precondition). Bootstrap 시 auto_verdict로 시작, 50 user verdict 누적 시 supervised로 전환. `03_SEARCH_ENGINE.md` §5.2 정합.

### 13.4 Final similarity 가중치

- **이전 Layer C**: `0.35 × feature + 0.40 × sequence + 0.15 × outcome + 0.10 × text`
- **`03_SEARCH_ENGINE.md` §7**: `0.40 × sequence + 0.40 × rerank + 0.15 × feature_vec + 0.05 × LLM_judge`

**해결:** **`03_SEARCH_ENGINE.md` 정본 채택.** Reranker가 separate term이고 LLM judge 비중이 더 보수적인 게 옳음. 단 outcome_context는 reranker feature로 흡수 (`03 §5.1` `peak_return_pct`, `hit_rate_for_family`).

### 13.5 Decision HUD 카드 — 4 vs 5

- **이전 Layer A**: 4 카드 (Current State / Top Evidence / Risk / Actions)
- **`05_VISUALIZATION_ENGINE.md` §7**: 5 카드 (Pattern Status / Top Evidence / Risk / Next Transition / Actions)

**해결:** **5 카드 정본 채택.** Next Transition은 advance/invalidation 조건 명시이므로 누락하면 유저 의사결정 incomplete. 단 카드별 max 3 항목 규칙은 유지.

### 13.6 페르소나 — Jin 단일 vs "every trader"

- **YC application**: "every trader"
- **v7 / `00_MASTER_ARCHITECTURE.md`**: Jin 1명 (Phase 1)

**해결:** **Jin 1명 단일 페르소나** (§3). YC framing은 market sizing 용도, 제품 결정은 Jin 중심.

### 13.7 LoRA per-user vs LightGBM-first

- **YC application**: per-user LoRA가 핵심 차별화
- **`04_AI_AGENT_LAYER.md` §8**: Phase A (no fine-tuning) → B (parser fine-tune) → C (KTO reranker) → D (multimodal)

**해결:** **Phased approach 채택**:
- Day-1: LightGBM (signals) + rule-first patterns
- Phase B (3-6 months): Parser fine-tune
- Phase C (6-12 months): Reranker KTO
- Phase D (12+ months): Personal LoRA + multimodal

YC pitch 강조는 시장 차별화 메시지. 실제 구현은 단계 명시.

### 13.8 Capture ↔ Challenge 관계

- **v6 / WTD final design**: 혼용
- **`01_PATTERN_OBJECT_MODEL.md` §1**: 명확히 분리

**해결:** **객체 계층 정본**:
```
PatternDraft (AI 생성) → PatternCandidate (review 대기) → PatternObject (immutable) → PatternRuntimeState (per symbol × pattern)
```

`capture` = chart range 저장된 증거. `challenge` = evaluated hypothesis (pattern_hunting 또는 classifier_training). `PatternDraft`는 parser 출력의 별도 객체.

### 13.9 TAM — $28B vs $474B

- **v7 §6**: TAM ~$28B (크립토 AI 에이전트 시총)
- **YC application**: Trading bot market $474B

**해결:** **§4.2 niche-based 계산 채택**: 5M active retail × $29/mo addressable. SOM Y1 ~$8.7M ARR upper bound. $474B는 framing 용도로만 인용 가능.

### 13.10 free-form floating canvas vs IDE split-pane

- **최근 시도**: free-move floating canvas (스크린샷 기준 망함)
- **`05_VISUALIZATION_ENGINE.md` §6**: IDE split-pane

**해결:** **§9.5 IDE split-pane 정본.** Free-form canvas 폐기. Claude Code/VSCode 스타일 resizable divider + double-click reset + localStorage persistence.

### 13.11 4-Card vs 5-Card HUD

§13.5와 동일 (해결됨).

### 13.12 6 Plane vs L1~L7

§13.1과 동일 (해결됨).

---

## 14. Change Policy

1. **이 문서 (§1~§7)는 핵심 변경 불가.** 변경 시 ADR 필수. `00_MASTER_ARCHITECTURE.md` §1과 동기화 필수.
2. **`00`~`07`이 이 문서와 충돌하면 7-Doc이 우선.** 7-Doc이 엔지니어링 정본, 이 문서는 product 정본. 충돌 시 product를 7-Doc에 맞추어 갱신.
3. **Mode 3개 (§9.1) 추가/제거는 breaking change.** ADR + 모든 wireframe 갱신 필수.
4. **Intent 6개 (§9.2) 추가/제거는 breaking change.** `05_VISUALIZATION_ENGINE.md` §2~§3과 동기화 필수.
5. **Decision HUD 5 카드 규칙 (§9.3)은 절대 확장 금지.** 6번째 카드 추가 = 기존 5 중 하나 합치거나 버려야 가능.
6. **Pricing/tier 변경 시 §5 + §13.2 충돌 기록 + `07_IMPLEMENTATION_ROADMAP.md` §5.3 cost model 동시 갱신.**
7. **Phase 2+ → Day-1 승격 (§12)은 Business Gate (§10.4) 통과 후에만.**
8. **Non-Goals (§12)는 선언. 추가는 자유롭지만 제거는 ADR.**
9. **Kill Criteria (§11) 완화는 금지.** 강화는 자유.
10. **이 문서 변경 시 `00_MASTER_ARCHITECTURE.md` §0 문서 구성표에 반영 필수.**

---

## 15. 참조

이 문서가 가리키는 7-Doc:

- `00_MASTER_ARCHITECTURE.md` — 전체 합의, 용어, 7-Layer architecture, design principles
- `01_PATTERN_OBJECT_MODEL.md` — Pattern / Phase / Signal / Feature 객체 계약 + Signal Vocabulary
- `02_ENGINE_RUNTIME.md` — State Machine (durable), Scanner, Ledger 4-table split
- `03_SEARCH_ENGINE.md` — 4-stage search pipeline + sequence matcher 알고리즘
- `04_AI_AGENT_LAYER.md` — Parser / Judge / Orchestrator + fine-tune phased roadmap
- `05_VISUALIZATION_ENGINE.md` — Intent → Template → Highlight → Chart Config + IDE split-pane spec
- `06_DATA_CONTRACTS.md` — API routes, DB schema, event schemas, schema versioning
- `07_IMPLEMENTATION_ROADMAP.md` — Slice 1~12 + kill criteria + tech debt + risk register

Deprecated (이 문서 채택과 함께):

- `core-loop-v1.md` (이전 Layer B) → `06_DATA_CONTRACTS.md` + `02_ENGINE_RUNTIME.md`로 흡수
- `engine-runtime-v1.md` (이전 Layer C) → `01`~`03`, `06`으로 흡수
- `product-prd-v1.md` (이전 Layer A) → 이 `-1_PRODUCT_PRD.md`로 대체

---

*Cogochi Product PRD v1.0 (file `-1_PRODUCT_PRD.md`) | 2026-04-25 | 7-Doc canonical alignment.*
