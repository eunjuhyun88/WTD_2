# WTD — System Design Document v1.0

> **Crypto Decision Intelligence OS**
> 2026-02-22

---

## 0. 한 문장 정의

**"8개 AI 에이전트 풀에서 3개를 드래프트하고, LLM Spec으로 성격을 선택하고, RAG 기억으로 경험을 쌓으며, Arena 대전을 통해 Passport에 판단 이력을 남기는 크립토 Decision Intelligence 시스템."**

---

## 1. 설계 철학 — 왜 이렇게 만드는가

### 1.1 핵심 사상 (WTD 비전에서 유래)

```
"차트를 해석하는 AI가 아니라,
 시장을 상태 단위로 이해하는 크립토 전용 Decision Intelligence 시스템"

→ AI가 답을 주는 것이 아님
→ 유저가 먼저 판단하고, AI와 비교하는 것
→ 유저의 판단 이력 자체가 자산이 됨
```

### 1.2 5대 설계 원칙

| # | 원칙 | 구현 |
|---|------|------|
| 1 | **독립 판단 보호 (Direction 4)** | 에이전트 의견은 유저 가설 입력 후에만 공개 |
| 2 | **조합이 전략이다** | 8개 풀에서 3개 드래프트 — 선택이 곧 실력 |
| 3 | **달라지는 것이지 강해지는 게 아니다** | Spec = 사이드그레이드, P2W 아님 |
| 4 | **경험은 맥락이다** | RAG 기억 = 과거가 미래를 보장 안 함, 맥락만 제공 |
| 5 | **모든 지표는 추세다** | 값 자체가 아니라 변화의 방향·속도·가속도가 핵심 |

### 1.3 설계 결정 히스토리

```
v1: 고정 7인 에이전트 팀 → "유저 선택이 없으면 게임이 아님"
v2: 추세 분석 프레임워크 추가 → "RSI 58 자체는 의미 없음"
v3 (현재):
  ├── 8풀 3드래프트 → "유저가 선택하게 하자. 조합이 곧 싸움"
  ├── Spec 시스템 → "강해지는 게 아니라 달라지는 것"
  ├── RAG 기억 → "경험이 쌓이되 P2W는 아닌 구조"
  ├── LLM Spec → "skill은 클로드나 gpt에 있는 걸 의미"
  ├── VPA + VALUATION + MACRO 에이전트 추가
  ├── Exit Optimizer (WTD F09)
  └── wtd 4문서 통합 (Passport, Arena, Journey, Engagement)
```

---

## 2. 시스템 아키텍처

### 2.1 전체 데이터 흐름

```
┌────────── EXTERNAL DATA SOURCES ──────────────────────┐
│ Binance Futures │ Yahoo Finance │ CoinGecko │ F&G     │
│ CryptoQuant │ WhaleAlert │ DeFiLlama │ LunarCrush    │
└──────┬────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│           SNAPSHOT COLLECTOR (cron)                        │
│  시계열 Append → 추세 계산 → 다이버전스 감지 → UPSERT     │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│              PostgreSQL (Supabase + pgvector)              │
│                                                            │
│  indicator_series        시계열 + 추세 메타                │
│  market_snapshots        원시 데이터 캐시                  │
│  match_memories          유저별 RAG 기억 (vector 256d)     │
│  user_passports          6대 메트릭 + 배지 + 티어          │
│  user_agent_progress     Spec 해금 + 에이전트별 전적       │
│  agent_accuracy_stats    글로벌 에이전트+Spec 통계         │
│  arena_matches           매치 상태 + DS/RE/CI + 결과       │
│  agent_analysis_results  매치별 에이전트 분석 기록         │
│  live_sessions           LIVE 관전 세션                    │
│  agent_challenges        Challenge 기록                    │
│  lp_transactions         LP 적립/차감 이력                 │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│               MATCH ENGINE                                 │
│                                                            │
│  1. 유저 A & B → 3 에이전트 드래프트 + 가중치 + Spec      │
│  2. 에이전트별:                                            │
│     Code(팩터 계산) → RAG(기억 검색) → LLM(Spec 해석)     │
│  3. 3 에이전트 가중 합산 → 최종 예측                       │
│  4. 유저 hypothesis (override 가능)                        │
│  5. 24h 후 결과 → LP + Passport + RAG + Stats             │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│               FRONTEND (SvelteKit 2 + Svelte 5)           │
│                                                            │
│  Lobby → Draft → Analysis → Hypothesis → Battle → Result  │
│  Passport · Oracle · Challenge · LIVE · Scanner            │
└──────────────────────────────────────────────────────────┘
```

