# STOCKCLAW v3 Architecture Design

Created: 2026-02-22
Updated: 2026-02-23 (§6 미구현 모듈 설계 추가 — Agent 4 감사 기반)
Status: **DESIGN REVIEW** — 구현 시작 전 승인 필요
Doc index: `docs/README.md`

> **구현 게이트**: 이 문서 승인 전 코드 작업 금지.
> 승인 후 Shared → BE → FE 순서로만 진행.

---

## 1. Shared 설계 (계약/코어)

### 1.1 Agent 단일 소스 (Single Source of Truth)

```
engine/types.ts          ← AgentId, AgentDefinition (계약)
engine/agents.ts         ← AGENT_POOL: Record<AgentId, AgentDefinition> (8개)
engine/specs.ts          ← SPEC_REGISTRY: 32 Spec (8 Agent × 4 Tier)
         │
         ▼
data/agents.ts           ← AGDEFS: AgentDef[] (브릿지, AGENT_POOL에서 파생)
                            CHARACTER_ART, SOURCES (UI 전용, 그대로 유지)
```

**브릿지 규칙**:
- `AGDEFS`는 `getAllAgents()`에서 자동 생성, 수동 하드코딩 금지
- `AgentDef` interface는 호환 유지 (id, name, icon, color, dir, conf, abilities, finding, speech, img 등)
- 신규 필드(role, factors, specs)는 `AGENT_POOL` 직접 참조로만 접근
- guardian/commander/scanner → 자연 제거 (브릿지에서 매핑 없음)

**8 Agent 배치**:
```
OFFENSE (3): STRUCTURE, VPA, ICT       ← 방향 판단
DEFENSE (3): DERIV, VALUATION, FLOW    ← 리스크 감지
CONTEXT (2): SENTI, MACRO              ← 환경 분석
```

### 1.2 Phase 모델

```
Phase = 'DRAFT' | 'ANALYSIS' | 'HYPOTHESIS' | 'BATTLE' | 'RESULT'
```

이미 gameState.ts, phases.ts, gameLoop.ts에 반영 완료.

| Phase | Duration | 제어 | 설명 |
|-------|----------|------|------|
| DRAFT | 유저 제어 | Lobby → SquadConfig → startAnalysisFromDraft() | 3 Agent 선택 + Spec + 가중치 |
| ANALYSIS | 5s (÷speed) | 자동 진행 | Agent Pipeline 실행, 결과 표시 |
| HYPOTHESIS | 30s (÷speed) | 유저 제어 (타임아웃 시 auto-skip) | 방향 + TP/SL 설정 |
| BATTLE | 12s (÷speed) | 자동 진행 | 가격 시뮬레이션, TP/SL 판정 |
| RESULT | 유저 제어 | Play Again / Lobby | LP 보상, 통계 갱신 |

### 1.3 Progression 계약

**현재 문제 (3곳이 각자 계산)**:
```
walletStore.phase       → resolveLifecyclePhase(matches, lp) → 0~5 (숫자)
userProfileStore.tier   → calcTier(matches, winRate, pnl)     → bronze/silver/gold/diamond
agentData.level         → resolveAgentLevelFromMatches(count)  → 1~10
```

**v3 통합 설계**:
```
progressionStore (Single Source of Truth)
  ├─ lp: number
  ├─ totalMatches: number
  ├─ wins / losses: number
  ├─ streak: number
  ├─ agentMatchCounts: Record<string, number>
  │
  ├─ [derived] currentTier → getTierForLP(lp): Tier
  │   BRONZE  : 0-199 LP
  │   SILVER  : 200-599 LP
  │   GOLD    : 600-1199 LP
  │   DIAMOND : 1200-2199 LP (레벨 1/2/3)
  │   MASTER  : 2200+ LP
  │
  ├─ [derived] unlockedSpecs → getUnlockedSpecs(agentId, matchCount)
  │   base: 0판, a/b: 10판, c: 30판
  │
  └─ [action] recordMatchResult(won, lpDelta, agentIds[])
       → walletStore.recordMatch() 위임
       → agentData.recordAgentMatch() 위임
       → matchHistoryStore.addMatchRecord() 위임
```

**walletStore 변경**: `phase: number` → progressionStore의 `currentTier` 구독으로 대체
**userProfileStore 변경**: `calcTier()` 자체 로직 → progressionStore.currentTier 구독
**agentData 변경**: 이미 `resolveAgentLevelFromMatches()` 사용 중 (유지)

### 1.4 Price 계약

**현재 문제 (3곳 각각 가격 갱신)**:
```
Header.svelte      → subscribeMiniTicker(['BTCUSDT','ETHUSDT','SOLUSDT']) → gameState.prices 갱신 (350ms batch)
ChartPanel.svelte  → subscribeMiniTicker([sym])                           → livePrice 로컬변수 갱신
terminal/+page     → setInterval 1s/30s                                   → 기존 gameState.prices 읽어서 재배포
gameState.ts       → updatePrices() 랜덤 지터                              → 가짜 가격 변동
```

