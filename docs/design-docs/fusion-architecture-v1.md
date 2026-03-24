# Fusion Architecture v1 — Trading Agent Platform

Purpose:
- 현재 6-Surface 게임 루프 위에 "자동매매 에이전트 플랫폼" 레이어를 융합
- 유저 관점: "내 매매 → 에이전트화 → 자동매매 → 경쟁 → 수익" 파이프라인 완성
- 10개 오픈소스 레포 패턴을 CHATBATTLE 맥락에 맞게 통합

Canonical authority:
- 이 문서는 `docs/design-docs/unified-product-model.md`를 **확장**한다.
- 기존 6-Surface 모델, Non-Negotiable Invariants, C02 스택은 그대로 유지.
- 충돌 시 `SYSTEM_INTENT.md`가 우선.

---

## 1. 비전 한 문장

> 유저가 자신의 매매패턴을 가져와 AI 에이전트로 만들고,
> 다른 유저의 전략을 테스트하고, 대결하고, 수익을 나누는 플랫폼.

---

## 2. 현재 모델 → 확장 모델 매핑

### 현재 6-Surface (유지)

```
Home → Create Agent → Terminal → World → Battle → Agent
```

### 확장: 3개 레이어 추가

```
[기존 6-Surface: 게임/학습 루프]
    │
    ├── [NEW] Strategy Layer (전략 빌더 + 백테스트)
    │     → Terminal에 통합
    │
    ├── [NEW] Execution Layer (자동매매 파이프라인)
    │     → Agent에 통합
    │
    └── [NEW] Marketplace Layer (전략 마켓플레이스)
          → Signals/Market에 통합 (기존 secondary surface 확장)
```

### 왜 새 Surface를 만들지 않는가

기존 설계 원칙: "6-Surface는 final IA"
→ 새 기능은 기존 Surface 안에 **모드/탭**으로 흡수
→ Surface 수를 늘리면 사용자 인지 부하 증가

---

## 3. Surface별 확장 설계

### 3.1 Terminal 확장 → Strategy Console

현재: 차트 + 인텔 + 스캔 (읽기 전용 분석)
확장: **전략 빌더 + 백테스트 + 패턴 임포트**

```
Terminal (확장 후)
├── [기존] WarRoom (차트 + 에이전트 인텔)
├── [기존] Intel Panel (스캔 결과)
├── [NEW] Strategy Builder Tab
│   ├── Pattern Importer
│   │   ├── Exchange API 연결 (Binance/Bybit/OKX)
│   │   ├── Wallet 거래내역 가져오기 (Viem)
│   │   └── CSV/JSON 수동 업로드
│   ├── Skill Composer
│   │   ├── Entry Skills (진입 조건 카드)
│   │   ├── Risk Skills (리스크 관리 카드)
│   │   └── Exit Skills (청산 조건 카드)
│   └── Backtest Runner
│       ├── 과거 데이터 시뮬레이션
│       ├── 성과 리포트 (승률, PnL, MDD, Sharpe)
│       └── 기존 에이전트와 비교
├── [NEW] Mission Control View
│   ├── 다수 에이전트 동시 분석 현황
│   ├── 실시간 진행 상태
│   └── 결과 비교 대시보드
└── [기존] Bottom Panel (액션)
```

#### Pattern Importer 데이터 플로우

```
거래소 API / 지갑 온체인 데이터
    ↓
TradeHistory[] (raw trades)
    ↓
PatternExtractor (src/lib/engine/patternExtractor.ts)
    ├── 진입 패턴 분류 (breakout, reversal, momentum, mean-reversion)
    ├── 포지션 사이징 패턴 (fixed, martingale, kelly)
    ├── 청산 패턴 (target-hit, trailing, time-based)
    └── 시간대/페어 선호도
    ↓
TradingProfile (유저의 매매 DNA)
    ↓
SkillCard[] (재사용 가능한 전략 구성요소)
    ↓
Strategy (배포 가능한 완성된 전략)
```

#### Skill Card 시스템 (superpowers 패턴 적용)