### 2.2 기술 스택

```
Frontend:  SvelteKit 2 / Svelte 5 / TypeScript / Vite
Backend:   SvelteKit API Routes (Server-side)
Database:  Supabase PostgreSQL + pgvector
LLM:       Claude / GPT (Spec 프롬프트)
Embedding: text-embedding-3-small (256d) 또는 수치 정규화
Realtime:  Supabase Realtime (SSE for LIVE)
Cron:      Supabase Edge Functions / Vercel Cron
```

---

## 3. 에이전트 시스템

### 3.1 8 Agent Pool

**왜 8개인가?**
- WTD F10 "6관점 해석"에서 출발 (추세/파생/온체인/VPA/밸류/ICT)
- VPA를 STRUCTURE에서 분리 (볼륨 가격 분석은 독자적 관점)
- MACRO 추가 (DXY, S&P, 금리 — 크립토 상관관계 핵심)
- SENTI 유지 (F&G + 소셜)
- → 6관점 + VPA분리 + MACRO 추가 = 8개

```
┌────────── OFFENSE (방향 판단 특화) ──────────┐
│ 📊 STRUCTURE — 차트 구조, EMA, RSI, 다이버전스 │
│ 📈 VPA      — 볼륨, CVD, 매수매도 비율         │
│ ⚡ ICT      — 유동성풀, FVG, OTE, 스마트머니   │
├────────── DEFENSE (리스크 감지 특화) ────────┤
│ 💰 DERIV     — OI, 펀딩비, 청산, 롱숏비율      │
│ 💎 VALUATION — MVRV, NUPL, SOPR, 사이클 위치  │
│ 🐋 FLOW      — 거래소 유출입, 고래, 온체인      │
├────────── CONTEXT (환경/센티먼트) ───────────┤
│ 🧠 SENTI     — Fear&Greed, 소셜, 뉴스          │
│ 🌍 MACRO     — DXY, S&P500, 금리, BTC.D       │
└─────────────────────────────────────────────┘
```

### 3.2 왜 3 드래프트인가

```
"유저가 선택하게 하자. 선택 조합에 따라 싸움이 되는 거지" — 설계 방향

드래프트 수   장점                단점
3개         선택이 아픔 → 전략    커버 못하는 영역 多
4개         밸런스, 무난          전략성 약간 약화
5개         관점 다양             뭘 빼도 차이 없음

→ 3개가 정답:
  8개 중 5개를 포기해야 함 = 매 판마다 고민
  "DERIV 넣을까 MACRO 넣을까?" = 게임성
  시장을 어떻게 읽느냐가 곧 조합 선택
```

### 3.3 에이전트별 분석 팩터

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

---

## 4. Spec 시스템 — LLM 프롬프트 기반

### 4.1 설계 배경

```
"skill은 클로드나 gpt에 있는 걸 의미한 거긴 해"

→ Spec 변형 = 단순 가중치 테이블 변경이 아님
→ LLM에 주는 시스템 프롬프트 자체가 달라짐
→ 같은 데이터를 보고도 "성격"에 따라 다르게 해석
→ 진짜 "에이전트"에 가까움

하이브리드 구조:
  Layer 1 (Code):  지표 계산, 추세 분석 — 결정론적, 정확해야 함
  Layer 2 (LLM):   Spec별 시스템 프롬프트로 해석 — 비결정론적, 개성 있음
  Layer 3 (Code):  팩터 가중치 테이블 — Spec별 다름
```

### 4.2 해금 조건 + P2W 방지

```
"Lv.12라서 이김" → P2W (나쁨)
"Aggressive Spec이라서 빨리 잡음" → 전략 선택 (좋음)

해금은 참여 횟수 기반 (파워 아님):
  Base Spec    — 처음부터 사용 가능
  Spec A (10전) — 10전 해금 (사이드그레이드)
  Spec B (10전) — 10전 동시 해금 (사이드그레이드)
  Spec C (30전) — 30전 해금 (사이드그레이드)

⚠️ Spec C > Spec A 아님!
  트렌딩 장: STRUCTURE [Trend Rider] >>> [Reversal Catcher]
  전환점:    STRUCTURE [Reversal Catcher] >>> [Trend Rider]
  → 해금 = "더 많은 선택지" ≠ "더 강함"
```

