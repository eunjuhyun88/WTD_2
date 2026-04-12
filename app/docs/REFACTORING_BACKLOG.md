# STOCKCLAW v3 Refactoring Backlog

Created: 2026-02-22
Updated: 2026-02-23 (Agent 4 코드 감사 기반 상태 동기화)
Doc index: `docs/README.md`
Rule: **Contract → BE → FE**, never mixed in one PR

---

## Shared (계약/코어)

> FE/BE 둘 다 이 계약만 참조. 변경 시 항상 Shared 먼저.

| ID | 제목 | 설명 | 상태 |
|----|------|------|------|
| **S-01** | Agent 브릿지 단일화 | `data/agents.ts`를 `AGENT_POOL` 기반 브릿지로 교체, `AGDEFS` export만 호환 유지 | ✅ |
| **S-02** | Progression 단일 규칙 확정 | `progressionStore` 신설 기준 계약 정의 (LP, matches, tier, unlockedSpecs) | ✅ |
| **S-03** | Price 계약 단일화 | `livePrice` 단일 스토어/이벤트 규약 정의 (심볼, 타임스탬프, source) | ✅ |
| **S-04** | Arena DraftSelection 계약 고정 | `{ agentId, specId, weight }[]` + 합계 100 검증 규칙 확정 | ✅ |
| **S-05** | Terminal Persistence Migration | `005_terminal_persistence.sql` (scan_runs/scan_signals/agent_chat_messages) | ✅ |
| **S-06** | Arena Competitive Contract | Arena `mode(PVE/PVP/TOURNAMENT)`, PvP pool 상태, Tournament Ban/Pick payload 계약 확정 | 🟡 (mode enum+tournament status 구현, Ban/Pick/PvP pool 미구현) |

### S-01 상세: Agent 브릿지 단일화
- **변경 파일**: `src/lib/data/agents.ts`
- **방법**: `getAllAgents()` from `engine/agents.ts` → `AgentDef[]` 변환 함수
  - guardian/commander/scanner 제거
  - VPA/ICT/VALUATION/MACRO 자동 추가
  - `AgentDef` interface 유지 (16개 파일 import 경로 불변)
  - `CHARACTER_ART`, `SOURCES`는 그대로 유지
- **검증**: `AGDEFS.length === 8`, 기존 UI 렌더링 정상
- **branch**: `codex/contract-agent-bridge`

### S-02 상세: Progression 단일 규칙 확정
- 현재 문제: `progressionRules.ts` 임계값 ≠ `constants.ts` TIER_TABLE
  - `resolveLifecyclePhase()`: LP 2200/matches 200 → phase 5
  - `getTierForLP()`: LP 2200 → MASTER
- **방향**: 둘을 통합. walletStore의 `phase: number` → `tier: Tier` 전환 검토
- 계약 정의: `progressionStore`가 사용할 인터페이스 확정
  - `{ lp, totalMatches, wins, losses, streak, agentMatchCounts, currentTier, unlockedSpecs }`
- **branch**: `codex/contract-progression`

### S-03 상세: Price 계약 단일화
- 현재 문제: Header/Chart/Terminal 각각 WS/interval 사용
- 계약: `livePrice` 스토어 인터페이스
  - `Record<symbol, { price: number; ts: number; source: 'ws' | 'rest' }>`
- `gameState.updatePrices()` 랜덤 지터 → priceService 위임
- **branch**: `codex/contract-price`

### S-04 상세: Arena DraftSelection 계약 고정
- types.ts에 이미 `DraftSelection` 정의 있음: `{ agentId, specId, weight }`
- 추가: 검증 헬퍼 `validateDraft(selections: DraftSelection[]): ValidationResult`
  - 에이전트 3개 정확, weight 합 100, 최소 10 최대 80, spec 해금 확인
- constants.ts: `DRAFT_AGENT_COUNT=3`, `DRAFT_TOTAL_WEIGHT=100`, `DRAFT_MIN_WEIGHT=10`, `DRAFT_MAX_WEIGHT=80` 이미 존재
- **branch**: `codex/contract-draft`

### S-06 상세: Arena Competitive Contract
- 계약 범위:
  - Arena mode enum: `PVE | PVP | TOURNAMENT`
  - PvP pool status enum: `WAITING | MATCHED | EXPIRED | CANCELLED`
  - Tournament status enum: `REG_OPEN | REG_CLOSED | IN_PROGRESS | COMPLETED | CANCELLED`
  - Tournament Ban/Pick payload: `POST /api/tournaments/:id/ban`, `POST /api/tournaments/:id/draft`
  - Arena result settlement 확장: `lpDelta`, `eloDelta`, `fbs`
- 산출물:
  - `docs/API_CONTRACT.md` §2 업데이트
  - `docs/PERSISTENCE_DESIGN.md` migration 006 및 데이터 플로우 업데이트