```typescript
// src/lib/engine/skills/types.ts
interface SkillCard {
  id: string;
  name: string;
  category: 'entry' | 'risk' | 'exit' | 'filter';
  description: string;

  // 실행 조건
  conditions: ConditionSet;

  // 파라미터 (유저 조정 가능)
  params: Record<string, ParamDef>;

  // 의존하는 데이터 소스
  requiredFactors: FactorType[];

  // 출처 추적
  origin: 'system' | 'extracted' | 'community' | 'ai-generated';
  sourceUserId?: string;

  // 성과 메타데이터
  backtestStats?: BacktestResult;
}

// 예시: 골든크로스 진입 스킬
const goldenCross: SkillCard = {
  id: 'entry-golden-cross',
  name: '골든크로스 진입',
  category: 'entry',
  conditions: {
    indicator: 'EMA',
    fast: 20,
    slow: 50,
    crossType: 'bullish'
  },
  params: {
    fastPeriod: { type: 'number', default: 20, min: 5, max: 50 },
    slowPeriod: { type: 'number', default: 50, min: 20, max: 200 }
  },
  requiredFactors: ['STRUCTURE'],
  origin: 'system'
};
```

### 3.2 Agent 확장 → Trading Agent Hub

현재: 성장 + 기록 + 트레이너 카드 + 공유/렌탈
확장: **자동매매 실행 + 버전 관리 + 수익 추적**

```
Agent (확장 후)
├── [기존] Standby / Hangar (현재 상태)
├── [기존] Train (독트린, 프롬프트, 메모리)
├── [기존] Record (전적, 뱃지, 프루프)
├── [NEW] Execute Tab (자동매매)
│   ├── Mode Selector
│   │   ├── Paper Trading (가상 잔고)
│   │   ├── Signal Only (알림만)
│   │   └── Live Trading (실전, 권한 필요)
│   ├── Active Positions
│   │   ├── 현재 오픈 포지션
│   │   ├── PnL 실시간
│   │   └── 리스크 대시보드
│   ├── Execution Log
│   │   ├── 모든 주문 이력
│   │   ├── 진입/청산 사유
│   │   └── 슬리피지/수수료
│   └── Kill Switch
│       ├── 긴급 전체 청산
│       ├── 일일 손실 한도
│       └── 자동 정지 조건
├── [NEW] Version Manager
│   ├── v1.0 → v1.1 → v2.0 (전략 버전)
│   ├── A/B 비교 (Paper vs Live)
│   ├── 롤백 기능
│   └── Promotion Gate (Paper 성과 → Live 승격)
└── [기존] Release Readiness (퍼블릭 리스팅)
```

#### 자동매매 실행 파이프라인

```
Strategy (Terminal에서 구성)
    ↓
ExecutionPipeline (src/lib/server/executionPipeline.ts)
    ├── MarketMonitor (시장 감시, 스킬 조건 체크)
    │   └── priceStore WebSocket feed
    ├── SignalGenerator (진입/청산 신호 생성)
    │   └── SkillCard[] 평가
    ├── RiskChecker (리스크 검증)
    │   ├── 포지션 사이즈 계산
    │   ├── 최대 동시 포지션
    │   └── 일일 손실 한도 체크
    ├── OrderExecutor (주문 실행)
    │   ├── Paper: 가상 체결
    │   ├── GMX V2: gmxV2.ts
    │   └── DEX: polymarketClob.ts
    └── RecordWriter (기록)
        ├── TradeRecord → DB
        ├── GameRecord → ORPO pair
        └── RAG entry → 학습 메모리
```

### 3.3 Battle 확장 → Strategy Arena

현재: 에이전트 vs 시장 (whale encounter)
확장: **전략 vs 전략 대결 + 스웜 시뮬레이션**