### 4.3 전체 Spec 트리

| Agent | Base | Spec A (10전) | Spec B (10전) | Spec C (30전) |
|-------|------|---------------|---------------|---------------|
| **STRUCTURE** | 균형 차트 분석 | Trend Rider (기울기+MTF) | Structure Mapper (HH/HL) | Reversal Catcher (다이버전스) |
| **VPA** | 균형 볼륨 분석 | Volume Surge (이상 거래량) | Absorption Reader (흡수) | Climax Detector (클라이맥스) |
| **ICT** | 균형 ICT 분석 | Liquidity Raider (스탑헌팅) | Fair Value Sniper (FVG) | Market Maker Model (축적/분배) |
| **DERIV** | 균형 파생 분석 | Squeeze Hunter (청산 캐스케이드) | Position Reader (OI 구조) | Contrarian (과열 역이용) |
| **VALUATION** | 균형 밸류 분석 | Cycle Timer (대주기) | Profit Tracker (실현손익) | Fair Value Band (적정가 이탈) |
| **FLOW** | 균형 온체인 분석 | Whale Follower (고래 추종) | Exchange Flow (거래소) | Smart Money (고수익 지갑) |
| **SENTI** | 균형 센티먼트 | Crowd Reader (소셜 추종) | Fear Buyer (공포 역발상) | Narrative Tracker (뉴스) |
| **MACRO** | 균형 매크로 | Risk On/Off (위험선호도) | Liquidity Cycle (유동성) | Event Trader (FOMC/CPI) |

### 4.4 LLM Spec 프롬프트 예시 — DERIV

```
Base (균형형):
"You are DERIV, a derivatives market analyst.
 Analyze the given futures market data objectively.
 Weigh all factors equally: OI trends, funding rate, liquidations, LS ratio.
 If signals conflict, clearly state the ambiguity."

Squeeze Hunter (공격형):
"You are DERIV [Squeeze Hunter], a specialist in liquidation cascade setups.
 Your PRIMARY focus: funding rate extremes + concentrated OI.
 When FR is >0.03% AND OI rising, AGGRESSIVELY flag squeeze potential.
 You LOOK FOR: crowded positions that will get liquidated.
 Weakness: you may see squeezes everywhere."

Position Reader (방어형):
"You are DERIV [Position Reader], a specialist in reading positional structure.
 Your PRIMARY focus: where positions are built and at what levels.
 Analyze OI by price level, average entry prices, trapped positions.
 You are METHODICAL: build thesis from position data, not momentum.
 Weakness: slow to react to sudden moves."

Contrarian (역발상형):
"You are DERIV [Contrarian], a specialist in fading overheated markets.
 When LS ratio is extreme, FR is extreme, OI is at highs — FADE the consensus.
 You actively SEEK: euphoria to short, panic to buy.
 Weakness: in strong trends, contrarian approach gets destroyed."
```

### 4.5 에이전트 실행 파이프라인

```typescript
async function runAgent(agentId, specId, marketData, memories, userId) {

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
    user: `Market data:\n${dataContext}\n\nPast experience:\n${memoryText}`
  });

  // Layer 3: Code — 가중치 합산 (결정론적)
  const specWeights = getSpecWeights(agentId, specId);
  const { bullScore, bearScore } = computeScores(factors, specWeights);

  // 최종: Code 스코어 + LLM 해석 블렌딩
  return {
    agentId, specId,
    direction: resolveDirection(bullScore, bearScore, llmResponse.direction),
    confidence: blendConfidence(bullScore, bearScore, llmResponse.confidence),
    thesis: llmResponse.thesis,
    factors, trends, divergences,
    bullScore, bearScore,
    memoryContext: summarizeMemories(memories),
  };
}
```

---

## 5. RAG 기억 시스템

### 5.1 설계 배경

