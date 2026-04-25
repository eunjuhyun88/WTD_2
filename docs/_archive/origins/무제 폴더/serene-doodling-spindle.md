# CHATBATTLE (Cogochi) — Full Stack Build Plan

## Context

**CHATBATTLE**은 AI 트레이딩 훈련 플랫폼 + 카피트레이딩 마켓플레이스.
포지셔닝: "AI와 같은 차트를 보고, 누가 더 잘 읽는지 겨룬다"

### 통합 소스 4가지
1. **Claude Code 패턴**: Tool 시스템, Permission, Hook, Task/Agent, Memory, MCP 아키텍처 참조
2. **Memento-Kit** (`/Users/ej/Downloads/memento-kit`): 에이전트 컨텍스트 엔지니어링 — 멀티에이전트 조정, 메모리, 오케스트레이터, 레지스트리
3. **Cogochi 설계문서** (`/Users/ej/Downloads/Cogochi_ALL_20260315/`): PRD, GDD, AutoResearch, Tokenomics, AgentEconomy (20개 문서)
4. **CHATBATTLE 시장조사 개선안**: 포지셔닝 변경, /review 추가, 프로세스 보상, 저널 자동화, 선물 트레이더 특화

### 핵심 개선사항 (시장조사 기반)
- 포지셔닝: "게임" → **"AI 트레이딩 훈련 플랫폼"**
- `/review` 의무화: 복기 안 하면 다음 Battle 잠김
- 프로세스 보상: 규칙 준수(50%) + 결과(30%) + 복기 품질(20%)
- Stage 진급: 복기 완료율 포함 (BRONZE→DIAMOND)
- Lab/Battle 역할 분리: Lab=자동 실험, Battle=수동 판단 훈련
- Terminal 연결: 실시간 → Battle/Doctrine 피드
- 선물 특화: 펀딩비, OI, 청산 히트맵, 포지션 사이징, MTF, 마켓 스트럭처

### 기술 스택
- **백엔드**: Node.js + Hono + TypeScript
- **DB**: PostgreSQL + Drizzle + pgvector
- **웹**: SvelteKit (마켓플레이스, SEO, Web3)
- **앱**: Flutter (터미널, 트레이딩, 모니터링)
- **워커**: Python (AutoResearch)
- **컨트랙트**: Solidity + Hardhat (Monad)
- **인프라**: pnpm + Turborepo 모노레포

### 프로젝트 위치
`/Users/ej/Projects/cogochi`

---

## Phase 1: 프로젝트 스캐폴딩 + Memento-Kit 부트스트랩

### 1-1. 모노레포 구조