```
Battle (확장 후)
├── [기존] Whale Encounter (AI vs Market)
├── [NEW] Strategy Duel (전략 vs 전략)
│   ├── 매칭: 비슷한 레벨/성과의 전략끼리
│   ├── 동일 시장 데이터에서 동시 실행
│   ├── 실시간 PnL 비교
│   └── 판정: 동일 기간 수익률/리스크 조정 수익
├── [NEW] Swarm Simulation (MiroFish 패턴)
│   ├── N개 전략을 동시 시뮬레이션
│   ├── 집단지성 예측 생성
│   ├── 개별 전략 기여도 추적
│   └── 시각화: 에이전트 무리의 방향성
└── [NEW] Tournament
    ├── 시즌제 (주간/월간)
    ├── 리더보드 (수익률, 샤프, MDD)
    ├── 보상: 배지, NFT, 수익 분배
    └── 시즌 엔드: 최고 전략 하이라이트
```

#### Strategy Duel GameRecord 확장

```typescript
// 기존 GameRecord 확장
interface DuelGameRecord extends GameRecord {
  mode: 'whale-encounter' | 'strategy-duel' | 'swarm';

  // duel 전용
  duel?: {
    challengerStrategy: StrategySnapshot;
    defenderStrategy: StrategySnapshot;
    sharedMarketWindow: { start: number; end: number; pair: string };
    challengerTrades: TradeRecord[];
    defenderTrades: TradeRecord[];
    challengerPnL: number;
    defenderPnL: number;
    verdict: 'challenger' | 'defender' | 'draw';
  };

  // swarm 전용
  swarm?: {
    participants: SwarmParticipant[];
    consensusDirection: 'long' | 'short' | 'neutral';
    consensusConfidence: number;
    actualOutcome: MarketOutcome;
  };
}
```

### 3.4 Signals/Market 확장 → Strategy Marketplace

현재: 시그널 디스커버리 + 커뮤니티
확장: **전략 마켓플레이스 + 카피트레이딩 + 렌탈**

```
Signals/Market (확장 후)
├── [기존] Signal Discovery
├── [기존] Community Posts
├── [NEW] Strategy Market
│   ├── Browse
│   │   ├── 카테고리: 추세추종, 역추세, 스캘핑, 스윙
│   │   ├── 필터: 수익률, MDD, 기간, 페어
│   │   └── 정렬: 인기순, 수익순, 리스크조정수익순
│   ├── Strategy Detail
│   │   ├── 성과 차트 (equity curve)
│   │   ├── 트레이더 프로필 (Passport 연동)
│   │   ├── Proof Card (검증된 실적)
│   │   ├── 사용 중인 Skill Cards (일부 블러)
│   │   └── 리뷰/평점
│   ├── Copy Trading
│   │   ├── 1-click copy (비율 설정)
│   │   ├── 실시간 따라하기
│   │   ├── 카피 성과 대시보드
│   │   └── 수수료 분배 (전략 제작자 ← 카피어)
│   └── Rental / Subscription
│       ├── 전략 시간제 대여
│       ├── 구독 모델 (월/주)
│       └── NFT 기반 접근 권한
└── [NEW] Creator Dashboard
    ├── 내 전략 퍼블리시 관리
    ├── 카피어 현황
    ├── 수익 대시보드
    └── 전략 업데이트/버전 관리
```

---

## 4. 에이전트 메모리 아키텍처 (OpenViking 패턴)

현재 `ragService.ts`를 계층형 메모리로 업그레이드.

```
┌─────────────────────────────────────────┐
│           Agent Memory System           │
├─────────────────────────────────────────┤
│                                         │
│  L0: Working Memory (항상 로드)          │
│  ├── 현재 시장 상태 (priceStore)         │
│  ├── 활성 포지션                         │
│  ├── 오늘의 PnL                         │
│  └── 직전 3개 거래 결과                  │
│                                         │
│  L1: Session Memory (온디맨드)           │
│  ├── 최근 7일 거래 기록                  │
│  ├── 활성 전략의 파라미터                │
│  ├── 최근 백테스트 결과                  │
│  └── 현재 시장 레짐 판단                 │
│                                         │
│  L2: Long-term Memory (시맨틱 검색)      │
│  ├── 전체 거래 히스토리                   │
│  ├── ORPO 학습 페어                      │
│  ├── 패턴별 성과 통계                     │
│  ├── 시장 레짐별 최적 전략 기억           │
│  └── 실패/성공 교훈 (RAG entries)        │
│                                         │
│  L3: Collective Memory (스웜)            │
│  ├── 커뮤니티 전략 성과 집계              │
│  ├── 시장 컨센서스 방향                   │
│  └── 유사 전략 군집 분석                  │
│                                         │
└─────────────────────────────────────────┘
```

