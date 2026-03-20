# STOCKCLAW Arena System Specification v3.0

Last updated: 2026-02-23  
Owner: Product/FE/BE Shared  
Status: Design Locked (implementation pending)

---

## 0. Purpose and Scope

이 문서는 Arena 기능을 PvE 중심 구조에서 `PvE + PvP 1:1 + Tournament`로 확장하는 통합 설계 문서다.

포함 범위:
1. 로비/모드 전환 UX
2. PvE 용병 드래프트 (3-agent + spec + weight)
3. 5-Phase 매치 상태머신
4. PvP 매칭풀 + ELO
5. 토너먼트(8/16/32) + Ban/Pick
6. 스코어링/FBS/LP/티어 규칙
7. DB/API 확장
8. FE/BE 책임 분리와 구현 순서

비포함 범위:
1. ORPO 모델 학습/튜닝 상세
2. Wallet 온보딩 상세
3. Terminal UI 디테일 리디자인

---

## 1. Lobby as Unified Hub

### 1.1 Lobby Layout Blocks

로비는 아래 블록으로 구성한다.
1. 모드 카드: `PvE`, `PvP`, `Tournament`
2. 진행 중 매치 목록(최대 5)
3. 최근 결과(전적 + LP 변동)
4. 주간 토너먼트 카드(등록 인원/시작까지 남은 시간)

### 1.2 Unlock Gates

| Mode | Unlock |
|---|---|
| PvE | 즉시 해금 |
| PvP 1:1 | PvE 10전 완료 |
| Tournament | Silver 이상 + PvP 5전 |

### 1.3 Mode Switching

1. `LOBBY -> PvE`: 코인 선택 -> DRAFT -> 5Phase -> RESULT -> LOBBY
2. `LOBBY -> PvP`: 매칭풀(create/accept/auto) -> DRAFT -> 5Phase -> RESULT -> LOBBY
3. `LOBBY -> Tournament`: 등록 -> 대진표 -> 라운드별 5Phase -> 최종 RESULT -> LOBBY

### 1.4 Concurrent Match Policy

1. PvE: 제한 없음(운영 정책으로 상한 가능)
2. PvP: 유저당 최대 3개
3. Tournament: 유저당 1개
4. 전체 합계: 최대 5개

---

## 2. PvE Draft System

### 2.1 Draft Inputs (60s)

유저 입력 필드:
1. ORPO 모델 선택 (`Base`, `Aggressive`, `Conservative`)
2. Agent 8개 중 3개 선택
3. 각 Agent의 Spec 선택
4. 각 Agent weight 배분 (합계 100)

### 2.2 Validation Rules

1. 선택 Agent 수 = 정확히 3
2. Agent 중복 금지
3. 개별 weight `10~80`
4. 총합 `100`
5. 선택 Spec 해금 여부 확인

### 2.3 Timeout Rules

1. 50초: 경고 상태
2. 55초: 위험 경고
3. 60초: 자동 제출
4. 에이전트 미선택 시 fallback:
- 최근 매치 draft 복사
- 최근 draft 없으면 `STRUCTURE + DERIV + FLOW` 기본값

### 2.4 Synergy and Counter Effects

#### Synergy (+)
- `STRUCTURE + DERIV`: +3%
- `FLOW + SENTI`: +3%
- `ICT + VPA`: +4%
- `MACRO + SENTI`: +2%
- `DERIV + FLOW`: +3%

#### Conflict (-)
- `STRUCTURE + ICT`: -2%
- `SENTI + VALUATION`: -2%
- 3 Agent 전원 동일 방향 과합의: -3%

적용 위치:
1. Agent 개별 score에는 직접 반영하지 않는다.
2. `COMMANDER/합산 단계`에서 최종 confidence 보정으로만 반영한다.

주의:
1. 위 계수는 설계 가정치이며 백테스트로 재보정 필요.

### 2.5 System Drafting (PvE Opponent)

시스템은 레짐별 자동 draft preset을 사용한다.
- 상승: STRUCTURE/VPA/MACRO = 40/30/30
- 하락: DERIV/FLOW/SENTI = 40/35/25
- 횡보: ICT/VPA/DERIV = 35/35/30
- 고변동: DERIV/MACRO/SENTI = 40/30/30
- 이벤트: MACRO/DERIV/VPA = 50/30/20

---

## 3. 5-Phase Match Lifecycle (Common)

Phase는 서버 권한 단일 소스로 관리한다.

1. `DRAFT`
2. `ANALYSIS`
3. `HYPOTHESIS`
4. `BATTLE`
5. `RESULT`

### 3.1 Phase Responsibilities

#### DRAFT (60s)
1. 유저 draft 입력 수집/검증
2. timeout 시 자동 제출