- **branch**: `codex/contract-arena-competitive`

---

## BE 트랙

> `src/routes/api/**`, `src/lib/services/**`, `src/lib/engine/**` (순수 계산)
> FE 파일 일절 안 건드림. 완료 기준: API 응답/에러코드 정상.

| ID | 제목 | 설명 | depends | 상태 |
|----|------|------|---------|------|
| **B-01** | Arena API 스캐폴딩 | `/api/arena/match/*` 생성 (create/draft/analyze/hypothesis/result) | S-04 | ✅ |
| **B-02** | 지표 엔진 분리 | `scanEngine.ts` 서버 분리, 타입 통합, 클라이언트 임포트 전면 제거 | — | ✅ |
| **B-03** | agentPipeline 구현 | `agentPipeline.ts` + 8개 에이전트 scoring 모듈 + `computeFinalPrediction` | B-02 | ✅ |
| **B-04** | exitOptimizer 구현 | SL/TP 3전략 + EV/R:R 계산 | B-02 | ✅ |
| **B-05** | 데이터 수집 API | snapshot/proxy 라우트 및 외부 API 클라이언트 추가 | — | ✅ |
| **B-06** | progression 서버 반영 | 매치 결과 기준 LP/티어/해금 업데이트 일원화 | B-01, B-03 | ✅ |
| **B-07** | RAG memory | `memory.ts` + pgvector 검색/저장 연동 | B-03 | ⬜ |
| **B-08** | 하위호환 어댑터 | 기존 `/api/matches`를 신규 arena API 내부 호출로 연결 | B-01 | ✅ |
| **B-09** | Terminal Scan API | `POST /api/terminal/scan` (warroomScan.ts 로직 서버 이전) | B-02, S-05 | ✅ |
| **B-10** | Terminal Chat API | 기존 `/api/chat/messages` 확장 (meta.mentionedAgent → 에이전트 응답 생성) | B-09 | ✅ |
| **B-11** | Market Data API | 뉴스(RSS)/이벤트(온체인)/플로우(스마트머니) + DexScreener(boost/ads/takeover/search) 프록시 | — | ✅ |
| **B-12** | PvP Matching Pool API | `/api/pvp/pool/create`, `/available`, `/:id/accept` + 4h 만료 watchdog | B-01, S-06 | ⬜ |
| **B-13** | Tournament API | `/api/tournaments/active`, `/register`, `/bracket`, `/ban`, `/draft` | B-01, S-06 | 🟡 (active/register/bracket 완료, ban/draft 미구현) |
| **B-14** | Competitive Settlement Engine | mode별 LP/ELO/FBS 정산 + `arena_matches`/`lp_transactions` 반영 | B-03, B-12, B-13 | ⬜ |

---

## FE 트랙

> `src/components/**`, `src/routes/**/+page.svelte`, `src/lib/stores/**`
> BE 파일 안 건드림. 완료 기준: `svelte-check` 0 errors + 화면 정상.

| ID | 제목 | 설명 | depends | 상태 |
|----|------|------|---------|------|
| **F-01** | AGDEFS 소비부 치환 | 현재 AGDEFS 참조 16개 파일을 브릿지/신규 모델 기준으로 정리 | S-01 | ✅ |
| **F-02** | progressionStore 소비 통일 | wallet/userProfile/agentData의 중복 계산 제거, 표시값 단일화 (Oracle 프로필 모달 Tier/Phase 표시 교체 포함) | S-02 | ⬜ |
| **F-03** | priceService 적용 | Header/Chart/Terminal의 WS/interval 중복 제거, 단일 구독으로 통일 | S-03, B-05 | ⬜ |
| **F-04** | Lobby v3 | 8에이전트 표시, 3개 선택, 가중치 합 100, Spec 선택 UI | S-04, F-01 | ✅ |
| **F-05** | SquadConfig v3 | 기존 risk/timeframe 중심 UI를 DraftSelection 중심으로 교체 | S-04, F-01 | ✅ |
| **F-06** | Arena 5-Phase 화면 정리 | ANALYSIS/HYPOTHESIS/BATTLE/RESULT를 agentPipeline 출력 기반으로 재구성 | F-04, B-03 | ✅ |
| **F-07** | WarRoom UI 분해 | WarRoom.svelte 렌더링 전용 축소 (현재 1142줄 → 목표 800 이하) | B-02 | ✅ |
| **F-08** | 가시성/UI 정리 | 인텔/채팅/지표바 접기·라벨·모바일 동선 최종 튜닝 | F-06, F-07 | 🟡 (ChartPanel/Terminal 1차 완료, 모바일 미세 조정 잔여) |
| **F-09** | Store 전환 | localStorage primary → Supabase primary (quickTrade/tracked/scanTabs/chat) | B-09, B-10 | ⬜ |
| **F-10** | 하드코딩 제거 | LIVE FEED/HEADLINES/EVENTS/FLOW → API fetch, chat 응답 → 스캔 컨텍스트 | B-09, B-10, B-11 | ✅ |
| **F-11** | 영속성 검증 | 새로고침/다른기기/오프라인 시 데이터 복원 확인 | F-09, F-10 | ⬜ |
| **F-12** | Oracle 모달 정합성 | Oracle 프로필 모달의 `TIER: CONNECTED`, `PHASE P1` 구형 표기를 v3 계약 값으로 교체 | F-02 | ⬜ |
| **F-13** | Lobby Hub v3 | 모드 카드(PvE/PvP/Tournament) + 진행중 매치 + 주간 토너 위젯 구성 | S-06, B-12, B-13 | ✅ |
| **F-14** | PvP Pool UI | AUTO/BROWSE/CREATE 플로우 + 대기열/수락 + 만료 처리 | F-13, B-12 | ⬜ |
| **F-15** | Tournament UI | 등록/대진표/Ban-Pick/라운드 전환 UI + 배지/보상 노출 | F-13, B-13, B-14 | 🟡 (등록/대진표 완료, Ban-Pick UI 미구현) |