```
/Users/ej/Projects/cogochi/
├── package.json                    ← 루트 (pnpm workspace)
├── pnpm-workspace.yaml
├── turbo.json                      ← Turborepo 빌드 파이프라인
├── tsconfig.base.json
├── .env.example
├── .gitignore
│
├── packages/
│   ├── shared/                     ← 공유 타입, 스키마, 상수
│   │   └── src/
│   │       ├── types/              ← 15+ 모델 타입
│   │       ├── schemas/            ← Zod 스키마 (Claude Code Tool 패턴)
│   │       ├── constants/          ← Archetype, Grade, Zone, Stage, Fee
│   │       └── utils/              ← riskClassifier, stageChecker, scoring
│   │
│   └── db/                         ← Drizzle ORM
│       └── src/
│           ├── schema/             ← 18+ 테이블
│           ├── migrations/
│           └── seed.ts
│
├── apps/
│   ├── api/                        ← Hono 백엔드 API
│   │   └── src/
│   │       ├── index.ts
│   │       ├── routes/             ← 25+ API 패밀리
│   │       ├── services/           ← 비즈니스 로직
│   │       ├── tools/              ← Claude Code Tool 패턴
│   │       ├── hooks/              ← 트레이딩 이벤트 훅
│   │       ├── permissions/        ← 리스크 분류기
│   │       ├── middleware/
│   │       └── lib/
│   │
│   ├── web/                        ← SvelteKit 웹
│   │   └── src/
│   │       ├── routes/             ← 개선된 Surface 모델
│   │       ├── lib/
│   │       └── components/
│   │
│   └── workers/                    ← Python AutoResearch 워커
│       ├── data_prepare.py
│       ├── trading_agent.py
│       ├── evaluate.py
│       ├── autoresearch_runner.py
│       └── walk_forward.py
│
├── app/                            ← Flutter 모바일
│   └── lib/
│       ├── screens/
│       ├── widgets/
│       ├── services/
│       ├── providers/
│       └── models/
│
├── contracts/                      ← Solidity (Monad)
│   └── contracts/
│       ├── AgentNFT.sol
│       ├── PassportSBT.sol
│       ├── CommitmentRegistry.sol
│       ├── MarketplaceEscrow.sol
│       ├── COGOCHI.sol
│       └── veGOCHI.sol
│
├── agents/                         ← Memento-Kit 에이전트 블루프린트
│   ├── crusher.json
│   ├── rider.json
│   ├── oracle.json
│   └── guardian.json
│
├── tools/                          ← Memento-Kit 도구 계약
├── docs/                           ← Memento-Kit 표준 문서
├── .agent-context/                 ← Memento-Kit 런타임
├── .claude/                        ← Claude Code 통합
├── context-kit.json                ← Memento-Kit 설정
├── AGENTS.md
├── CLAUDE.md
├── ARCHITECTURE.md
└── README.md
```

### 1-2. Memento-Kit 부트스트랩

```bash
# Core
bash /Users/ej/Downloads/memento-kit/setup.sh \
  --target /Users/ej/Projects/cogochi \
  --project-name chatbattle \
  --summary "AI trading training platform with on-chain verified track records" \
  --stack "Hono,SvelteKit,Flutter,PostgreSQL,Drizzle,Solidity" \
  --surfaces "api,web,app,contracts,workers"

# Memory
bash /Users/ej/Downloads/memento-kit/setup-memory.sh \
  --target /Users/ej/Projects/cogochi \
  --agent-name chatbattle-dev \
  --agent-role "Full-stack developer building CHATBATTLE platform"

# Orchestrator (AutoResearch 태스크 큐)
bash /Users/ej/Downloads/memento-kit/setup-orchestrator.sh \
  --target /Users/ej/Projects/cogochi \
  --orchestrator-name autoresearch \
  --core-repo /Users/ej/Projects/cogochi
```

---

## Phase 2: 공유 패키지

### 2-1. packages/shared — 타입 & 스키마

```
packages/shared/src/
├── types/
│   ├── user.ts            ← User, Subscription (FREE/PRO)
│   ├── agent.ts           ← OwnedAgent, AgentRecord, AgentProgression
│   ├── archetype.ts       ← CRUSHER | RIDER | ORACLE | GUARDIAN
│   ├── doctrine.ts        ← Doctrine, SignalWeights, RiskRules
│   ├── battle.ts          ← EvalMatch, EvalScenario, AgentDecision
│   ├── review.ts          ← ★ NEW: ReviewSession, ReviewPrompt, ReviewScore
│   ├── memory.ts          ← BattleMemory, MemoryBank
│   ├── market.ts          ← MarketListing, RentalTransaction
│   ├── backtest.ts        ← BacktestRun, BacktestScore
│   ├── autoresearch.ts    ← AutoResearchRun, ExperimentLog
│   ├── blockchain.ts      ← PassportSBT, CommitmentRecord
│   ├── signal.ts          ← SignalSnapshot (40+ 필드)
│   ├── journal.ts         ← ★ NEW: TradeJournal, JournalEntry, SetupClassification
│   ├── mission.ts         ← ★ NEW: DailyMission, MissionProgress
│   └── scoring.ts         ← ★ NEW: ProcessScore (규칙준수/결과/복기품질)
├── schemas/               ← Zod 스키마
├── constants/
│   ├── archetypes.ts      ← 4 아키타입 + 강/약 시장
│   ├── grades.ts          ← Common($20)/Rare($80)/Legendary($300)
│   ├── zones.ts           ← 11 Primary + 12 Modifier Zone
│   ├── stages.ts          ← ★ 개선: BRONZE→DIAMOND (복기율 포함)
│   ├── fees.ts            ← 마켓 수수료 (5% USDC / 4% $COGOCHI)
│   ├── scoring.ts         ← ★ NEW: 프로세스 보상 가중치 (50/30/20)
│   └── missions.ts        ← ★ NEW: 일일 미션 정의
└── utils/
    ├── riskClassifier.ts  ← 위험도 분류 (Claude Code bashClassifier 패턴)
    ├── stageChecker.ts    ← ★ 개선: 복기 완료율 포함 Stage 검증
    ├── rentalPricing.ts   ← 렌탈 가격 공식
    ├── scoring.ts         ← ★ 개선: processScore 계산 (규칙50+결과30+복기20)
    ├── missionTracker.ts  ← ★ NEW: 일일 미션 진행 추적
    └── setupClassifier.ts ← ★ NEW: 트레이드 셋업 자동 분류 (FVG, OB, BOS 등)
```