#### ANALYSIS (~5s)
1. 선택 Agent 분석 실행
2. factor + direction + confidence + thesis 저장
3. 일부 데이터 소스 실패 시 confidence 하향

#### HYPOTHESIS (30s)
1. 유저 최종 방향/confidence/근거 입력
2. 무응답 시 agent consensus + balanced exit 자동 적용

#### BATTLE (60s + 24h tracking)
1. 10초 x 6 window 의사결정(옵션)
2. 이후 24h 서버 추적
3. TP/SL hit 또는 만기 시 종료

#### RESULT
1. 승패/FBS/LP/ELO 계산
2. Agent 적중/오판 기록
3. Spec 해금/배지 체크
4. RAG memory 기록

### 3.2 Recovery Rules

1. 클라이언트 새로고침/탭 이동은 phase 진행에 영향 없음
2. 서버 cron watchdog(예: 10분 간격)으로 비정상 phase 체류 복구
3. Phase timeout/실패 이력은 audit event로 남김

---

## 4. PvP 1:1 System

### 4.1 Matching Pool States

`pvp_matching_pool.status`
1. `WAITING`
2. `MATCHED`
3. `EXPIRED`
4. `CANCELLED`

State flow:
1. `CREATED -> WAITING -> MATCHED -> IN_PROGRESS -> RESULT`
2. `WAITING (4h 초과) -> EXPIRED`
3. `EXPIRED -> (optional) PvE fallback`

### 4.2 ELO Rules

1. 초기 ELO = 1200
2. K-factor:
- 100전 미만: 32
- 100전 이상: 16
3. 기대승률:
- `E = 1 / (1 + 10^((opp - me)/400))`
4. 변동:
- `delta = K * (actual - E)`

### 4.3 Match Expansion by Waiting Time

1. 0~30분: ELO ±50, 같은 티어, 같은 코인
2. 30분~2시간: ELO ±100, 티어 ±1, 같은 코인
3. 2~4시간: ELO ±200, 티어 ±2, 같은 코인
4. 4시간+: 만료

### 4.4 PvP Limits

1. 유저당 동시 PvP 최대 3개
2. Auto Match는 조건 충족 매치가 없으면 새 매치 생성 후 WAITING

---

## 5. Tournament System

### 5.1 Tournament Types

| Type | Bracket | Cycle | Gate |
|---|---|---|---|
| Daily Sprint | 8 | Daily | Silver + PvP 5전 |
| Weekly Cup | 16 | Weekly | Gold + PvP 10전 |
| Season Championship | 32 | Season End | Platinum + qualifier |

### 5.2 Round Duration

1. 각 라운드 = 1 매치 = 동일 5-Phase
2. 라운드 판정은 24h 기준
3. 전체 기간:
- 8인: 약 48h
- 16인: 약 72h
- 32인: 약 96h

### 5.3 Tournament-only Ban/Pick

1. Ban Phase 20초: 양측 1 Agent ban
2. Pick Phase 40초: 남은 6 중 3 선택
3. Ban된 Agent는 양측 모두 사용 불가

### 5.4 Tournament State Model

`tournaments.status`
1. `REG_OPEN`
2. `REG_CLOSED`
3. `IN_PROGRESS`
4. `COMPLETED`
5. `CANCELLED`

---

## 6. Scoring and Rewards

### 6.1 FBS Formula

`FBS = 0.5*DS + 0.3*RE + 0.2*CI`

1. DS: 방향/정렬/override/timing
2. RE: 리스크 및 실행 품질
3. CI: confidence calibration

### 6.2 LP Policy (Unified)

1. PvE 승: +8 (고점수 보너스)
2. PvE 패: -3
3. PvP 승: +25 (+MVP 가능)
4. PvP 패: -10
5. DISSENT WIN 보너스:
- PvE: +5
- PvP: +15
6. Perfect Read: +3

### 6.3 Tier Gates

| Tier | LP | Unlock |
|---|---|---|
| Bronze | 0 | PvE |
| Silver | 500 | PvP + Daily |
| Gold | 2000 | Weekly + Custom Spec |
| Platinum | 10000 | DAO + Season |
| Master | 50000 | Community ORPO |

ELO와 LP는 분리한다.
1. ELO: 매칭 품질
2. LP: 보상/진행

---

## 7. FE/BE Responsibility Split

## 7.1 FE Scope

주요 책임:
1. Lobby, Draft, Match UI 렌더링
2. 입력 검증 UX(사전 검증)
3. SSE 구독 및 phase 전환 반영
4. active match 요약/배너

주요 파일(예상):
1. `src/routes/arena/+page.svelte`
2. `src/components/arena/Lobby.svelte`
3. `src/components/arena/SquadConfig.svelte`
4. `src/components/arena/BattleStage.svelte`
5. `src/lib/stores/*` (read model)

