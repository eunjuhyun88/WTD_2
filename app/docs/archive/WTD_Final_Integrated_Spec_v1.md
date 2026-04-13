# WTD — Final Integrated System Spec v1.0

> **Crypto Intelligence OS × Arena Battle × Passport Progression**
> 2026-02-22 · 모든 wtd 문서 + Agent Engine v3 통합

---

## 0. 한 문장 요약

**"8개 AI 에이전트 풀에서 3개를 드래프트하고, LLM 기반 Spec으로 특성화하고, RAG 기억으로 경험을 축적하며, 실시간 대전을 통해 Passport에 판단 이력을 쌓아가는 크립토 Decision Intelligence 시스템."**

---

## 목차

1. [시스템 전체 구조도](#1-시스템-전체-구조도)
2. [8 Agent Pool + LLM Spec](#2-8-agent-pool--llm-spec)
3. [Draft + Match Flow (Arena 통합)](#3-draft--match-flow)
4. [Scoring: DS / RE / CI + FBS](#4-scoring-system)
5. [Passport (확장형)](#5-passport) 
6. [User Journey — 6 Phase Lifecycle](#6-user-journey)
7. [Engagement: Oracle · Challenge · LIVE](#7-engagement)
8. [RAG Memory System](#8-rag-memory-system)
9. [Exit Optimizer](#9-exit-optimizer)
10. [Notification UX](#10-notification-ux)
11. [추세 분석 프레임워크](#11-추세-분석-프레임워크)
12. [DB Schema (통합)](#12-db-schema)
13. [Data Collection](#13-data-collection)
14. [API Endpoints (통합)](#14-api-endpoints)
15. [메타 게임 시나리오](#15-메타-게임-시나리오)
16. [구현 순서](#16-구현-순서)
17. [검증 체크리스트](#17-검증-체크리스트)

---

## 1. 시스템 전체 구조도

```
┌─────────────────── EXTERNAL DATA ───────────────────────┐
│ Binance │ Yahoo │ CoinGecko │ F&G │ LunarCrush │ RSS    │
│ CryptoQuant │ WhaleAlert │ DeFiLlama │ Blockchain.com   │
└────┬──────────────────────────────────────────────┬──────┘
     │                                              │
     ▼                                              ▼
┌────────────────────────────────────────────────────────────┐
│              SNAPSHOT COLLECTOR (cron)                       │
│  시계열 Append + 추세 계산 + 다이버전스 감지                │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│                 PostgreSQL (Supabase)                        │
│                                                              │
│  indicator_series        시계열 + 추세 메타                  │
│  market_snapshots        원시 데이터 캐시                    │
│  match_memories          유저별 RAG 기억 (pgvector)          │
│  user_passports          6대 메트릭 + 배지 + 티어            │
│  user_agent_progress     Spec 해금 + 에이전트별 매치 수      │
│  agent_analysis_results  매치별 에이전트 분석 결과            │
│  agent_accuracy_stats    글로벌 에이전트+Spec 통계           │
│  arena_matches           매치 상태 + 결과                    │
│  live_sessions           LIVE 관전 세션                      │
│  agent_challenges        Challenge 기록                      │
│  lp_transactions         LP 적립/차감 이력                   │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│                    MATCH ENGINE                              │
│                                                              │
│  1. User A → 3 에이전트 드래프트 + 가중치 + Spec             │
│  2. User B → 3 에이전트 드래프트 + 가중치 + Spec             │
│  3. 각 에이전트:                                             │
│     a. indicator_series → 시계열+추세 읽기                   │
│     b. match_memories → RAG 기억 검색                        │
│     c. Spec LLM 프롬프트 → 해석 생성                        │
│     d. Code 팩터 + LLM 해석 → direction + confidence         │
│  4. 3 에이전트 가중 합산 → 최종 예측                         │
│  5. 유저 hypothesis (override 가능)                          │
│  6. 24h 후 결과 확정                                         │
│  7. 승패 → LP, Passport, RAG, Stats 업데이트                │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│                    FRONTEND                                  │
│                                                              │
│  Lobby → Draft → Analysis → Hypothesis → Battle → Result    │
│  Passport · Oracle · Challenge · LIVE · Scanner              │
└────────────────────────────────────────────────────────────┘
```

---

## 2. 8 Agent Pool + LLM Spec

### 2.1 에이전트 풀

```
┌────────────────── AGENT POOL (8개) ──────────────────────┐
│                                                           │
│  ⚔️ OFFENSE (공격형 — 방향 판단 특화)                     │
│  ├── 📊 STRUCTURE  — 차트 구조, EMA, RSI, 다이버전스      │
│  ├── 📈 VPA        — 볼륨, CVD, 매수매도 비율             │
│  └── ⚡ ICT        — 유동성풀, FVG, OTE, 스마트머니       │
│                                                           │
│  🛡️ DEFENSE (수비형 — 리스크 감지 특화)                   │
│  ├── 💰 DERIV      — OI, 펀딩비, 청산, 롱숏비율           │
│  ├── 💎 VALUATION  — MVRV, NUPL, SOPR, 사이클 위치       │
│  └── 🐋 FLOW       — 거래소 유출입, 고래, 온체인           │
│                                                           │
│  🌐 CONTEXT (환경형 — 매크로/센티먼트)                    │
│  ├── 🧠 SENTI      — Fear&Greed, 소셜, 뉴스               │
│  └── 🌍 MACRO      — DXY, S&P500, 금리, BTC.D, 유동성    │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### 2.2 에이전트별 분석 팩터

#### STRUCTURE (차트 구조)

| Factor | 분석 대상 |
|--------|----------|
| EMA_TREND | EMA7-25 갭의 추세 (기울기, 가속도) |
| RSI_TREND | RSI14 추세 (방향 + 현재 구간) |
| RSI_DIVERGENCE | 가격 vs RSI 다이버전스 |
| MTF_ALIGNMENT | 1H/4H/1D 추세 정렬 |
| PRICE_STRUCTURE | HH/HL vs LH/LL 패턴 |
| VOL_TREND | 거래량 추세 (가격과의 일치 여부) |

#### VPA (볼륨 가격 분석)

| Factor | 분석 대상 |
|--------|----------|
| CVD_TREND | Cumulative Volume Delta 추세 |
| BUY_SELL_RATIO | 매수/매도 볼륨 비율 추세 |
| VOL_PROFILE | 볼륨 프로파일 (POC, VA) |
| ABSORPTION | 매수/매도 흡수 패턴 |
| VOL_DIVERGENCE | 가격 vs 거래량 다이버전스 |
| CLIMAX_SIGNAL | 볼륨 클라이맥스 감지 |

#### ICT (스마트머니)

| Factor | 분석 대상 |
|--------|----------|
| LIQUIDITY_POOL | 유동성 풀 위치 + 가격 접근도 |
| FVG | Fair Value Gap 존재 여부 + 방향 |
| ORDER_BLOCK | 오더블록 위치 + 가격 관계 |
| BOS_CHOCH | Break of Structure / Change of Character |
| DISPLACEMENT | 변위 캔들 (강한 모멘텀) |
| PREMIUM_DISCOUNT | 프리미엄/디스카운트 존 |

#### DERIV (파생상품)

| Factor | 분석 대상 |
|--------|----------|
| OI_PRICE_CONV | OI 추세 + 가격 추세 수렴/발산 |
| FR_TREND | 펀딩비 추세 (과열 방향, 전환점) |
| LIQUIDATION_TREND | 청산 추세 (롱/숏 청산 비율) |
| LS_RATIO_TREND | 롱숏비율 추세 |
| OI_DIVERGENCE | OI vs 가격 다이버전스 |
| SQUEEZE_SIGNAL | 스퀴즈 가능성 (FR 극단 + OI 집중) |

#### VALUATION (밸류에이션)

| Factor | 분석 대상 |
|--------|----------|
| MVRV_ZONE | Market Value to Realized Value 구간 |
| NUPL_TREND | Net Unrealized Profit/Loss 추세 |
| SOPR_SIGNAL | Spent Output Profit Ratio 신호 |
| CYCLE_POSITION | 현재 사이클 위치 추정 |
| REALIZED_CAP_TREND | Realized Cap 변화 추세 |
| SUPPLY_PROFIT | 수익권 공급량 비율 추세 |

#### FLOW (온체인 자금 흐름)

| Factor | 분석 대상 |
|--------|----------|
| EXCHANGE_FLOW | 거래소 순유출입 추세 |
| WHALE_ACTIVITY | 대형 트랜잭션 추세 |
| MINER_FLOW | 채굴자 유출입 추세 |
| STABLECOIN_FLOW | 스테이블코인 공급 추세 |
| ACTIVE_ADDRESSES | 활성 주소 수 추세 |
| ETF_FLOW | ETF 자금 유출입 (BTC) |

#### SENTI (센티먼트)

| Factor | 분석 대상 |
|--------|----------|
| FG_TREND | Fear & Greed 추세 (방향 + 절대값) |
| SOCIAL_VOLUME | 소셜 미디어 언급량 추세 |
| SOCIAL_SENTIMENT | 소셜 긍정/부정 비율 추세 |
| NEWS_IMPACT | 최근 뉴스 임팩트 |
| SEARCH_TREND | 구글 트렌드 추세 |
| CONTRARIAN_SIGNAL | 극단 센티먼트 역발상 |

#### MACRO (매크로)

| Factor | 분석 대상 |
|--------|----------|
| DXY_TREND | 달러 인덱스 추세 (역상관) |
| EQUITY_TREND | S&P500/Nasdaq 추세 (상관) |
| YIELD_TREND | US10Y 금리 추세 (유동성) |
| BTC_DOMINANCE | BTC 도미넌스 추세 |
| STABLECOIN_MCAP | 스테이블코인 시총 추세 (유동성) |
| EVENT_PROXIMITY | FOMC/CPI 이벤트 임박도 |

### 2.3 Spec 시스템 — LLM 프롬프트 기반

#### 핵심 원칙

```
Spec = 사이드그레이드 (강해지는 게 아니라 달라지는 것)
Spec C > Spec A가 아님. 시장 상황에 따라 유불리 다름.
한 매치에 Spec 1개만 장착.

Spec 구현 = 하이브리드:
  Layer 1 (Code): 지표 계산, 시계열 분석 — 결정론적, 정확해야 함
  Layer 2 (LLM): 해석, 논리, thesis 생성 — Spec별 다른 시스템 프롬프트
  Layer 3 (Code): 가중치 테이블 — Spec별 팩터 가중치 다름
```

#### 해금 조건

```
Base Spec   — 처음부터 사용 가능 (균형형)
Spec A      — 해당 에이전트 10전 후 해금
Spec B      — 해당 에이전트 10전 후 해금 (A와 동시)
Spec C      — 해당 에이전트 30전 후 해금
```

#### 전체 8 에이전트 × 4 Spec 맵

| Agent | Base | Spec A (10전) | Spec B (10전) | Spec C (30전) |
|-------|------|---------------|---------------|---------------|
| **STRUCTURE** | 균형 차트 분석 | Trend Rider (기울기+MTF 집중) | Structure Mapper (HH/HL 구조) | Reversal Catcher (다이버전스 역전) |
| **VPA** | 균형 볼륨 분석 | Volume Surge (이상 거래량) | Absorption Reader (흡수 패턴) | Climax Detector (볼륨 클라이맥스) |
| **ICT** | 균형 ICT 분석 | Liquidity Raider (스탑헌팅) | Fair Value Sniper (FVG 되돌림) | Market Maker Model (축적/분배) |
| **DERIV** | 균형 파생 분석 | Squeeze Hunter (청산 캐스케이드) | Position Reader (OI 구조) | Contrarian (과열 역이용) |
| **VALUATION** | 균형 밸류 분석 | Cycle Timer (대주기 고/저점) | Profit Tracker (실현손익 흐름) | Fair Value Band (적정가 이탈) |
| **FLOW** | 균형 온체인 분석 | Whale Follower (고래 추종) | Exchange Flow (거래소 유출입) | Smart Money (고수익 지갑) |
| **SENTI** | 균형 센티먼트 | Crowd Reader (소셜 추종) | Fear Buyer (공포 역발상) | Narrative Tracker (뉴스 모멘텀) |
| **MACRO** | 균형 매크로 | Risk On/Off (위험선호도) | Liquidity Cycle (글로벌 유동성) | Event Trader (FOMC/CPI 이벤트) |

#### LLM Spec 프롬프트 예시 — DERIV 에이전트

```typescript
// src/lib/engine/agents/deriv/prompts.ts

const DERIV_PROMPTS = {
  // Base — 균형형
  base: `You are DERIV, a derivatives market analyst.
Analyze the given futures market data objectively.
Weigh all factors equally: OI trends, funding rate, liquidations, LS ratio.
Present a balanced view without favoring any particular signal.
If signals conflict, clearly state the ambiguity.`,

  // Spec A — Squeeze Hunter
  squeeze_hunter: `You are DERIV [Squeeze Hunter], a specialist in identifying liquidation cascade setups.
Your PRIMARY focus: funding rate extremes combined with concentrated OI.
When FR is >0.03% or <-0.03% AND OI has been rising, AGGRESSIVELY flag squeeze potential.
You LOOK FOR: crowded positions that will get liquidated.
You are BIASED toward: contrarian setups where the crowd will get punished.
Weakness: you may see squeezes everywhere and miss genuine trend continuation.`,

  // Spec B — Position Reader
  position_reader: `You are DERIV [Position Reader], a specialist in reading positional structure.
Your PRIMARY focus: where positions are built and at what levels.
Analyze OI by price level, average entry prices, and how trapped positions might behave.
You LOOK FOR: structural shifts in positioning — who is trapped, who has room.
You are METHODICAL: build thesis from position data, not from momentum.
Weakness: slow to react to sudden moves, may miss fast liquidation events.`,

  // Spec C — Contrarian
  contrarian: `You are DERIV [Contrarian], a specialist in fading overheated derivatives markets.
Your PRIMARY focus: when the market is TOO one-sided, bet against the crowd.
When LS ratio is extreme, FR is extreme, OI is at highs — you FADE the consensus.
You actively SEEK: euphoria to short, panic to buy.
You DISTRUST: continuation signals when positioning is already extreme.
Weakness: in strong trends, contrarian approach gets destroyed.`
};
```

#### Spec 가중치 테이블 예시 — DERIV

```typescript
const DERIV_SPEC_WEIGHTS = {
  base:            { OI_PRICE_CONV: 0.20, FR_TREND: 0.20, LIQUIDATION_TREND: 0.15, LS_RATIO_TREND: 0.15, OI_DIVERGENCE: 0.15, SQUEEZE_SIGNAL: 0.15 },
  squeeze_hunter:  { OI_PRICE_CONV: 0.10, FR_TREND: 0.30, LIQUIDATION_TREND: 0.10, LS_RATIO_TREND: 0.05, OI_DIVERGENCE: 0.10, SQUEEZE_SIGNAL: 0.35 },
  position_reader: { OI_PRICE_CONV: 0.30, FR_TREND: 0.10, LIQUIDATION_TREND: 0.10, LS_RATIO_TREND: 0.25, OI_DIVERGENCE: 0.20, SQUEEZE_SIGNAL: 0.05 },
  contrarian:      { OI_PRICE_CONV: 0.15, FR_TREND: 0.25, LIQUIDATION_TREND: 0.05, LS_RATIO_TREND: 0.30, OI_DIVERGENCE: 0.10, SQUEEZE_SIGNAL: 0.15 },
};
```

### 2.4 에이전트 실행 파이프라인

```typescript
// src/lib/engine/agentPipeline.ts

interface AgentOutput {
  agentId: string;
  specId: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;   // 0-100
  thesis: string;       // LLM이 생성한 해석
  factors: ScoringFactor[];
  bullScore: number;
  bearScore: number;
  memoryContext?: MemoryContext;
  trendContext: Record<string, TrendAnalysis>;
  divergences: DivergenceSignal[];
}

async function runAgent(
  agentId: string,
  specId: string,
  marketData: MarketData,
  memories: MatchMemory[],
  userId: string
): Promise<AgentOutput> {
  // Layer 1: Code — 팩터 계산 (결정론적)
  const factors = await computeFactors(agentId, marketData);
  const trends = computeTrends(agentId, marketData);
  const divergences = detectDivergences(agentId, marketData);

  // Layer 2: LLM — Spec별 해석 (비결정론적)
  const specPrompt = getSpecPrompt(agentId, specId);
  const dataContext = formatDataForLLM(factors, trends, divergences);
  const memoryText = formatMemoriesForLLM(memories);

  const llmResponse = await callLLM({
    system: specPrompt,
    user: `Market data:\n${dataContext}\n\nPast experience:\n${memoryText}\n\nProvide direction (LONG/SHORT/NEUTRAL), confidence (0-100), and thesis.`
  });

  // Layer 3: Code — 가중치 합산 (결정론적)
  const specWeights = getSpecWeights(agentId, specId);
  const weightedFactors = applySpecWeights(factors, specWeights);
  const { bullScore, bearScore } = computeScores(weightedFactors);

  // 최종 판단: Code 스코어 + LLM 해석 합산
  return {
    agentId, specId,
    direction: resolveDirection(bullScore, bearScore, llmResponse.direction),
    confidence: blendConfidence(bullScore, bearScore, llmResponse.confidence),
    thesis: llmResponse.thesis,
    factors: weightedFactors,
    bullScore, bearScore,
    memoryContext: memories.length > 0 ? summarizeMemories(memories) : undefined,
    trendContext: trends,
    divergences,
  };
}
```

---

## 3. Draft + Match Flow

### 3.1 드래프트 규칙

```
매치당 3개 에이전트 선택 (8개 풀에서)
각 에이전트에 가중치 배분 (총 100%)
각 에이전트의 Spec 선택 (해금된 것 중)
드래프트 시간: 60초
상대방 드래프트: 비공개
```

### 3.2 매치 전체 플로우

```
Phase 1: DRAFT (60초)
├── 에이전트 3개 선택
├── 가중치 배분 (예: 40/35/25)
├── Spec 선택
├── 상대방 드래프트는 비공개
└── VS 스크린 (2초 애니메이션)

Phase 2: ANALYSIS (자동, ~5초)
├── 선택된 에이전트들이 실시간 데이터 분석
├── RAG 기억 검색 → 맥락 보강
├── 각 에이전트 LLM Spec 프롬프트로 독립 판단
├── Code 팩터 + LLM 해석 합산
└── 3 에이전트 가중 합산 → 최종 방향 + confidence

Phase 3: HYPOTHESIS (30초) — ⚠️ 독립 판단 원칙
├── 유저가 에이전트 분석 결과를 확인
├── 최종 판단: LONG / SHORT / 에이전트 판단 그대로
├── 유저가 override 할 수도 있음 (전략적 선택)
├── 유저 override 이력도 추적 → Passport IDS에 반영
└── 이 단계에서 Oracle 접근 차단 (독립 판단 보호)

Phase 4: BATTLE (실시간 추적, 60초 + 결정 윈도우)
├── 실제 가격 움직임 추적
├── 10초 Decision Window × 6회 (BUY/SELL/HOLD)
├── 실시간 PnL 표시
├── DS / RE / CI 실시간 계산
└── 24시간 후 최종 확정

Phase 5: RESULT
├── 승패 + LP 보상
├── FBS 계산: 0.5*DS + 0.3*RE + 0.2*CI
├── 에이전트별 개별 적중률 표시
├── Spec 해금 체크 → 알림
├── RAG 기억 저장
├── Passport 갱신
└── agent_accuracy_stats 업데이트
```

### 3.3 매치 합산 로직

```typescript
interface DraftSelection {
  agentId: string;
  specId: string;
  weight: number;  // 0-100, 3개 합산 = 100
}

function computeFinalPrediction(
  outputs: AgentOutput[],
  draft: DraftSelection[]
): MatchPrediction {
  let totalBull = 0;
  let totalBear = 0;

  for (const d of draft) {
    const output = outputs.find(o => o.agentId === d.agentId)!;
    totalBull += output.bullScore * (d.weight / 100);
    totalBear += output.bearScore * (d.weight / 100);
  }

  return {
    direction: totalBull > totalBear ? 'LONG' : 'SHORT',
    confidence: Math.min(99, Math.abs(totalBull - totalBear)),
    agentBreakdown: outputs.map(o => ({
      agentId: o.agentId, specId: o.specId,
      direction: o.direction, confidence: o.confidence,
      thesis: o.thesis,
    })),
  };
}
```

---

## 4. Scoring System

### 4.1 3축 스코어 — DS / RE / CI

```
DS (Decision Score) — 방향 판단 품질
├── 에이전트 합의와 유저 판단의 정확도
├── 드래프트 조합의 시장 적합성
└── 3 에이전트가 시장 레짐에 맞는 조합이었는지

RE (Risk/Execution) — 리스크 관리 + 실행 품질
├── Exit Optimizer 준수 (SL/TP 이행)
├── Decision Window 내 적시 행동
└── 과도한 레버리지 / 무모한 베팅 감지

CI (Confidence Index) — 신뢰도 일관성
├── 유저 신뢰도 vs 실제 결과 캘리브레이션
├── 과대/과소 신뢰 패턴 추적
└── Spec 선택의 일관성
```

### 4.2 FBS 계산

```
FBS = 0.5 × DS + 0.3 × RE + 0.2 × CI

DS 계산:
  direction_correct: 방향이 맞았으면 base 60 + 보너스
  agent_alignment: 드래프트 조합이 시장 레짐에 맞으면 +10~20
  override_bonus: 유저가 에이전트 의견을 뒤집고 맞으면 +15 (IDS에도 반영)

RE 계산:
  sl_compliance: SL 준수 = base 50
  tp_reached: TP 도달 = +20
  timing: Decision Window 내 최적 타이밍 = +30

CI 계산:
  calibration: |confidence - actual_accuracy| 작을수록 높음
  consistency: 최근 10판 신뢰도 분산 작을수록 높음
```

### 4.3 LP 보상 테이블

```
승리 (일반)     → +11 LP
승리 (클러치)   → +18 LP  (FBS 80+ 또는 역전승)
패배 (일반)     → -8 LP
무승부          → +2 LP

보너스:
  Perfect Read (에이전트 3/3 정확) → +3 LP 추가
  DISSENT WIN (에이전트 반대했는데 맞음) → +5 LP 추가
  Challenge WIN → +7 LP
  Challenge LOSS → -4 LP
```

---

## 5. Passport

### 5.1 6대 핵심 메트릭

```
┌────────────────── TRADING PASSPORT ──────────────────────┐
│                                                           │
│  ◆ DIAMOND II          @CryptoKim                        │
│  Passport #0042 · 147판 · 2024-11-12 발급                │
│                                                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │
│  │  68%    │  │  72%    │  │  61%    │                  │
│  │  승률   │  │ 방향정확 │  │  IDS   │                  │
│  └─────────┘  └─────────┘  └─────────┘                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │
│  │  -4.2   │  │  78%    │  │ 🔒 2/3 │                  │
│  │ 캘리브  │  │ GUARDIAN │  │Challenge│                  │
│  └─────────┘  └─────────┘  └─────────┘                  │
│                                                           │
│  ┌─── 에이전트 경험 ───────────────────────────────────┐  │
│  │ DERIV: 48전 28승(58%) · Spec C 해금 · RAG 48건     │  │
│  │ STRUCTURE: 35전 22승(63%) · Spec A/B 해금 · RAG 35건│  │
│  │ MACRO: 12전 7승(58%) · Base만 · RAG 12건            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─── 배지 캐비닛 ──────────────────────────────────────┐  │
│  │ 🏆 SEASON 2 TOP10  🎯 PERFECT READ ×4              │  │
│  │ ⚡ DISSENT WIN ×12  🌙 NIGHT OWL                    │  │
│  │ 🔒 MASTER LEAGUE   🔒 100판 달성                    │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### 5.2 메트릭 계산 공식

| 메트릭 | 공식 | 최소 표본 | 갱신 시점 |
|--------|------|----------|----------|
| **승률** | win_count / (win+loss) × 100 | 10판 | 포지션 종료 시 |
| **방향 정확도** | direction_correct / direction_total × 100 | 10판 | H값 확정 시 (지연 평가) |
| **IDS (독립 판단)** | dissent_win / dissent_total × 100 | DISSENT 5판 | 포지션 종료 시 |
| **캘리브레이션** | confidence_avg − direction_accuracy | 10판 | H값 확정 시 |
| **GUARDIAN 순종** | override_accepted / override_offered × 100 | Override 3회 | APPROVE/REJECT 시 |
| **Challenge 승률** | challenge_win / challenge_total × 100 | Challenge 3회 | Challenge 판정 시 |

### 5.3 에이전트 경험 섹션 (신규)

Passport에 유저가 사용한 에이전트별 통계 표시:

```typescript
interface PassportAgentStats {
  agentId: string;
  totalMatches: number;
  wins: number;
  winRate: number;
  unlockedSpecs: string[];       // ['base', 'a', 'b']
  mostUsedSpec: string;          // 'squeeze_hunter'
  ragMemoryCount: number;        // 48건
  bestComboWith: string[];       // ['STRUCTURE', 'MACRO'] 이 에이전트와 함께 쓸 때 승률 최고
  avgDraftWeight: number;        // 평균 배분 가중치
}
```

### 5.4 공개 범위 원칙

```
본인 뷰     = 전체 (모든 메트릭 + 에이전트 경험 + 히스토리)
팔로워 뷰   = 승률 + 방향 정확도 + IDS만
Creator 뷰  = 위 + 캘리브레이션 추가 공개
비공개 항목  = worst_pnl, 연속 손실 최고, GUARDIAN 무시 후 손실률
```

### 5.5 티어 시스템

| 티어 | LP 범위 | 해금 기능 |
|------|--------|----------|
| **Bronze** | 0-200 LP | 기본 기능, 에이전트 8개 풀 Base Spec만 |
| **Silver** | 200-600 LP | Spec A/B 해금 가능, 멀티 포지션 |
| **Gold** | 600-1,200 LP | Oracle 전체 접근, Challenge 가능, Spec C 해금 가능 |
| **Diamond** | 1,200-2,200 LP | LIVE 관전 공개, Creator 프로필, Season 랭킹 |
| **Master** | 2,200+ LP | Strategy NFT, Coach Review, 전체 에이전트 해금 가능 |

### 5.6 기록 트리거 — 언제 어떤 컬럼이 갱신되는가

#### SUBMIT 시점 (가설 제출 즉시)

| 조건 | 갱신 컬럼 | 방식 |
|------|----------|------|
| 방향(LONG/SHORT/NEUTRAL) 제출 | total_hypotheses | +1 |
| 방향이 LONG 또는 SHORT인 경우만 | direction_total | +1 |
| 신뢰도(1-5) 입력 시 | confidence_avg | 가중 평균 재계산 |
| 드래프트 3 에이전트 정보 | draft_history | JSONB append |

#### APPROVE / REJECT 시점

| 조건 | 갱신 컬럼 | 방식 |
|------|----------|------|
| APPROVE 선택 | total_approved | +1 |
| REJECT 선택 | total_rejected | +1 (이후 갱신 없음) |
| APPROVE + 합의 (에이전트 3/3) | consensus_count | +1 |
| APPROVE + 이견 (에이전트 2/3 이하) | dissent_count | +1 |
| 유저가 에이전트 방향을 override | override_count | +1 |

#### 포지션 종료 시점

| 조건 | 갱신 컬럼 | 방식 |
|------|----------|------|
| 수익 마감 (pnl > 0) | win_count, total_pnl_bps | +1 / 누적 |
| 손실 마감 (pnl < 0) | loss_count, total_pnl_bps | +1 / 누적 |
| 방향 정확 (H값 기준) | direction_correct | +1 |
| DISSENT + 수익 | dissent_win_count | +1 |
| 에이전트별 승리 | user_agent_progress wins | +1 |
| 매치 수 → Spec 해금 체크 | unlocked_specs | 조건 충족 시 추가 |
| RAG 기억 저장 | match_memories | INSERT |

#### 일배치 (00:05 UTC)

| 조건 | 갱신 컬럼 | 방식 |
|------|----------|------|
| agent_accuracy_stats 재계산 | accuracy_pct, avg_confidence | 전체 재계산 |
| Passport 파생 지표 재계산 | win_rate, calibration 등 | 재계산 |
| 글로벌 Oracle 리더보드 갱신 | agent_performance_snapshots | 스냅샷 |

### 5.7 배지 시스템

| 배지 | 조건 | 카테고리 |
|------|------|---------|
| 🏆 SEASON TOP10 | 시즌 종료 시 LP 상위 10 | Season |
| 🎯 PERFECT READ | 에이전트 3/3 정확 매치 | Skill |
| ⚡ DISSENT WIN | 에이전트 반대 의견 냈는데 유저가 맞음 | Courage |
| 🌙 NIGHT OWL | UTC 00:00-06:00 매치 30회 | Activity |
| 🐋 WHALE HUNTER | FLOW 에이전트 Spec C 해금 | Mastery |
| 🔮 ORACLE MASTER | 모든 에이전트 30전 이상 + 승률 60%+ | Mastery |
| 💎 DIAMOND HANDS | 연속 5판 APPROVE (REJECT 없이) | Consistency |
| 🔒 MASTER LEAGUE | Master 티어 도달 | Progression |

---

## 6. User Journey — 6 Phase Lifecycle

### 6.1 전체 라이프사이클

```
┌─────┬──────────┬─────────────────────────────────────────┐
│  P0 │AWARENESS │ LP: 없음 · 외부 유입 → 가입             │
├─────┼──────────┼─────────────────────────────────────────┤
│  P1 │ONBOARDING│ LP: 0 (Bronze) · 가입 → 첫 판 · 5분 이내│
├─────┼──────────┼─────────────────────────────────────────┤
│  P2 │FIRST LOOP│ LP: 0→200 · 첫 판 → 10판 · 습관 형성   │
├─────┼──────────┼─────────────────────────────────────────┤
│  P3 │PROGRESS  │ LP: 200→1200 · Bronze→Silver→Gold       │
├─────┼──────────┼─────────────────────────────────────────┤
│  P4 │COMPETE   │ LP: 1200→2200 · Gold→Diamond            │
├─────┼──────────┼─────────────────────────────────────────┤
│  P5 │MASTERY   │ LP: 2200+ · Diamond→Master              │
└─────┴──────────┴─────────────────────────────────────────┘
```

### 6.2 Phase별 해금 항목 — 에이전트 시스템 연동

| Phase | LP 범위 | 에이전트 해금 | Spec 해금 | 기능 해금 |
|-------|---------|-------------|----------|----------|
| P0 | - | - | - | 랜딩 + 가입 |
| P1 | 0 | 8개 풀 접근 (Base만) | Base only | 데모 판, 드래프트 튜토리얼 |
| P2 | 0→200 | 8개 풀 전체 | 각 에이전트 10전 후 A/B | Loop B (이벤트), Loop C (포지션) |
| P3 | 200→1200 | 통계 화면 해금 | 각 에이전트 30전 후 C | Loop D (일배치), Oracle 열람, Challenge |
| P4 | 1200→2200 | Oracle 전체 + 에이전트 상세 | 전체 접근 | LIVE 관전 공개, Season 랭킹, 팀 매치 |
| P5 | 2200+ | RAG 기억 리뷰 화면 | 전체 + 크로스 Spec 분석 | Strategy NFT, Coach Review, LIVE 스트리밍 |

### 6.3 3 Loop 구조

```
Loop B — 이벤트 (SCANNER 트리거)
├── SCANNER/Daemon 이상 신호 감지
├── Push 알림 → 코인명+강도만 (방향 절대 미포함)
├── 유저 앱 진입 → 클린 차트
├── 가설 입력 (방향 + 신뢰도 + 근거 태그)
├── SUBMIT → 에이전트 3개 분석 (드래프트 기반)
├── 결과 비교: 유저 가설 ↔ 에이전트 합의
├── APPROVE → Loop C 진입 / REJECT → 대기 복귀
└── Passport 기록 + LP

Loop C — 포지션 (APPROVE 후 자동 시작)
├── 포지션 오픈
├── 중간 업데이트 수신 (에이전트 재분석)
├── 홀드/청산 재판단
├── SL/TP 도달 또는 수동 종료
└── 결과 확정 → RAG 기억 저장

Loop D — 일배치 (00:05 UTC)
├── 어제 판 결과 공개
├── Oracle 리더보드 갱신
├── 오늘 SCANNER 후보 확인
├── Passport 파생 지표 재계산
└── 에이전트 accuracy_stats 업데이트
```

### 6.4 P2 판정별 유저 반응 대응

| 판정 | 유저 감정 | 이탈 위험 | 설계 대응 |
|------|---------|---------|---------|
| 🟢 CONSENSUS 3/3 | 강한 성취감 | 없음 | +LP 애니 강조, Perfect Read 배지 |
| 🟡 PARTIAL 2/3 | 애매함 | 낮음 | '2/3 합의' 명확 표시, 이견 에이전트 아이콘 강조 |
| 🔴 DISSENT | 당황 | 높음 (P2) | '에이전트가 항상 맞지는 않음' + 이견 보기 CTA |
| ⚫ OVERRIDE | 혼란 | 중간 | 사유 한 줄 필수 표시 |

### 6.5 연패 방지 메커니즘

```
3연패 시: "잠시 쉬어가세요" 알림 + 분석 요약 제공
5연패 시: 에이전트 추천 조합 변경 제안
         + 유저의 최근 드래프트 패턴 분석
         + "이 시장 레짐에서 이 조합이 더 나을 수 있습니다"
7연패 시: 강제 휴식 없음 (유저 자율)
         + 다만 연패 기간 LP 감소량 완화 (-8 → -5)
```

---

## 7. Engagement: Oracle · Challenge · LIVE

### 7.1 Oracle — 에이전트+Spec 리더보드

```
Oracle = 에이전트별 적중률 + Spec별 성과 공개 리더보드

⚠️ 핵심 원칙: 가설 입력 중 Oracle 접근 차단
  (성적 좋은 에이전트 따라가기 = 독립 판단 원칙 붕괴)

표시 항목:
├── 에이전트 이름 + Spec
├── 적중률 (Wilson Score 보정)
├── 표본 수
├── 95% 신뢰구간
├── 캘리브레이션
├── 최강 코인 (에이전트-코인별 적중률)
├── 30일 추이 (스파크라인)
└── 시장 레짐별 성과
```

#### Oracle 확장 — Spec별 표시

기존 wtd 5개 에이전트 → 8개 에이전트 × 4 Spec = 32개 행

```
Oracle 리더보드 (30일 기준):
1. FLOW [Smart Money]     — 74% (289건) — BTC 최강
2. DERIV [Squeeze Hunter] — 72% (341건) — ALT 최강
3. STRUCTURE [Trend Rider] — 71% (312건) — BTC 최강
4. MACRO [Event Trader]   — 68% (198건) — 전체 균일
5. VALUATION [Cycle Timer] — 67% (156건) — BTC 최강
...
```

### 7.2 Challenge — 에이전트에 도전

```
Challenge = 특정 에이전트+Spec의 최근 판단에 반박

조건:
├── Gold 이상 (P3+)
├── 해당 에이전트 10전 이상 사용 경험
├── 반박 방향 + 근거 태그 + 선택적 근거 텍스트 (280자)
└── H값 확정 후 자동 판정

보상:
├── Challenge WIN → +7 LP + Passport Challenge 승률 갱신
├── Challenge LOSS → -4 LP
└── Challenge 5승 이상 → "에이전트 킬러" 배지

Passport 연동:
├── Challenge 승률 = challenge_win / challenge_total
├── 최소 3회 후 공개
└── 본인 뷰에서만 전체, 팔로워 뷰에서는 승률만
```

### 7.3 LIVE — 실시간 관전

```
LIVE = Diamond+ Creator가 매치 과정을 실시간 공개

해금 조건: Diamond 티어 (LP 1200+) + 50전 이상
공개 설정: Creator 자발적 (기본값 비공개)

관전 내용 (SSE 실시간 스트림):
├── 가설 제출 즉시 팔로워에게 노출
├── 에이전트 분석 진행 상태 (실시간)
├── APPROVE/REJECT 결정
├── 포지션 진행 PnL (실시간)
├── 에이전트 방향: Creator 결과 확인 후에만 노출
└── 댓글: 판 종료 후에만 활성화

팔로워 = 읽기 전용:
├── 리액션만 허용 (🔥🧊🤔⚡💀)
├── Creator에게 영향 주는 행동 금지
└── 코멘트는 판 종료 후

관전 타임라인:
├── 14:32 📊 가설 제출: ▲ LONG — 신뢰도 4/5
├── 14:32 🤖 에이전트 분석 시작 (DERIV 완료, STRUCTURE 진행 중...)
├── 14:33 ✅ 전체 분석 완료: Entry Score 74
├── 14:33 📋 ✓ APPROVE
├── 14:35 📈 포지션 오픈: $96,420
├── 14:48 ⚡ 중간 업데이트: +1.2%
└── 15:10 🏁 종료: +2.3% WIN
```

---

## 8. RAG Memory System

### 8.1 개념

```
레벨업 = "강해진다" → ❌ P2W
RAG 기억 = "맥락이 풍부해진다" → ✅ 경험

에이전트는 유저별로 과거 매치를 기억.
같은 시장 상황이 오면 과거 경험을 참고해서 분석.
과거가 미래를 보장하지 않으므로 P2W가 아님.
잘못된 기억이 오히려 방해될 수도 있음.
```

### 8.2 기억 저장 (매 매치 종료 시)

```typescript
interface MatchMemory {
  userId: string;
  agentId: string;        // 'DERIV'
  specId: string;         // 'squeeze_hunter'
  pair: string;           // 'BTCUSDT'
  matchId: string;

  marketState: {
    indicators: Record<string, { value: number; trend: TrendAnalysis }>;
    regime: 'trending_up' | 'trending_down' | 'ranging' | 'volatile';
    priceLevel: number;
  };

  prediction: { direction: string; confidence: number };
  factors: ScoringFactor[];
  thesis: string;

  outcome: boolean;
  priceChange: number;
  lesson: string;           // LLM 자동 생성 교훈

  embedding: number[];      // pgvector 256d
  createdAt: Date;
}
```

### 8.3 기억 검색 (매 매치 시작 시)

```typescript
async function retrieveMemories(
  userId: string,
  agentId: string,
  currentMarketEmbedding: number[],
  limit: number = 5
): Promise<MatchMemory[]> {
  const { data } = await supabase.rpc('search_memories', {
    query_embedding: currentMarketEmbedding,
    match_user_id: userId,
    match_agent_id: agentId,
    match_count: limit
  });
  return data;
}
```

### 8.4 기억 보강

```typescript
function augmentWithMemories(
  baseAnalysis: ReasoningResult,
  memories: MatchMemory[]
): ReasoningResult {
  if (memories.length === 0) return baseAnalysis;

  const wins = memories.filter(m => m.outcome);
  const losses = memories.filter(m => !m.outcome);

  const memoryContext = {
    totalSimilar: memories.length,
    winRate: wins.length / memories.length,
    winPatterns: extractPatterns(wins),
    lossPatterns: extractPatterns(losses),
    suggestions: generateSuggestions(losses),
  };

  return {
    ...baseAnalysis,
    memoryContext,
    thesis: baseAnalysis.thesis +
      `\n[경험] 유사 ${memories.length}건 중 ${wins.length}건 성공.` +
      (memoryContext.lossPatterns[0]?.detail || ''),
  };
}
```

### 8.5 임베딩 생성

```typescript
// 옵션 1: 수치 정규화 벡터 (ML 불필요, 비용 0)
function createMarketEmbedding(indicators: Record<string, any>): number[] {
  // 각 지표의 [value_norm, slope_norm, accel_norm] concatenate
  // → 약 50-100차원 벡터 (padding으로 256d)
}

// 옵션 2: LLM 임베딩 (더 정확, 비용 발생)
// text-embedding-3-small → 256d
async function createLLMEmbedding(marketStateText: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: marketStateText,
    dimensions: 256
  });
  return response.data[0].embedding;
}
```

### 8.6 Passport 연동

- Passport 에이전트 경험 섹션에 RAG 기억 건수 표시
- P5 Master에서 RAG 기억 리뷰 화면 해금
  - 유저가 과거 기억을 검토하고 "이건 더 이상 유효하지 않다" 삭제 가능
  - 삭제된 기억은 이후 검색에서 제외

---

## 9. Exit Optimizer

```typescript
interface ExitRecommendation {
  conservative: { sl: number; tp: number; rr: number; tpProb: number; ev: number };
  balanced:     { sl: number; tp: number; rr: number; tpProb: number; ev: number };
  aggressive:   { sl: number; tp: number; rr: number; tpProb: number; ev: number };
  recommended: 'conservative' | 'balanced' | 'aggressive';
  kellySize: number;  // 최적 포지션 사이즈 %
}

function computeExitLevels(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  atr: number,
  supports: number[],
  resistances: number[],
  historicalHitRate: number
): ExitRecommendation {
  // Conservative: ATR × 1.0 SL, 가장 가까운 지지/저항 TP
  // Balanced: ATR × 1.5 SL, 두 번째 지지/저항 TP
  // Aggressive: ATR × 2.0 SL, 세 번째 지지/저항 TP

  // R:R = TP거리 / SL거리
  // EV = (tpProb × tpProfit) - (slProb × slLoss)
  // Kelly = (tpProb × rr - slProb) / rr

  // recommended = EV가 가장 높은 것
}
```

Exit Optimizer 결과는:
- 매치 분석 후 HYPOTHESIS 단계에서 표시
- RE(Risk/Execution) 스코어 계산에 사용
- Passport 리스크 프로필에 SL 준수율 기록

---

## 10. Notification UX

### 10.1 4등급 알림 체계

| 등급 | 표시 방식 | 트리거 |
|------|---------|--------|
| **CRITICAL** | 풀스크린 오버레이 (닫기 버튼) | 캐스케이드 청산 $50M+, RSI 90+, 포지션 SL 5% 이내 |
| **HIGH** | Tray + 아이콘 빨간 점 | SCANNER A-Grade, MSS 감지, 고래 $10M+ |
| **MEDIUM** | Tray만 (아이콘 변화 없음) | Condition 충족, Standing Order B~C급 |
| **LOW** | /scanner 피드에만 | 정기 보고, Light Score 갱신 |

### 10.2 Intent Modal 흐름 (독립 판단 원칙)

```
Tray [분석 시작] 클릭
→ Step 1: 코인명 + 강도 (방향 절대 노출 안 함)
→ Step 2: 가설 입력 (방향 + 신뢰도 + 근거 태그)
→ SUBMIT (이 시점에 드래프트된 에이전트 분석 시작)
→ Step 3: 에이전트 분석 실행 — 이 시점부터 신호 내용 공개
→ 결과 비교
→ APPROVE/REJECT
→ Passport 기록 갱신 (포지션 종료 후)
```

### 10.3 ⚠️ 독립 판단 원칙 (Direction 4)

```
절대 원칙:
- 알림 텍스트에 LONG/SHORT 포함 금지
- 가설 입력 전 에이전트 방향 노출 금지
- 가설 입력 중 Oracle 접근 차단
- LIVE 관전에서도 에이전트 방향은 Creator 결과 확인 후 노출

이유:
유저가 먼저 판단하고, 에이전트와 비교하는 것이 시스템 핵심.
에이전트 의견을 먼저 보면 독립적 판단이 불가능.
```

---

## 11. 추세 분석 프레임워크

### 11.1 핵심 타입

```typescript
interface TrendAnalysis {
  direction: 'RISING' | 'FALLING' | 'FLAT';
  slope: number;           // -1.0 ~ +1.0 정규화
  acceleration: number;    // 기울기의 변화율
  strength: number;        // 0-100
  duration: number;        // 현재 추세 유지 봉 수
  fromValue: number;
  toValue: number;
  changePct: number;
}

interface DivergenceSignal {
  type: 'BULLISH_DIV' | 'BEARISH_DIV' | 'HIDDEN_BULL' | 'HIDDEN_BEAR' | 'NONE';
  indicator: string;
  priceAction: 'HH' | 'HL' | 'LH' | 'LL';
  indicatorAction: 'HH' | 'HL' | 'LH' | 'LL';
  confidence: number;
  detail: string;
}

interface MultiTimeframeTrend {
  tf1h: TrendAnalysis;
  tf4h: TrendAnalysis;
  tf1d: TrendAnalysis;
  alignment: 'ALIGNED_BULL' | 'ALIGNED_BEAR' | 'CONFLICTING' | 'NEUTRAL';
}
```

### 11.2 핵심 원칙

```
"RSI 58 자체는 의미 없음."
"RSI가 30→58로 올라온 건지, 80→58로 내려온 건지가 판단의 핵심."

모든 지표는 시계열로 저장.
N봉 window의 방향/기울기/가속도/다이버전스 분석.
```

---

## 12. DB Schema

### 12.1 indicator_series

```sql
CREATE TABLE indicator_series (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair        text NOT NULL,
  timeframe   text NOT NULL,
  indicator   text NOT NULL,
  timestamps  bigint[] NOT NULL,
  values      numeric[] NOT NULL,
  trend_dir   text,
  trend_slope numeric(10,6),
  trend_accel numeric(10,6),
  trend_strength numeric(5,2),
  trend_duration int,
  divergence_type text,
  divergence_conf numeric(5,2),
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pair, timeframe, indicator)
);
```

### 12.2 market_snapshots

```sql
CREATE TABLE market_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair        text NOT NULL,
  source      text NOT NULL,
  data_type   text NOT NULL,
  payload     jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  UNIQUE(pair, source, data_type)
);
```

### 12.3 arena_matches

```sql
CREATE TABLE arena_matches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair        text NOT NULL,
  timeframe   text NOT NULL DEFAULT '4h',

  user_a_id   text NOT NULL,
  user_b_id   text,              -- NULL = AI 대전

  -- 드래프트
  user_a_draft jsonb NOT NULL,   -- [{agentId, specId, weight}]
  user_b_draft jsonb,

  -- 최종 예측
  user_a_prediction jsonb,       -- {direction, confidence, override}
  user_b_prediction jsonb,

  -- 스코어
  user_a_ds   numeric(5,2),
  user_a_re   numeric(5,2),
  user_a_ci   numeric(5,2),
  user_a_fbs  numeric(5,2),
  user_b_ds   numeric(5,2),
  user_b_re   numeric(5,2),
  user_b_ci   numeric(5,2),
  user_b_fbs  numeric(5,2),

  -- 결과
  entry_price numeric(16,8),
  exit_price  numeric(16,8),
  price_change numeric(8,4),
  winner_id   text,
  result_type text,              -- 'normal_win', 'clutch_win', 'draw'

  -- LP
  user_a_lp_delta int DEFAULT 0,
  user_b_lp_delta int DEFAULT 0,

  -- 상태
  status      text NOT NULL DEFAULT 'DRAFT',
  -- DRAFT → ANALYSIS → HYPOTHESIS → BATTLE → RESULT
  market_regime text,            -- 'trending_up', 'trending_down', 'ranging', 'volatile'

  created_at  timestamptz DEFAULT now(),
  started_at  timestamptz,
  ended_at    timestamptz
);
```

### 12.4 agent_analysis_results

```sql
CREATE TABLE agent_analysis_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid REFERENCES arena_matches(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  agent_id    text NOT NULL,
  spec_id     text NOT NULL,
  draft_weight numeric(5,2) NOT NULL,
  pair        text NOT NULL,

  direction   text NOT NULL CHECK (direction IN ('LONG','SHORT','NEUTRAL')),
  confidence  numeric(5,2) NOT NULL,
  thesis      text NOT NULL,

  factors     jsonb NOT NULL DEFAULT '[]',
  bull_score  numeric(5,2) DEFAULT 0,
  bear_score  numeric(5,2) DEFAULT 0,
  trend_context jsonb,
  divergences   jsonb,
  memory_context jsonb,

  llm_prompt_used text,          -- 사용된 Spec 프롬프트 ID
  latency_ms  int,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, user_id, agent_id)
);
```

### 12.5 match_memories (RAG + pgvector)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE match_memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  agent_id    text NOT NULL,
  spec_id     text NOT NULL,
  pair        text NOT NULL,
  match_id    uuid REFERENCES arena_matches(id),

  market_state  jsonb NOT NULL,
  market_regime text,

  direction   text NOT NULL,
  confidence  numeric(5,2),
  factors     jsonb,
  thesis      text,

  outcome     boolean,
  price_change numeric(8,4),
  lesson      text,

  embedding   vector(256),
  is_active   boolean DEFAULT true,  -- 유저가 삭제한 기억은 false

  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_memory_user_agent ON match_memories(user_id, agent_id, pair);
CREATE INDEX idx_memory_vector ON match_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(256),
  match_user_id text,
  match_agent_id text,
  match_count int DEFAULT 5
) RETURNS SETOF match_memories AS $$
  SELECT * FROM match_memories
  WHERE user_id = match_user_id
    AND agent_id = match_agent_id
    AND is_active = true
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql;
```

### 12.6 user_passports

```sql
CREATE TABLE user_passports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  passport_number int GENERATED ALWAYS AS IDENTITY,

  -- 6대 메트릭
  total_hypotheses  int DEFAULT 0,
  total_approved    int DEFAULT 0,
  total_rejected    int DEFAULT 0,
  win_count         int DEFAULT 0,
  loss_count        int DEFAULT 0,
  direction_total   int DEFAULT 0,
  direction_correct int DEFAULT 0,
  dissent_count     int DEFAULT 0,
  dissent_win_count int DEFAULT 0,
  override_offered  int DEFAULT 0,
  override_accepted int DEFAULT 0,
  override_ignored  int DEFAULT 0,
  challenge_total   int DEFAULT 0,
  challenge_win     int DEFAULT 0,
  confidence_sum    numeric(10,2) DEFAULT 0,
  total_pnl_bps     numeric(10,2) DEFAULT 0,

  -- 파생 지표 (00:05 UTC 재계산)
  win_rate          numeric(5,2) DEFAULT 0,
  direction_accuracy numeric(5,2) DEFAULT 0,
  ids_score         numeric(5,2) DEFAULT 0,
  calibration       numeric(6,2) DEFAULT 0,
  guardian_compliance numeric(5,2) DEFAULT 0,
  challenge_win_rate numeric(5,2) DEFAULT 0,

  -- 연속 기록
  current_streak    int DEFAULT 0,
  best_win_streak   int DEFAULT 0,
  worst_loss_streak int DEFAULT 0,

  -- LP + 티어
  lp_total          int DEFAULT 0,
  tier              text DEFAULT 'BRONZE',
  tier_level        int DEFAULT 1,        -- I, II, III

  -- 드래프트 통계
  draft_history     jsonb DEFAULT '[]',   -- 최근 50판 드래프트 기록
  favorite_agents   jsonb DEFAULT '{}',   -- {DERIV: 48, STRUCTURE: 35, ...}

  -- 배지
  badges            jsonb DEFAULT '[]',   -- [{id, name, earned_at}]

  -- 공개 설정
  is_creator        boolean DEFAULT false,
  live_enabled      boolean DEFAULT false,

  issued_at         timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
```

### 12.7 user_agent_progress

```sql
CREATE TABLE user_agent_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  agent_id    text NOT NULL,

  total_matches  int NOT NULL DEFAULT 0,
  wins           int NOT NULL DEFAULT 0,
  losses         int NOT NULL DEFAULT 0,
  win_rate       numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_matches > 0 THEN (wins::numeric / total_matches * 100) ELSE 0 END
  ) STORED,

  unlocked_specs text[] DEFAULT '{base}',
  most_used_spec text DEFAULT 'base',
  avg_draft_weight numeric(5,2) DEFAULT 33.33,

  -- 함께 쓸 때 성과
  combo_stats    jsonb DEFAULT '{}',  -- {"STRUCTURE": {matches: 10, wins: 7}, ...}

  last_10_results boolean[] DEFAULT '{}',
  current_streak  int DEFAULT 0,
  best_streak     int DEFAULT 0,

  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, agent_id)
);
```

### 12.8 agent_accuracy_stats

```sql
CREATE TABLE agent_accuracy_stats (
  agent_id        text NOT NULL,
  spec_id         text NOT NULL,
  total_calls     int NOT NULL DEFAULT 0,
  correct_calls   int NOT NULL DEFAULT 0,
  accuracy_pct    numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_calls > 0 THEN (correct_calls::numeric / total_calls * 100) ELSE 0 END
  ) STORED,
  avg_confidence  numeric(5,2) DEFAULT 0,
  regime_stats    jsonb DEFAULT '{}',
  coin_stats      jsonb DEFAULT '{}',  -- {"BTC": {calls: 100, correct: 72}, ...}
  updated_at      timestamptz DEFAULT now(),
  PRIMARY KEY (agent_id, spec_id)
);
```

### 12.9 lp_transactions

```sql
CREATE TABLE lp_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  match_id    uuid REFERENCES arena_matches(id),
  amount      int NOT NULL,              -- +11, -8, +18, +7 등
  reason      text NOT NULL,             -- 'normal_win', 'clutch_win', 'loss', 'challenge_win', 'perfect_read'
  balance_after int NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_lp_user ON lp_transactions(user_id, created_at DESC);
```

### 12.10 live_sessions

```sql
CREATE TABLE live_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid REFERENCES arena_matches(id),
  creator_id  text NOT NULL,
  pair        text NOT NULL,
  direction   text,
  confidence  int,
  stage       text NOT NULL DEFAULT 'WAITING',
  -- WAITING → HYPOTHESIS_SUBMITTED → ANALYSIS_RUNNING → POSITION_OPEN → RESULT_SHOWN
  spectator_count int DEFAULT 0,
  pnl_current numeric(8,4),
  is_live     boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  ended_at    timestamptz
);
```

### 12.11 agent_challenges

```sql
CREATE TABLE agent_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  agent_id    text NOT NULL,
  spec_id     text NOT NULL,
  pair        text NOT NULL,
  user_direction text NOT NULL,         -- 유저의 반박 방향
  agent_direction text NOT NULL,        -- 에이전트의 원래 방향
  reason_tags text[] DEFAULT '{}',
  reason_text text,
  outcome     boolean,                  -- true = 유저 승, false = 에이전트 승
  lp_delta    int,
  match_id    uuid REFERENCES arena_matches(id),
  created_at  timestamptz DEFAULT now(),
  resolved_at timestamptz
);
```

---

## 13. Data Collection

### 13.1 수집 주기별 지표

| 지표 | 주기 | 시계열 | TF | 에이전트 |
|------|------|--------|-----|---------|
| Klines (OHLCV) | 30초 | 200봉 | 1h, 4h, 1d | STRUCTURE, VPA, ICT |
| EMA 7/25/99 | kline 갱신 | 200 | 1h, 4h, 1d | STRUCTURE |
| RSI 14 | kline 갱신 | 200 | 1h, 4h, 1d | STRUCTURE |
| ATR 14 | kline 갱신 | 200 | 4h | Exit Optimizer |
| MACD | kline 갱신 | 200 | 4h | STRUCTURE |
| OBV / CVD | kline 갱신 | 200 | 4h | VPA |
| OI | 1분 | 200 | 5m | DERIV |
| Funding Rate | 8시간 | 100 | 8h | DERIV |
| LS Ratio | 1분 | 200 | 5m | DERIV |
| Liquidations | 1분 | 200 | 5m | DERIV |
| Fear & Greed | 1시간 | 30일 | 1d | SENTI |
| BTC Dominance | 5분 | 200 | 4h | MACRO |
| DXY | 5분 | 200 | 4h | MACRO |
| S&P500 | 5분 (장중) | 200 | 4h | MACRO |
| US10Y | 5분 (장중) | 200 | 4h | MACRO |
| Stablecoin Mcap | 1시간 | 200 | 1d | MACRO |
| MVRV / NUPL | 1시간 | 200 | 1d | VALUATION |
| Exchange Flows | 5분 | 200 | 4h | FLOW |
| Whale Txns | 1분 | 200 | 1h | FLOW |
| Social Volume | 1시간 | 200 | 4h | SENTI |

### 13.2 API 소스

| 데이터 | 소스 | 비용 |
|--------|------|------|
| Klines, OI, FR, Liq, LS | Binance Futures API | 무료 |
| Fear & Greed | alternative.me | 무료 |
| BTC.D, Stablecoin Mcap | CoinGecko /global | 무료 (50/min) |
| DXY, S&P500, US10Y | Yahoo Finance | 무료 |
| MVRV, NUPL, SOPR | CoinGlass / Blockchain.com | 무료 제한 |
| Exchange Flows | CryptoQuant | 무료 제한 |
| Whale Txns | Whale Alert API | 무료 (10/min) |
| Social Volume | LunarCrush (MCP) | 무료 |
| TVL | DeFiLlama | 무료 |
| News | CoinDesk/CoinTelegraph RSS | 무료 |

---

## 14. API Endpoints

### 데이터 수집
- `POST /api/market/snapshot` — cron, 시계열 append + 추세 계산

### 매치
- `POST /api/arena/match/create` — 매치 생성 (매칭)
- `POST /api/arena/match/:id/draft` — 드래프트 제출 (3 에이전트 + 가중치 + Spec)
- `POST /api/arena/match/:id/analyze` — 에이전트 분석 실행
- `POST /api/arena/match/:id/hypothesis` — 최종 예측 제출 (override 포함)
- `GET /api/arena/match/:id/battle` — 실시간 배틀 상태 (SSE)
- `GET /api/arena/match/:id/result` — 매치 결과

### 에이전트
- `GET /api/arena/agents` — 에이전트 풀 목록 + 유저별 해금 상태
- `GET /api/arena/agents/:id/specs` — Spec 목록 + 해금 상태
- `GET /api/arena/agents/:id/stats` — 글로벌 통계 (Oracle)
- `GET /api/arena/agents/:id/memories` — 유저별 RAG 기억 요약

### Oracle
- `GET /api/oracle/leaderboard` — 에이전트+Spec 리더보드
- `GET /api/oracle/agents/:id/profile` — 에이전트 상세 프로필

### Challenge
- `POST /api/agents/:id/challenge` — Challenge 제출
- `GET /api/challenges/me` — 내 Challenge 히스토리

### Passport
- `GET /api/passport/me` — 내 Passport 전체
- `GET /api/passport/:userId` — 다른 유저 Passport (공개 범위)
- `GET /api/passport/me/agents` — 에이전트별 경험 통계
- `GET /api/passport/me/history` — 매치 히스토리

### LIVE
- `POST /api/live/sessions/:matchId/start` — LIVE 세션 시작
- `GET /api/live/sessions/:id/stream` — SSE 실시간 스트림
- `POST /api/live/sessions/:id/react` — 리액션 전송
- `GET /api/live/sessions/active` — 진행 중 세션 목록

### LP
- `GET /api/lp/me` — 내 LP 잔액 + 히스토리
- `GET /api/lp/ladder` — 티어별 LP 기준

### 프록시
- `GET /api/feargreed` — F&G 프록시
- `GET /api/coingecko/global` — CoinGecko 프록시
- `GET /api/yahoo/:symbol` — Yahoo Finance 프록시

---

## 15. 메타 게임 시나리오

```
상승장 (트렌딩):
  강한 조합: STRUCTURE [Trend Rider] + MACRO [Risk On/Off] + VPA [Volume Surge]
  약한 조합: VALUATION + SENTI (추세 무시, 역발상 실패)

횡보장 (레인지):
  강한 조합: VPA [Absorption Reader] + ICT [Fair Value Sniper] + DERIV [Position Reader]
  약한 조합: MACRO + STRUCTURE [Trend Rider] (추세 없어서 혼란)

고점 (버블):
  강한 조합: VALUATION [Cycle Timer] + SENTI [Fear Buyer] + FLOW [Smart Money]
  약한 조합: STRUCTURE [Trend Rider] (추세 따라가다 꼭대기에서 잡힘)

폭락 (패닉):
  강한 조합: DERIV [Squeeze Hunter] + SENTI [Crowd Reader] + FLOW [Whale Follower]
  약한 조합: MACRO [Liquidity Cycle] (매크로 반응 느림)

이벤트 (FOMC/CPI):
  강한 조합: MACRO [Event Trader] + DERIV [Contrarian] + VPA [Climax Detector]
  약한 조합: STRUCTURE + VALUATION (이벤트 무관한 분석)
```

이 메타 구조가 유저에게 "드래프트 = 전략"이라는 경험을 준다.
같은 유저라도 시장 레짐을 다르게 읽으면 다른 조합을 선택하게 되고,
그 선택의 차이가 대전 결과를 만든다.

---

## 16. 구현 순서

### Phase 1 — 코어 엔진 (Week 1-2)

1. `src/lib/engine/trend.ts` — TrendAnalysis, DivergenceSignal
2. `src/lib/engine/indicators.ts` — EMA/RSI/ATR/OBV/MACD/CVD 계산
3. `src/lib/engine/specs.ts` — AgentSpec 타입 + 8×4 Spec 정의 + LLM 프롬프트
4. DB 마이그레이션: 전체 스키마

### Phase 2 — 데이터 수집 (Week 2-3)

5. API 클라이언트: binanceFutures, feargreed, yahooFinance, coingecko
6. `/api/market/snapshot` — cron 수집기
7. 프록시 엔드포인트

### Phase 3 — 에이전트 엔진 (Week 3-5)

8. `src/lib/engine/agentPipeline.ts` — 공통 인터페이스 + runAgent
9. 8개 에이전트 구현 (각 4 Spec LLM 프롬프트 + 가중치 테이블)
10. `src/lib/engine/exitOptimizer.ts`
11. `src/lib/engine/scoring.ts` — DS/RE/CI/FBS 계산

### Phase 4 — RAG 기억 (Week 5-6)

12. pgvector + match_memories
13. `src/lib/engine/memory.ts` — 임베딩 + 검색 + 보강
14. 매치 종료 시 자동 기억 저장

### Phase 5 — 매치 엔진 + Passport (Week 6-8)

15. 매치 API (create, draft, analyze, hypothesis, result)
16. 합산 로직 + 승패 결정 + LP
17. Passport CRUD + 트리거 로직
18. Spec 해금 체크

### Phase 6 — Engagement (Week 8-10)

19. Oracle 리더보드
20. Challenge 시스템
21. LIVE 관전 (SSE)
22. 배지 시스템

### Phase 7 — 프론트엔드 (Week 10-14)

23. Lobby + Draft UI (8 에이전트 선택 + 가중치 슬라이더 + Spec 선택)
24. Analysis UI (에이전트별 판단 + RAG 기억 + Exit Optimizer)
25. Hypothesis UI (방향 + 신뢰도 + override)
26. Battle UI (실시간 차트 + DS/RE/CI + FBS 바)
27. Result UI (승패 + LP 팝업 + Spec 해금 알림)
28. Passport UI (6대 메트릭 + 에이전트 경험 + 배지)
29. Oracle UI (리더보드 + 에이전트 상세)
30. LIVE UI (타임라인 + 리액션)
31. Notification UX (4등급 + Intent Modal)

---

## 17. 검증 체크리스트

### 엔진

- [ ] indicator_series에 RSI 시계열 저장 → trend_dir, trend_slope 정확
- [ ] 가격 HH + RSI LH → BEARISH_DIV 감지
- [ ] 멀티TF 정렬: 1H/4H/1D 모두 상승 → ALIGNED_BULL
- [ ] 같은 DERIV Spec A vs C → 다른 방향 출력 가능
- [ ] LLM Spec 프롬프트가 실제로 해석 차이를 만드는지
- [ ] RAG 검색: 유사 시장 상태에서 top-5 정확 반환
- [ ] 3 에이전트 가중 합산 → 최종 direction + confidence 정확
- [ ] Exit Optimizer: ATR 기반 SL, 기대값 양수

### Passport

- [ ] 승률 10판 미만 → 표시 안 됨
- [ ] DISSENT + WIN → IDS 갱신
- [ ] GUARDIAN Override 수용/무시 → guardian_compliance 갱신
- [ ] 포지션 종료 시 win/loss/pnl 정확 갱신
- [ ] 공개 범위: 팔로워가 비공개 항목 접근 불가

### Spec 해금

- [ ] 에이전트 10전 → Spec A/B 해금
- [ ] 에이전트 30전 → Spec C 해금
- [ ] 해금되지 않은 Spec 선택 불가
- [ ] 해금 알림 (Result 화면에서)

### 독립 판단

- [ ] 알림에 LONG/SHORT 노출 안 됨
- [ ] 가설 입력 중 Oracle 접근 차단
- [ ] LIVE 관전에서 에이전트 방향은 Creator 결과 후 노출

### LP + 티어

- [ ] 일반 승리 +11, 클러치 +18, 패배 -8
- [ ] Perfect Read +3 추가, DISSENT WIN +5 추가
- [ ] LP 기준 티어 자동 전환
- [ ] Diamond → LIVE 해금

### 메타 게임

- [ ] 상승장에서 STRUCTURE+MACRO > VALUATION+SENTI
- [ ] 횡보장에서 VPA+ICT > MACRO+STRUCTURE
- [ ] 같은 시장에서 다른 드래프트 → 다른 결과

---

## 부록: 파일 구조

```
src/
├── lib/
│   ├── engine/
│   │   ├── trend.ts              # TrendAnalysis, DivergenceSignal
│   │   ├── indicators.ts         # EMA/RSI/ATR/OBV/MACD/CVD
│   │   ├── specs.ts              # AgentSpec 타입 + 8×4 Spec
│   │   ├── agentPipeline.ts      # runAgent, computeFinalPrediction
│   │   ├── memory.ts             # RAG 임베딩/검색/보강
│   │   ├── scoring.ts            # DS/RE/CI/FBS 계산
│   │   ├── exitOptimizer.ts      # SL/TP/R:R/EV/Kelly
│   │   ├── matchEngine.ts        # 매치 생성/진행/결과
│   │   ├── passportEngine.ts     # Passport 트리거 처리
│   │   └── agents/
│   │       ├── structure/
│   │       │   ├── factors.ts    # 6 팩터 계산
│   │       │   ├── prompts.ts    # 4 Spec LLM 프롬프트
│   │       │   └── weights.ts    # 4 Spec 가중치 테이블
│   │       ├── vpa/
│   │       ├── ict/
│   │       ├── deriv/
│   │       ├── valuation/
│   │       ├── flow/
│   │       ├── senti/
│   │       └── macro/
│   ├── api/
│   │   ├── binanceFutures.ts
│   │   ├── feargreed.ts
│   │   ├── coingecko.ts
│   │   ├── yahooFinance.ts
│   │   ├── cryptoquant.ts
│   │   ├── whaleAlert.ts
│   │   ├── defillama.ts
│   │   └── newsRss.ts
│   └── stores/
│       ├── matchStore.ts
│       ├── passportStore.ts
│       └── agentStore.ts
├── routes/
│   ├── api/
│   │   ├── market/snapshot/
│   │   ├── arena/match/
│   │   ├── arena/agents/
│   │   ├── oracle/
│   │   ├── passport/
│   │   ├── live/
│   │   ├── lp/
│   │   └── challenges/
│   └── (app)/
│       ├── lobby/
│       ├── arena/
│       │   ├── draft/
│       │   ├── analysis/
│       │   ├── hypothesis/
│       │   ├── battle/
│       │   └── result/
│       ├── passport/
│       ├── oracle/
│       └── live/
└── components/
    ├── arena/
    │   ├── DraftScreen.svelte
    │   ├── AgentCard.svelte
    │   ├── SpecSelector.svelte
    │   ├── WeightSlider.svelte
    │   ├── AnalysisPanel.svelte
    │   ├── BattleScreen.svelte
    │   ├── ScoreBar.svelte
    │   └── ResultScreen.svelte
    ├── passport/
    │   ├── PassportCard.svelte
    │   ├── MetricGrid.svelte
    │   ├── AgentExperience.svelte
    │   └── BadgeCabinet.svelte
    ├── oracle/
    │   ├── Leaderboard.svelte
    │   ├── AgentDetail.svelte
    │   └── ChallengeForm.svelte
    ├── live/
    │   ├── SessionList.svelte
    │   ├── Timeline.svelte
    │   └── ReactionBar.svelte
    └── notification/
        ├── NotificationTray.svelte
        ├── IntentModal.svelte
        └── CriticalOverlay.svelte
```

---

> **End of Spec v1.0**
> 다음 단계: Phase 1 코어 엔진 구현 시작