**v3 통합 설계**:
```
priceService.ts (단일 WS 연결)
  ├─ livePrice: Writable<PriceMap>
  │   type PriceMap = Record<string, PriceTick>
  │   type PriceTick = { price: number; ts: number; source: 'ws' | 'rest' }
  │
  ├─ startPriceStream(symbols: string[])
  │   → 단일 miniTicker WS 연결
  │   → 350ms 배치 → livePrice store 갱신
  │   → 재연결 로직 (exponential backoff)
  │
  └─ stopPriceStream()

소비자 (모두 livePrice 구독만):
  Header.svelte      → $livePrice.BTCUSDT?.price (자체 WS 제거)
  ChartPanel.svelte  → $livePrice[sym]?.price    (miniTicker 제거, klines WS는 차트 전용 유지)
  terminal/+page     → $livePrice                (interval 제거)
  gameState.ts       → updatePrices() 제거 또는 livePrice → gameState.prices 자동 동기화
```

### 1.5 DraftSelection 계약

```typescript
// types.ts에 이미 정의:
interface DraftSelection {
  agentId: AgentId;
  specId: string;
  weight: number;  // 10~80, 3개 합 = 100
}

// 추가할 검증 헬퍼 (engine/draft.ts):
function validateDraft(selections: DraftSelection[]): ValidationResult {
  // 1. selections.length === DRAFT_AGENT_COUNT (3)
  // 2. 중복 agentId 없음
  // 3. 각 weight >= DRAFT_MIN_WEIGHT (10) && <= DRAFT_MAX_WEIGHT (80)
  // 4. weight 합 === DRAFT_TOTAL_WEIGHT (100)
  // 5. 각 specId가 해당 agent의 해금된 spec에 포함
  return { valid, errors[] }
}
```

---

## 2. BE 설계 (Backend)

### 2.1 Arena Match API

```
POST   /api/arena/match/create          → { matchId }
POST   /api/arena/match/[id]/draft      → { draftId, agents[] }
POST   /api/arena/match/[id]/analyze    → { outputs: AgentOutput[] }
POST   /api/arena/match/[id]/hypothesis → { hypothesisId }
GET    /api/arena/match/[id]/result     → { result: MatchResult, lpDelta }
```

**요청/응답 상세**:

| Endpoint | Request Body | Response | DB 테이블 |
|----------|-------------|----------|----------|
| create | `{ pair, timeframe }` | `{ matchId, phase: 'DRAFT' }` | arena_matches INSERT |
| draft | `{ selections: DraftSelection[] }` | `{ draftId, validated: true }` | arena_drafts INSERT |
| analyze | `{}` (서버가 draft 기반 실행) | `{ outputs: AgentOutput[] }` | agent_analysis_results INSERT |
| hypothesis | `{ prediction: MatchPrediction }` | `{ hypothesisId }` | arena_matches UPDATE |
| result | — | `{ result, lpDelta, agentBreakdown }` | arena_matches UPDATE, user_lp_transactions INSERT |

**하위호환**: 기존 `/api/matches` → 내부에서 `/api/arena/match` 호출하는 어댑터

### 2.2 분석 파이프라인

```
analyze API 호출 시 서버 내부 플로우:

1. Draft 로드 (arena_drafts)
     ↓
2. Market Data 수집
   ├─ fetchKlines(pair, tf, 240)
   ├─ fetchCurrentOI/Funding/LSRatio
   └─ indicator_series 테이블 (캐시)
     ↓
3. indicators.ts — 순수 함수
   ├─ calcRSI(), calcSMA(), calcEMA(), calcATR()
   ├─ calcOBV(), calcMACD(), calcCVD()
   └─ calcBollingerBands()
     ↓
4. trend.ts — 추세 분석
   ├─ analyzeTrend(values[]) → TrendAnalysis
   ├─ detectDivergence(prices[], indicator[])
   └─ analyzeMultiTF(tf1h[], tf4h[], tf1d[])
     ↓
5. agentPipeline.ts — 에이전트 실행
   ├─ for each agent in draft:
   │   ├─ agents/{id}.ts → computeFactors(marketData) → ScoringFactor[]
   │   ├─ spec의 factorWeights로 가중합산 → direction + confidence
   │   ├─ memory.ts → retrieveMemories() (RAG, 선택적)
   │   └─ → AgentOutput
   │
   └─ computeFinalPrediction(outputs[], weights[]) → MatchPrediction
     ↓
6. exitOptimizer.ts — SL/TP 계산
   ├─ conservative / balanced / aggressive
   └─ R:R, EV, kellySize
     ↓
7. agent_analysis_results INSERT → 응답 반환
```

### 2.3 DB 스키마 (004_agent_engine_v3.sql 기반)

```
arena_matches           ← 매치 메타 (pair, tf, phase, userA/B, prices)
arena_drafts            ← 드래프트 (matchId, userId, selections jsonb)
agent_analysis_results  ← 에이전트 출력 (matchId, agentId, specId, direction, confidence, factors)
user_lp_transactions    ← LP 변동 기록
user_agent_progress     ← 에이전트별 매치 수, Spec 해금 상태
agent_accuracy_stats    ← 에이전트 정확도 통계
match_memories          ← RAG 기억 (embedding vector)
indicator_series        ← 시계열 지표 캐시
live_sessions           ← 라이브 세션
challenges              ← 챌린지 기록
badges                  ← 배지 달성
```

### 2.4 외부 데이터 수집 경로