## 7.2 BE Scope

주요 책임:
1. Match/Tournament/PvP pool 상태머신
2. Draft validation 최종 판정
3. Analysis pipeline + scoring
4. Phase scheduler/watchdog
5. LP/ELO 정산
6. Persistence + RAG write

주요 파일(예상):
1. `src/routes/api/arena/**`
2. `src/routes/api/pvp/**`
3. `src/routes/api/tournaments/**`
4. `src/lib/engine/agentPipeline.ts`
5. `src/lib/engine/scoring.ts`
6. `src/lib/engine/memory.ts`

---

## 8. Data Model Additions

아래 테이블은 `arena_matches` 중심 공통 모델 위에 확장한다.

### 8.1 Required Tables

1. `pvp_matching_pool`
- id, creator_user_id, pair, tier_band, elo_band, status, created_at, expires_at, matched_user_id

2. `tournaments`
- id, type, pair, start_at, status, max_players, entry_fee_lp, created_at

3. `tournament_registrations`
- tournament_id, user_id, seed, paid_lp, registered_at

4. `tournament_brackets`
- tournament_id, round, match_index, user_a_id, user_b_id, winner_id, match_id

5. `tournament_results`
- tournament_id, user_id, final_rank, lp_reward, elo_change, badges

### 8.2 Existing Tables Reuse

1. `arena_matches`
- mode 필드 확장 필요 (`PVE`, `PVP`, `TOURNAMENT`)
2. `agent_analysis_results`
- 재사용
3. `lp_transactions`
- 재사용
4. `match_memories`
- 재사용

---

## 9. API Surface (v3)

### 9.1 Arena Core

1. `POST /api/arena/match/create`
2. `POST /api/arena/match/:id/draft`
3. `POST /api/arena/match/:id/analyze`
4. `POST /api/arena/match/:id/hypothesis`
5. `GET /api/arena/match/:id/battle` (SSE)
6. `GET /api/arena/match/:id/result`

### 9.2 PvP

1. `POST /api/pvp/pool/create`
2. `GET /api/pvp/pool/available`
3. `POST /api/pvp/pool/:id/accept`

### 9.3 Tournament

1. `GET /api/tournaments/active`
2. `POST /api/tournaments/:id/register`
3. `GET /api/tournaments/:id/bracket`
4. `POST /api/tournaments/:id/ban`
5. `POST /api/tournaments/:id/draft`

### 9.4 Integration

1. `GET /api/oracle/leaderboard`
2. `POST /api/agents/:id/challenge`
3. `GET /api/passport/me`

---

## 10. Mobile/Responsive Rules

1. Desktop (>=1024): 3-panel
2. Tablet (768~1023): 2-panel + tab
3. Mobile (<768): 1-panel full-screen flow

모바일 필수:
1. Draft 입력을 스텝형(순차)으로 분해
2. Battle CTA(BUY/SELL/HOLD) 하단 고정
3. Tournament bracket는 가로 스크롤 + 현재 라운드 중앙 정렬

---

## 11. Risks and Validation

### 11.1 Critical Preconditions

1. ORPO 오판 100건 수동 분류
2. ORPO 단독 vs ORPO+Agent A/B 테스트
3. Synergy/Counter 계수 백테스트
4. 60초 Draft UX 사용자 테스트

### 11.2 Open Risk Items

1. 계수(+2~4%, -2~-3%) 검증 전제
2. FBS 가중치(0.5/0.3/0.2) 검증 필요
3. Daily 8인 고정 모집 실패 가능성
4. Ban/Pick 전략 다양성 실제 체감 불확실

---

## 12. Implementation Roadmap

1. P0: ORPO 오류 분류 + A/B (Go/No-Go)
2. P3: 코어 엔진/DB 마이그레이션 안정화
3. P4: Match API + scoring + synergy/counter
4. P5: LP/티어/Passport 통합
5. P6: RAG 검색/보정
6. P7: PvP 풀 + ELO + LIVE
7. P8: Tournament + Ban/Pick + Bracket
8. P9: Weekly/Season 운영

---

## 13. Alignment Notes with Current Canonical Docs

이 문서는 확장 설계 문서이며, 실제 구현 착수 시 아래 문서를 함께 갱신해야 한다.

1. `docs/API_CONTRACT.md`
- Arena/PvP/Tournament endpoint request/response 확정

2. `docs/FE_STATE_MAP.md`
- Lobby/PvP/Tournament store ownership 반영

3. `docs/INTERACTION_CALL_MAP.md`
- 로비 클릭/모드 전환/ban-pick 플로우 반영

4. `docs/PERSISTENCE_DESIGN.md`
- 신규 5개 테이블 마이그레이션 반영

5. `docs/REFACTORING_BACKLOG.md`
- BE/FE 티켓으로 세분화 반영

