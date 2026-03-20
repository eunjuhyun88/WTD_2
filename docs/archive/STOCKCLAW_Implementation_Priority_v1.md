# STOCKCLAW — 구현 우선순위 + Phase 분리 설계

> **현재 상태 → v3 전환 로드맵**
> 2026-02-22

---

## 0. 현재 상태 요약 (AS-IS)

```
✅ 있는 것:
├── 7 에이전트 (STRUCTURE, FLOW, DERIV, SENTI, GUARDIAN, COMMANDER, SCANNER)
├── 11 Phase 배틀 (standby→config→...→result→cooldown)
├── 44 API routes, 16 Stores, 28+ Components
├── 3 DB Migration (30+ 테이블)
├── 지갑 인증 + 이메일 가입
├── 퀵트레이드 + 시그널 트래킹
├── Passport 기본 (tier/streak 표시)
└── Terminal 3-panel (WarRoom/Chart/Intel)

❌ 없는 것 (v3):
├── 8 에이전트 풀 (VPA, ICT, VALUATION 에이전트 없음)
├── 3 드래프트 + 가중치 + Spec 선택
├── LLM Spec 시스템 (SDK도 미설치)
├── RAG 기억 (pgvector 미설치)
├── 5 Phase 매치 (DRAFT→ANALYSIS→HYPOTHESIS→BATTLE→RESULT)
├── FBS 스코어링 (DS/RE/CI)
├── 6대 Passport 메트릭
├── LP/티어 자동 전환
├── Oracle 8×4 리더보드
├── Challenge / LIVE
├── Exit Optimizer
├── 시계열 추세 분석 (indicator_series)
└── Snapshot Collector (cron)
```

---

## 1. 핵심 원칙: 왜 이 순서인가

```
원칙 1: "DB가 없으면 아무것도 쌓이지 않는다"
  → DB 스키마가 최우선. 나머지는 그 위에 쌓는다.

원칙 2: "데이터가 없으면 에이전트가 분석할 게 없다"
  → 데이터 수집 파이프라인이 에이전트보다 먼저.

원칙 3: "게임 루프가 있어야 나머지가 의미 있다"
  → 매치 엔진(드래프트→결과)이 중심. 나머지 시스템은 매치에 플러그인.

원칙 4: "비싼 것은 나중에"
  → LLM 호출, RAG 임베딩은 나중에 추가 가능. 먼저 Code-only로 작동하게.

원칙 5: "유저가 볼 수 있어야 검증된다"
  → 각 Phase 끝에 실제 플레이 가능한 상태 목표.
```

---

## 2. 전체 Phase 맵 (8 Phase)

```
Timeline (주 단위):

 W1   W2   W3   W4   W5   W6   W7   W8   W9   W10  W11  W12  W13  W14
├────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤────┤
│ P1: DB + 코어 │ P2: 데이터 │ P3: 에이전트   │ P4: 매치  │ P5: LP/  │
│   마이그레이션 │   수집 파이프│  엔진 (Code)   │  엔진     │ Passport │
│               │   라인       │               │ +Scoring  │ +Engage  │
├───────────────┤─────────────┤───────────────┤──────────┤──────────┤
│ P6: LLM Spec  │ P7: RAG 기억│ P8: 프론트엔드 v3                     │
│               │             │                                       │
└───────────────┴─────────────┴───────────────────────────────────────┘

각 Phase 완료 시 "플레이 가능한" 마일스톤:
  P1 끝: DB 준비됨 (SQL 확인 가능)
  P2 끝: 시계열 데이터가 쌓이기 시작
  P3 끝: 에이전트가 Code-only로 방향+confidence 산출
  P4 끝: 매치 한 판을 처음부터 끝까지 돌릴 수 있음 ← 핵심 마일스톤
  P5 끝: LP 쌓이고 Passport 보임
  P6 끝: Spec별 LLM 해석 차이 확인 가능
  P7 끝: RAG 기억 검색으로 "경험 있는" 분석
  P8 끝: 프론트엔드 전체 v3 완성
```

---

## 3. Phase 상세

---

### Phase 1: DB 마이그레이션 + 코어 타입 (Week 1-2)

> **"기반이 없으면 아무것도 쌓이지 않는다"**