```
기존 (유지):
  binance.ts    → klines, miniTicker, 24hr
  coinalyze.ts  → OI, FR, Liq, LS Ratio

신규:
  binanceFutures.ts  → OI/FR/Liq/LS (coinalyze 대안)
  yahooFinance.ts    → DXY, S&P500, US10Y
  cryptoquant.ts     → MVRV, NUPL, Exchange Flows
  newsRss.ts         → CoinDesk, CoinTelegraph

프록시 라우트:
  /api/feargreed       → alternative.me F&G API
  /api/coingecko/global → CoinGecko global stats
  /api/yahoo/[symbol]   → Yahoo Finance quote

스냅샷 수집:
  /api/market/snapshot → cron 호출, indicator_series UPSERT
  캐시 TTL: constants.ts SNAPSHOT_INTERVALS 기준 (30s ~ 1h)
```

---

## 3. FE 설계 (Frontend)

### 3.1 화면별 상태 머신 (Arena)

```
┌─────────┐
│  LOBBY  │ ← state.inLobby === true
│         │   8 Agent 선택, Spec 선택, 가중치 배분
└────┬────┘
     │ onSquadDeploy → startAnalysisFromDraft()
     ▼
┌─────────┐
│  DRAFT  │ ← state.phase === 'DRAFT' && !state.inLobby
│         │   SquadConfig (risk/timeframe → v3: DraftSelection[])
└────┬────┘
     │ advancePhase() (gameLoop)
     ▼
┌─────────┐
│ ANALYSIS│ ← state.phase === 'ANALYSIS' (5s ÷ speed)
│         │   에이전트 스캔 애니메이션 + 결과 표시
│         │   initScout() → initGather() → initCouncil()
└────┬────┘
     │ advancePhase() (타이머 만료)
     ▼
┌──────────┐
│HYPOTHESIS│ ← state.phase === 'HYPOTHESIS' (30s ÷ speed)
│          │   HypothesisPanel: 방향/TP/SL 입력
│          │   타임아웃 시 NEUTRAL auto-skip
└────┬─────┘
     │ onHypothesisSubmit() → advancePhase()
     ▼
┌─────────┐
│ BATTLE  │ ← state.phase === 'BATTLE' (12s ÷ speed)
│         │   가격 시뮬레이션, TP/SL 판정
│         │   initBattle() → battleInterval
└────┬────┘
     │ advancePhase() (TP/SL hit or timeout)
     ▼
┌─────────┐
│ RESULT  │ ← state.phase === 'RESULT'
│         │   initResult() → 5개 스토어 갱신
│         │   Play Again / Back to Lobby
└─────────┘
```

### 3.2 데이터 소비 규칙

**원칙**: FE 컴포넌트는 API를 직접 호출하지 않고, Store만 소비한다.

| 컴포넌트 | 읽는 Store | 쓰는 Store | 호출 API |
|---------|-----------|-----------|---------|
| **Header** | gameState (prices, phase), walletStore | — | — |
| **Lobby** | AGDEFS (→AGENT_POOL 브릿지), progressionStore (unlockedSpecs) | gameState (selectedAgents) | — |
| **SquadConfig** | gameState (squadConfig) | gameState (squadConfig) | — |
| **Arena +page** | gameState (전체), AGDEFS | gameState, walletStore, agentData, matchHistoryStore, pnlStore | — |
| **ChartPanel** | gameState (pair, timeframe), livePrice | — | binance (klines WS only) |
| **BattleStage** | gameState (phase, selectedAgents), AGDEFS | — | — |
| **HypothesisPanel** | gameState (prices, hypothesis) | — | — |
| **BottomBar** | gameState (phase, running), AGDEFS | — | — |
| **WarRoom** | gameState (pair, timeframe) | — | warroomScan (→binance+coinalyze) |
| **Oracle** | AGENT_POOL (직접), agentStats, matchHistoryStore | — | — |
| **Passport** | AGDEFS, walletStore, userProfileStore | — | — |
| **Terminal** | gameState, livePrice | quickTradeStore, trackedSignalStore | — |

### 3.3 FE 스토어 의존 그래프

```
progressionStore (NEW, Single Source of Truth)
  ├── derives: currentTier, unlockedSpecs
  ├── writes to: walletStore.recordMatch()
  ├── writes to: agentData.recordAgentMatch()
  └── writes to: matchHistoryStore.addMatchRecord()

priceService.livePrice (NEW, Single WS)
  ├── consumed by: Header.svelte
  ├── consumed by: ChartPanel.svelte
  ├── consumed by: terminal/+page.svelte
  └── syncs to: gameState.prices (선택적)

gameState (기존)
  ├── phase, running, timer → gameLoop 제어
  ├── selectedAgents, hypothesis, pos → 매치 데이터
  ├── prices → livePrice에서 동기화
  └── lp, wins, losses, streak → progressionStore로 위임 예정

walletStore (기존, 축소)
  ├── tier, connected, address → 지갑/인증
  ├── matchesPlayed, totalLP → progressionStore에서 동기화
  └── phase → progressionStore.currentTier로 대체

userProfileStore (기존, 축소)
  ├── displayName, badges → 프로필 UI
  └── tier/stats → progressionStore에서 파생

agentData (기존)
  ├── per-agent stats (level, xp, wins, losses, matches)
  └── recordAgentMatch() + recalcFromMatches()
```

### 3.4 v3 Draft UI 화면 설계