### 2-2. packages/db — Drizzle 스키마

```
packages/db/src/schema/
├── users.ts               ← users
├── agents.ts              ← agents (archetype, grade, stage, status)
├── doctrines.ts           ← doctrines (markdown + signal weights)
├── loadouts.ts            ← training_loadouts
├── scenarios.ts           ← eval_scenarios (500 고정)
├── battles.ts             ← eval_matches
├── reviews.ts             ← ★ NEW: review_sessions (복기 기록)
├── memories.ts            ← battle_memories (+ pgvector)
├── memoryBanks.ts         ← memory_banks
├── backtests.ts           ← backtest_runs
├── autoResearchRuns.ts    ← autoresearch_runs + experiment_logs
├── marketListings.ts      ← marketplace
├── rentalTransactions.ts  ← 렌탈 거래
├── commitments.ts         ← 온체인 커밋 캐시
├── signals.ts             ← signal_snapshots
├── journals.ts            ← ★ NEW: trade_journals (실제 트레이드 저널)
├── missions.ts            ← ★ NEW: daily_missions + mission_progress
├── notifications.ts       ← 알림
└── index.ts
```

---

## Phase 3: 백엔드 API

### 3-1. 라우트 구조

```
apps/api/src/routes/
├── auth.ts            ← login, logout, refresh (JWT + wallet)
├── agents.ts          ← CRUD, configure, retrain, track-record
├── doctrines.ts       ← CRUD, markdown parse
├── battles.ts         ← ★ 개선: create, execute (캔들 하나씩), reflect
├── reviews.ts         ← ★ NEW: create, submit, AI분석, 복기 점수
├── lab.ts             ← ★ NEW: 자동 백테스트, 버전 비교, 벤치마크팩
├── market.ts          ← list, rent, buy, cancel, signals
├── autoresearch.ts    ← start, progress, logs, stop
├── backtest.ts        ← start, progress, report, trades
├── memory.ts          ← search, compact, cards
├── blockchain.ts      ← passport, track-record, publish
├── data.ts            ← Binance proxy (klines, OI, funding, LS)
├── terminal.ts        ← ★ 개선: chart + 유사과거검색(RAG) + Zone탐지
├── journal.ts         ← ★ NEW: 거래소 연동, 자동 임포트, 셋업 분류
├── missions.ts        ← ★ NEW: 오늘의 미션, 진행상황, 완료
├── notifications.ts   ← CRUD, settings
└── futures.ts         ← ★ NEW: 펀딩비추적, OI변화, 청산히트맵, MTF, 마켓스트럭처
```

### 3-2. 서비스 레이어