#### 1A. DB 마이그레이션 (0004_agent_engine_v3.sql)

```
Priority: ★★★★★ (최우선)
의존성: 없음
산출물: supabase/migrations/0004_agent_engine_v3.sql
```

**생성할 테이블 (11개):**

| 테이블 | 용도 | 참조 |
|--------|------|------|
| `indicator_series` | 시계열 + 추세 메타 | Spec §12.1 |
| `market_snapshots` | 원시 데이터 캐시 | Spec §12.2 |
| `arena_matches` | 매치 상태 + 드래프트 + FBS + LP | Spec §12.3 |
| `agent_analysis_results` | 에이전트별 분석 결과 | Spec §12.4 |
| `match_memories` | RAG 기억 (pgvector) | Spec §12.5 |
| `user_passports` | 6대 메트릭 + 배지 + 티어 | Spec §12.6 |
| `user_agent_progress` | Spec 해금 + 에이전트별 전적 | Spec §12.7 |
| `agent_accuracy_stats` | 글로벌 에이전트+Spec 통계 | Spec §12.8 |
| `lp_transactions` | LP 적립/차감 이력 | Spec §12.9 |
| `live_sessions` | LIVE 관전 세션 | Spec §12.10 |
| `agent_challenges` | Challenge 기록 | Spec §12.11 |

**추가 작업:**
- `CREATE EXTENSION IF NOT EXISTS vector;` (pgvector)
- `search_memories()` SQL 함수
- IVFFlat 인덱스

**기존 테이블 수정:**
- `app_users` → `passport_id` FK 추가 (또는 user_passports에서 user_id로 참조)
- 기존 `matches` 테이블과 신규 `arena_matches` 관계 정리

#### 1B. 코어 TypeScript 타입 정의

```
산출물:
  src/lib/engine/types.ts
  src/lib/engine/constants.ts
```

**정의할 타입:**

```typescript
// 에이전트 풀
type AgentId = 'STRUCTURE' | 'VPA' | 'ICT' | 'DERIV' | 'VALUATION' | 'FLOW' | 'SENTI' | 'MACRO';
type AgentRole = 'OFFENSE' | 'DEFENSE' | 'CONTEXT';

// Spec
type SpecId = 'base' | string; // 에이전트별 고유
interface AgentSpec { id: string; name: string; description: string; weights: Record<string, number>; }

// 드래프트
interface DraftSelection { agentId: AgentId; specId: string; weight: number; }

// 분석 결과
interface AgentOutput { agentId: string; specId: string; direction: 'LONG'|'SHORT'|'NEUTRAL'; confidence: number; thesis: string; ... }

// 추세
interface TrendAnalysis { direction: 'RISING'|'FALLING'|'FLAT'; slope: number; acceleration: number; strength: number; duration: number; }
interface DivergenceSignal { type: string; indicator: string; confidence: number; ... }

// 매치
type MatchPhase = 'DRAFT' | 'ANALYSIS' | 'HYPOTHESIS' | 'BATTLE' | 'RESULT';
interface MatchState { id: string; phase: MatchPhase; pair: string; ... }

// 스코어
interface FBScore { ds: number; re: number; ci: number; fbs: number; }
```

#### 1C. 에이전트 데이터 재정의

```
산출물:
  src/lib/data/agents.ts (기존 파일 리팩터)
  src/lib/data/specs.ts (신규)
```

**기존 7 에이전트 → 8 에이전트 재정의:**

| 기존 | → v3 | 변경 |
|------|------|------|
| STRUCTURE | STRUCTURE | 팩터 6개 재정의 |
| — | **VPA** (신규) | 볼륨 가격 분석 |
| — | **ICT** (신규) | 스마트머니 |
| DERIV | DERIV | 팩터 6개 재정의 |
| — | **VALUATION** (신규) | MVRV/NUPL |
| FLOW | FLOW | 팩터 6개 재정의 |
| SENTI | SENTI | 팩터 6개 재정의 |
| — | **MACRO** (신규) | DXY/S&P500 |
| ~~GUARDIAN~~ | (삭제) | Override 로직으로 변환 |
| ~~COMMANDER~~ | (삭제) | 합산 로직으로 변환 |
| ~~SCANNER~~ | (별도) | Notification 시스템으로 |