```
┌──────────────────────────────────────────────────────┐
│  DRAFT YOUR SQUAD                        [Back]      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ── OFFENSE ──────────────────────────               │
│  [STRUCTURE ⚡]  [VPA 📈]  [ICT 🎯]                │
│    ✓ selected     locked     locked                  │
│                                                      │
│  ── DEFENSE ──────────────────────────               │
│  [DERIV 📊]  [VALUATION 💎]  [FLOW 💰]             │
│    ✓ selected    locked       ✓ selected             │
│                                                      │
│  ── CONTEXT ──────────────────────────               │
│  [SENTI 💜]  [MACRO 🌍]                             │
│                                                      │
├──────────────────────────────────────────────────────┤
│  SELECTED (3/3)                                      │
│                                                      │
│  STRUCTURE ⚡ ──[===|====]── 40%   Spec: Base ▼     │
│  DERIV 📊     ──[==|====]──  30%   Spec: Base ▼     │
│  FLOW 💰     ──[==|====]──  30%   Spec: Base ▼     │
│                              ─────                   │
│                         Total: 100%                  │
│                                                      │
│  [ ⚡ DEPLOY SQUAD ]                                 │
└──────────────────────────────────────────────────────┘
```

---

## 4. 인터랙션 플로우 (Action → Call → State → UI)

> 유저가 뭘 누르면 → 어디서 뭐가 호출되고 → 뭐가 바뀌고 → 화면이 어떻게 변하는지

### 4.1 매치 시작: Lobby → Draft → Analysis

```
[유저 액션] Lobby에서 3 Agent 선택 + "START" 클릭
  │
  ├─ Lobby.svelte
  │   dispatch('start', { selectedAgents: ['structure','deriv','flow'] })
  │
  ├─ arena/+page.svelte
  │   gameState.update(s => ({ ...s, selectedAgents, inLobby: false }))
  │   → 화면: Lobby 사라짐, SquadConfig 표시
  │
[유저 액션] SquadConfig에서 가중치/Spec 설정 + "DEPLOY" 클릭
  │
  ├─ SquadConfig.svelte
  │   dispatch('deploy', { config: SquadConfig })
  │
  ├─ arena/+page.svelte → onSquadDeploy()
  │   ├─ gameState.update(s => ({ ...s, squadConfig: config }))
  │   ├─ clearFeed()
  │   ├─ pushFeedItem({ text: 'Squad configured...' })
  │   └─ startAnalysisFromDraft()
  │       └─ gameLoop.ts → advancePhase()
  │           gameState: phase 'DRAFT' → 'ANALYSIS', timer = 5/speed
  │
  ├─ 화면 변화:
  │   SquadConfig 사라짐 → battle-layout 표시
  │   ChartPanel + BattleStage 렌더링 시작
  │   BottomBar phase badge: ANALYSIS (주황)
  │   phaseInit callback 발동 → initAnalysis()
  │
  ├─ initAnalysis() 내부:
  │   ├─ initScout(): 에이전트들이 데이터소스로 이동 애니메이션
  │   │   각 에이전트: walk → charge → energy 75 → addFeed(finding) → return
  │   ├─ initGather(): 에이전트들이 vote 자세
  │   └─ initCouncil(): 에이전트 vote 표시, addFeed(vote direction)
  │
  └─ ANALYSIS 타이머 만료 → gameLoop.advancePhase()
     gameState: phase 'ANALYSIS' → 'HYPOTHESIS', timer = 30/speed
```

### 4.2 Hypothesis 제출

```
[유저 액션] HypothesisPanel에서 LONG/SHORT 선택 + TP/SL 설정 + "SUBMIT"
  │
  ├─ HypothesisPanel.svelte
  │   dispatch('submit', { dir: 'LONG', entry, tp, sl, rr, conf, tf, vmode, closeN })
  │
  ├─ arena/+page.svelte → onHypothesisSubmit(e)
  │   ├─ hypothesisInterval 정지 (clearInterval)
  │   ├─ hypothesisVisible = false
  │   ├─ gameState.update(s => ({
  │   │     hypothesis: { dir, conf, entry, tp, sl, rr, ... },
  │   │     pos: { entry, tp, sl, dir, rr, size, lev }
  │   │   }))
  │   ├─ showChartPosition = true (차트에 TP/SL 라인 표시)
  │   ├─ addFeed('LONG · TP $xxx · SL $xxx')
  │   ├─ sfx.vote()
  │   └─ advancePhase()
  │       gameState: phase 'HYPOTHESIS' → 'BATTLE', timer = 12/speed
  │
  ├─ 화면 변화:
  │   HypothesisPanel 사라짐
  │   ChartPanel에 entry/tp/sl 수평선 표시
  │   BottomBar phase badge: BATTLE (빨강)
  │   BattleStage: 에이전트들 alert 자세
  │
  └─ 타임아웃 시 (hypothesisTimer <= 0):
     NEUTRAL auto-skip → advancePhase() 동일 플로우

[대안] 유저가 아무것도 안 하고 타임아웃
  │
  └─ hypothesisInterval → hypothesisTimer-- → 0 도달
     ├─ hypothesis: { dir: 'NEUTRAL', conf: 1, ... }
     ├─ pos: 기본값 (현재가 기준 +2%/-1.5%)
     └─ advancePhase() → BATTLE 진입
```

### 4.3 Battle → Result (매치 종료)