```
apps/api/src/services/
├── agentService.ts
├── battleService.ts         ← ★ 개선: 캔들 프로그레시브 공개, 유저+AI 동시 판단
├── reviewService.ts         ← ★ NEW: 복기 프롬프트 생성, AI 분석, 패턴 통계
├── labService.ts            ← ★ NEW: 자동 1000게임 시뮬, 버전 diff
├── marketService.ts
├── autoresearchService.ts   ← Python 워커 spawn + BullMQ
├── backtestService.ts
├── memoryService.ts         ← RAG (pgvector)
├── blockchainService.ts     ← viem (Monad)
├── dataSourceService.ts     ← Binance REST (MCP 패턴)
├── journalService.ts        ← ★ NEW: 거래소 API 연동, 트레이드 자동 분류
├── missionService.ts        ← ★ NEW: 미션 생성/체크/보상
├── futuresService.ts        ← ★ NEW: 펀딩비, OI, 청산, 마켓스트럭처
├── scoringService.ts        ← ★ NEW: processScore 계산 엔진
└── coachingService.ts       ← ★ NEW: AI 코칭 (연패패턴, 셋업별 승률, 틸트감지)
```

### 3-3. API 엔드포인트 우선순위

| 패밀리 | 주요 라우트 | 우선순위 |
|---------|------------|---------|
| auth | login, logout, refresh | P0 |
| agents | CRUD, configure, retrain | P0 |
| doctrines | CRUD, markdown parse | P0 |
| data | klines, OI, funding, LS ratio | P0 |
| battles | create, tick-execute, reflect | P0 |
| **reviews** | ★ create, submit, AI분석, score | **P0** |
| **scoring** | ★ processScore 계산 | **P0** |
| **missions** | ★ daily 미션 CRUD | **P1** |
| lab | auto-backtest, version compare | P1 |
| autoresearch | start, progress, stop | P1 |
| backtest | start, report, trades | P1 |
| memory | search, compact | P1 |
| **futures** | ★ 펀딩비, OI, 청산히트맵, MTF | **P1** |
| terminal | chart + RAG 유사 과거 검색 | P2 |
| market | list, rent, buy, signals | P2 |
| blockchain | passport, commit, publish | P2 |
| **journal** | ★ 거래소 연동, 자동 분류 | **P2** |
| **coaching** | ★ AI 코칭 (틸트, 패턴) | **P2** |
| notifications | CRUD, settings | P3 |

### 3-4. Claude Code 패턴 적용

**Tool 시스템** (`apps/api/src/tools/`):
```
├── base.ts                    ← TradingTool<TInput, TOutput> 인터페이스
├── dataFetchTool.ts           ← Binance 데이터 조회
├── backtestTool.ts            ← 백테스트 실행
├── orderTool.ts               ← 주문 실행 (Phase 2)
├── zoneDetectTool.ts          ← Zone 감지
├── setupClassifyTool.ts       ← ★ 셋업 자동 분류 (FVG/OB/BOS/CHoCH)
└── structureDetectTool.ts     ← ★ 마켓 스트럭처 자동 라벨링
```

**Hook 시스템** (`apps/api/src/hooks/`):
```
├── registry.ts                ← TradeHookRegistry (AsyncHookRegistry 패턴)
├── preOrder.ts                ← 주문 전 리스크 체크
├── postOrder.ts               ← PnL 업데이트, 알림
├── postBattle.ts              ← ★ Battle 후 → Review 생성 트리거
├── postReview.ts              ← ★ Review 완료 → 다음 Battle 언락
├── onZoneChange.ts            ← Zone 변경시 재평가
├── dailySummary.ts            ← 일일 요약 → 온체인
└── tiltDetector.ts            ← ★ 연패/복수매매/오버트레이딩 감지
```

**Permission 시스템** (`apps/api/src/permissions/`):
```
├── tradeClassifier.ts         ← LOW/MEDIUM/HIGH/DANGER 분류
├── approvalFlow.ts            ← 승인 요청 흐름
├── sandboxMode.ts             ← 페이퍼 트레이딩 모드
└── reviewGate.ts              ← ★ "복기 완료해야 다음 판 열림" 게이트
```

---

## Phase 4: AutoResearch 워커