```
"이거를 rag으로 구현하는 거야?" — 유저 질문

전통적 레벨업 vs RAG 레벨업:
  ❌ Lv.1 DERIV: confidence +0% → Lv.12: +3%  (숫자 뻥튀기)
  ✅ Lv.1 DERIV: 기억 0건 → Lv.12: 기억 47건
     "비슷한 상황 15건 중 12건에서 OI 급증 후 하락"
     → 분석에 경험이 반영됨 = 진짜 더 정확해질 수 있음

P2W 아닌 이유:
  → 과거가 미래를 보장하지 않음
  → 잘못된 기억이 오히려 방해될 수 있음
  → "기억이 많다" ≠ "이긴다"
```

### 5.2 저장: 매 매치 종료 시

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
  };

  prediction: { direction: string; confidence: number };
  thesis: string;
  outcome: boolean;
  priceChange: number;
  lesson: string;        // LLM 자동 생성 교훈

  embedding: number[];   // pgvector 256d
}
```

### 5.3 검색: 매 매치 시작 시

```sql
-- 유사 시장 상태에서의 과거 경험 top 5
SELECT * FROM match_memories
WHERE user_id = $1 AND agent_id = $2 AND is_active = true
ORDER BY embedding <=> $current_embedding
LIMIT 5;
```

### 5.4 보강: 기억을 분석에 주입

```
DERIV Agent [Squeeze Hunter] + 47전 RAG 기억:

  기본 분석: "OI 급증 + FR 과열 → SHORT 75%"

  RAG 보강:
  ┌──────────────────────────────────────────┐
  │ "유사 상황 5건 발견 (3승 2패)"            │
  │                                          │
  │ ✅ 성공 패턴: OI+FR 과열 → 청산 캐스케이드│
  │ ❌ 실패 패턴: 고래 매수가 파생 압력 압도   │
  │                                          │
  │ → FLOW 에이전트와 함께 쓰면 감지 가능     │
  └──────────────────────────────────────────┘

  보정 결과: "SHORT 70% (약간 보수적)"
  thesis: "과열이지만 과거 3/5 숏스퀴즈 리스크 존재"
```

### 5.5 3층 성장 구조 요약

```
┌─────────────────────────────────────────────────────────┐
│  RAG (기억) = "어떤 상황에서 어떤 결과가 나왔는지"       │
│  → 분석의 맥락을 풍부하게 함                             │
│  → 모든 Spec에 공통 적용                                │
│                                                          │
│  Spec (성격) = "같은 데이터를 어떤 관점으로 볼지"        │
│  → LLM 프롬프트 + 가중치 배분 변경                      │
│  → 시장 상황에 따라 유불리 바뀜                          │
│                                                          │
│  Unlock (해금) = "참여하면 선택지가 늘어남"              │
│  → 10전/30전 기반 (파워 아님)                            │
│  → 더 많은 전략 옵션 제공                               │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Draft + Match Flow

### 6.1 드래프트 규칙

```
매치당 3개 에이전트 선택 (8개 풀에서)
각 에이전트에 가중치 배분 (총 100%)
각 에이전트의 Spec 선택 (해금된 것 중)
드래프트 시간: 60초
상대방 드래프트: 비공개
```

### 6.2 매치 5 Phase

```
Phase 1: DRAFT (60초)
├── 에이전트 3개 선택 + 가중치 + Spec
├── 상대방 드래프트 비공개
└── VS 스크린 (2초 애니메이션)

Phase 2: ANALYSIS (자동, ~5초)
├── 에이전트별: Code팩터 → RAG기억 → LLM Spec해석
├── 3 에이전트 가중 합산 → 최종 방향 + confidence
└── ⚠️ Oracle 접근 차단 (독립 판단 보호)

Phase 3: HYPOTHESIS (30초)
├── 유저가 에이전트 분석 결과 확인
├── 최종: LONG / SHORT / 에이전트 판단 그대로
├── 유저 override 가능 (DISSENT → Passport IDS에 반영)
└── Exit Optimizer 추천 확인 (SL/TP/R:R)

Phase 4: BATTLE (실시간 60초 + Decision Window)
├── 실제 가격 추적 + 실시간 PnL
├── 10초 Decision Window × 6회
├── DS / RE / CI 실시간 계산
└── FBS 바 표시

Phase 5: RESULT
├── FBS 승패 결정 (0.5*DS + 0.3*RE + 0.2*CI)
├── LP 보상
├── 에이전트별 적중률 표시
├── Spec 해금 체크
├── RAG 기억 저장
└── Passport 갱신
```

