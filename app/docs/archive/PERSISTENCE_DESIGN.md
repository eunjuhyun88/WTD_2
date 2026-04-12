# STOCKCLAW v3 Persistence Design

작성일: 2026-02-22
수정일: 2026-02-23 (Arena v3 PvP/Tournament 영속성 반영)
목적: 모든 사용자 데이터를 Supabase primary로 전환하고, v3에서 각 플로우가 서버 기준으로 어떻게 동작하는지 고정한다.
Doc index: `docs/README.md`

---

## 1. 현재 상태 (As-Is)

### 1.1 영속성 혼재 맵

| 데이터 | 세션 전용 | localStorage | Supabase | 문제 |
|--------|----------|-------------|----------|------|
| chatMessages | ✅ 유일 | — | API 있으나 미사용 | 새로고침하면 전부 사라짐 |
| latestScan | ✅ 유일 | — | — | 새로고침하면 사라짐 |
| scanTabs (스캔히스토리) | — | ✅ 유일 | — | 기기 바뀌면 사라짐 |
| gameState (매치상태) | — | ✅ primary | — | 서버 검증 없음 |
| matchHistory | — | ✅ primary | API 있음 (미연결) | 이중 저장, 서버와 불일치 가능 |
| agentData (stats) | — | ✅ primary | API 있음 (미연결) | 이중 저장 |
| quickTrades | — | ✅ primary | ✅ 서버 백업 | 로컬 우선, 충돌 가능 |
| trackedSignals | — | ✅ primary | ✅ 서버 백업 | 로컬 우선, 충돌 가능 |
| community posts | — | ✅ primary | ✅ 서버 백업 | 로컬 우선 |
| pnl records | — | ✅ primary | API 있음 | 이중 저장 |
| userProfile | — | ✅ primary | API 있음 | 이중 저장 |
| UI state (탭/레이아웃) | — | — | ✅ primary | 정상 |
| preferences | — | — | ✅ primary | 정상 |

### 1.2 핵심 문제

1. **데이터 유실**: chatMessages, latestScan은 세션 전용 → 새로고침 = 전부 소멸
2. **기기 동기화 불가**: scanTabs, gameState, matchHistory는 localStorage → 다른 기기에서 접근 불가
3. **이중 소스**: quickTrades, trackedSignals는 localStorage primary + 서버 backup → 충돌 시 어느쪽이 진실?
4. **v3 계약 미반영**: user_passports 테이블에 tier/LP가 있지만, FE는 gameState.lp와 userProfileStore.profileTier를 각자 사용

---

## 2. 목표 (To-Be)

```
모든 사용자 데이터:  Supabase = Single Source of Truth
                    localStorage = 캐시/오프라인 전용 (서버와 동기화)
                    세션 변수 = 임시 UI 상태만 (ex: 모달 열림/닫힘)
```

원칙:
1. **Write**: 항상 서버 먼저 → 성공 시 로컬 캐시 갱신
2. **Read**: 로컬 캐시 먼저 표시 → 백그라운드로 서버 fetch → diff 있으면 갱신
3. **Conflict**: 서버가 항상 우선 (last-write-wins)
4. **Offline**: localStorage에 pending queue → 재연결 시 flush

---

## 3. 신규 Supabase 테이블 (migration 005 + 006)

### 3.1 `terminal_scan_runs` — 스캔 세션

```sql
CREATE TABLE IF NOT EXISTS terminal_scan_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  pair        text NOT NULL,           -- 'BTC/USDT'
  timeframe   text NOT NULL,           -- '4h'
  token       text NOT NULL,           -- 'BTC'

  -- 합산 결과
  consensus   text NOT NULL CHECK (consensus IN ('long','short','neutral')),
  avg_confidence numeric(5,2) NOT NULL,
  summary     text NOT NULL,           -- "Consensus LONG · Avg CONF 72% · RSI 58.3" (보조 신호 요약)

  -- 하이라이트 (에이전트별 요약)
  highlights  jsonb NOT NULL DEFAULT '[]',
  -- [{ agent: "STRUCTURE", vote: "long", conf: 72, note: "Price $97,234..." }]

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_runs_user
  ON terminal_scan_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scan_runs_pair
  ON terminal_scan_runs (user_id, pair, timeframe, created_at DESC);
```

v3 변경: 현재 scanTabs는 same pair+tf면 탭 업데이트. Supabase에서는 **매 스캔을 별도 row로 저장**하고, FE에서 pair+tf 기준 그룹핑하여 탭 표시.
참고: `consensus`는 스캔의 보조 추천값이며 자동 매매 최종결정을 의미하지 않는다.

### 3.2 `terminal_scan_signals` — 스캔 내 개별 시그널