```
[자동] BATTLE phase 진입 → initBattle()
  │
  ├─ battleInterval 시작 (500ms마다)
  │   매 tick:
  │   ├─ 가격 = BTC * (1 + random jitter)
  │   ├─ TP hit 체크: LONG이면 price >= tp
  │   ├─ SL hit 체크: LONG이면 price <= sl
  │   └─ 8초 초과 시 time_win/time_loss
  │
  ├─ TP/SL/timeout 도달:
  │   ├─ battleResult = 'tp' | 'sl' | 'time_win' | 'time_loss'
  │   ├─ clearInterval(battleInterval)
  │   └─ advancePhase() → RESULT
  │
[자동] RESULT phase → initResult()
  │
  ├─ 1. 승패 판정
  │   battleResult 'tp' → win=true
  │   battleResult 'sl' → win=false
  │   battleResult 'time_win' → win=true
  │   battleResult 'time_loss' → win=false
  │
  ├─ 2. LP 계산
  │   consensus = determineConsensus(userDir, agentDirs[], false)
  │   lpChange = calculateLP(win, streak, consensus.lpMult)
  │
  ├─ 3. 스토어 갱신 (5개 동시)
  │   ├─ gameState:  matchN+1, wins/losses+1, streak, lp+lpChange
  │   ├─ walletStore: recordWalletMatch(win, lpChange)
  │   │   → matchesPlayed+1, totalLP+lpChange
  │   │   → phase = resolveLifecyclePhase(matches, lp)
  │   ├─ agentData:  recordAgentMatch(agentId, { matchN, dir, conf, win, lp })
  │   │   → wins/losses+1, curStreak, matches.push()
  │   │   → recalcFromMatches() → level/xp 재계산
  │   ├─ matchHistoryStore: addMatchRecord({ matchN, win, lp, agents, agentVotes, hypothesis, ... })
  │   └─ pnlStore:   addPnLEntry('arena', matchId, lpChange, description)
  │
  ├─ 4. UI 갱신
  │   ├─ resultData = { win, lp, tag, motto }
  │   ├─ resultVisible = true → 결과 오버레이 표시
  │   ├─ win: sfx.win() + dogeFloat() + 에이전트 jump 자세
  │   │  lose: sfx.lose() + 에이전트 sad 자세
  │   ├─ addFeed('WIN! +XX LP' 또는 'LOSE -XX LP')
  │   ├─ 1.5초 후: pvpVisible = true (PVP 비교 패널)
  │   └─ gameState: running = false, timer = 0
  │
  └─ 화면 변화:
     ChartPanel: TP/SL 라인 유지
     결과 오버레이: WIN/LOSE + LP 변동 + 모토
     BottomBar: RESULT phase (녹색)
     [Play Again] → playAgain() → 새 매치 시작
     [Back to Lobby] → goLobby() → inLobby=true
```

### 4.4 Play Again / Back to Lobby

```
[유저 액션] "Play Again" 클릭
  │
  ├─ arena/+page.svelte → playAgain()
  │   ├─ 모든 UI 상태 초기화 (pvp, result, verdict, hypothesis, compare, preview)
  │   ├─ floatDir = null, showChartPosition = false
  │   ├─ findings = []
  │   ├─ resetPhaseInit()
  │   └─ engineStartMatch()
  │       gameState: { running: true, phase: 'DRAFT', timer: 0 }
  │       → SquadConfig 표시 (같은 에이전트로 다시)
  │
[유저 액션] "Back to Lobby" 클릭
  │
  ├─ arena/+page.svelte → goLobby()
  │   ├─ 모든 UI 상태 초기화
  │   ├─ hypothesisInterval 정지
  │   └─ gameState: { inLobby: true, running: false, phase: 'DRAFT', timer: 0 }
  │       → Lobby 표시 (에이전트 재선택 가능)
```

### 4.5 WarRoom 스캔

```
[유저 액션] WarRoom에서 "SCAN" 버튼 클릭
  │
  ├─ WarRoom.svelte
  │   scanRunning = true, scanStep = 'fetching...'
  │
  ├─ runWarRoomScan(pair, timeframe) 호출 (warroomScan.ts)
  │   ├─ fetchKlines(symbol, tf, 240)   ← Binance REST
  │   ├─ fetch24hr(symbol)              ← Binance REST
  │   ├─ fetchCurrentOI(pair)           ← Coinalyze REST
  │   ├─ fetchCurrentFunding(pair)      ← Coinalyze REST
  │   ├─ fetchPredictedFunding(pair)    ← Coinalyze REST
  │   ├─ fetchLSRatioHistory(pair)      ← Coinalyze REST
  │   └─ fetchLiquidationHistory(pair)  ← Coinalyze REST
  │
  ├─ 스코어링 (5 에이전트)
  │   structureScore → SMA 20/60/120 + RSI + change24
  │   flowScore      → change24 + volumeRatio + quoteVolume
  │   derivScore     → funding + predFunding + lsRatio + liqBias
  │   sentiScore     → change24 proxy + RSI + funding
  │   macroScore     → SMA120 + change24 + funding crosscheck
  │
  ├─ 결과 반환: WarRoomScanResult
  │   { signals: AgentSignal[], consensus, avgConfidence, summary, highlights }
  │
  ├─ WarRoom.svelte
  │   scanTabs.push(newTab), activeScanId = newTab.id
  │   scanRunning = false
  │   dispatch('scancomplete', { consensus, summary, ... })
  │
  └─ 화면 변화:
     새 스캔 탭 활성화
     5 에이전트 시그널 카드 표시 (vote/conf/entry/tp/sl)
     상단 요약: Consensus LONG/SHORT · Avg CONF XX%
```

### 4.6 탭 전환 (Arena ↔ Terminal ↔ Passport)