### 6.3 합산 로직

```typescript
function computeFinalPrediction(outputs: AgentOutput[], draft: DraftSelection[]) {
  let totalBull = 0, totalBear = 0;
  for (const d of draft) {
    const output = outputs.find(o => o.agentId === d.agentId)!;
    totalBull += output.bullScore * (d.weight / 100);
    totalBear += output.bearScore * (d.weight / 100);
  }
  return {
    direction: totalBull > totalBear ? 'LONG' : 'SHORT',
    confidence: Math.min(99, Math.abs(totalBull - totalBear)),
  };
}
```

---

## 7. Scoring System — DS / RE / CI + FBS

### 7.1 3축 스코어

```
DS (Decision Score) — 방향 판단 품질
├── 에이전트 합의 + 유저 판단 정확도
├── 드래프트 조합의 시장 레짐 적합성
└── Override 성공 보너스

RE (Risk/Execution) — 리스크 관리
├── Exit Optimizer SL/TP 준수
├── Decision Window 적시 행동
└── 과도한 베팅 감지

CI (Confidence Index) — 신뢰도 일관성
├── 유저 신뢰도 vs 실제 결과 캘리브레이션
├── Spec 선택의 일관성
└── 최근 10판 신뢰도 분산
```

### 7.2 FBS + LP

```
FBS = 0.5 × DS + 0.3 × RE + 0.2 × CI

LP 보상:
  승리 (일반)     → +11 LP
  승리 (클러치)   → +18 LP  (FBS 80+ 또는 역전승)
  패배            → -8 LP
  Perfect Read    → +3 LP 추가 (에이전트 3/3 정확)
  DISSENT WIN     → +5 LP 추가 (에이전트 반대, 유저가 맞음)
  Challenge WIN   → +7 LP
  Challenge LOSS  → -4 LP
```

---

## 8. Exit Optimizer

**WTD F09에서 유래 — 현재 플랜에 없었던 것 추가**

```typescript
interface ExitRecommendation {
  conservative: { sl, tp, rr, tpProb, ev };
  balanced:     { sl, tp, rr, tpProb, ev };
  aggressive:   { sl, tp, rr, tpProb, ev };
  recommended: 'conservative' | 'balanced' | 'aggressive';
  kellySize: number;  // 최적 포지션 사이즈 %
}

// ATR 기반 SL + 지지/저항 기반 TP
// R:R = TP거리 / SL거리
// EV = (tpProb × tpProfit) - (slProb × slLoss)
// Kelly = (tpProb × rr - slProb) / rr
```

---

## 9. Passport

### 9.1 6대 핵심 메트릭

| 메트릭 | 공식 | 최소 표본 |
|--------|------|----------|
| **승률** | win / (win+loss) × 100 | 10판 |
| **방향 정확도** | direction_correct / direction_total × 100 | 10판 |
| **IDS (독립 판단)** | dissent_win / dissent_total × 100 | DISSENT 5판 |
| **캘리브레이션** | confidence_avg − direction_accuracy | 10판 |
| **GUARDIAN 순종** | override_accepted / override_offered × 100 | Override 3회 |
| **Challenge 승률** | challenge_win / challenge_total × 100 | Challenge 3회 |

### 9.2 에이전트 경험 섹션 (v3 신규)

```
에이전트별 통계:
├── DERIV: 48전 28승(58%) · Spec C 해금 · RAG 48건
├── STRUCTURE: 35전 22승(63%) · Spec A/B 해금 · RAG 35건
├── MACRO: 12전 7승(58%) · Base만 · RAG 12건
└── 최고 콤보: DERIV+STRUCTURE+MACRO (승률 72%)
```

### 9.3 공개 범위 + 배지

```
본인 뷰     = 전체
팔로워 뷰   = 승률 + 방향 정확도 + IDS만
Creator 뷰  = 위 + 캘리브레이션 추가
비공개       = worst_pnl, 연속 손실, GUARDIAN 무시 후 손실률

배지: 🏆 SEASON TOP10 · 🎯 PERFECT READ · ⚡ DISSENT WIN
      🌙 NIGHT OWL · 🐋 WHALE HUNTER · 🔮 ORACLE MASTER
      💎 DIAMOND HANDS · 🔒 MASTER LEAGUE
```