### 메모리 → 의사결정 플로우

```
시장 이벤트 발생
    ↓
L0 체크: 현재 포지션 + 리스크 상태
    ↓
L1 로드: 최근 패턴 + 현재 전략
    ↓
L2 검색: "이 패턴에서 과거에 어떻게 했나?"
    ↓
L3 참조: "다른 전략들은 지금 어떻게 하고 있나?"
    ↓
C02 Decision Stack (기존 유지)
    ORPO → CTX → Guardian → Commander
    ↓
실행 결정 + 근거 기록
```

---

## 5. Swarm Intelligence 시스템 (MiroFish 패턴)

### 핵심 개념

유저들의 전략을 "가상 에이전트"로 복제 → 동시 시뮬레이션 → 집단 예측

```typescript
// src/lib/engine/swarm/types.ts
interface SwarmAgent {
  id: string;
  sourceStrategyId: string;
  sourceUserId: string;

  // 성격 (agency-agents 패턴)
  personality: {
    riskTolerance: number;      // 0-1
    timeHorizon: 'scalp' | 'swing' | 'position';
    convictionThreshold: number; // 신호 강도 최소값
    contrarian: boolean;         // 역추세 선호
  };

  // 현재 상태
  state: {
    position: 'long' | 'short' | 'flat';
    confidence: number;
    reasoning: string;
    lastAction: SwarmAction;
  };

  // 메모리 (OpenViking L2 연동)
  memory: AgentMemoryRef;
}

interface SwarmSimulation {
  id: string;
  pair: string;
  timeframe: string;
  agents: SwarmAgent[];
  startTime: number;
  endTime: number;

  // 집단 결과
  consensus: {
    direction: 'long' | 'short' | 'neutral';
    confidence: number;
    agreementRatio: number;  // 동의 비율
    topContributors: string[]; // 가장 영향력 있는 에이전트
  };

  // 시각화 데이터
  visualization: {
    agentPositions: Map<string, { x: number; y: number; direction: string }>;
    flowField: Vector2D[];  // 전체 흐름 방향
    clusters: AgentCluster[];
  };
}
```

### Swarm → Battle 연동

```
Swarm Simulation 결과
    ↓
컨센서스 방향 + 신뢰도
    ↓
Battle에서 "Swarm vs Individual" 모드
    ├── 개인 전략이 집단지성을 이길 수 있는가?
    ├── 집단지성이 맞으면: 카피한 유저 모두 수익
    └── 개인이 이기면: 높은 보상 + "Against the Swarm" 뱃지
```

---

## 6. 데이터 모델 확장

### 신규 DB 테이블