```
[유저 액션] 하단 네비게이션에서 탭 클릭
  │
  ├─ +layout.svelte 또는 해당 네비 컴포넌트
  │   goto('/arena') 또는 goto('/terminal') 또는 goto('/passport')
  │
  ├─ SvelteKit 라우팅 → 해당 +page.svelte 마운트
  │
  ├─ 상태 유지:
  │   gameState는 전역 writable → 탭 전환해도 유지
  │   매치 진행 중(running=true)이면 gameLoop 계속 동작
  │   Arena 복귀 시 현재 phase에 맞는 UI 복원
  │
  └─ 주의:
     Header WS는 +layout에서 관리 → 항상 동작
     ChartPanel WS는 Arena 내부 → Arena 벗어나면 정지
     WarRoom WS는 Terminal 내부 → Terminal 벗어나면 정지
```

### 4.7 Oracle 에이전트 상세 보기

```
[유저 액션] Oracle 테이블에서 에이전트 행 클릭
  │
  ├─ oracle/+page.svelte → selectAgent(ag)
  │   selectedAgent = ag (OracleRow 타입)
  │
  ├─ 화면 변화:
  │   우측 사이드바 슬라이드인 (agent-detail-overlay)
  │   ├─ 에이전트 정보: name, icon, color, Wilson%, accuracy%
  │   ├─ Recent Votes: 최근 8개 매치의 dir/conf/win
  │   ├─ Abilities: analysis/accuracy/speed/instinct 바 차트
  │   ├─ Finding: Signal Model 설명
  │   ├─ Specialties: factor 태그
  │   └─ [DEPLOY TO ARENA] 버튼
  │
[유저 액션] "DEPLOY TO ARENA" 클릭
  │
  └─ triggerArena() → goto('/arena')
```

---

## 5. 구현 게이트

### Gate 1: 설계 승인
- [ ] 이 문서의 Shared/BE/FE 설계를 유저가 승인
- [ ] 승인 전 코드 작업 금지

### Gate 2: Shared 계약 확정 후 BE/FE 시작
- [ ] S-01 (Agent 브릿지) 완료 → F-01 시작 가능
- [ ] S-02 (Progression 계약) 완료 → F-02 시작 가능
- [ ] S-03 (Price 계약) 완료 → B-05, F-03 시작 가능
- [ ] S-04 (Draft 계약) 완료 → B-01, F-04/F-05 시작 가능

### Gate 3: BE 완료 후 FE 연동
- [ ] B-02 (Indicators) 완료 → F-07 시작 가능
- [ ] B-03 (Pipeline) 완료 → F-06 시작 가능
- [ ] B-05 (Price Service) 완료 → F-03 시작 가능

### 매 티켓 검증
```bash
node node_modules/.bin/vite build     # 0 errors
node node_modules/.bin/svelte-check   # 0 errors
```

---

## 파일 변경 총정리

### Shared 신규/수정
| 파일 | 작업 | 티켓 |
|------|------|------|
| `data/agents.ts` | 재작성 (AGENT_POOL 파생) | S-01 |
| `engine/draft.ts` | 신규 (validateDraft) | S-04 |
| `stores/progressionRules.ts` | 수정 (TIER_TABLE 정렬) | S-02 |

### BE 신규
| 파일 | 티켓 |
|------|------|
| `engine/indicators.ts` | B-02 |
| `engine/trend.ts` | B-02 |
| `services/scanService.ts` | B-02 |
| `services/priceService.ts` | B-05 |
| `engine/agentPipeline.ts` | B-03 |
| `engine/agents/structure.ts` ~ `macro.ts` (8개) | B-03 |
| `engine/exitOptimizer.ts` | B-04 |
| `engine/memory.ts` | B-07 |
| `routes/api/arena/match/**` (5 라우트) | B-01 |
| `routes/api/market/snapshot/+server.ts` | B-05 |
| `api/binanceFutures.ts`, `yahooFinance.ts`, `cryptoquant.ts` | B-05 |

### FE 수정
| 파일 | 변경 | 티켓 |
|------|------|------|
| `stores/progressionStore.ts` | 신규 | F-02 |
| `stores/walletStore.ts` | phase → tier 위임 | F-02 |
| `stores/userProfileStore.ts` | tier → progressionStore | F-02 |
| `stores/agentData.ts` | createDefaultStats 8 Agent | F-01 |
| `components/arena/Lobby.svelte` | 재작성 (3픽/가중치/Spec) | F-04 |
| `components/arena/SquadConfig.svelte` | 재작성 (DraftSelection) | F-05 |
| `components/layout/Header.svelte` | WS 제거 → livePrice | F-03 |
| `components/arena/ChartPanel.svelte` | miniTicker 제거 | F-03 |
| `routes/terminal/+page.svelte` | interval 제거 | F-03 |
| `routes/arena/+page.svelte` | Phase UI + Draft flow | F-06 |
| `components/terminal/WarRoom.svelte` | 렌더링 전용 축소 | F-07 |

---

## 6. 미구현 모듈 설계 (Agent 4 감사 기반, 2026-02-23)

> Phase 4 마무리 후 도출된 미구현/미완성 모듈에 대한 설계 방향 문서.
> 구현 핸드오프: Agent 1(BE) 또는 Agent 2(FE)에 전달.

### 6.1 S-03 재검토 — Price 계약 현황

**결론: S-03 계약 자체는 ✅ 완료. F-03 (FE 적용)은 ⬜ 미시작.**

