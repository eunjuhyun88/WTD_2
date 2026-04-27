# WTD Agent Forge — 전체 시스템 아키텍처

## 1. 제품 정의

**한 문장:** 유저가 AI 트레이딩 에이전트를 설계·육성하고, 실제 시장 데이터에서 검증하며, 그 데이터가 에이전트를 강하게 만드는 자기강화 루프.

**두 가지 가치:**
- 🎮 **게임:** NFT Agent를 키우고 배틀하는 재미
- 📈 **실전:** 실제 트레이딩 판단에 쓸 수 있는 신뢰할 수 있는 도구

**핵심 원칙 (논문 근거):**
1. LLM은 트레이더가 아니라 **시장 해석기** (2602.00196: feature generation > direct prediction)
2. 한 덩어리 판단이 아니라 **태스크별 분해** (2602.23330: fine-grained > coarse)
3. 가장 빠른 승률 개선은 **"안 하는 판단"** (TradingAgents: risk veto)
4. RAG는 **보정기**, 메인 엔진 아님 (FinTradeBench: RAG weak for trading signals)
5. 에이전트 **다양성이 수익** (2603.03671: same strategy = profit erosion)
6. 평가 하네스 고정, **파라미터만 변경** (autoresearch: keep/discard loop)

---

## 2. 시스템 구조 (4-Layer)

```
┌─────────────────────────────────────────────────────┐
│  Layer 5: SOCIAL / TRADE EXECUTION                   │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐       │
│  │ Signal   │ │ Copy     │ │ Exchange API  │       │
│  │ (알림)   │ │ (구독)   │ │ (자동 주문)    │       │
│  └──────────┘ └──────────┘ └───────────────┘       │
├─────────────────────────────────────────────────────┤
│  Layer 4: USER EXPERIENCE                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │ Terminal │ │ Battle  │ │ Agent   │ │ Research │  │
│  │ (Train) │ │ (Fight) │ │ (Grow)  │ │ (Prove)  │  │
│  └─────────┘ └─────────┘ └─────────┘ └──────────┘  │
├─────────────────────────────────────────────────────┤
│  Layer 3: NFT AGENT (유저 소유)                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Identity + Doctrine + Memory + Record + Stage │   │
│  └──────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│  Layer 2: RUNTIME ENGINE (V4 Pipeline)               │
│  OBSERVE → CLASSIFY → REASON → DEBATE → DECIDE      │
│  → RESOLVE → REFLECT                                │
│  ┌────────┐ ┌──────────┐ ┌──────┐ ┌──────┐ ┌──────┐│
│  │ Regime │ │Structure │ │ Flow │ │ Risk │ │Timing││
│  └────────┘ └──────────┘ └──────┘ └──────┘ └──────┘│
│                          + Abstain Gate              │
├─────────────────────────────────────────────────────┤
│  Layer 1: RESEARCH ORG (autoresearch)                │
│  개발자도 쓰고, 유저도 쓰는 동일 엔진                  │
│  ┌──────────────────────────────────────────────┐   │
│  │ eval harness + hill climbing + forward-walk   │   │
│  │ program.md → parameter candidates → keep/disc │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 3. 각 Layer 상세

### Layer 1: Research Org (내부 자동화)

**목적:** 에이전트 성능을 자동으로 개선하는 연구 파이프라인

**autoresearch 적용:**
- `program.md` = 연구 목표 (승률, EV, 과적합 방지)
- `train.py` = V4_CONFIG 파라미터 (수정 가능 범위)
- `eval` = forward-walk 검증 (고정, 절대 수정 안 함)
- 5분 학습 = 100배틀 시뮬
- keep/discard = OOS에서도 개선 확인

**튜닝 대상 파라미터:**
```
rsiOverbought, rsiOversold         (reason.ts heuristic)
momentumThreshold, trendThreshold  (reason.ts heuristic)
ABSTAIN_CONFIDENCE_THRESHOLD       (debate.ts)
AUTO_SL_PERCENT                    (resolve.ts)
POSITION_SIZE                      (decide.ts)
volSpikeThreshold                  (observe.ts)
```

**출력:** 검증된 파라미터 세트 → 모든 에이전트의 base config로 배포

### autoresearch = 개발 도구 + 유저 도구 (동일 엔진)

**개발 시 (지금 나):**
```
npm run research:optimize -- --agent STRUCTURE --metric pnl --rounds 30
→ hill climbing 30라운드 → 최적 파라미터 → OOS 검증 → keep/discard
→ 결과가 V4_CONFIG에 반영
```

**유저가 직접:**
```
Terminal > My Agent > Train > Auto-Optimize
→ 같은 hill climbing 엔진
→ 유저의 doctrine 파라미터를 자동 튜닝
→ forward-walk 결과를 Agent Record에 기록
→ "이 doctrine은 4h trend_up에서 73% 승률" 증명
```

**핵심:** 개발자가 쓰는 연구 도구와 유저가 쓰는 훈련 도구가 **같은 코드**

### 에이전트 공유 → 카피트레이딩 → 실거래

**공유 모델:**
```
유저 A: Agent 설계 + 훈련 + 증명 (forward-walk 성적)
  ↓ 공개
마켓플레이스: "MaxiCrusher #042 — 4h trend_up 73% 승률, 200전 검증"
  ↓ 구독
유저 B: 카피트레이딩 (Agent A의 신호를 자동 수신)
  ↓ 실행