**Spec 트리 (8×4=32 Spec 정의):**
- 각 에이전트의 Base/A/B/C Spec 이름 + 설명 + 팩터 가중치 테이블

#### Phase 1 완료 기준

- [ ] 0004 마이그레이션 SQL 실행 가능
- [ ] 모든 v3 테이블 생성됨 (psql로 확인)
- [ ] TypeScript 타입 import 가능
- [ ] 8 에이전트 × 4 Spec 데이터 파일 존재

---

### Phase 2: 데이터 수집 파이프라인 (Week 2-3)

> **"에이전트가 분석할 데이터가 있어야 한다"**

#### 2A. API 클라이언트 확장

```
Priority: ★★★★☆
의존성: Phase 1 (DB 테이블)
산출물:
  src/lib/api/binanceFutures.ts (확장)
  src/lib/api/feargreed.ts (신규)
  src/lib/api/yahooFinance.ts (신규)
  src/lib/api/coingecko.ts (신규)
  src/lib/api/cryptoquant.ts (신규)
  src/lib/api/whaleAlert.ts (신규)
```

**현재:** Binance (부분), Coinalyze, Polymarket
**필요:** 위 + Yahoo Finance, CoinGecko, Fear&Greed, CryptoQuant, WhaleAlert

| API | 에이전트 | 데이터 | 비용 |
|-----|---------|--------|------|
| Binance Futures | STRUCTURE, VPA, DERIV | Klines, OI, FR, 청산, LS | 무료 |
| alternative.me | SENTI | Fear & Greed | 무료 |
| Yahoo Finance | MACRO | DXY, S&P500, US10Y | 무료 |
| CoinGecko | MACRO | BTC.D, Stablecoin Mcap | 무료 (50/min) |
| CryptoQuant | VALUATION, FLOW | MVRV, Exchange Flows | 무료 제한 |
| WhaleAlert | FLOW | 고래 트랜잭션 | 무료 (10/min) |
| LunarCrush (MCP) | SENTI | Social Volume | 무료 |

#### 2B. Snapshot Collector (cron)

```
산출물:
  src/routes/api/market/snapshot/+server.ts
  src/lib/engine/snapshotCollector.ts
```

**플로우:**
```
cron (30초~1분) → 각 API 호출 → 원시 데이터 → market_snapshots UPSERT
                                              → 지표 계산 → indicator_series UPSERT
                                              → 추세 분석 → trend_* 필드 갱신
```

#### 2C. 추세 분석 엔진

```
산출물:
  src/lib/engine/trend.ts
  src/lib/engine/indicators.ts
```

- `analyzeTrend()`: 시계열 → direction, slope, acceleration, strength
- `detectDivergence()`: 가격 vs 지표 다이버전스
- `analyzeMultiTF()`: 1H/4H/1D 정렬 분석
- 지표 계산: EMA, RSI, ATR, MACD, OBV, CVD

#### Phase 2 완료 기준

- [ ] `indicator_series`에 BTC 시계열 데이터가 쌓임
- [ ] `market_snapshots`에 원시 데이터 캐시됨
- [ ] 추세 분석: RSI trend가 RISING/FALLING/FLAT으로 계산됨
- [ ] 다이버전스: 가격 HH + RSI LH → BEARISH_DIV 감지

---

### Phase 3: 에이전트 엔진 — Code Only (Week 3-5)

> **"LLM 없이도 작동하는 에이전트를 먼저 만든다"**

#### 3A. 에이전트별 팩터 계산

```
Priority: ★★★★★
의존성: Phase 2 (indicator_series 데이터)
산출물:
  src/lib/engine/agents/structure/factors.ts
  src/lib/engine/agents/structure/weights.ts
  src/lib/engine/agents/vpa/factors.ts
  src/lib/engine/agents/vpa/weights.ts
  ... (8 에이전트 × 2 파일 = 16 파일)
```

**각 에이전트당:**
- `factors.ts`: 6개 팩터 계산 (indicator_series 읽기 → 점수 산출)
- `weights.ts`: 4개 Spec별 가중치 테이블

**핵심:** 이 단계에서는 LLM 없이 **Code만으로** direction + confidence 산출