```sql
CREATE TABLE IF NOT EXISTS terminal_scan_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id     uuid NOT NULL REFERENCES terminal_scan_runs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,

  agent_id    text NOT NULL,           -- 'structure','flow','deriv','senti','macro'
  agent_name  text NOT NULL,           -- 'STRUCTURE'
  vote        text NOT NULL CHECK (vote IN ('long','short','neutral')),
  confidence  numeric(5,2) NOT NULL,   -- 45-95
  analysis_text text NOT NULL,         -- "Price $97,234 · MA20 $96,800 · RSI 58.3"
  data_source text NOT NULL,           -- "BINANCE:BTC:4H"

  -- 트레이드 플랜
  entry_price numeric(16,8) NOT NULL,
  tp_price    numeric(16,8) NOT NULL,
  sl_price    numeric(16,8) NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_signals_scan
  ON terminal_scan_signals (scan_id);
```

### 3.3 `agent_chat_messages` — 에이전트 채팅 히스토리

```sql
CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,

  from_agent  text NOT NULL,           -- 'YOU', 'SYSTEM', 'ORCHESTRATOR', 'STRUCTURE', ...
  icon        text NOT NULL DEFAULT '',
  color       text NOT NULL DEFAULT '',
  message     text NOT NULL,
  is_user     boolean NOT NULL DEFAULT false,
  is_system   boolean NOT NULL DEFAULT false,

  -- 스캔 연결 (스캔 완료 시 자동 생성된 메시지)
  scan_id     uuid REFERENCES terminal_scan_runs(id) ON DELETE SET NULL,

  -- 응답 생성 소스 (에이전트 메시지만 해당)
  response_source text CHECK (response_source IN ('scan_context', 'llm', 'fallback')),

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user
  ON agent_chat_messages (user_id, created_at DESC);
```

v3 변경: 현재 하드코딩 랜덤 응답 → v3에서는 **실제 스캔 데이터 기반 응답** 또는 **LLM API 호출 응답**으로 전환. 응답 생성 소스(hardcoded/scan-based/llm)를 `response_source` 컬럼으로 추적 가능.

> **주의**: 기존 `/api/chat/messages` 엔드포인트가 사용하는 `chat_messages` 테이블이 이미 존재할 수 있다.
> `agent_chat_messages`는 **별도 테이블**로 생성하되, v3 전환 완료 후 기존 `chat_messages` 데이터를
> 마이그레이션하거나 adapter로 연결한다. Migration 005에서 기존 테이블 존재 여부를 확인할 것.

### 3.4 기존 테이블 역할 확인 (이미 있는 것)

| 기존 테이블 | 용도 | v3 변경 필요? |
|------------|------|-------------|
| `arena_matches` | 매치 전체 상태 | 현재 gameState localStorage와 병행 → **서버 primary로 전환** |
| `user_passports` | LP, tier, 통계 | 현재 FE가 직접 계산 → **서버 계산 결과 읽기 전용** |
| `user_agent_progress` | 에이전트별 전적 | 현재 agentData localStorage → **서버 primary** |
| `lp_transactions` | LP 변동 이력 | 현재 pnlStore localStorage → **서버 primary** |
| `agent_accuracy_stats` | 글로벌 통계 | Oracle에서 사용 → 변경 없음 |
| `user_ui_state` | 탭/레이아웃 | 이미 서버 primary ✅ |
| `user_preferences` | 설정 | 이미 서버 primary ✅ |

### 3.5 `pvp_matching_pool` — PvP 매칭 풀

```sql
CREATE TABLE IF NOT EXISTS pvp_matching_pool (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id   uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  matched_user_id   uuid REFERENCES app_users(id) ON DELETE SET NULL,

  pair              text NOT NULL,              -- 'BTC/USDT'
  timeframe         text NOT NULL,              -- '4h'
  auto_accept       boolean NOT NULL DEFAULT false,

  creator_tier      text NOT NULL,              -- 'BRONZE'...'MASTER'
  creator_elo       integer NOT NULL DEFAULT 1200,
  elo_min           integer NOT NULL,
  elo_max           integer NOT NULL,
  tier_min          text NOT NULL,
  tier_max          text NOT NULL,

  status            text NOT NULL CHECK (status IN ('WAITING', 'MATCHED', 'EXPIRED', 'CANCELLED')),
  arena_match_id    uuid REFERENCES arena_matches(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pvp_pool_waiting
  ON pvp_matching_pool (status, pair, timeframe, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pvp_pool_creator
  ON pvp_matching_pool (creator_user_id, status, created_at DESC);
```

### 3.6 Tournament 테이블