```
apps/workers/
├── requirements.txt           ← torch, transformers, ollama, pandas, numpy
├── data_prepare.py            ← 500 시나리오 (SEED=42)
├── trading_agent.py           ← 에이전트 결정 로직
├── evaluate.py                ← composite_score = -(sharpe×win_rate)/(|max_dd|+0.01)
├── autoresearch_runner.py     ← 100 iteration (karpathy 패턴)
├── walk_forward.py            ← r>0.6, dd<-25%, 50+trades, 180+days
└── api_bridge.py              ← Hono API 상태 업데이트
```

Memento-Kit 오케스트레이터 연동: JSONL 태스크 큐 → 워커 할당 → 승인 게이트

---

## Phase 5: SvelteKit 웹 — 개선된 Surface 모델

```
apps/web/src/routes/
├── +page.svelte                      ← 랜딩 "AI와 같은 차트를 본다"
├── +layout.svelte                    ← 공통 레이아웃
├── onboard/+page.svelte              ← ★ 첫 에이전트 + 첫 연습 체험
│
├── dashboard/                        ← ★ 오늘의 훈련 상태
│   ├── +page.svelte                  ← 일일 미션 + 복기 리마인더
│   └── missions/+page.svelte         ← 미션 상세
│
├── terminal/                         ← 실시간 차트 분석
│   └── +page.svelte                  ← 차트 + Zone + RAG 유사 과거
│
├── lab/                              ← ★ 전략 실험실 (자동)
│   ├── +page.svelte                  ← 벤치마크팩, 버전 비교
│   └── [runId]/+page.svelte          ← 실험 결과 상세
│
├── battle/                           ← 실전 연습 (수동)
│   ├── +page.svelte                  ← 배틀 목록
│   ├── [id]/+page.svelte             ← ★ 캔들 하나씩 공개, 유저 판단
│   └── [id]/review/+page.svelte      ← ★★★ 복기 (의무!)
│
├── review/                           ← ★ 복기 센터
│   ├── +page.svelte                  ← 미완료 복기 목록
│   └── [id]/+page.svelte             ← AI 비교 분석 + 패턴 통계
│
├── agent/                            ← 에이전트 관리
│   ├── +page.svelte                  ← 에이전트 목록
│   ├── [id]/+page.svelte             ← Agent HQ (전략/기억/기록/성장)
│   └── [id]/doctrine/+page.svelte    ← Doctrine 에디터
│
├── journal/                          ← ★ 트레이드 저널 (Phase 2)
│   ├── +page.svelte                  ← 거래소 연동, 트레이드 목록
│   └── [id]/+page.svelte             ← 개별 복기 + AI 코칭
│
├── marketplace/                      ← 마켓플레이스 (Phase 2)
│   ├── +page.svelte                  ← 검색/필터
│   └── [id]/+page.svelte             ← 에이전트 상세 + 온체인 기록
│
├── mint/+page.svelte                 ← NFT 민팅 (지갑 연결)
├── staking/+page.svelte              ← veGOCHI 스테이킹
└── api/                              ← SvelteKit API (프록시)
```

---

## Phase 6: Flutter 앱