```typescript
// Phase 3에서의 에이전트 파이프라인 (LLM 없음)
async function runAgentCodeOnly(agentId, specId, marketData) {
  // Layer 1: Code — 팩터 계산
  const factors = await computeFactors(agentId, marketData);
  const trends = computeTrends(agentId, marketData);
  const divergences = detectDivergences(agentId, marketData);

  // Layer 2: LLM — SKIP (Phase 6에서 추가)
  const thesis = `[자동] ${agentId} 팩터 기반 분석`;

  // Layer 3: Code — 가중치 합산
  const specWeights = getSpecWeights(agentId, specId);
  const { bullScore, bearScore } = computeScores(factors, specWeights);

  return {
    agentId, specId,
    direction: bullScore > bearScore ? 'LONG' : 'SHORT',
    confidence: Math.min(99, Math.abs(bullScore - bearScore)),
    thesis,
    factors, bullScore, bearScore,
  };
}
```

#### 3B. 합산 로직

```
산출물:
  src/lib/engine/agentPipeline.ts
```

- `computeFinalPrediction()`: 3 에이전트 가중 합산
- `runAgent()`: 단일 에이전트 실행 (Code-only)
- `runDraft()`: 드래프트 3개 에이전트 병렬 실행

#### 3C. Exit Optimizer

```
산출물:
  src/lib/engine/exitOptimizer.ts
```

- ATR 기반 SL 계산
- 지지/저항 기반 TP 계산
- R:R ratio + EV + Kelly Criterion

#### Phase 3 완료 기준

- [ ] 8개 에이전트 각각이 direction + confidence 산출
- [ ] 같은 DERIV라도 Spec A vs C → 다른 결과 출력
- [ ] 3 에이전트 가중 합산 → 최종 방향 + confidence 정확
- [ ] Exit Optimizer: SL/TP/R:R 3단계 추천
- [ ] **단위 테스트**: 에이전트 팩터 계산 정확성

---

### Phase 4: 매치 엔진 + 스코어링 (Week 5-7)

> **"한 판을 처음부터 끝까지 돌릴 수 있다" ← 핵심 마일스톤**

#### 4A. 매치 API (CRUD)

```
Priority: ★★★★★
의존성: Phase 3 (에이전트 엔진)
산출물:
  src/routes/api/arena/match/create/+server.ts
  src/routes/api/arena/match/[id]/draft/+server.ts
  src/routes/api/arena/match/[id]/analyze/+server.ts
  src/routes/api/arena/match/[id]/hypothesis/+server.ts
  src/routes/api/arena/match/[id]/battle/+server.ts
  src/routes/api/arena/match/[id]/result/+server.ts
```

**매치 플로우:**
```
POST /create → 매치 생성 (매칭)
POST /{id}/draft → 드래프트 제출 (3 에이전트 + 가중치 + Spec)
POST /{id}/analyze → 에이전트 분석 실행 (Code-only Phase 3 사용)
POST /{id}/hypothesis → 유저 가설 제출 (direction + confidence)
GET /{id}/battle → SSE 실시간 가격 추적
GET /{id}/result → 매치 결과
```

#### 4B. 스코어링 엔진 (DS/RE/CI/FBS)

```
산출물:
  src/lib/engine/scoring.ts (기존 리팩터)
```

**기존:** `calculateLP(win, streak, lpMult)` → 단순 LP
**v3:** DS + RE + CI → FBS → LP

```typescript
function calculateFBS(match): FBScore {
  const ds = calculateDS(match); // 방향 판단 품질
  const re = calculateRE(match); // 리스크/실행 품질
  const ci = calculateCI(match); // 신뢰도 일관성
  const fbs = 0.5 * ds + 0.3 * re + 0.2 * ci;
  return { ds, re, ci, fbs };
}
```

#### 4C. 매치 엔진 오케스트레이터

```
산출물:
  src/lib/engine/matchEngine.ts
```

- 전체 매치 라이프사이클 관리 (DRAFT → RESULT)
- Phase 전환 로직
- 타이머 관리 (60초 드래프트, 30초 가설)
- 결과 확정 + 후처리 (LP, Passport, Stats)

#### Phase 4 완료 기준