현재 구조:
```
priceStore.ts          ← livePrice: Record<symbol, PriceTick> (Single Source)
  └─ updatePrice(), updatePrices(), updatePriceFull()

livePriceSyncService.ts ← 가격 → quickTradeStore/trackedSignalStore 분배
  └─ ensureLivePriceSyncStarted() / stopLivePriceSync()

binance.ts (client)    ← subscribeMiniTicker() → WS 실시간 → priceStore 갱신
+layout.svelte         ← onMount: fetchPrices() + subscribeMiniTicker() 부트스트랩
```

**priceService.ts 미존재 사유**: 현재 `priceStore.ts`가 계약 역할을 겸하고 있음.
별도 `priceService.ts` 신설은 F-03 작업에서 Header/Chart/Terminal의 중복 WS를 통합할 때 수행.

**F-03 스코프**:
1. Header.svelte: 자체 `subscribeMiniTicker()` 제거 → `$livePrice` 구독
2. ChartPanel.svelte: miniTicker 제거 (klines WS는 차트 전용 유지)
3. terminal/+page.svelte: `setInterval` 기반 가격 갱신 제거
4. gameState.ts: `updatePrices()` 랜덤 지터 제거 또는 `livePrice` 동기화

---

### 6.2 B-06 — Progression 서버 반영 설계

**현황**: `resolveMatch()` 가 LP delta를 계산하지만 DB에 반영하지 않음.

**필요 함수**: `persistProgression(userId, matchResult, draftedAgents)`

```
/api/arena/resolve (POST)
  │
  ├─ arenaService.resolveMatch(matchId, exitPrice)
  │   → MatchResult { winnerId, resultType, lpDelta, fbs, agentBreakdown }
  │
  └─ persistProgression(userId, matchResult, draftedAgents)  ← 신규
      │
      ├─ 1. INSERT lp_transactions
      │   (match_id, user_id, amount, reason, balance_after)
      │
      ├─ 2. UPDATE user_passports
      │   SET lp_total = lp_total + amount,
      │       tier = getTierForLP(new_lp),
      │       win_count += (won ? 1 : 0),
      │       loss_count += (won ? 0 : 1),
      │       current_streak = ...,
      │       updated_at = now()
      │
      ├─ 3. UPDATE user_agent_progress (×3, 드래프트된 에이전트별)
      │   SET total_matches += 1,
      │       wins += (won ? 1 : 0),
      │       losses += (won ? 0 : 1),
      │       unlocked_specs = CASE
      │         WHEN total_matches >= 30 THEN '{base,a,b,c}'
      │         WHEN total_matches >= 10 THEN '{base,a,b}'
      │         ELSE unlocked_specs
      │       END,
      │       updated_at = now()
      │
      └─ 4. 응답에 progression 포함
          { matchResult, progression: { lpTotal, tier, newUnlocks[] } }
```

**트랜잭션**: 1~3을 단일 PostgreSQL 트랜잭션으로 실행.
**파일**: `src/lib/server/arenaService.ts` 확장 또는 `src/lib/server/progressionService.ts` 신설.
**의존**: B-01 ✅, B-03 ✅

---

### 6.3 B-07 — RAG Memory 설계

**현황**: DB 스키마 ✅ (pgvector, match_memories, search_memories 함수). 구현 코드 ⬜.

**아키텍처**:
```
src/lib/server/memory.ts (신규)
  │
  ├─ storeMemory(params: StoreMemoryInput): Promise<string>
  │   1. 임베딩 생성 (수치 정규화 256d)
  │   2. INSERT match_memories (factors, thesis, direction, confidence, embedding)
  │   3. return memoryId
  │
  ├─ retrieveMemories(params: RetrieveInput): Promise<MatchMemory[]>
  │   1. 현재 market_state → 임베딩 생성
  │   2. search_memories(embedding, userId, agentId, top_k=5)
  │   3. is_active=true 필터 + 유사도 순 반환
  │
  └─ augmentAgentContext(memories: MatchMemory[]): string
      1. top-k 기억을 자연어 요약
      2. "비슷한 시장 상황 N건 중 M건 방향 일치"
      3. agentPipeline system prompt에 주입
```

**임베딩 전략**: 수치 정규화 (Option A — 외부 API 불필요)
```typescript
function generateEmbedding(factors: ScoringFactor[], regime: string, direction: string): number[] {
  // 48 factors → 48 normalized scores (0-1)
  // + regime one-hot (4d): trending_up/trending_down/ranging/volatile
  // + direction one-hot (3d): LONG/SHORT/NEUTRAL
  // + padding → 256d total
  // L2 normalize
}
```

**agentPipeline 통합 지점**:
```
분석 시 (analyze):
  1. retrieveMemories(currentMarketState, agentId) → top-5 과거 기억
  2. augmentAgentContext(memories) → system prompt 추가
  3. agentPipeline 실행 (기억 반영된 컨텍스트로)

결과 저장 시 (resolve):
  1. matchResult 확정 후
  2. storeMemory(factors, thesis, direction, confidence, outcome, priceChange)
  3. LLM으로 lesson 생성 (선택적)
```

**파일**: `src/lib/server/memory.ts` 신설
**의존**: B-03 ✅, pgvector ✅

---

### 6.4 Phase 5 — 경쟁모드 아키텍처 (B-12/B-13/B-14)

#### 6.4.1 PvP Matching Pool (B-12)

**현황**: DB 테이블 `pvp_matching_pool` 존재. BE 로직 ⬜.