거래소 연결: Binance/Bybit API로 실제 주문
```

**3단계 거래 파이프라인:**
1. **Signal** (게임 레벨) — Agent가 LONG/SHORT/NO_TRADE 판단 → 알림
2. **Copy** (소셜 레벨) — 다른 유저가 이 Agent를 구독 → 같은 신호 수신
3. **Execute** (실전 레벨) — 거래소 API 연결 → 자동 주문 (유저가 직접 API 키 입력)

**신뢰 구조:**
- Agent의 forward-walk 성적이 **증명서** (on-chain 또는 서버 검증)
- 실데이터 OOS 검증을 통과해야 공유 가능
- 카피트레이더는 Agent의 실시간 성적 + 과거 성적 모두 확인
- Agent 소유자는 카피트레이딩 수수료 수익

**기존 코드 활용:**
- `src/lib/server/autoResearch/experimentRunner.ts` — 이미 존재, hill climbing으로 업그레이드
- forward-walk 스크립트 — 이번 세션에서 검증 완료
- QuickTrade 체인 (`ragService.ts` decision chain) — 실거래 기록 인프라 이미 존재

---

### Layer 2: Runtime Engine (V4 Pipeline 진화)

**목적:** 매 틱 시장을 해석하고 포지션을 관리하는 실시간 의사결정

**현재 (7-state):**
```
OBSERVE → RETRIEVE → REASON → DEBATE → DECIDE → RESOLVE → REFLECT
```

**진화 (8-state, CLASSIFY 추가):**
```
OBSERVE → CLASSIFY → RETRIEVE → REASON → DEBATE → DECIDE → RESOLVE → REFLECT
```

#### CLASSIFY (새 단계)
**왜 필요:** 2602.23330 논문 — "fine-grained task decomposition이 coarse보다 우월"
현재는 에이전트가 "장세 분석 + 셋업 판단 + 진입 결정"을 한 번에 함.
분리하면 **어디서 틀렸는지** 알 수 있음.

**입력:** observe.ts의 SignalSnapshot + MarketFrame
**출력:**
```ts
{
  marketState: 'trend_up' | 'trend_down' | 'range' | 'volatile' | 'compressed',
  setupType: 'breakout' | 'pullback' | 'reversal' | 'range_fade' | 'fake_breakout' | 'no_setup',
  regimeConfidence: 0~1,
}
```

**구현:** `observe.ts` 안에 `classifyMarketState()` + `detectSetupType()` 함수 추가
**사용 지표:** 기존 `indicators.ts`의 EMA, RSI, BB, ATR 재사용

#### 에이전트 5-Agent 구조 (TradingAgents + 2602.23330 + 실전 데스크)

현재: 4 에이전트가 전부 "LONG/SHORT/FLAT" 같은 태스크 (겹침)
변경: **5 에이전트, 각자 다른 태스크, 겹침 없음**

논문 근거:
- 2602.23330: "fine-grained task decomposition이 coarse보다 유의미하게 우월"
- 2603.03671: "같은 전략 복제 → 수익 감소" → 다양성 필수
- TradingAgents: Analyst→Researcher→Trader→Risk 파이프라인

실전 트레이딩 데스크 대응:
- 시장 분석가 → Regime + Structure
- 오더플로우 트레이더 → Flow
- 리스크 매니저 → Risk
- 실행 트레이더 → Timing

| # | Agent | 태스크 | 구조화 출력 | 소비 지표 |
|---|-------|-------|-----------|----------|
| 1 | **REGIME** | 지금 어떤 장? | `{ marketState, confidence }` | EMA, BB width, ATR |
| 2 | **STRUCTURE** | 구조/패턴/레벨 | `{ trend, pattern, keyLevels, breakoutValid }` | EMA, RSI, 가격구조, 패턴 |
| 3 | **FLOW** | 주문흐름/파생 | `{ cvdBias, oiSignal, fundingHeat, volumeProfile }` | CVD, OI, funding, volume |
| 4 | **RISK** | 위험/가치 평가 | `{ riskScore, suggestedSL, rrRatio, shouldSkip }` | ATR, 변동성, 포지션 사이즈 |
| 5 | **TIMING** | 진입 타이밍 | `{ entryQuality, isLate, isEarly, optimalEntry }` | RSI, 모멘텀, 가격 대비 SMA |

**데이터 흐름:**
```
REGIME → (모든 에이전트의 첫 입력)
  ├→ STRUCTURE (regime에 따라 패턴 해석 달라짐)
  ├→ FLOW (regime에 따라 funding 의미 달라짐)
  ├→ RISK (regime에 따라 SL 거리 달라짐)
  └→ TIMING (regime에 따라 진입 기준 달라짐)
       ↓
  debate.ts (Bull/Bear 토론 + Abstain Gate)
       ↓
  최종 판단: LONG / SHORT / NO_TRADE
```

**NFT Agent 커스터마이징:**
유저는 5 에이전트의 **가중치와 임계값**을 조정 = doctrine
- "FLOW를 2배 중시" → 파생 신호 중심 전략
- "RISK shouldSkip 임계값 낮춤" → 보수적 전략
- "TIMING 무시" → 타이밍보다 방향 중시

#### Abstain Gate (NO_TRADE)
**왜 필요:** 실전 검증에서 에이전트가 항상 진입 → 노이즈에서 손실
TradingAgents의 Risk Manager veto와 동일 개념

조건:
- `setupType === 'no_setup'` → NO_TRADE
- `marketState === 'compressed'` + 다이버전스 없음 → NO_TRADE
- 합의 confidence < 0.45 → NO_TRADE
- Risk agent의 riskScore > 0.7 → NO_TRADE

#### MFE/MAE/FailureTag 추적
**왜 필요:** "왜 졌는지" 모르면 개선 불가

매 틱 열린 포지션:
```ts
position.mfe = Math.max(mfe, unrealized);  // 최대 이익 도달점
position.mae = Math.min(mae, unrealized);  // 최대 손실 도달점
```

청산 시 자동 분류:
- MAE 진입 직후 → `late_entry`
- MFE > 0인데 PnL < 0 → `stop_too_tight` or `target_too_far`
- marketState 변경 → `wrong_regime`
- setupType = no_setup → `should_not_trade`

---

### Layer 3: NFT Agent (유저 소유 컨테이너)

**목적:** 유저가 "소유"하고 "키우는" 정책+메모리+정체성

**NFT Agent = 5가지 속성:**

```ts
interface NFTAgent {
  // 1. Identity (불변)
  id: string;
  archetype: 'CRUSHER' | 'RIDER' | 'ORACLE' | 'GUARDIAN';
  name: string;
  visual: string;  // 외형 NFT