- [ ] API로 매치 한 판 전체 플로우 실행 가능 (Postman/curl)
- [ ] 드래프트 → 분석 → 가설 → 결과 → FBS 계산 완료
- [ ] LP 보상 정확 (+11/-8/+18/+2)
- [ ] arena_matches 테이블에 전체 매치 기록 저장
- [ ] **⭐ 이 시점에서 "게임 한 판" 가능 (백엔드)**

---

### Phase 5: LP/Passport/Engagement (Week 7-9)

> **"기록이 쌓이고 보상이 보인다"**

#### 5A. LP 시스템

```
산출물:
  src/lib/engine/lpEngine.ts
  src/routes/api/lp/+server.ts
```

- LP 적립/차감 로직
- lp_transactions INSERT
- 보너스: Perfect Read (+3), DISSENT WIN (+5)
- 연패 완화 (7연패+ → -8 → -5)

#### 5B. 티어 시스템

```
산출물:
  src/lib/engine/tierEngine.ts
```

- `calculateTier(lp)` → tier + level
- 승급/강등 판단 + 해금 기능 체크
- 강등 보호 유예기간

#### 5C. Passport 갱신 엔진

```
산출물:
  src/lib/engine/passportEngine.ts
  src/routes/api/passport/+server.ts
```

- 6대 메트릭 갱신 로직 (SUBMIT/APPROVE/종료/일배치)
- 에이전트 progress 갱신
- 배지 체크 로직
- 일배치 재계산 (00:05 UTC cron)

#### 5D. Spec 해금

```
산출물:
  src/lib/engine/specUnlock.ts
```

- 매치 종료 시 해금 체크
- `user_agent_progress.unlocked_specs` 갱신
- 해금 알림 데이터 생성

#### 5E. Oracle 리더보드

```
산출물:
  src/routes/api/oracle/+server.ts
```

- `agent_accuracy_stats` 기반 리더보드
- Wilson Score 보정
- 기간/정렬 필터
- 에이전트 상세 프로필

#### 5F. Challenge

```
산출물:
  src/routes/api/challenges/+server.ts
```

- Challenge 제출 + 자동 판정
- LP 보상 (+7/-4)

#### Phase 5 완료 기준

- [ ] 매치 후 LP가 쌓이고 lp_transactions에 기록
- [ ] LP 기준 티어 자동 전환
- [ ] Passport 6대 메트릭 갱신 확인
- [ ] 에이전트 10전 → Spec A/B 해금
- [ ] Oracle 리더보드 API 동작
- [ ] Challenge 제출/판정 동작

---

### Phase 6: LLM Spec 시스템 (Week 9-10)

> **"Code + LLM 하이브리드 — 에이전트에 '성격'을 부여"**

#### 6A. LLM 클라이언트 설정

```
Priority: ★★★☆☆
의존성: Phase 3 (에이전트 엔진)
산출물:
  src/lib/engine/llm/client.ts
  src/lib/engine/llm/prompts.ts
```

- npm: `@anthropic-ai/sdk` 또는 `openai` 추가
- LLM 호출 래퍼 (에러 핸들링, 재시도, 타임아웃)
- 비용 추적 로깅

#### 6B. Spec 프롬프트 정의

```
산출물:
  src/lib/engine/agents/structure/prompts.ts
  src/lib/engine/agents/deriv/prompts.ts
  ... (8 에이전트 × 4 Spec = 32 프롬프트)
```

- 각 Spec의 system prompt
- 데이터 → LLM 컨텍스트 포맷팅
- LLM 응답 파싱 (direction + confidence + thesis)

#### 6C. 에이전트 파이프라인 업그레이드

```
산출물:
  src/lib/engine/agentPipeline.ts (Phase 3 확장)
```

```typescript
// Phase 6: LLM 추가
async function runAgent(agentId, specId, marketData, memories, userId) {
  // Layer 1: Code (기존)
  const factors = await computeFactors(agentId, marketData);

  // Layer 2: LLM (NEW!)
  const specPrompt = getSpecPrompt(agentId, specId);
  const llmResponse = await callLLM({ system: specPrompt, user: dataContext });

  // Layer 3: Code (기존)
  const specWeights = getSpecWeights(agentId, specId);
  const { bullScore, bearScore } = computeScores(factors, specWeights);

  // 블렌딩: Code + LLM
  return {
    direction: resolveDirection(bullScore, bearScore, llmResponse.direction),
    confidence: blendConfidence(bullScore, bearScore, llmResponse.confidence),
    thesis: llmResponse.thesis,
    ...
  };
}
```