```sql
CREATE TABLE IF NOT EXISTS tournaments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type              text NOT NULL CHECK (type IN ('DAILY_SPRINT', 'WEEKLY_CUP', 'SEASON_CHAMPIONSHIP')),
  pair              text NOT NULL,
  timeframe         text NOT NULL DEFAULT '4h',
  status            text NOT NULL CHECK (status IN ('REG_OPEN', 'REG_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  max_players       integer NOT NULL CHECK (max_players IN (8, 16, 32)),
  entry_fee_lp      integer NOT NULL DEFAULT 0,
  start_at          timestamptz NOT NULL,
  end_at            timestamptz,
  created_by        uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_registrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  seed              integer,
  paid_lp           integer NOT NULL DEFAULT 0,
  elo_snapshot      integer NOT NULL DEFAULT 1200,
  tier_snapshot     text NOT NULL DEFAULT 'BRONZE',
  registered_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS tournament_brackets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round             integer NOT NULL,
  match_index       integer NOT NULL,
  user_a_id         uuid REFERENCES app_users(id) ON DELETE SET NULL,
  user_b_id         uuid REFERENCES app_users(id) ON DELETE SET NULL,
  winner_id         uuid REFERENCES app_users(id) ON DELETE SET NULL,
  match_id          uuid REFERENCES arena_matches(id) ON DELETE SET NULL,
  status            text NOT NULL CHECK (status IN ('WAITING', 'IN_PROGRESS', 'RESULT')),
  scheduled_at      timestamptz,
  resolved_at       timestamptz,
  UNIQUE (tournament_id, round, match_index)
);

CREATE TABLE IF NOT EXISTS tournament_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  final_rank        integer NOT NULL,
  lp_reward         integer NOT NULL DEFAULT 0,
  elo_change        integer NOT NULL DEFAULT 0,
  badges            jsonb NOT NULL DEFAULT '[]',
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournaments_active
  ON tournaments (status, start_at);

CREATE INDEX IF NOT EXISTS idx_tournament_reg_user
  ON tournament_registrations (user_id, tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_bracket_round
  ON tournament_brackets (tournament_id, round, match_index);
```

### 3.7 `arena_matches` 확장 필드 (모드 공통화)

```sql
ALTER TABLE arena_matches
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'PVE'
    CHECK (mode IN ('PVE', 'PVP', 'TOURNAMENT')),
  ADD COLUMN IF NOT EXISTS pvp_pool_id uuid REFERENCES pvp_matching_pool(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tournament_round integer,
  ADD COLUMN IF NOT EXISTS fbs_score numeric(6,2),
  ADD COLUMN IF NOT EXISTS elo_delta integer NOT NULL DEFAULT 0;
```

운영 규칙:
1. `mode=PVE`: `pvp_pool_id`, `tournament_id`는 `NULL`
2. `mode=PVP`: `pvp_pool_id`는 필수, `tournament_id`는 `NULL`
3. `mode=TOURNAMENT`: `tournament_id` 필수
4. `ELO`는 PvP/토너먼트 모드에서만 변화, `LP`는 모든 모드에서 변화

---

## 4. v3 플로우 — 스캔이 어떻게 바뀌는지

### 4.1 현재 스캔 플로우

```
[SCAN 클릭]
  → warroomScan.ts (클라이언트)
    → Binance REST + Coinalyze REST (직접 호출)
    → 클라이언트에서 5개 에이전트 스코어링
    → scanTabs localStorage에 저장
    → chatMessages 세션변수에 push
  → 새로고침하면? scanTabs 복원 가능, chat은 사라짐
  → 다른 기기에서? 아무것도 없음
```

### 4.2 v3 스캔 플로우

```
[SCAN 클릭]
  │
  ├─ FE: scanRunning = true, UI 로딩 표시
  │
  ├─ API: POST /api/terminal/scan
  │  │  Request: { pair: "BTC/USDT", timeframe: "4h" }
  │  │
  │  ├─ BE: Market Data 수집
  │  │   ├─ fetchKlines(pair, tf, 240)     → Binance
  │  │   ├─ fetch24hr(pair)                → Binance
  │  │   ├─ fetchCurrentOI(pair)           → Coinalyze
  │  │   ├─ fetchCurrentFunding(pair)      → Coinalyze
  │  │   ├─ fetchPredictedFunding(pair)    → Coinalyze
  │  │   ├─ fetchLSRatioHistory(pair)      → Coinalyze
  │  │   └─ fetchLiquidationHistory(pair)  → Coinalyze
  │  │
  │  ├─ BE: 5 에이전트 스코어링 (indicators.ts + trend.ts)
  │  │   ※ Terminal 스캔은 5개 에이전트만 사용 (Arena는 8개 전체)
  │  │   ※ VPA/ICT/VALUATION은 Arena Draft에서만 선택 가능
  │  │   ※ 결과는 추천/보조 신호이며 최종 집행 결정은 트레이더가 수행
  │  │   ├─ STRUCTURE: SMA 20/60/120 + RSI + 24h변동
  │  │   ├─ FLOW: 볼륨비 + quoteVolume + momentum
  │  │   ├─ DERIV: funding + predFR + lsRatio + liqBias
  │  │   ├─ SENTI: 24h proxy + RSI + funding
  │  │   └─ MACRO: SMA120 + 24h + funding crosscheck
  │  │
  │  ├─ BE: Supabase INSERT
  │  │   ├─ terminal_scan_runs INSERT → scan_id
  │  │   ├─ terminal_scan_signals INSERT × 5
  │  │   ├─ indicator_series UPSERT (캐시 갱신)
  │  │   └─ agent_chat_messages INSERT (ORCHESTRATOR 요약 메시지)
  │  │
  │  └─ Response:
  │     {
  │       scan: { id, pair, tf, consensus, avgConf, summary, highlights },
  │       signals: AgentSignal[5],
  │       chatMessage: { id, from: "ORCHESTRATOR", text: "BTC 4H scan done..." }
  │     }
  │
  ├─ FE: 결과 수신
  │   ├─ scanTabs 로컬 캐시 업데이트
  │   ├─ chatMessages 배열에 push
  │   ├─ latestScan 갱신 (우측 scan-brief 카드)
  │   └─ scanRunning = false
  │
  └─ 새로고침/다른기기:
     ├─ GET /api/terminal/scan/history?limit=20  → 최근 스캔 히스토리
     ├─ GET /api/terminal/scan/:id/signals → 시그널 목록
     └─ GET /api/chat/messages?channel=terminal&limit=100 → 최근 채팅 100개
```