---

## 10. Engagement

### 10.1 Oracle — 에이전트+Spec 리더보드

```
8 에이전트 × 4 Spec = 최대 32행 리더보드

표시: 적중률(Wilson Score) + 표본 + 95% 신뢰구간 + 캘리브레이션
     + 최강 코인 + 30일 추이 + 레짐별 성과

⚠️ 가설 입력 중 Oracle 접근 차단 (독립 판단 원칙)
갱신: 00:05 UTC 일배치
```

### 10.2 Challenge

```
Gold 이상(P3+) + 해당 에이전트 10전 이상
에이전트+Spec의 최근 판단에 반박 (방향 + 근거)
H값 확정 후 자동 판정
WIN: +7 LP / LOSS: -4 LP
```

### 10.3 LIVE 관전

```
Diamond+ Creator가 매치 과정을 SSE로 실시간 공개
팔로워: 읽기 전용 (리액션만 허용 🔥🧊🤔⚡💀)
에이전트 방향: Creator 결과 확인 후에만 노출
댓글: 판 종료 후에만 활성화
```

---

## 11. Notification UX

### 11.1 4등급 + 독립 판단 원칙

| 등급 | 표시 | 트리거 |
|------|------|--------|
| CRITICAL | 풀스크린 오버레이 | 캐스케이드 청산 $50M+, SL 5% 이내 |
| HIGH | Tray + 빨간 점 | SCANNER A-Grade, MSS, 고래 $10M+ |
| MEDIUM | Tray만 | Condition 충족, B~C급 |
| LOW | /scanner 피드 | 정기 보고, Light Score |

```
⚠️ 절대 원칙: 알림 텍스트에 LONG/SHORT 포함 금지
   가설 입력 전 에이전트 방향 노출 금지

Intent Modal:
  Step 1: 코인명 + 강도 (방향 없음)
  Step 2: 가설 입력 (방향 + 신뢰도 + 태그) ← SUBMIT
  Step 3: 에이전트 분석 실행 (이 시점부터 방향 공개)
```

---

## 12. 추세 분석 프레임워크

### 12.1 핵심 원칙

```
"RSI 58 자체는 의미 없음.
 RSI가 30→58로 올라온 건지, 80→58로 내려온 건지가 판단의 핵심."

모든 지표: 시계열로 저장 → N봉 window의 방향/기울기/가속도/다이버전스
```

### 12.2 타입 정의

```typescript
interface TrendAnalysis {
  direction: 'RISING' | 'FALLING' | 'FLAT';
  slope: number;           // -1.0 ~ +1.0
  acceleration: number;
  strength: number;        // 0-100
  duration: number;
}

interface DivergenceSignal {
  type: 'BULLISH_DIV' | 'BEARISH_DIV' | 'HIDDEN_BULL' | 'HIDDEN_BEAR';
  indicator: string;
  priceAction: 'HH' | 'HL' | 'LH' | 'LL';
  indicatorAction: 'HH' | 'HL' | 'LH' | 'LL';
  confidence: number;
}

interface MultiTimeframeTrend {
  tf1h: TrendAnalysis;
  tf4h: TrendAnalysis;
  tf1d: TrendAnalysis;
  alignment: 'ALIGNED_BULL' | 'ALIGNED_BEAR' | 'CONFLICTING' | 'NEUTRAL';
}
```

---

## 13. 메타 게임 시나리오

```
"시장이 바뀌면 메타도 바뀜
 → 지금 어떤 장인지 읽는 게 진짜 실력"

상승장 (트렌딩):
  강: STRUCTURE [Trend Rider] + MACRO [Risk On/Off] + VPA [Volume Surge]
  약: VALUATION + SENTI

횡보장 (레인지):
  강: VPA [Absorption Reader] + ICT [Fair Value Sniper] + DERIV [Position Reader]
  약: MACRO + STRUCTURE [Trend Rider]

고점 (버블):
  강: VALUATION [Cycle Timer] + SENTI [Fear Buyer] + FLOW [Smart Money]
  약: STRUCTURE [Trend Rider]

폭락 (패닉):
  강: DERIV [Squeeze Hunter] + SENTI [Crowd Reader] + FLOW [Whale Follower]
  약: MACRO [Liquidity Cycle]

이벤트 (FOMC/CPI):
  강: MACRO [Event Trader] + DERIV [Contrarian] + VPA [Climax Detector]
  약: STRUCTURE + VALUATION
```