```
src/lib/server/pvpPoolService.ts (신규)
  │
  ├─ createPool(userId, pair, timeframe): Promise<PvpPool>
  │   INSERT pvp_matching_pool (creator_user_id, pair, timeframe, status='WAITING')
  │   expires_at = now() + 4h
  │   creator_tier/elo = user_passports에서 조회
  │
  ├─ listAvailable(pair?, limit?): Promise<PvpPool[]>
  │   WHERE status='WAITING' AND expires_at > now()
  │   ORDER BY created_at DESC
  │
  ├─ acceptPool(poolId, userId): Promise<AcceptResult>
  │   트랜잭션:
  │   1. UPDATE pool SET status='MATCHED', matched_user_id
  │   2. arenaService.createMatch(pair, tf, mode='PVP', pvpPoolId)
  │   3. return { poolId, matchId, opponent }
  │
  └─ expireStalePoolsJob(): Promise<number>
      UPDATE SET status='EXPIRED' WHERE expires_at < now() AND status='WAITING'
      → cron 또는 periodic 호출 (5분마다)
```

**API 라우트**:
```
POST /api/pvp/pool/create     → createPool()
GET  /api/pvp/pool/available  → listAvailable()
POST /api/pvp/pool/:id/accept → acceptPool()
```

#### 6.4.2 Tournament Ban/Pick (B-13 완성)

**현황**: active/register/bracket ✅. ban/draft ⬜.

```
tournamentService.ts 확장:
  │
  ├─ submitBan(tournamentId, matchId, userId, bannedAgentId): Promise<BanResult>
  │   1. 매치 상태 검증 (phase='BAN', 해당 유저 차례)
  │   2. tournament_brackets UPDATE: ban_a 또는 ban_b SET
  │   3. 양쪽 다 ban 제출 → phase='PICK' 전이
  │   4. return { myBan, opponentBan, pickStartsAt }
  │
  └─ submitTournamentDraft(tournamentId, matchId, userId, draft): Promise<DraftResult>
      1. draft 검증 (3개, weight 합 100, ban된 에이전트 미포함)
      2. arenaService.submitDraft(matchId, userId, draft)
      3. 양쪽 다 draft 제출 → phase='ANALYSIS' 전이
      4. return { matchId, phase: 'ANALYSIS', acceptedDraft }
```

**API 라우트**:
```
POST /api/tournaments/:id/ban   → submitBan()
POST /api/tournaments/:id/draft → submitTournamentDraft()
```

**Ban/Pick 타이밍**:
- Ban 위상: 20초 (양쪽 동시)
- Pick 위상: 40초 (양쪽 동시)
- 타임아웃 시 랜덤 선택

#### 6.4.3 Settlement Engine (B-14)

**현황**: scoring.ts에 PvE LP 계산만 존재. 모드별 정산 ⬜.

```
src/lib/server/settlementEngine.ts (신규)
  │
  ├─ settleMatch(matchId, matchResult): Promise<SettlementResult>
  │   mode 분기:
  │   ├─ PVE:  lpDelta = LP_REWARDS[resultType]
  │   ├─ PVP:  lpDelta = PVP_LP_REWARDS[resultType] + eloDelta 계산
  │   └─ TOURNAMENT: lpDelta = tournamentRankReward(rank)
  │
  ├─ calculateElo(myElo, oppElo, won): { newElo, eloDelta }
  │   K = matchesPlayed < 100 ? 32 : 16
  │   E = 1 / (1 + 10^((oppElo - myElo) / 400))
  │   delta = round(K * ((won ? 1 : 0) - E))
  │   return { newElo: myElo + delta, eloDelta: delta }
  │
  ├─ persistSettlement(userId, settlement): Promise<void>
  │   트랜잭션:
  │   1. INSERT lp_transactions (amount, reason, balance_after)
  │   2. UPDATE user_passports (lp_total, tier, elo_rating)
  │   3. UPDATE arena_matches (fbs_score, elo_delta)
  │   4. persistProgression() 호출 (B-06)
  │
  └─ settleTournament(tournamentId): Promise<TournamentSettlement>
      1. 최종 순위 산출 (bracket 기반)
      2. 순위별 LP 보상 분배
      3. tournament_results INSERT
      4. 각 참가자 lp_transactions INSERT
```

**LP 보상 테이블 (모드별)**:
```
PVE:        win +11, clutch +18, loss -8, draw +2
PVP:        win +25, loss -10, draw +5
Tournament: 1등 +100, 2등 +50, 3-4등 +25, 5-8등 -10
```

**ELO 초기값**: 1200
**ELO K-factor**: 32 (매치 <100), 16 (매치 ≥100)

---

### 6.5 구현 우선순위 및 핸드오프

```
즉시 (B-06 — Agent 1 BE):
  arenaService.ts에 persistProgression() 추가
  /api/arena/resolve에서 호출

다음 (B-14 → B-12 → B-13):
  settlementEngine.ts 신설 (PVE settlement 먼저)
  pvpPoolService.ts 신설 + API 라우트 3개
  tournamentService.ts ban/draft 확장

마지막 (B-07):
  memory.ts 신설 (수치 임베딩 우선)
  agentPipeline 통합

FE (F-03 → F-14 → F-15):
  priceService 통합 (Header/Chart/Terminal WS 단일화)
  PvP Pool UI 컴포넌트
  Tournament Ban/Pick UI
```