### 4.3 v3 에이전트 챗 플로우

```
현재: @STRUCTURE 입력 → 하드코딩 2~3개 중 랜덤 → 세션 전용
v3:   @STRUCTURE 입력 → 서버 API → 실제 분석 기반 응답 → DB 저장

[유저] "@STRUCTURE 현재 추세 어때?"
  │
  ├─ FE: 유저 메시지 즉시 표시 (optimistic)
  │   chatMessages.push({ from:'YOU', text, isUser:true })
  │   isTyping = true
  │
  ├─ API: POST /api/chat/messages
  │  │  Request: { channel: "terminal", senderKind: "user", message: "@STRUCTURE 현재 추세 어때?", meta: { mentionedAgent: "STRUCTURE", pair: "BTC/USDT", timeframe: "4h" } }
  │  │
  │  ├─ BE: 응답 생성
  │  │   ├─ Phase 1 (MVP): 스캔 컨텍스트 기반 템플릿 응답
  │  │   │   최근 STRUCTURE 스캔 결과 조회 (terminal_scan_signals)
  │  │   │   → "최근 BTC 4H 스캔: SMA20 > SMA60 > SMA120 정배열,
  │  │   │      RSI 58.3으로 과매수 아님. 추세 유지 중. LONG 72% 유지."
  │  │   │
  │  │   ├─ Phase 2 (향후): LLM API 호출
  │  │   │   system: "당신은 STRUCTURE 에이전트입니다. 추세 분석 전문가."
  │  │   │   context: 최근 스캔 데이터 + indicator_series
  │  │   │   user: "@STRUCTURE 현재 추세 어때?"
  │  │   │   → LLM 응답
  │  │   │
  │  │   └─ response_source: 'scan_context' | 'llm' | 'fallback'
  │  │
  │  ├─ BE: Supabase INSERT
  │  │   ├─ agent_chat_messages INSERT (유저 메시지, is_user=true)
  │  │   └─ agent_chat_messages INSERT (에이전트 응답, is_user=false)
  │  │
  │  └─ Response: { id, from: "STRUCTURE", text: "최근 BTC 4H...", responseSource: "scan_context" }
  │
  └─ FE: isTyping = false, chatMessages.push(응답)
```

### 4.4 v3 시그널 → 트레이드 전체 플로우