#### Phase 6 완료 기준

- [ ] DERIV [Base] vs [Squeeze Hunter] → 같은 데이터에서 다른 thesis 출력
- [ ] LLM 호출 실패 시 Code-only 폴백 동작
- [ ] 비용 추적: 매치당 LLM 호출 횟수 + 토큰 수 로깅
- [ ] **⭐ "에이전트에 성격이 느껴진다"**

---

### Phase 7: RAG 기억 시스템 (Week 10-11)

> **"경험이 쌓여서 분석이 달라진다"**

#### 7A. 임베딩 생성

```
Priority: ★★★☆☆
의존성: Phase 6 (LLM), Phase 1 (pgvector)
산출물:
  src/lib/engine/memory.ts
```

- `createMarketEmbedding()`: 시장 상태 → 256d 벡터
- 옵션 1: 수치 정규화 (비용 0, 빠름)
- 옵션 2: text-embedding-3-small (정확, 비용)
- 초기에는 옵션 1로 시작, 성능 검증 후 옵션 2 전환

#### 7B. 기억 저장/검색

```
산출물:
  src/lib/engine/memory.ts (확장)
```

- 매치 종료 시: 기억 저장 (embedding + market_state + outcome + lesson)
- 매치 시작 시: 유사 기억 검색 (pgvector cosine similarity top-5)
- 기억 보강: `augmentWithMemories()` → thesis에 경험 추가

#### 7C. 기억 리뷰 UI (Master)

```
산출물:
  src/routes/api/arena/agents/[id]/memories/+server.ts
```

- 기억 목록 조회
- 기억 soft delete (is_active = false)

#### Phase 7 완료 기준

- [ ] 매치 종료 시 match_memories에 기억 저장됨
- [ ] 유사 시장 상태 검색 → top-5 반환
- [ ] 기억이 있는 에이전트의 thesis에 "[경험]" 컨텍스트 포함
- [ ] **⭐ "10전 이상 한 에이전트가 뭔가 기억하는 느낌"**

---

### Phase 8: 프론트엔드 v3 (Week 11-14)

> **"유저가 보고 만지는 모든 것"**

#### 8A. Draft UI

```
산출물:
  src/components/arena/DraftScreen.svelte
  src/components/arena/AgentCard.svelte
  src/components/arena/SpecSelector.svelte
  src/components/arena/WeightSlider.svelte
```

- 8개 에이전트 그리드 (OFFENSE/DEFENSE/CONTEXT)
- 에이전트 선택 → Spec 선택 → 가중치 슬라이더
- 60초 타이머
- VS 스크린 애니메이션

#### 8B. Analysis + Hypothesis UI

```
산출물:
  src/components/arena/AnalysisPanel.svelte
  src/components/arena/ExitOptimizerCard.svelte
```

- 에이전트별 분석 카드 (direction + confidence + thesis + RAG)
- Exit Optimizer 3단계 추천 표시
- 가설 입력 (방향 + 신뢰도 + 태그)
- DISSENT 경고

#### 8C. Battle + Result UI

```
산출물:
  src/components/arena/BattleScreen.svelte
  src/components/arena/ScoreBar.svelte
  src/components/arena/ResultScreen.svelte
```

- 실시간 차트 + PnL
- Decision Window (10초 × 6회)
- DS/RE/CI/FBS 바
- 결과 화면 (에이전트 breakdown + LP + Spec 해금)

#### 8D. Passport v3 UI

```
산출물:
  src/components/passport/PassportCard.svelte (리팩터)
  src/components/passport/MetricGrid.svelte
  src/components/passport/AgentExperience.svelte
  src/components/passport/BadgeCabinet.svelte
```

- 6대 메트릭 카드
- 에이전트 경험 리스트
- LP/티어 진행 바
- 배지 캐비닛

#### 8E. Oracle + Challenge UI

```
산출물:
  src/components/oracle/Leaderboard.svelte (리팩터)
  src/components/oracle/AgentDetail.svelte
  src/components/oracle/ChallengeForm.svelte
```

#### 8F. LIVE 관전 UI