  // 2. Doctrine (유저가 설계, 서버가 검증)
  doctrine: {
    version: number;
    enabledIndicators: string[];
    riskEnvelope: { maxSL: number, minRR: number, skipThreshold: number };
    stylePrompt: string;  // "보수적", "역추세 중심" 등
  };

  // 3. Memory (배틀에서 축적)
  memory: {
    totalCards: number;
    boundaryCount: number;  // 아깝게 진 케이스
    bestRegime: MarketState;
    weakRegime: MarketState;
    recentLessons: string[];
  };

  // 4. Record (성적)
  record: {
    matches: number;
    winRate: number;
    expectancy: number;    // 평균 R-multiple
    maxDrawdown: number;
    noTradePrecision: number;  // NO_TRADE가 정확했던 비율
    byRegime: Record<MarketState, { wins: number, losses: number }>;
    bySetup: Record<SetupType, { wins: number, losses: number }>;
  };

  // 5. Progression (성장)
  stage: number;  // 0~10
  specialization: string[];  // "trend_up 전문", "breakout 강함"
  proofBadges: string[];     // "100전 50승", "range 무패" 등
}
```

**"키운다"는 뜻:**
1. **배틀** → 데이터 획득 (GameRecord)
2. **복기** → 실패 원인 태깅 (FailureTags)
3. **조정** → doctrine 수정 (skipThreshold 변경 등)
4. **축적** → memory bank 성장 (boundary case 저장)
5. **발행** → 새 doctrine version publish → record 갱신

---

### Layer 4: User Experience

**4가지 Surface:**

| Surface | 목적 | 핵심 기능 |
|---------|------|----------|
| **Terminal** | 에이전트 훈련 | doctrine 설계, 시뮬레이션, 백테스트 |
| **Battle** | 실전 검증 | 실데이터 배틀, 틱별 판단 관전, PnL 추적 |
| **Agent** | 성장 확인 | 성적표, 강점/약점, memory, progression |
| **Research** | 증명 | forward-walk 결과, 랜덤 대비 엣지, regime별 성과 |

---

## 4. 데이터 흐름 (자기강화 루프)

```
유저가 Agent 설계 (doctrine)
        ↓
배틀 실행 (실데이터, forward-walk)
        ↓
GameRecord 생성 (structured labels)
  ├─ MarketState + SetupType (자동)
  ├─ MFE/MAE/R-multiple (자동)
  ├─ FailureTags (자동 + 복기)
  └─ NO_TRADE 기록 (자동)
        ↓
학습 데이터로 변환
  ├─ OrpoPair: 좋은 판단 vs 나쁜 판단 (boundary 우선)
  ├─ RAGEntry: 유사 패턴 검색용 (confidence 보정기)
  └─ MemoryCard: 에이전트 기억 (실패/성공 교훈)
        ↓
Research Org (autoresearch)
  ├─ hill climbing으로 파라미터 최적화
  ├─ forward-walk OOS 검증
  └─ 개선이면 keep, 아니면 discard
        ↓
개선된 base config → 모든 에이전트에 적용
        ↓
에이전트 더 강해짐 → 더 좋은 데이터 → 반복
```

---

## 5. GameRecord 스키마 (학습 가능한 구조)

```ts
interface GameRecordV2 {
  // 시장 문맥 (자동 생성)
  context: {
    pair: string;
    timeframe: string;
    marketState: MarketState;       // classify에서
    setupType: SetupType;           // classify에서
    regimeConfidence: number;
    factorSignature: number[];      // 기존 48 factor
  };

  // 에이전트 출력 (5-Agent, 각자 다른 태스크)
  agentOutputs: {
    regime: { marketState, confidence };
    structure: { trend, pattern, keyLevels, breakoutValid };
    flow: { cvdBias, oiSignal, fundingHeat, volumeProfile };
    risk: { riskScore, suggestedSL, rrRatio, shouldSkip };
    timing: { entryQuality, isLate, isEarly, optimalEntry };
  };

  // 합의 결정
  decision: {
    action: 'LONG' | 'SHORT' | 'NO_TRADE';
    confidence: number;
    entryPrice?: number;
    stopLoss?: number;
    abstainReason?: string;
  };

  // 결과 (자동 계산)
  outcome: {
    pnl: number;
    rMultiple: number;
    mfe: number;
    mae: number;
    holdTicks: number;
    exitType: ExitType;
  };