```
[LONG 버튼 클릭] on signal card
  │
  ├─ FE: optimistic UI (포지션 즉시 표시)
  │
  ├─ API: POST /api/quick-trades/open  ← 이미 존재하는 API
  │   Request: {
  │     pair: "BTC/USDT",
  │     dir: "LONG",
  │     entry: 97234,
  │     tp: 99100,
  │     sl: 95800,
  │     source: "STRUCTURE",       ← 어떤 에이전트가 추천했는지
  │     scanId: "uuid",            ← (v3 신규) 어떤 스캔에서 나온 시그널인지
  │     note: ""
  │   }
  │
  ├─ BE: Supabase INSERT (quick_trades 테이블)
  │   + user_passports UPDATE (통계 갱신)
  │
  └─ 데이터 표시 위치:
     ├─ Terminal > 우측 POSITIONS 탭 (openTrades)
     ├─ Terminal > QuickTradePanel 플로팅
     ├─ Passport > POSITIONS 탭 > OPEN TRADES 섹션
     └─ (v3 신규) Passport > ARENA 탭에서 "에이전트 추천 기반 승률" 통계

[TRACK 버튼 클릭]
  │
  ├─ API: POST /api/signals/track  ← 이미 존재하는 API
  │   Request: {
  │     pair: "BTC/USDT",
  │     dir: "LONG",
  │     entryPrice: 97234,
  │     source: "STRUCTURE",
  │     confidence: 72,
  │     scanId: "uuid",            ← (v3 신규) 스캔 연결
  │     expiresAt: +24h
  │   }
  │
  ├─ BE: tracked_signals INSERT
  │   + user_passports UPDATE (tracked count)
  │
  └─ 데이터 표시 위치:
     ├─ Terminal > 우측 POSITIONS 탭 (trackedSignals)
     ├─ Passport > POSITIONS 탭 > TRACKED SIGNALS
     └─ 24시간 후 서버에서 자동 만료 (cron or TTL)

[COPY TRADE 다중선택]
  │
  ├─ FE: CopyTradeModal 3단계
  │   Step 1: 방향/레버리지/사이즈 설정
  │   Step 2: 선택된 시그널 확인
  │   Step 3: 최종 확인
  │
  ├─ API: POST /api/copy-trades/publish  ← 이미 존재하는 API
  │   Request: {
  │     pair, dir, entry, tp[], sl,
  │     leverage: 5, sizePercent: 50,
  │     signalIds: [uuid, uuid, ...],   ← 선택된 scan_signal IDs
  │     scanId: "uuid",
  │     evidence: [{ agent, vote, conf, note }],
  │     note: ""
  │   }
  │
  ├─ BE: 동시 생성
  │   ├─ quick_trades INSERT (source: 'copy-trade')
  │   ├─ tracked_signals INSERT (source: 'COPY TRADE')
  │   └─ copy_trade_runs INSERT (실행 기록)
  │
  └─ 데이터 표시:
     ├─ Terminal POSITIONS (오픈 포지션)
     ├─ Passport POSITIONS (오픈 + 추적)
     └─ Signals 페이지 (공유된 시그널로 표시)
```

### 4.5 v3 스캔 히스토리 누적 + 탭 구조

```
현재:
  scanTabs: ScanTab[] (localStorage, MAX 6탭, 탭당 MAX 60시그널)
  같은 pair+tf → 기존 탭 업데이트 (시그널 prepend)
  다른 pair+tf → 새 탭 (7번째부터 LRU 제거)

v3:
  ┌─ Supabase (Source of Truth) ────────────────────────┐
  │ terminal_scan_runs: 모든 스캔 세션 (무제한)               │
  │ terminal_scan_signals: 모든 시그널 (무제한)           │
  └─────────────────────────────────────────────────────┘
         │
         ▼ FE에서 조회 시
  ┌─ API: GET /api/terminal/scan/history ────────────────┐
  │ ?pair=BTC/USDT&timeframe=4h                          │
  │ &limit=20 (API_CONTRACT §9.2 기준)                   │
  │                                                      │
  │                                                      │
  │ Response:                                            │
  │ [                                                    │
  │   {                                                  │
  │     pair: "BTC/USDT", timeframe: "4h",               │
  │     scanCount: 3,                                    │
  │     latestScanAt: "2026-02-22T14:15:00Z",            │
  │     signals: AgentSignal[15]  (3스캔 × 5시그널)       │
  │   },                                                 │
  │   {                                                  │
  │     pair: "ETH/USDT", timeframe: "4h",               │
  │     scanCount: 1,                                    │
  │     signals: AgentSignal[5]                           │
  │   }                                                  │
  │ ]                                                    │
  └──────────────────────────────────────────────────────┘
         │
         ▼ FE 탭 구조
  ┌──────────────────────────────────────────────────────┐
  │ [LIVE FEED] [BTC/4H (3)] [ETH/4H (1)] [SOL/1H (2)] │
  │                                                      │
  │ (v3 신규) 각 탭에 스캔 횟수 표시                       │
  │ (v3 신규) 탭 내에서 스캔별 시간 구분선                  │
  │ (v3 신규) LIVE FEED는 실제 최신 전체 스캔 결과         │
  │          (하드코딩 제거 → 실시간 데이터)               │
  └──────────────────────────────────────────────────────┘
```

### 4.6 v3 우측 패널 전체 플로우

```
우측 IntelPanel 탭 구조:

[INTEL] ──┬── [CHAT]       → agent_chat_messages (Supabase)
          ├── [HEADLINES]   → v3: /api/market/news (실시간 RSS 수집)
          ├── [EVENTS]      → v3: /api/market/events (온체인 이벤트)
          └── [FLOW]        → v3: /api/market/flow (스마트머니 추적)

[COMMUNITY] → community_posts (Supabase, 이미 있음)

[POSITIONS] ──┬── Open Trades      → quick_trades (Supabase)
              ├── Tracked Signals  → tracked_signals (Supabase)
              └── Predictions      → prediction_positions (Supabase)

v3에서 바뀌는 것:
1. CHAT: 세션전용 → Supabase 저장 + 스캔 컨텍스트 기반 응답
2. HEADLINES: 하드코딩 → RSS 수집 API
3. EVENTS: 하드코딩 → 온체인 이벤트 API
4. FLOW: 하드코딩 → 실시간 플로우 데이터
5. POSITIONS: localStorage primary → Supabase primary
```