```
app/lib/
├── main.dart
├── app.dart
├── screens/
│   ├── dashboard/                    ← ★ 오늘의 미션 (첫 화면)
│   │   ├── dashboard_screen.dart
│   │   └── mission_card.dart
│   ├── terminal/                     ← Bloomberg-style 대시보드
│   │   ├── terminal_screen.dart
│   │   ├── chart_widget.dart         ← fl_chart
│   │   ├── orderbook_widget.dart
│   │   ├── funding_overlay.dart      ← ★ 펀딩비 오버레이
│   │   └── liquidation_heatmap.dart  ← ★ 청산 히트맵
│   ├── battle/                       ← ★ 캔들 하나씩 공개
│   │   ├── battle_screen.dart
│   │   ├── candle_reveal.dart
│   │   └── decision_input.dart       ← LONG/SHORT/SKIP 입력
│   ├── review/                       ← ★★★ 복기 (의무)
│   │   ├── review_screen.dart
│   │   ├── ai_comparison.dart        ← AI vs 내 판단 비교
│   │   └── pattern_stats.dart        ← "이 패턴 47번 중 68% LONG 정답"
│   ├── agents/
│   │   ├── agent_list_screen.dart
│   │   ├── agent_detail_screen.dart
│   │   └── doctrine_editor.dart
│   ├── lab/                          ← 전략 실험
│   │   └── lab_screen.dart
│   ├── journal/                      ← ★ 트레이드 저널
│   │   └── journal_screen.dart
│   └── alerts/
│       └── alerts_screen.dart
├── widgets/
│   ├── agent_avatar.dart             ← 4 Archetype 스프라이트 (buddy 패턴)
│   ├── pnl_card.dart                 ← PnL 위젯 (cost-tracker 패턴)
│   ├── zone_indicator.dart
│   ├── stage_badge.dart              ← BRONZE→DIAMOND
│   ├── process_score_ring.dart       ← ★ 규칙준수/결과/복기 3중 링
│   ├── mission_progress.dart         ← ★ 일일 미션 프로그레스 바
│   ├── market_structure.dart         ← ★ BOS/CHoCH/OB/FVG 마킹
│   └── mtf_confluence.dart           ← ★ 멀티타임프레임 일치도
├── services/
│   ├── api_client.dart               ← Hono API (Dio)
│   ├── websocket_service.dart
│   ├── notification_service.dart     ← FCM
│   ├── biometric_service.dart        ← FaceID/지문
│   └── local_cache.dart              ← Hive
├── providers/                        ← Riverpod
│   ├── agent_provider.dart
│   ├── battle_provider.dart
│   ├── review_provider.dart          ← ★
│   ├── mission_provider.dart         ← ★
│   ├── auth_provider.dart
│   └── theme_provider.dart
└── models/
```

---

## Phase 7: 스마트 컨트랙트

```
contracts/contracts/
├── AgentNFT.sol            ← ERC-721, archetype/grade 메타데이터
├── PassportSBT.sol         ← ERC-5192, 트랙레코드 (배틀+복기 기록 포함)
├── CommitmentRegistry.sol  ← ERC-8004, 커밋-리빌 패턴
├── MarketplaceEscrow.sol   ← USDC/$COGOCHI 에스크로
├── COGOCHI.sol             ← ERC-20, burn: mint 50/200/1000, upgrade 100/500/2000
├── veGOCHI.sol             ← 스테이킹, 40% 수익분배, Stage3 유지 1000 veGOCHI
└── interfaces/
    ├── IERC8004.sol
    └── IERC5192.sol
```

---

## Memento-Kit 통합

### 에이전트 블루프린트 (agents/*.json)
```json
{
  "id": "crusher",
  "role": "Downtrend specialist with short bias. CVD divergence sensitive.",
  "reads": ["docs/zones.md", "packages/shared/src/constants/"],
  "writes": [".agent-context/decisions/", "apps/workers/"],
  "tools": ["data-fetch", "zone-detect", "backtest", "structure-detect"]
}
```

### 도구 계약 (tools/*.json)
```json
{
  "id": "setup-classify",
  "surface": "api",
  "input": { "candles": "Candle[]", "indicators": "object" },
  "output": { "setup": "FVG|OB|BOS|CHoCH|RANGE", "confidence": "number" },
  "sideEffects": []
}
```

### 오케스트레이터 → AutoResearch 태스크 큐
### 컨텍스트 관리 → 세션 스냅샷, 체크포인트, 히스토리 압축

---

## 빌드 순서

### Sprint 1 (Day 1-3): 프로젝트 초기화
1. 디렉토리 생성 + pnpm workspace + Turborepo
2. Memento-Kit 부트스트랩 (core + memory + orchestrator)
3. Git init + .gitignore + README + CLAUDE.md + AGENTS.md

### Sprint 2 (Day 4-7): 공유 패키지
4. packages/shared — 15개 모델 타입 + Zod 스키마
5. packages/shared — 상수 + ★프로세스 스코어링 + ★미션
6. packages/shared — 유틸리티 (분류기, 스코어링, 미션 트래커)
7. packages/db — Drizzle 스키마 18+ 테이블 (★reviews, journals, missions)
8. packages/db — 마이그레이션 + seed (500 시나리오)