```sql
-- 거래소 연동
CREATE TABLE exchange_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES app_users(id),
  exchange TEXT NOT NULL,          -- 'binance', 'bybit', 'okx'
  api_key_encrypted TEXT NOT NULL, -- 암호화 저장
  permissions TEXT[] DEFAULT '{}', -- ['read', 'trade']
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 임포트된 거래 내역
CREATE TABLE imported_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES app_users(id),
  source TEXT NOT NULL,            -- 'binance_api', 'wallet_onchain', 'csv'
  pair TEXT NOT NULL,
  side TEXT NOT NULL,              -- 'buy', 'sell'
  price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL,
  fee NUMERIC DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 스킬 카드
CREATE TABLE skill_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES app_users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,          -- 'entry', 'risk', 'exit', 'filter'
  conditions JSONB NOT NULL,
  params JSONB NOT NULL,
  required_factors TEXT[],
  origin TEXT NOT NULL,            -- 'system', 'extracted', 'community', 'ai'
  is_public BOOLEAN DEFAULT false,
  backtest_stats JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 전략 (스킬 카드 조합)
CREATE TABLE strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES app_users(id),
  agent_id TEXT,                    -- 연결된 에이전트
  name TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  skill_card_ids UUID[],
  config JSONB NOT NULL,            -- 파라미터, 페어, 타임프레임
  status TEXT DEFAULT 'draft',      -- 'draft', 'paper', 'live', 'paused', 'archived'
  paper_stats JSONB,
  live_stats JSONB,
  is_listed BOOLEAN DEFAULT false,
  listing_price JSONB,              -- { type: 'copy' | 'rental', price: number }
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 전략 버전 히스토리
CREATE TABLE strategy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES strategies(id),
  version INTEGER NOT NULL,
  skill_card_ids UUID[],
  config JSONB NOT NULL,
  changelog TEXT,
  backtest_result JSONB,
  promoted_at TIMESTAMPTZ,         -- Paper → Live 승격 시점
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 자동매매 실행 로그
CREATE TABLE execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES strategies(id),
  user_id UUID REFERENCES app_users(id),
  action TEXT NOT NULL,             -- 'open', 'close', 'modify', 'alert'
  pair TEXT NOT NULL,
  side TEXT,
  price NUMERIC,
  quantity NUMERIC,
  reason JSONB,                     -- 어떤 스킬이 트리거했는지
  mode TEXT NOT NULL,               -- 'paper', 'live'
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 카피 트레이딩 구독
CREATE TABLE copy_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  copier_id UUID REFERENCES app_users(id),
  creator_id UUID REFERENCES app_users(id),
  strategy_id UUID REFERENCES strategies(id),
  allocation_ratio NUMERIC DEFAULT 1.0,  -- 복사 비율
  status TEXT DEFAULT 'active',
  fee_rate NUMERIC DEFAULT 0.1,          -- 수수료율
  total_pnl NUMERIC DEFAULT 0,
  total_fee_paid NUMERIC DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- 스웜 시뮬레이션
CREATE TABLE swarm_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  participant_strategy_ids UUID[],
  consensus JSONB,
  actual_outcome JSONB,
  accuracy NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 에이전트 메모리 (L2 장기 기억)
CREATE TABLE agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  user_id UUID REFERENCES app_users(id),
  memory_type TEXT NOT NULL,       -- 'trade_lesson', 'pattern_stat', 'regime_note'
  content JSONB NOT NULL,
  embedding VECTOR(1536),          -- pgvector 시맨틱 검색용
  quality TEXT DEFAULT 'medium',
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 7. API 확장

### 신규 엔드포인트

```
# 거래소 연동
POST   /api/exchange/connect         # API 키 등록
GET    /api/exchange/connections      # 연결된 거래소 목록
DELETE /api/exchange/connections/:id  # 연결 해제
POST   /api/exchange/import-trades   # 거래내역 가져오기
GET    /api/exchange/import-status   # 임포트 진행 상태

# 패턴 분석
POST   /api/patterns/extract         # 거래내역 → 패턴 추출
GET    /api/patterns/:userId         # 유저 매매 프로파일

# 스킬 카드
GET    /api/skills                   # 사용 가능한 스킬 목록
POST   /api/skills                   # 스킬 카드 생성
GET    /api/skills/:id               # 스킬 상세
PUT    /api/skills/:id               # 스킬 수정
POST   /api/skills/:id/backtest      # 개별 스킬 백테스트

# 전략
GET    /api/strategies               # 내 전략 목록
POST   /api/strategies               # 전략 생성 (스킬 조합)
GET    /api/strategies/:id           # 전략 상세
PUT    /api/strategies/:id           # 전략 수정
POST   /api/strategies/:id/backtest  # 전략 백테스트
POST   /api/strategies/:id/promote   # Paper → Live 승격
POST   /api/strategies/:id/pause     # 전략 일시정지
GET    /api/strategies/:id/versions  # 버전 히스토리

# 자동매매
POST   /api/execution/start          # 자동매매 시작
POST   /api/execution/stop           # 자동매매 중지
GET    /api/execution/status         # 현재 실행 상태
GET    /api/execution/logs           # 실행 로그
POST   /api/execution/kill           # 긴급 전체 청산