---

## 실행 순서 (고정)

```
Phase 1: 계약 확정
  S-01 → S-02 → S-03 → S-04 → S-05 → S-06

Phase 2: 병렬 시작
  BE: B-01 + B-02 + B-09 (Terminal Scan)
  FE: F-01 + F-03 (price display는 S-03 계약만 소비)

Phase 3: 크리티컬 패스
  BE: B-03 (pipeline) + B-10 (Chat) + B-11 (Market Data)
  FE: F-04 (Lobby) → F-05 (SquadConfig) → F-06 (Arena Phases)

Phase 4: 마무리
  BE: B-05 + B-06 + B-07 + B-08
  FE: F-07 + F-08 + F-09 (Store 전환) + F-10 (하드코딩 제거) + F-11 (영속성 검증) + F-12 (Oracle 모달)

Phase 5: 경쟁모드 확장 (Arena v3)
  BE: B-12 (PvP Pool) + B-13 (Tournament) + B-14 (Settlement)
  FE: F-13 (Lobby Hub) + F-14 (PvP Pool UI) + F-15 (Tournament UI)
```

---

## 검증 게이트

1. **각 티켓 완료마다**: `vite build` + `svelte-check` 통과
2. **트랙 머지 전**: 계약(Shared) 변경 diff 재검토
3. **FE/BE 혼합 커밋 금지**: 한 PR = 한 트랙

---

## 브랜치 규칙

- `codex/contract-*` — Shared 트랙
- `codex/be-*` — BE 트랙
- `codex/fe-*` — FE 트랙

---

## 이미 반영된 것 ✅

| 항목 | 파일 | 상태 |
|------|------|------|
| 5-Phase 코어 | gameState.ts, phases.ts, gameLoop.ts | ✅ |
| v3 타입 30+ | engine/types.ts | ✅ |
| 8 Agent Pool | engine/agents.ts (AGENT_POOL) | ✅ |
| 32 Spec | engine/specs.ts (SPEC_REGISTRY) | ✅ |
| LP/Tier 상수 | engine/constants.ts | ✅ |
| DB Migration | 004_agent_engine_v3.sql | ✅ |
| Oracle v3 | oracle/+page.svelte (AGENT_POOL, Wilson score) | ✅ |
| WarRoom 스캔 1차 분리 | engine/warroomScan.ts | ✅ |
| 진행 규칙 공통 함수 | stores/progressionRules.ts | ✅ |
| Arena guardian→macro | arena/+page.svelte | ✅ |
| warroom.ts guardian→macro | data/warroom.ts | ✅ |
| Arena API 풀 라이프사이클 | routes/api/arena/* + arenaService.ts | ✅ |
| exitOptimizer 3전략+Kelly | engine/exitOptimizer.ts (588 LOC) | ✅ |
| 데이터 수집 40+ 프록시 | server/providers/* + market routes | ✅ |
| scanEngine 서버 분리 | server/scanEngine.ts + server/binance.ts | ✅ |
| Lobby Hub 모드 카드 | components/arena/Lobby.svelte | ✅ |
| SquadConfig DraftSelection | components/arena/SquadConfig.svelte | ✅ |
| Arena 5-Phase UI | arena/+page.svelte (ANALYSIS~RESULT) | ✅ |
| Tournament 기초 API | tournaments/active, register, bracket | ✅ |
| livePrice 스토어 계약 | stores/priceStore.ts + livePriceSyncService.ts | ✅ |