---

## 5. 페이지별 데이터 소스 전환 맵

### 5.1 Terminal

| 데이터 | 현재 소스 | v3 소스 | API |
|--------|----------|---------|-----|
| 스캔 결과 | warroomScan.ts (FE) | POST /api/terminal/scan (BE) | 신규 |
| 스캔 히스토리 | scanTabs localStorage | GET /api/terminal/scan/history | 신규 |
| 채팅 메시지 | 세션변수 | GET /api/chat/messages?channel=terminal | 기존 확장 |
| 채팅 응답 | 하드코딩 랜덤 | POST /api/chat/messages (meta.mentionedAgent) | 기존 확장 |
| 오픈 포지션 | quickTradeStore localStorage | GET /api/quick-trades | 기존 (primary 전환) |
| 추적 시그널 | trackedSignalStore localStorage | GET /api/signals | 기존 (primary 전환) |
| 뉴스 | HEADLINES 하드코딩 | GET /api/market/news | 신규 |
| 이벤트 | EVENTS 하드코딩 | GET /api/market/events | 신규 |
| 플로우 | 인라인 하드코딩 | GET /api/market/flow | 신규 |
| 지표 스트립 | Coinalyze 직접호출 | GET /api/market/derivatives | 신규 (프록시) |
| 가격 | 3곳 개별 WS | priceService 단일 WS | S-03 |

### 5.2 Arena