# 마켓플레이스
GET    /api/marketplace/strategies   # 퍼블릭 전략 브라우즈
GET    /api/marketplace/strategies/:id  # 전략 상세 (퍼블릭)
POST   /api/marketplace/copy         # 카피 트레이딩 시작
DELETE /api/marketplace/copy/:id     # 카피 중단
GET    /api/marketplace/my-copies    # 내가 카피 중인 전략
GET    /api/marketplace/my-copiers   # 나를 카피하는 유저

# 스웜
POST   /api/swarm/simulate           # 스웜 시뮬레이션 실행
GET    /api/swarm/consensus          # 현재 집단 예측
GET    /api/swarm/history            # 과거 스웜 정확도

# 에이전트 메모리
GET    /api/agent-memory/:agentId    # 에이전트 메모리 조회
POST   /api/agent-memory/:agentId/query  # 시맨틱 검색
```

---

## 8. 신규 모듈 맵

### Engine (src/lib/engine/)

```
engine/
├── [기존] agents.ts, battleEngine.ts, scoring.ts, etc.
├── skills/
│   ├── types.ts          # SkillCard 타입
│   ├── registry.ts       # 시스템 스킬 카드 레지스트리
│   ├── evaluator.ts      # 스킬 조건 평가 엔진
│   └── composer.ts       # 스킬 → 전략 조합기
├── strategy/
│   ├── types.ts          # Strategy 타입
│   ├── backtester.ts     # 백테스트 엔진
│   ├── optimizer.ts      # 파라미터 최적화
│   └── validator.ts      # 전략 유효성 검증
├── swarm/
│   ├── types.ts          # SwarmAgent, SwarmSimulation
│   ├── simulator.ts      # 스웜 시뮬레이션 엔진
│   ├── consensus.ts      # 집단 의사결정
│   └── visualizer.ts     # 스웜 시각화 데이터
├── memory/
│   ├── types.ts          # 메모리 레이어 타입
│   ├── l0Working.ts      # L0: 워킹 메모리
│   ├── l1Session.ts      # L1: 세션 메모리
│   ├── l2LongTerm.ts     # L2: 장기 기억 (시맨틱)
│   └── l3Collective.ts   # L3: 집단 기억
└── pattern/
    ├── extractor.ts      # 거래내역 → 패턴 추출
    ├── classifier.ts     # 패턴 분류기
    └── profiler.ts       # 유저 매매 프로파일 생성
```

### Server (src/lib/server/)

```
server/
├── [기존] db.ts, session.ts, authRepository.ts, etc.
├── exchangeConnector.ts      # 거래소 API 연동
├── tradeImporter.ts          # 거래내역 임포트
├── executionPipeline.ts      # 자동매매 실행 파이프라인
├── executionMonitor.ts       # 실행 모니터링 + Kill Switch
├── strategyVersioning.ts     # 전략 버전 관리
├── marketplaceService.ts     # 마켓플레이스 로직
├── copyTradeExecutor.ts      # 카피 트레이딩 실행
├── revenueDistributor.ts     # 수익 분배
└── swarmOrchestrator.ts      # 스웜 시뮬레이션 오케스트레이터
```

### Components (src/components/)

```
components/
├── [기존] arena/, terminal/, layout/, etc.
├── strategy/
│   ├── SkillCardPicker.svelte    # 스킬 카드 선택 UI
│   ├── StrategyComposer.svelte   # 전략 빌더 UI
│   ├── BacktestReport.svelte     # 백테스트 결과
│   └── EquityCurve.svelte        # 수익 곡선 차트
├── execution/
│   ├── ExecutionDashboard.svelte # 자동매매 대시보드
│   ├── PositionCard.svelte       # 포지션 카드
│   ├── ExecutionLog.svelte       # 실행 로그
│   └── KillSwitch.svelte         # 긴급 정지 버튼
├── marketplace/
│   ├── StrategyBrowser.svelte    # 전략 브라우즈
│   ├── StrategyDetailCard.svelte # 전략 상세
│   ├── CopyTradeSetup.svelte     # 카피 설정
│   └── CreatorDashboard.svelte   # 크리에이터 대시보드
└── swarm/
    ├── SwarmVisualizer.svelte    # 스웜 시각화
    ├── ConsensusGauge.svelte     # 집단 컨센서스 게이지
    └── SwarmBattleView.svelte    # 스웜 vs 개인 배틀