  // 복기 (자동 + 반자동)
  review: {
    quality: 'strong' | 'medium' | 'boundary' | 'weak';
    failureTags: FailureTag[];
    shouldHaveBeenNoTrade: boolean;
    lesson: string;
  };
}
```

---

## 5-1. 학습 데이터 구조 + 유저 참여형 데이터 생성

### 데이터 소스 3가지

```
┌──────────────────────────────────────────────────┐
│  1. AUTO (자동 생성)                              │
│  배틀/시뮬 실행 시 자동으로 기록                     │
│  → marketState, setupType, MFE/MAE, failureTags   │
│  → 에이전트 출력 JSON, 합의 결과, PnL              │
│                                                    │
│  2. USER (유저 입력)                               │
│  유저가 직접 차트를 보고 라벨링                      │
│  → "이건 fake_breakout이었다"                      │
│  → "여기서 NO_TRADE 했어야 했다"                    │
│  → "이 패턴은 pullback인데 늦게 진입했다"            │
│  → 유저의 트레이딩 지식이 학습 데이터로 변환          │
│                                                    │
│  3. MARKET (시장 결과)                             │
│  시간이 지나면 결과가 확정                          │
│  → 진입 후 TP/SL 중 뭐가 먼저 닿았는지             │
│  → 24시간 후 가격이 어디에 있는지                   │
│  → decision chain maturation (이미 존재)            │
└──────────────────────────────────────────────────┘
```

### 유저 입력 학습 데이터 (핵심 기능)

**왜 필요:**
- 논문 2602.00196: "LLM feature generation + downstream model"
- 유저의 트레이딩 지식 = 가장 고품질 feature
- "같은 데이터, 다른 해석" — 유저의 해석이 학습 데이터

**유저가 할 수 있는 입력:**

1. **차트 라벨링** (Terminal에서)
   ```
   차트를 보고:
   - "이건 trend_up" (marketState 교정)
   - "이건 fake_breakout" (setupType 교정)
   - "여기서 진입하면 안 됐다" (shouldHaveBeenNoTrade)
   ```

2. **복기 태깅** (배틀 결과에서)
   ```
   패배 후:
   - failureTags 선택: wrong_regime, late_entry, stop_too_tight
   - lesson 작성: "횡보장에서 돌파 추격함"
   - "이건 boundary case다" (학습 가치 높은 케이스 마킹)
   ```

3. **유사 패턴 평가** (RAG recall에서)
   ```
   에이전트가 유사 케이스를 보여주면:
   - "이건 맞는 비교다" (relevance +1)
   - "이건 다른 상황이다" (relevance -1)
   → RAG 검색 품질 개선
   ```

4. **커스텀 트레이닝 셋** (Agent Train에서)
   ```
   유저가 직접 고르기:
   - "이 10개 배틀은 내 에이전트가 배워야 할 케이스"
   - "이 패턴은 항상 SHORT 해야 하는 케이스"
   → 커스텀 ORPO pair / RAG entry 생성
   ```

### 학습 데이터 품질 관리

**자동 품질 분류 (기존 + 확장):**
```
strong:   margin > 15 AND 근거 >= 3개 AND 결과 명확
medium:   margin > 8 AND 근거 >= 1개
boundary: margin <= 5 (아깝게 갈림) ← 가장 학습 가치 높음
weak:     margin > 3 but 근거 부족
noise:    margin <= 3 OR 데이터 불완전
```

**유저 교정 후 재분류:**
- 유저가 "이건 fake_breakout이었다"고 태깅 → 해당 케이스의 setupType 업데이트
- 유저가 "boundary"로 마킹 → 학습 우선순위 상승
- 유저가 "noise"로 마킹 → 학습에서 제외

### 데이터 구조 (확장)

```ts
interface LearningRecord extends GameRecordV2 {
  // 자동 생성
  autoLabels: {
    marketState: MarketState;
    setupType: SetupType;
    failureTags: FailureTag[];
    quality: PairQuality;
  };

  // 유저 교정 (선택적)
  userLabels?: {
    marketStateOverride?: MarketState;   // "이건 range였다"
    setupTypeOverride?: SetupType;       // "이건 fake_breakout이었다"
    failureTagsOverride?: FailureTag[];  // "late_entry가 아니라 wrong_setup이었다"
    qualityOverride?: PairQuality;       // "이건 boundary다"
    shouldHaveBeenNoTrade?: boolean;     // "안 들어갔어야 했다"
    lesson?: string;                     // 유저 작성 교훈
    isTrainingCandidate?: boolean;       // "이걸로 학습시켜라"
    ragRelevanceScore?: number;          // 유사 패턴 평가 (-1~1)
    taggedAt: number;
  };

  // 시장 결과 (시간 경과 후 자동)
  marketOutcome?: {
    price1h?: number;
    price4h?: number;
    price24h?: number;
    tpHitFirst?: boolean;
    slHitFirst?: boolean;
    maturedAt: number;
  };
}
```

### autoresearch에서 학습 데이터 활용

```
1. 자동 데이터 (대량, 낮은 품질)
   → hill climbing 파라미터 탐색용
   → 100배틀 시뮬의 기반

2. 유저 교정 데이터 (소량, 높은 품질)
   → boundary case 학습 우선순위
   → ORPO pair에서 가중치 2배
   → doctrine 개인화의 핵심 입력

3. 시장 확정 데이터 (시간 경과 후)
   → forward-walk 검증의 ground truth
   → decision chain maturation
   → 에이전트 성적표의 근거
```

---

## 5-2. 학습 데이터 구조 (ORPO 대체)

### 현재 문제
기존 OrpoPair는 "승자 vs 패자" 텍스트 선호도 학습용. 우리는:
- 수치 파라미터 최적화 (RSI, SL, 임계값)
- 분류 정확도 개선 (MarketState, SetupType)
- 이진 판단 학습 (NO_TRADE 맞았나/틀렸나)
- 시계열 패턴 학습 (유사 차트에서 어떤 판단이 좋았나)

이건 ORPO/DPO 문제가 아니라 **구조화된 학습 데이터셋** 문제.

### 학습 데이터셋 4종 (각각 다른 목적)

#### Dataset A: 분류 학습셋 (MarketState/SetupType)
```ts
interface ClassificationSample {
  // 입력 (모델이 보는 것)
  features: {
    ema20: number; ema50: number;
    rsi14: number;
    bbWidth: number; bbPosition: number;
    atr14: number; atrRatio: number;  // ATR / 평균ATR
    priceVsSma: number;
    volumeRatio: number;
    cvd: number; oiChange: number;
  };