| 데이터 | 현재 소스 | v3 소스 | API |
|--------|----------|---------|-----|
| 매치 상태 | gameState localStorage | arena_matches (Supabase) | POST /api/arena/match/* |
| 배틀 스트림 | 클라이언트 임의 타이머 | 서버 phase + SSE 이벤트 | GET /api/arena/match/:id/battle |
| 에이전트 분석 | FE 내부 계산 | agent_analysis_results | POST /api/arena/match/:id/analyze |
| FBS/LP/ELO 결과 | gameState.lp + walletStore | arena_matches.fbs_score + lp_transactions + user_passports | GET /api/arena/match/:id/result |
| 매치 히스토리 | matchHistoryStore localStorage | arena_matches 조회 | GET /api/matches |
| PvP 매칭 대기열 | 메모리/임시 상태 | pvp_matching_pool | POST /api/pvp/pool/create, GET /api/pvp/pool/available, POST /api/pvp/pool/:id/accept |
| 토너먼트 메타 | 미구현 | tournaments | GET /api/tournaments/active |
| 토너먼트 참가 | 미구현 | tournament_registrations | POST /api/tournaments/:id/register |
| 토너먼트 대진표 | 미구현 | tournament_brackets | GET /api/tournaments/:id/bracket |
| 토너먼트 결과 | 미구현 | tournament_results | GET /api/tournaments/:id/bracket, GET /api/arena/match/:id/result |

### 5.3 Passport

| 데이터 | 현재 소스 | v3 소스 | API |
|--------|----------|---------|-----|
| Tier | userProfileStore.profileTier (자체계산) | user_passports.tier (서버계산) | GET /api/profile/passport |
| LP | gameState.lp (로컬) | user_passports.lp_total | GET /api/profile/passport |
| 매치 수 | matchHistoryStore.length (로컬) | user_passports.win_count+loss_count | GET /api/profile/passport |
| 에이전트 목록 | AGDEFS (7개) | AGENT_POOL 브릿지 (8개) | — (FE 전환) |
| 배지 | userProfileStore.badges (로컬) | user_passports.badges | GET /api/profile/passport |
| 포지션 | quickTradeStore localStorage | quick_trades (Supabase) | GET /api/quick-trades |
| 추적 시그널 | trackedSignalStore localStorage | tracked_signals (Supabase) | GET /api/signals |

### 5.4 Oracle

| 데이터 | 현재 소스 | v3 소스 | API |
|--------|----------|---------|-----|
| 에이전트 목록 | AGENT_POOL (이미 v3) | 동일 | — |
| Wilson/정확도 | agentStats localStorage | agent_accuracy_stats | GET /api/agents/stats |
| 프로필 모달 Tier | walletStore.tier "CONNECTED" | user_passports.tier | GET /api/profile/passport |
| 프로필 모달 Phase | resolveLifecyclePhase() | **삭제** (v3에 Phase 개념 없음) | — |

### 5.5 Lobby / PvP / Tournament

| 데이터 | 현재 소스 | v3 소스 | API |
|--------|----------|---------|-----|
| 로비 모드 해금 조건 | FE 하드코딩 | user_passports + user_agent_progress 집계 | GET /api/profile/passport |
| 진행 중 매치 목록 | localStorage 분산 | arena_matches (status in progress) | GET /api/matches |
| PvP 기록(ELO) | 미구현 | user_passports.elo_pvp (또는 전용 통계 테이블) | GET /api/profile/passport |
| 토너먼트 위젯 | 미구현 | tournaments + tournament_registrations count | GET /api/tournaments/active |

---

## 6. 신규 API 엔드포인트

### 6.1 Terminal Scan API

```
POST   /api/terminal/scan                          ← 스캔 실행 (BE에서 계산)
GET    /api/terminal/scan/history?pair=...&timeframe=...   ← 스캔 히스토리 (API_CONTRACT §9.2 기준)
GET    /api/terminal/scan/:id                       ← 단일 스캔 상세
GET    /api/terminal/scan/:id/signals               ← 스캔 내 시그널 목록
```

> **경로 통일**: API_CONTRACT §9.2의 `/api/terminal/scan/history` 경로를 정본으로 사용한다.

### 6.2 Terminal Chat API (기존 `/api/chat/messages` 확장)

```
POST   /api/chat/messages             ← 메시지 전송 + 에이전트 응답 생성 (meta.mentionedAgent 포함 시)
GET    /api/chat/messages?channel=terminal&limit=100  ← 채팅 히스토리 (pagination)
```

> **통일 규칙**: API_CONTRACT §9.1의 기존 `/api/chat/messages` 엔드포인트를 그대로 사용한다.
> v3 확장: POST 요청에 `meta.mentionedAgent`가 포함되면 서버가 에이전트 응답을 자동 생성하고,
> 유저 메시지 + 에이전트 응답을 함께 `agent_chat_messages` 테이블에 저장한다.

### 6.3 Market Data API (하드코딩 대체)

```
GET    /api/market/news               ← RSS 수집 뉴스
GET    /api/market/events             ← 온체인/매크로 이벤트
GET    /api/market/flow               ← 스마트머니 플로우
GET    /api/market/derivatives/:pair  ← OI/FR/LS 프록시
GET    /api/market/dex/*              ← DexScreener 프록시 (boost/ads/takeover/search/pairs)
```

### 6.4 Arena Competitive API (PvP/Tournament)

```
GET    /api/arena/match/:id/battle     ← Battle phase SSE (decision window + pnl tick)
POST   /api/pvp/pool/create            ← PvP 매칭 풀 생성
GET    /api/pvp/pool/available         ← 매칭 가능 대기열 조회
POST   /api/pvp/pool/:id/accept        ← 대기열 수락 + 매치 생성

GET    /api/tournaments/active         ← 토너먼트 목록/상태
POST   /api/tournaments/:id/register   ← 참가 등록 (LP 차감)
GET    /api/tournaments/:id/bracket    ← 대진표/라운드 상태
POST   /api/tournaments/:id/ban        ← Ban phase 제출
POST   /api/tournaments/:id/draft      ← Tournament draft 제출
```

---

## 7. 클라이언트 캐시 전략

### 7.1 Stale-While-Revalidate 패턴

```typescript
// 예시: scanTabs 로딩
async function loadScanTabs(): ScanTab[] {
  // 1. 로컬 캐시 즉시 반환 (화면 빠르게 표시)
  const cached = localStorage.getItem('scanTabs');
  if (cached) renderTabs(JSON.parse(cached));

  // 2. 서버에서 최신 데이터 fetch
  const fresh = await fetch(`/api/terminal/scan/history?pair=${pair}&timeframe=${timeframe}&limit=6`);
  const data = await fresh.json();

  // 3. 서버 데이터로 갱신
  localStorage.setItem('scanTabs', JSON.stringify(data));
  renderTabs(data);

  return data;
}
```

### 7.2 Optimistic Write 패턴

```typescript
// 예시: 채팅 메시지 전송
async function sendChat(text: string) {
  // 1. 즉시 UI 반영 (optimistic)
  const tempId = crypto.randomUUID();
  chatMessages.push({ id: tempId, from: 'YOU', text, isUser: true });

  // 2. 서버 전송
  const res = await fetch('/api/chat/messages', {
    method: 'POST',
    body: JSON.stringify({
      channel: 'terminal',
      senderKind: 'user',
      senderName: 'YOU',
      message: text,
      meta: { mentionedAgent, pair, timeframe, scanId }
    })
  });

  // 3. 서버 응답으로 교체
  const { userMsg, agentResponse } = await res.json();
  replaceTempId(tempId, userMsg.id);
  chatMessages.push(agentResponse);
}
```

### 7.3 STORAGE_KEYS 변환

| 현재 key | v3 역할 | 변경 |
|---------|---------|------|
| `stockclaw_state` | 매치 상태 캐시 | Supabase primary → 로컬 캐시 |
| `stockclaw_agents` | 에이전트 stats 캐시 | user_agent_progress 캐시 |
| `stockclaw_wallet` | 지갑 연결 상태 | 유지 (로컬 전용, 보안) |
| `stockclaw_match_history` | 매치 히스토리 캐시 | arena_matches 캐시 |
| `stockclaw_quicktrades` | 포지션 캐시 | quick_trades 캐시 |
| `stockclaw_tracked` | 추적 시그널 캐시 | tracked_signals 캐시 |
| `stockclaw_community` | 커뮤니티 캐시 | community_posts 캐시 |
| `stockclaw_profile` | 프로필 캐시 | user_passports 캐시 |
| `stockclaw_pnl` | PnL 캐시 | lp_transactions 캐시 |
| (신규) `stockclaw_scans` | 스캔 탭 캐시 | terminal_scan_runs 캐시 |
| (신규) `stockclaw_chat` | 채팅 캐시 | agent_chat_messages 캐시 |

---

## 8. Migration 실행 순서

```
Phase 1: 테이블 생성 (005_terminal_persistence.sql)
  → terminal_scan_runs, terminal_scan_signals, agent_chat_messages 생성

Phase 2: Arena 경쟁모드 테이블 생성 (006_arena_competitive_modes.sql)
  → pvp_matching_pool, tournaments, tournament_registrations 생성
  → tournament_brackets, tournament_results 생성
  → arena_matches mode/pvp_pool_id/tournament_id/fbs_score/elo_delta 확장

Phase 3: Terminal API 구현 (B-09 ~ B-11)
  → POST /api/terminal/scan (warroomScan.ts 로직을 서버로 이동)
  → POST /api/chat/messages 확장 (meta.mentionedAgent → 에이전트 응답 생성)
  → GET /api/terminal/scan/history

Phase 4: Arena 경쟁모드 API 구현 (B-12 ~ B-14)
  → GET /api/arena/match/:id/battle (SSE)
  → POST/GET /api/pvp/pool/*
  → GET/POST /api/tournaments/*

Phase 5: Store 전환 (F-09 ~ F-11)
  → quickTradeStore: localStorage primary → Supabase primary
  → trackedSignalStore: 동일 전환
  → scanTabs: 동일 전환
  → chatMessages: 세션변수 → Supabase + 로컬캐시

Phase 6: 하드코딩 제거 + 경쟁모드 FE 연결 (F-10, F-13 ~ F-15)
  → LIVE FEED: 프리셋 → 실시간 스캔 결과
  → HEADLINES/EVENTS/FLOW: 정적 → API fetch
  → 에이전트 챗 응답: 랜덤 문자열 → 스캔 컨텍스트 기반
  → Lobby/PvP Pool/Tournament 화면을 API 기반으로 전환

Phase 7: 정합성 검증
  → 모든 화면에서 동일 tier/LP/매치수 표시 확인
  → 다른 기기에서 동일 데이터 확인
  → PvP 매칭풀 만료(4h) 및 토너먼트 라운드 전이 확인
  → 새로고침 후 모든 데이터 복원 확인
```

---

## 9. REFACTORING_BACKLOG 추가 항목

기존 백로그에 추가 필요:

| ID | Track | 작업 | 의존 |
|----|-------|------|------|
| S-05 | Shared | migration 005_terminal_persistence.sql | — |
| S-06 | Shared | migration 006_arena_competitive_modes.sql + Arena mode enum 계약 | S-04 |
| B-09 | BE | Terminal Scan API (스캔 서버 이전) | B-02 (indicators), S-05 |
| B-10 | BE | Terminal Chat API (기존 /api/chat/messages 확장, 컨텍스트 기반 응답) | B-09 |
| B-11 | BE | Market Data API (뉴스/이벤트/플로우) | — |
| B-12 | BE | PvP Matching Pool API + 만료 watchdog | B-01, S-06 |
| B-13 | BE | Tournament API (active/register/bracket/ban/draft) | B-01, S-06 |
| B-14 | BE | Arena 결과 정산 확장 (FBS/LP/ELO/모드별 보상) | B-03, B-12, B-13 |
| F-09 | FE | Store 전환 (localStorage → Supabase primary) | B-09, B-10 |
| F-10 | FE | 하드코딩 제거 (LIVE FEED, HEADLINES, chat 응답) | B-09, B-10, B-11 |
| F-11 | FE | 영속성 검증 (새로고침/다른기기/오프라인) | F-09, F-10 |
| F-13 | FE | Lobby Hub v3 (모드카드/진행중매치/토너위젯) | S-06, B-12, B-13 |
| F-14 | FE | PvP 매칭풀 화면 (AUTO/BROWSE/CREATE) | F-13, B-12 |
| F-15 | FE | Tournament 화면 (등록/대진표/Ban-Pick) | F-13, B-13 |