```
산출물:
  src/components/live/SessionList.svelte
  src/components/live/Timeline.svelte
  src/components/live/ReactionBar.svelte
```

#### 8G. 알림 UX (Direction 4)

```
산출물:
  src/components/notification/NotificationTray.svelte (리팩터)
  src/components/notification/IntentModal.svelte
  src/components/notification/CriticalOverlay.svelte
```

#### Phase 8 완료 기준

- [ ] 드래프트 화면에서 8개 에이전트 선택 + Spec + 가중치 작동
- [ ] 분석 결과 에이전트별 카드 표시
- [ ] 가설 입력 → 배틀 → 결과 전체 플로우 UI
- [ ] Passport에 6대 메트릭 + 에이전트 경험 표시
- [ ] Oracle 32행 리더보드 표시
- [ ] **⭐ "v3 시스템 전체 플레이 가능"**

---

## 4. 의존성 그래프

```
Phase 1: DB + 타입 ─────────┐
                             │
Phase 2: 데이터 수집 ─────────┤
                             │
Phase 3: 에이전트 (Code) ────┤── Phase 4: 매치 엔진 ──── Phase 5: LP/Passport
                             │         │
Phase 6: LLM Spec ──────────┘         │
         │                            │
Phase 7: RAG 기억 ───────────────────┘
                                      │
Phase 8: 프론트엔드 ─────────────────┘

Critical Path:
  P1 → P2 → P3 → P4 → P5 → P8 (최소 플레이 가능)

병렬 가능:
  P6 (LLM) ← P3 완료 후 언제든 시작 가능
  P7 (RAG) ← P1 + P6 완료 후
  P8 일부 ← P4 완료 후 바로 시작 (Draft UI 등)
```

---

## 5. 리스크 + 대응

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| LLM 비용 폭발 | P6 이후 매치당 6 LLM 호출 | 중 | 캐싱, 배치, 호출 횟수 제한 |
| pgvector 성능 | RAG 검색 느림 | 낮 | IVFFlat 인덱스, 기억 수 제한 |
| 기존 코드 충돌 | v1 Phase 11개 → v3 Phase 5개 전환 | 높 | 기존 arena 페이지 보존, v3는 `/arena-v3/`로 병렬 개발 |
| API rate limit | 외부 API 무료 제한 | 중 | market_snapshots 캐시, 수집 주기 조정 |
| 프론트엔드 복잡도 | arena 페이지 2208줄 리팩터 | 높 | 컴포넌트 분리 먼저, 점진적 전환 |

---

## 6. 빠른 시작: Phase 1 세부 태스크

> **"지금 바로 시작할 수 있는 것"**

```
Task 1.1: 0004_agent_engine_v3.sql 작성           (2-3시간)
Task 1.2: 마이그레이션 실행 + 테이블 확인          (30분)
Task 1.3: src/lib/engine/types.ts 타입 정의        (1-2시간)
Task 1.4: src/lib/engine/constants.ts 상수 정의    (30분)
Task 1.5: src/lib/data/agents.ts 8 에이전트 재정의 (2시간)
Task 1.6: src/lib/data/specs.ts 32 Spec 정의       (3시간)
Task 1.7: npm install @anthropic-ai/sdk (선행 설치) (10분)

총 예상: 약 1~1.5일
```

---

## 7. 요약: 뭘 먼저 하면 좋은가?

```
🔴 지금 바로:     Phase 1 — DB 마이그레이션 + 타입 + 에이전트 재정의
🟡 이번 주 내로:  Phase 2 — 데이터 수집 파이프라인 (API 클라이언트 + Snapshot)
🟢 다음 주:       Phase 3 — 에이전트 엔진 Code-only
🔵 그 다음:       Phase 4 — 매치 엔진 (← 여기서 "게임 한 판" 가능)
⚪ 그 이후:       Phase 5-8 — LP/Passport/LLM/RAG/프론트엔드
```

**핵심 질문: "Phase 4 끝나면 한 판 돌릴 수 있나?" → Yes.**
Phase 4까지 = 최소 실행 가능 제품 (코어 게임 루프)

---

> **End of Implementation Priority v1.0**
> 다음 액션: Phase 1 Task 1.1 (DB 마이그레이션 SQL 작성) 시작?