  // 정답 (자동 + 유저 교정)
  label: {
    marketState: MarketState;
    setupType: SetupType;
    source: 'auto' | 'user_corrected';
    confidence: number;
  };
}
```
**용도:** rule engine → 나중에 XGBoost/LightGBM 분류기
**생성:** 매 틱 자동 + 유저가 "이건 range였다"고 교정

#### Dataset B: 판단 학습셋 (LONG/SHORT/NO_TRADE)
```ts
interface DecisionSample {
  // 입력
  context: {
    marketState: MarketState;
    setupType: SetupType;
    agentOutputs: AgentOutputs;  // 5-Agent 구조화 출력
    candleFeatures: number[];    // 최근 24캔들 정규화
  };

  // 판단
  decision: {
    action: 'LONG' | 'SHORT' | 'NO_TRADE';
    confidence: number;
    params: {
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
    };
  };

  // 결과 (시장이 판정)
  outcome: {
    pnl: number;
    rMultiple: number;
    mfe: number; mae: number;
    exitType: ExitType;
    isWin: boolean;
  };

  // 메타
  quality: PairQuality;
  failureTags: FailureTag[];
}
```
**용도:**
- Hill climbing → 파라미터 최적화
- GRPO → 방향 판단 강화 (검증 가능 보상 = PnL)
- KTO → NO_TRADE 판단 (이진: 맞았다/틀렸다)
**생성:** 매 배틀/트레이드 자동

#### Dataset C: 유사 패턴 검색셋 (RAG)
```ts
interface PatternSample {
  embedding: number[];           // 256d (기존 ragEmbedding.ts)
  marketState: MarketState;
  setupType: SetupType;
  outcome: { pnl, isWin };
  lesson: string;
  relevanceScore?: number;       // 유저 평가 (-1~1)
  isBoundaryCase: boolean;
}
```
**용도:** RAG 검색 → confidence 보정
**생성:** 배틀 결과 + 유저 평가

#### Dataset D: 파라미터 실험셋 (autoresearch)
```ts
interface ExperimentSample {
  params: Record<string, number>;  // 사용된 파라미터 세트
  scenario: string;                // 시나리오 ID
  results: {
    winRate: number;
    totalPnl: number;
    avgRMultiple: number;
    noTradePrecision: number;
    maxDrawdown: number;
  };
  isOOS: boolean;                  // out-of-sample 여부
}
```
**용도:** hill climbing + Bayesian optimization
**생성:** `npm run research:optimize` 실행 시 자동

### 학습 방법론 선택 (ORPO만이 답이 아님)

2026년 기준 preference learning 전체 지형을 검토한 결과:

**우리 상황의 특수성:**
- 트레이딩 결과는 **검증 가능** (PnL = 객관적 보상)
- 수치 파라미터 최적화가 핵심 (RSI 임계값, SL 거리 등)
- 빠른 실험 반복 필요 (100배틀 ≈ 1분)
- LLM fine-tuning 리소스 제한적 (Qwen3 1.7B 로컬)

**방법론별 역할 분담:**

| 학습 대상 | 최적 방법 | 이유 |
|----------|----------|------|
| **수치 파라미터** (RSI/SL/임계값) | **Hill Climbing + CMA-ES** | ORPO/DPO는 수치에 약함. 직접 최적화가 우월 |
| **방향 판단** (LONG vs SHORT) | **GRPO** (검증 가능한 보상 기반 RL) | 트레이딩 결과가 검증 가능 → GRPO가 DPO/ORPO보다 적합 |
| **진입 vs 스킵** (NO_TRADE) | **KTO** (이진 피드백) | 쌍 비교보다 "맞았다/틀렸다" 이진 평가가 자연스러움 |
| **시장 분류** (MarketState) | **Rule engine → SFT** | 처음엔 규칙, 데이터 쌓이면 supervised fine-tuning |
| **유사 패턴 검색** | **RAG + 유저 교정** | 학습 아닌 검색 문제 |
| **파라미터 상관관계** | **Bayesian Optimization** | 여러 파라미터의 최적 조합 탐색 |

**핵심 인사이트 (2026 연구 동향):**
- [GRPO/DAPO](https://llm-stats.com/blog/research/post-training-techniques-2026): "can improve beyond training data" — 트레이딩처럼 결과가 검증 가능한 도메인에 최적
- [KTO](https://medium.com/@fahey_james/dpo-isnt-enough-the-modern-post-training-stack-simpo-orpo-kto-and-beyond-d82e52a1ee6c): "works with thumbs-up/down" — 트레이드 성공/실패 = 자연스러운 이진 피드백
- [FinDPO](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1608365/full): DPO의 금융 도메인 적용 사례 존재
- ORPO는 효율적이지만 수치 최적화에는 부적합

**실행 순서:**
1. **즉시:** Hill climbing (이미 검증됨) — 파라미터 최적화
2. **Phase 3 이후:** KTO — NO_TRADE 판단 학습 (이진 피드백)
3. **데이터 500+개 쌓인 후:** GRPO — 방향 판단 학습 (검증 가능 보상)
4. **나중:** Bayesian Opt — 파라미터 조합 탐색

---

## 5-3. 카피트레이딩 상세 설계

### 에이전트 공유 모델

```
┌─────────────────────────────────────────────────┐
│  Agent Creator (유저 A)                          │
│  ┌─────────────┐                                │
│  │ NFT Agent   │                                │
│  │ #042        │── 설계 + 훈련 + 증명            │
│  └──────┬──────┘                                │
│         ↓ 공개                                   │
├─────────────────────────────────────────────────┤
│  Agent Marketplace                               │
│  ┌──────────────────────────────────────┐       │
│  │ MaxiCrusher #042                      │       │
│  │ 4h | trend_up 전문 | 200전 검증       │       │
│  │ Forward-walk: +9.2% (OOS)            │       │
│  │ 승률: 62% | Sharpe: 1.4              │       │
│  │ 구독자: 47명 | 월수익: 0.3 ETH        │       │
│  │                                       │       │
│  │ [구독] [성적표 보기] [doctrine 보기]    │       │
│  └──────────────────────────────────────┘       │
├─────────────────────────────────────────────────┤
│  Copier (유저 B)                                 │
│  ┌──────────────┐                               │
│  │ 구독 중:      │                               │
│  │ #042 → 알림   │── Signal 수신                 │
│  │ #077 → 자동   │── Auto-execute (API 연결)     │
│  └──────────────┘                               │
└─────────────────────────────────────────────────┘
```

### 공유 등급

| 등급 | 조건 | 기능 |
|------|------|------|
| **Private** | 기본 | 본인만 사용 |
| **Signal** | 50전 이상 + OOS 검증 통과 | 다른 유저에게 알림만 전송 |
| **Copy** | 100전 이상 + OOS +5% 이상 + 30일 실전 성적 | 자동 카피트레이딩 허용 |
| **Verified** | 200전 + 실거래 성적 30일 + 커뮤니티 평가 | 마켓플레이스 추천 |

### 수익 모델

```
Creator: 카피트레이딩 수익의 10~20% (성과 수수료)
Platform: 카피트레이딩 수익의 5% (플랫폼 수수료)
Copier: 나머지
```

- 손실 시 수수료 없음 (high-water mark)
- Creator가 10전 연속 패배 → 자동 Copy 정지 + 구독자 알림

### 신뢰 구조

1. **Forward-walk 증명서** — OOS에서 검증된 성적만 표시 (IS 성적 비공개)
2. **실시간 성적 추적** — 공개 후 모든 판단/결과 기록 (수정 불가)
3. **Doctrine 투명성** — 구독자가 Creator의 doctrine 설정 확인 가능 (가중치, 임계값)
4. **리스크 제한** — Copier가 설정: 최대 포지션 크기, 일일 최대 손실, 동시 포지션 수

---

## 5-4. 거래소 연동 상세 설계

### 연동 구조

```
Agent 판단 (LONG/SHORT/NO_TRADE)
     ↓