```

### Stores (src/lib/stores/)

```
stores/
├── [기존] gameState.ts, priceStore.ts, etc.
├── strategyStore.ts          # 활성 전략 상태
├── executionStore.ts         # 자동매매 실행 상태
├── skillCardStore.ts         # 스킬 카드 컬렉션
├── marketplaceStore.ts       # 마켓플레이스 필터/정렬
├── swarmStore.ts             # 스웜 시뮬레이션 상태
└── agentMemoryStore.ts       # 에이전트 메모리 (L0/L1 클라이언트)
```

---

## 9. 유저 플로우 (End-to-End)

### 플로우 A: "내 매매 → 에이전트화 → 자동매매"

```
1. Home: "Create My Agent" 클릭
2. Create Agent: 캐릭터 선택 + 민팅 + AI 바인딩
3. Terminal > Strategy Builder:
   a. 거래소 API 연결 (Binance)
   b. 거래내역 임포트 (최근 3개월)
   c. 패턴 자동 추출 → "당신은 추세추종 + 스윙 트레이더"
   d. 추출된 패턴 → 스킬 카드 자동 생성
   e. 스킬 카드 조합 → 전략 v1.0
4. Terminal > Backtest:
   a. 지난 6개월 데이터로 백테스트
   b. 결과 확인 (승률 58%, Sharpe 1.2, MDD -12%)
   c. 파라미터 조정 → 전략 v1.1
5. Agent > Execute:
   a. Paper Trading 모드로 시작
   b. 2주 후 성과 확인
   c. Promotion Gate 통과 → Live Trading 승격
6. Agent > Record:
   a. 실전 성과 누적
   b. 프루프 카드 자동 생성
```

### 플로우 B: "남의 전략 → 테스트 → 카피"

```
1. Signals/Market > Strategy Market:
   a. "BTC 추세추종" 카테고리 브라우즈
   b. 상위 전략 상세 확인 (수익 곡선, Proof Card)
2. 전략 상세:
   a. "Paper Test" 클릭 → 내 계정에서 Paper 시뮬
   b. 2주 결과 확인
3. "Copy Trade" 시작:
   a. 복사 비율 설정 (50%)
   b. 최대 손실 한도 설정
   c. 카피 시작 → 실시간 따라하기
4. 대시보드에서 원본 vs 카피 성과 비교
```

### 플로우 C: "AI 모델 학습 → 새 전략"

```
1. Terminal > 차트 분석:
   a. 시장 데이터 라벨링 (이 구간은 "추세", 이 구간은 "횡보")
   b. 학습 데이터셋 빌드
2. Agent > Train:
   a. ORPO 학습 실행 (축적된 GameRecord 기반)
   b. 학습 전후 비교 (백테스트)
   c. 메모리 업데이트 (L2 장기 기억)
3. Agent > Version Manager:
   a. v1.0 (학습 전) vs v2.0 (학습 후) A/B 비교
   b. v2.0이 우월하면 승격
4. Battle > Strategy Duel:
   a. 내 v2.0 vs 커뮤니티 상위 전략
   b. 대결 결과 → 리더보드 반영