**유저 성장 루프:**
```
1. 처음: 아무거나 고름 → 지거나 이김
2. 패턴 발견: "횡보장에서는 VPA가 잘 맞네"
3. 전략 형성: 시장 상태에 따라 조합 바꿈
4. 메타 게임: "요즘 MACRO 넣는 사람이 많이 이기네"
5. 카운터: "MACRO 메타에 FLOW로 카운터"
6. 진짜 실력: 어떤 관점이 유효한지 아는 것 = 시장을 읽는 눈
```

---

## 14. Data Collection

### 14.1 수집 주기

| 지표 | 주기 | 에이전트 | 소스 |
|------|------|---------|------|
| Klines (OHLCV) | 30초 | STRUCTURE, VPA, ICT | Binance |
| EMA/RSI/ATR/MACD | kline 갱신 | STRUCTURE | 계산 |
| OBV/CVD | kline 갱신 | VPA | 계산 |
| OI, LS Ratio, 청산 | 1분 | DERIV | Binance |
| Funding Rate | 8시간 | DERIV | Binance |
| F&G Index | 1시간 | SENTI | alternative.me |
| Social Volume | 1시간 | SENTI | LunarCrush |
| DXY, S&P, US10Y | 5분 | MACRO | Yahoo Finance |
| BTC.D, Stablecoin | 5분 | MACRO | CoinGecko |
| MVRV, NUPL, SOPR | 1시간 | VALUATION | CryptoQuant |
| Exchange Flows | 5분 | FLOW | CryptoQuant |
| Whale Txns | 1분 | FLOW | Whale Alert |

---

## 15. DB Schema 요약

```
indicator_series     — 시계열 + 추세 메타 (pair, tf, indicator, values[], trend_*)
market_snapshots     — 원시 데이터 캐시 (pair, source, payload jsonb)
arena_matches        — 매치 전체 (draft jsonb, ds/re/ci, fbs, lp_delta)
agent_analysis_results — 에이전트별 분석 (factors jsonb, thesis, memory_context)
match_memories       — RAG 기억 (embedding vector(256), market_state, outcome)
user_passports       — 6대 메트릭 + 배지 + 티어 + 에이전트 경험
user_agent_progress  — Spec 해금 + 에이전트별 전적 + 콤보 통계
agent_accuracy_stats — 글로벌 에이전트+Spec 통계 (regime_stats, coin_stats)
lp_transactions      — LP 이력 (amount, reason, balance_after)
live_sessions        — LIVE 관전 (stage, spectator_count, pnl)
agent_challenges     — Challenge 기록 (user_dir, agent_dir, outcome)
```

---

## 16. 구현 순서

| Phase | 기간 | 내용 |
|-------|------|------|
| 1 | Week 1-2 | 코어 엔진: 추세 분석 + 지표 계산 + Spec 정의 + DB |
| 2 | Week 2-3 | 데이터 수집: API 클라이언트 + Snapshot Collector cron |
| 3 | Week 3-5 | 에이전트 엔진: 8개 에이전트 × 4 Spec + LLM 파이프라인 |
| 4 | Week 5-6 | RAG 기억: pgvector + 임베딩 + 검색 + 보강 |
| 5 | Week 6-8 | 매치 엔진 + Passport: 매치 API + 스코어링 + 트리거 |
| 6 | Week 8-10 | Engagement: Oracle + Challenge + LIVE (SSE) |
| 7 | Week 10-14 | 프론트엔드: Draft → Battle → Result → Passport → Oracle |

---

## 17. WTD 매핑 참조

| WTD 기능 | 우리 구현 |
|-------------|---------|
| F07 Entry Score | 3 에이전트 가중 합산 → confidence |
| F08 Direction Score | 에이전트 합의 → direction |
| F09 Exit Optimizer | Exit Optimizer (SL/TP/R:R/EV/Kelly) |
| F10 6관점 해석 | 8 Agent Pool (6관점 + VPA분리 + MACRO추가) |
| F11-F18 Signal Creator | 별도 제품 레이어 (현재 미포함) |

---

> **End of Design Document v1.0**