Signal Gateway (서버)
     ├─ Webhook 알림 (Telegram, Discord, 앱 푸시)
     ├─ Copy Signal 전파 (구독자에게)
     └─ Execution Engine (자동 주문)
          ↓
     Exchange Adapter
     ├─ Binance Futures API
     ├─ Bybit API
     └─ (향후) OKX, Bitget
          ↓
     Order Management
     ├─ Market/Limit 주문
     ├─ SL/TP 자동 설정
     └─ Position tracking
```

### API 키 관리 (보안)

```
유저가 API 키 입력 → 서버에 저장하지 않음
    ↓
브라우저 로컬 암호화 저장 (Web Crypto API)
    ↓
주문 시 클라이언트에서 직접 거래소 API 호출
    ↓
결과만 서버에 기록 (API 키 미포함)
```

**왜 클라이언트 사이드:**
- 서버가 API 키를 보관하면 해킹 리스크
- 클라이언트에서 직접 호출 → 서버는 신호만 제공

### 주문 실행 흐름

```ts
interface TradeSignal {
  agentId: string;
  action: 'LONG' | 'SHORT' | 'CLOSE';
  symbol: string;           // 'BTCUSDT'
  confidence: number;
  suggestedSL: number;      // Risk agent 출력
  suggestedTP: number;
  positionSizePct: number;  // 계정 자산 대비 %
  timestamp: number;
  signalId: string;         // 중복 방지
}