### Sprint 3 (Day 8-14): 백엔드 Core API
9. Hono 앱 + 미들웨어
10. auth, agents, doctrines, data 라우트 (P0)
11. Tool 시스템 기반 클래스
12. ★futures 라우트 (펀딩비, OI, 청산, MTF, 마켓스트럭처)

### Sprint 4 (Day 15-21): 배틀 + 리뷰 시스템 (핵심!)
13. battles 라우트 (★캔들 프로그레시브 공개, 유저+AI 동시 판단)
14. ★reviews 라우트 (복기 프롬프트, AI 분석, 패턴 통계)
15. ★scoring 서비스 (규칙준수50 + 결과30 + 복기품질20)
16. ★missions 라우트 (일일 미션 CRUD)
17. ★reviewGate (복기 완료해야 다음 Battle 열림)
18. hooks (postBattle→Review, postReview→Unlock, tiltDetector)

### Sprint 5 (Day 22-28): Lab + AutoResearch + Memory
19. ★lab 라우트 (자동 백테스트, 버전 비교)
20. autoresearch 라우트 + BullMQ
21. backtest 라우트
22. memory 라우트 (pgvector RAG)
23. terminal 라우트 (★유사 과거 검색)
24. permissions (risk classifier, sandbox mode)

### Sprint 6 (Day 29-35): 마켓 + 온체인 + AutoResearch 워커
25. market 라우트 + blockchain 라우트
26. Python 워커 (data_prepare, evaluate, trading_agent)
27. autoresearch_runner + walk_forward
28. 스마트 컨트랙트 (AgentNFT, PassportSBT, CommitmentRegistry)
29. COGOCHI + veGOCHI + MarketplaceEscrow

### Sprint 7 (Day 36-49): SvelteKit 웹
30. 디자인 시스템 + 랜딩 + 온보딩
31. ★dashboard (일일 미션)
32. ★battle (캔들 프로그레시브) + ★review (복기 의무)
33. terminal (차트 + Zone + RAG)
34. ★lab (실험실)
35. agent HQ + doctrine 에디터
36. marketplace + mint + staking

### Sprint 8 (Day 50-63): Flutter 앱
37. 프로젝트 설정 + Riverpod + Dio
38. ★dashboard (미션 첫 화면)
39. ★battle (캔들 공개) + ★review (복기)
40. terminal (차트 + ★펀딩비/청산히트맵/MTF)
41. agents + lab
42. 에이전트 아바타 (4 Archetype, buddy 패턴)

### Sprint 9 (Day 64-70): 통합 + 테스트
43. E2E 테스트 (API → Web → Blockchain)
44. Flutter ↔ API 통합 테스트
45. AutoResearch 전체 파이프라인 테스트
46. ★Battle→Review→Unlock 플로우 E2E
47. Memento-Kit 검증 (ctx:check, eval:validate)
48. 문서 정리 + 배포 준비

---

## 검증 방법

```bash
# API
cd apps/api && pnpm test && pnpm test:e2e

# DB
cd packages/db && pnpm db:push && pnpm db:seed

# 스마트 컨트랙트
cd contracts && npx hardhat test

# AutoResearch
cd apps/workers && python -m pytest

# Memento-Kit
pnpm ctx:check && pnpm eval:validate && pnpm coord:check

# 전체 빌드
pnpm turbo build

# ★ 핵심 플로우 E2E
# Battle 생성 → 캔들 공개 → 판단 → 결과 → Review 생성 → 복기 제출 → 다음 Battle 언락
```

---

## 오늘 시작 (Sprint 1)

1. `/Users/ej/Projects/cogochi` 디렉토리 생성
2. pnpm workspace + turbo.json + tsconfig.base.json
3. Memento-Kit 부트스트랩 3개 레이어
4. Git init
5. packages/shared 타입 정의 시작