```

---

## 10. 구현 우선순위

### Phase 1: Foundation (4주)
- [ ] 스킬 카드 타입 시스템 (`engine/skills/`)
- [ ] 시스템 기본 스킬 카드 20개 (indicators.ts 기반)
- [ ] 전략 CRUD API + DB 테이블
- [ ] Terminal에 Strategy Builder 탭 UI (Composer)
- [ ] Paper Trading 기본 파이프라인

### Phase 2: Import & Extract (3주)
- [ ] 거래소 API 커넥터 (Binance 우선)
- [ ] 거래내역 임포트 + 패턴 추출
- [ ] 추출 → 스킬 카드 자동 변환
- [ ] 백테스트 엔진 v1

### Phase 3: Execution (3주)
- [ ] 자동매매 실행 파이프라인 (Paper)
- [ ] 실행 대시보드 UI
- [ ] Kill Switch + 리스크 관리
- [ ] Paper → Live 승격 게이트

### Phase 4: Marketplace (3주)
- [ ] 전략 퍼블리시 + 브라우즈
- [ ] 카피 트레이딩 실행
- [ ] 수익 분배 로직
- [ ] 크리에이터 대시보드

### Phase 5: Swarm & Battle (3주)
- [ ] 스웜 시뮬레이션 엔진
- [ ] Strategy Duel 모드
- [ ] 리더보드 + 토너먼트
- [ ] 스웜 시각화

### Phase 6: Memory & Learning (2주)
- [ ] L0/L1/L2/L3 메모리 레이어
- [ ] ORPO 학습 실동작
- [ ] 자기개선 루프 (매매 후 → 기억 업데이트 → 다음 판단 개선)

---

## 11. 기존 코드 재사용 맵

| 기존 모듈 | 재사용 위치 | 방법 |
|-----------|------------|------|
| `indicators.ts` | SkillCard 조건 평가 | 래핑: 각 인디케이터를 SkillCard로 변환 |
| `patternDetector.ts` | PatternExtractor | 확장: 유저 거래 → 패턴 매칭 |
| `factorEngine.ts` | SkillCard requiredFactors | 연결: 팩터 → 스킬 의존성 |
| `battleEngine.ts` v1~v3 | Strategy Duel | 확장: 전략 vs 전략 모드 추가 |
| `ragService.ts` | L2 Long-term Memory | 업그레이드: 벡터 검색 + 품질 필터 |
| `gameRecordStore.ts` | 학습 데이터 소스 | 연결: GameRecord → ORPO + 메모리 |
| `gmxV2.ts` | Live Trading Executor | 재사용: 기존 주문 실행 로직 |
| `copy_trade_runs` 테이블 | Copy Subscription | 확장: 구독 모델 + 수수료 추가 |
| `scoring.ts` | Strategy 성과 평가 | 확장: Sharpe, MDD, Calmar 추가 |
| `c02Pipeline.ts` | AI 의사결정 | 유지: 메모리 레이어 입력 추가 |

---

## 12. 기존 불변식과의 호환성 체크

| 불변식 | 호환 여부 | 설명 |
|--------|----------|------|
| Same data, different interpretation | ✅ | 동일 시장 데이터에서 전략/에이전트가 다르게 해석 |
| Character ownership = operational | ✅ | 캐릭터에 전략이 바인딩, 성과가 누적 |
| Progression = evidence-bound | ✅ | 백테스트 + 실전 성과로만 승격 |
| Game wraps real learning | ✅ | 대결/스웜이 실제 학습 데이터 생성 |
| World ≠ Terminal | ✅ | 전략 빌더는 Terminal에, 배틀은 World/Battle에 |
| Server authority on durable state | ✅ | 전략, 실행 로그, 카피 구독 모두 서버 |
| priceStore canonical | ✅ | 실행 파이프라인도 priceStore 소비 |
| frontend is canonical | ✅ | 모든 구현은 frontend 내부 |

---

## Source References

### 적용한 오픈소스 패턴

| 레포 | 적용 위치 | 패턴 |
|------|----------|------|
| agency-agents | Agent Personality System | 에이전트별 고유 매매 성격/판단 기준 |
| superpowers | Skill Card System | 조합 가능한 전략 구성요소 |
| MiroFish | Swarm Simulation | 집단지성 예측 + 시각화 |
| OpenViking | Memory Architecture | L0/L1/L2/L3 계층형 메모리 |
| context-hub | Self-improvement Loop | 매매 후 자기 피드백 |
| deepagents | Execution Pipeline | 서브에이전트 오케스트레이션 |

### 기존 설계 문서

- `docs/SYSTEM_INTENT.md`
- `docs/design-docs/six-surface-game-loop.md`
- `docs/design-docs/unified-product-model.md`
- `docs/design-docs/arena-domain-model.md`
- `docs/design-docs/learning-loop.md`