// 유저 설정
interface ExecutionConfig {
  exchange: 'binance' | 'bybit';
  maxPositionPct: number;   // 최대 포지션 크기 (계정의 %)
  maxDailyLoss: number;     // 일일 최대 손실 %
  maxConcurrent: number;    // 동시 포지션 수
  leverage: number;         // 레버리지
  slMultiplier: number;     // SL 거리 배율 (1.0 = 에이전트 추천 그대로)
  autoExecute: boolean;     // true = 자동, false = 알림만
}
```

### 안전장치

| 장치 | 설명 |
|------|------|
| **일일 손실 한도** | 설정 초과 시 당일 거래 자동 정지 |
| **포지션 크기 제한** | 계정 대비 최대 % 초과 불가 |
| **중복 방지** | 같은 signalId로 2번 주문 불가 |
| **수동 확인 모드** | autoExecute=false면 알림만, 유저가 직접 확인 |
| **긴급 정지** | 앱에서 원클릭 전체 포지션 청산 |
| **Agent 성적 하락 시** | 10전 연속 패 → 자동 실행 일시 정지 |

### 구현 우선순위

1. **Phase A:** Signal only — Agent 판단 → Webhook 알림 (Telegram)
2. **Phase B:** Copy signal — Agent 공유 → 구독자 알림
3. **Phase C:** Manual execute — 알림에서 원클릭 주문 (Binance API)
4. **Phase D:** Auto execute — 자동 주문 + 리스크 관리

---

## 6. Terminal UI — 기본 에이전트 vs 내 Agent 비교

### 레이아웃

```
┌─────────────────────────────────────────────────────────┐
│                    BTC/USDT 4H Chart                     │
├────────────────────────┬────────────────────────────────┤
│  BASE AGENTS (8명)     │  MY AGENT                      │
│  ┌──────────────────┐  │  ┌────────────────────────┐    │
│  │ STRUCTURE: ↑ 72% │  │  │ 이름: MaxiCrusher #042  │    │
│  │ VPA:       ↑ 65% │  │  │ Archetype: CRUSHER      │    │
│  │ ICT:       ↓ 58% │  │  │ Doctrine v3             │    │
│  │ DERIV:     ↑ 81% │  │  ├────────────────────────┤    │
│  │ VALUATION: → 50% │  │  │                         │    │
│  │ FLOW:      ↑ 70% │  │  │  Structure: trend_up    │    │
│  │ SENTI:     → 45% │  │  │  Flow: bullish, no div  │    │
│  │ MACRO:     → 52% │  │  │  Risk: 0.35 (low)       │    │
│  ├──────────────────┤  │  │  Momentum: strong ↑      │    │
│  │ C02 합의:         │  │  ├────────────────────────┤    │
│  │ LONG 68%          │  │  │ 판단: LONG 78%          │    │
│  │ Setup: pullback   │  │  │ Setup: pullback         │    │
│  │ Regime: trend_up  │  │  │ "추세 중 눌림 진입"      │    │
│  └──────────────────┘  │  ├────────────────────────┤    │
│                        │  │ 이 상황 과거 성적:        │    │
│                        │  │ trend_up+pullback: 8W/3L │    │
│                        │  │ 승률 73% | avg R: 1.4    │    │
│                        │  │ 유사 케이스 3건 recall    │    │
│                        │  └────────────────────────┘    │
├────────────────────────┴────────────────────────────────┤
│  [배틀 시작] [시뮬레이션] [doctrine 수정]                 │
└─────────────────────────────────────────────────────────┘
```

### 왼쪽: Base Agents (기존 C02)
- 기존 8 에이전트 (STRUCTURE, VPA, ICT, DERIV, VALUATION, FLOW, SENTI, MACRO) 유지
- 각각 방향 + 신뢰도 표시
- C02 합의: 최종 방향 + 감지된 regime + setupType

### 오른쪽: My Agent (NFT Agent)
- **해석 레이어:** Structure/Flow/Risk/Momentum 각각의 구조화 출력
- **판단:** LONG/SHORT/NO_TRADE + confidence + 한 줄 근거
- **과거 성적:** 같은 (marketState + setupType) 조합에서 이 에이전트의 역대 성적
- **유사 케이스 recall:** RAG에서 가져온 비슷한 과거 3건
- **핵심 차이:** 기본 에이전트와 내 에이전트의 판단이 다를 때 하이라이트

### 핵심 가치
- 유저는 **"기본 AI는 LONG인데 내 에이전트는 NO_TRADE"** 같은 차이를 실시간으로 봄
- 그 차이가 맞았는지 결과로 확인 → doctrine 수정 근거
- "내 에이전트가 이 상황에서 73% 승률" → 신뢰도 근거

---

## 7. 구현 순서 (Phase별)

### Phase 1: CLASSIFY 단계 추가
- `types.ts`: MarketState, SetupType, FailureTag 타입
- `observe.ts`: classifyMarketState(), detectSetupType()
- 기존 indicators.ts (EMA, RSI, BB, ATR) 재사용
- **검증:** 알려진 캔들에 올바른 분류 반환

### Phase 2: NO_TRADE + Abstain Gate
- `types.ts`: BattleAction에 NO_TRADE 추가
- `reason.ts`: heuristic + LLM에 NO_TRADE 옵션
- `debate.ts`: abstain gate (confidence + setupType 기반)
- `reflect.ts`: NO_TRADE 학습 (correctly_abstained / missed_opportunity)
- **검증:** 10배틀에서 NO_TRADE 틱 존재 확인

### Phase 3: MFE/MAE + FailureTags
- `types.ts`: Position에 mfe, mae, holdTicks, exitType, failureTags
- `resolve.ts`: 매 틱 MFE/MAE 업데이트, 청산 시 classifyFailureTags()
- **검증:** 1배틀 상세 로그에서 MFE/MAE/failureTags 확인

### Phase 4: 실데이터 시나리오 (병렬 가능)
- `scenarioBuilder.ts`: 바이낸스 실데이터 fetch + 캐시
- `static/scenarios/`: JSON 캐시 파일
- `/api/battle/+server.ts`: 실데이터 연결
- **검증:** FTX crash 4h 실데이터로 배틀 실행

### Phase 5: Forward-Walk 검증 명령어
- `scripts/dev/forward-walk.mjs`: CLI 러너
- `experimentRunner.ts`: hill climbing 업그레이드
- **검증:** `npm run validate:forward-walk` 실행 → IS/OOS 비교

### Phase 6: GameRecord V2 + 학습 루프 연결
- `arenaWarTypes.ts` 확장: agentOutputs, review 필드
- `ragService.ts`: boundary case 우선 retrieval
- reflect.ts → OrpoPair/RAGEntry 생성에 새 필드 반영
- **검증:** 배틀 후 구조화된 GameRecord 저장 확인

---

## 7. 수정 파일 (기존 코드 재사용)

| 파일 | 존재 여부 | 변경 |
|------|----------|------|
| `src/lib/engine/v4/types.ts` | ✅ 존재 | MarketState, SetupType, FailureTag, NO_TRADE 추가 |
| `src/lib/engine/v4/states/observe.ts` | ✅ 존재 | classifyMarketState(), detectSetupType() |
| `src/lib/engine/v4/states/reason.ts` | ✅ 존재 | NO_TRADE in heuristic + compact prompt |
| `src/lib/engine/v4/states/debate.ts` | ✅ 존재 | abstain gate |
| `src/lib/engine/v4/states/decide.ts` | ✅ 존재 | NO_TRADE handling |
| `src/lib/engine/v4/states/resolve.ts` | ✅ 존재 | MFE/MAE, classifyFailureTags() |
| `src/lib/engine/v4/states/reflect.ts` | ✅ 존재 | NO_TRADE memory, failure lessons |
| `src/lib/engine/indicators.ts` | ✅ 존재 | 재사용 (EMA, RSI, BB, ATR, CVD) |
| `src/lib/engine/factorEngine.ts` | ✅ 존재 | 48 factor 재사용 |
| `src/lib/engine/patternDetector.ts` | ✅ 존재 | H&S, falling wedge 재사용 |
| `src/lib/engine/arenaWarTypes.ts` | ✅ 존재 | GameRecordV2 확장 |
| `src/lib/server/ragService.ts` | ✅ 존재 | boundary case retrieval |
| `src/lib/engine/ragEmbedding.ts` | ✅ 존재 | 256d embedding 재사용 |
| `src/lib/server/autoResearch/experimentRunner.ts` | ✅ 존재 | hill climbing 업그레이드 |
| `src/lib/api/binance.ts` | ✅ 존재 | fetchKlines 재사용 |
| `src/lib/server/scenarioBuilder.ts` | ❌ 새 파일 | 실데이터 시나리오 빌더 |
| `scripts/dev/forward-walk.mjs` | ❌ 새 파일 | 검증 CLI |

---

## 8. 성공 기준

**엔진 품질:**
- 4h forward-walk에서 랜덤 대비 +5% 이상 엣지 (현재: CRUSHER +15.5%)
- NO_TRADE precision > 60% (안 들어간 게 맞았던 비율)
- OOS degradation < 15% (과적합 아님)

**데이터 품질:**
- 모든 GameRecord에 marketState + setupType 기록
- 모든 청산 트레이드에 MFE/MAE + failureTags 기록
- boundary case가 전체의 15~25%

**제품 가치:**
- "내 에이전트가 trend_up에서 73% 승률, range에서 41% 승률" 같은 구체적 성적표
- "wrong_regime가 패배 원인의 40%"같은 개선 방향 제시
- doctrine 수정 → 재배틀 → 성적 변화 확인 가능

---

## 9. 설계 리뷰 — 발견된 허점 + 수정

### 허점 1: REGIME Agent와 CLASSIFY 단계가 중복
CLASSIFY 단계에서 marketState를 분류하는데, REGIME Agent도 같은 일을 함.
**수정:** CLASSIFY 단계 = REGIME Agent. 별도 단계가 아니라 OBSERVE 안에서 REGIME이 먼저 실행되고, 그 결과가 다른 4 Agent의 입력이 되는 구조.

### 허점 2: 5-Agent인데 NFT archetype은 4개 (CRUSHER/RIDER/ORACLE/GUARDIAN)
Agent 역할이 5개(Regime/Structure/Flow/Risk/Timing)인데 archetype은 4개. 매핑이 안 맞음.
**수정:** archetype은 "유저가 선택하는 전략 성격"이지 에이전트 역할이 아님. 모든 NFT Agent는 내부적으로 5-Agent 파이프라인을 사용하되, archetype에 따라 **가중치가 다름**:
- CRUSHER: Structure + Timing 가중치 ↑ (공격적 진입)
- RIDER: Flow + Timing 가중치 ↑ (추세 추종)
- ORACLE: Flow + Risk 가중치 ↑ (역추세 + 리스크 관리)
- GUARDIAN: Risk 가중치 ↑↑ (보수적, NO_TRADE 빈도 높음)

### 허점 3: 카피트레이딩에서 "실시간" 신호의 정의가 모호
배틀은 합성 시나리오 기반인데 카피트레이딩은 실시간이어야 함. 어떻게 전환?
**수정:** 카피트레이딩 모드에서는 배틀이 아니라 **실시간 캔들 스트림**에 연결:
- Binance WebSocket → 5m/1h/4h 캔들 수신
- 매 캔들 close 시 V4 파이프라인 1틱 실행
- 신호 생성 → Signal Gateway로 전파
- 배틀은 "과거 데이터 시뮬", 카피트레이딩은 "실시간 데이터 라이브"

### 허점 4: forward-walk 검증이 "에이전트 성적"인지 "파라미터 성적"인지 불명확
forward-walk로 검증하는 건 에이전트 전체? 특정 파라미터?
**수정:** 두 가지 모두 필요:
- **파라미터 검증** (autoresearch): 특정 파라미터 세트의 IS vs OOS
- **에이전트 검증** (Agent Record): NFT Agent의 doctrine + memory 조합으로 실제 배틀 성적
- Agent 공개 시 보여주는 건 **에이전트 검증** (실데이터 forward-walk)

### 허점 5: 유저 교정 데이터의 품질 보장이 없음
유저가 "이건 trend_up"이라고 했는데 실제로는 range면? 나쁜 학습 데이터.
**수정:**
- 유저 교정은 **본인 에이전트에만** 적용 (공통 모델 오염 방지)
- 공통 모델은 **시장 결과 확정 데이터**만 사용
- 유저 교정이 실제 성적 개선으로 이어지면 → 교정 품질 점수 상승 → 공통 학습에 반영 가능

### 허점 6: Layer 1 "4-Layer"라고 했는데 실제로는 5-Layer
제목이 "4-Layer"인데 Layer 5 (Social/Trade)가 추가됨.
**수정:** "5-Layer"로 수정 (이미 도식은 5개)

### 허점 7: 학습 루프에서 아직 "ORPO pair" 언급이 남아있음
5-1 섹션의 autoresearch 데이터 활용에서 "ORPO pair에서 가중치 2배" 문구 존재.
**수정:** "학습 데이터셋 B (DecisionSample)에서 가중치 2배"로 변경

### 허점 8: 실거래에서 slippage/수수료 미반영
시뮬에서 PnL 계산 시 slippage와 거래소 수수료가 빠져 있음. 실전과 차이.
**수정:** V4_CONFIG에 추가:
```
SLIPPAGE_PCT: 0.0005        // 0.05% per trade
COMMISSION_PCT: 0.0004      // maker 0.04% (Binance)
```
resolve.ts에서 포지션 진입/청산 시 슬리피지+수수료 차감
