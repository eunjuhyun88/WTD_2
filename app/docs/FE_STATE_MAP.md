# STOCKCLAW v3 FE State Map

작성일: 2026-02-22  
목적: FE에서 상태 소스를 단일화하고, Phase 기반 UI 흐름을 고정한다.
Doc index: `docs/README.md`

## 1. FE State Principles

1. `gameState`는 화면 전환/매치 phase 표시 용도로 최소화한다.
2. progression 수치(티어/LP/매치수)는 `progressionStore`만 사용한다.
3. 실시간 가격은 `priceService.livePrice`만 사용한다.
4. 분석 결과는 API 응답을 page-level state에서 보관하고 child component에 전달한다.
5. 컴포넌트는 계산보다 렌더링 책임을 우선한다.

## 2. Core Stores (Target)

## 2.1 `progressionStore` (Single Source)

필드:
1. `lpTotal`
2. `matches`
3. `wins`, `losses`, `streak`
4. `agentMatchCounts`
5. `currentTier`, `tierLevel`
6. `unlockedSpecsByAgent`

액션:
1. `recordMatchResult(won, lpDelta, agentIds[])`

## 2.2 `priceService.livePrice`

형식:

```ts
type LivePriceMap = {
  BTC: { price: number; ts: number };
  ETH: { price: number; ts: number };
  SOL: { price: number; ts: number };
};
```

규칙:
1. Header/Chart/Terminal 동일 store 구독
2. 별도 setInterval 가격 sync 금지

## 2.3 `arenaPageState` (page local)

필드:
1. `matchId`
2. `draftSelection[]`
3. `analysisOutputs[]`
4. `aggregatePrediction`
5. `hypothesisInput`
6. `battleRuntime`
7. `resultPayload`

`battleRuntime` 구조:

```ts
type BattleRuntime = {
  sessionId: string | null;
  status: 'idle' | 'live' | 'ended';
  startedAt: number | null;
  endedAt: number | null;
  currentPrice: number | null;
  pnlPct: number;
  hitTP: boolean;
  hitSL: boolean;
  ticks: Array<{ ts: number; price: number }>;
};
```

## 3. Route-Level State Map

## 3.1 `/arena`

주요 컴포넌트:
1. `Lobby.svelte` (DRAFT selection)
2. `SquadConfig.svelte` (Draft confirm)
3. `ChartPanel.svelte` (price + drawing)
4. `HypothesisPanel.svelte`
5. `BattleStage.svelte`

phase별 UI:
1. DRAFT
- 8 agent 카드 표시
- 3개 선택
- 각 agent spec 선택
- weight 합계 100 검증

2. ANALYSIS
- API analyze 호출 진행 상태
- 에이전트별 factor/contribution 카드
- aggregate direction/confidence

3. HYPOTHESIS
- 유저 방향 선택(override 포함)
- entry/tp/sl/rr 입력
- Exit optimizer 후보 표기

4. BATTLE
- 실시간 가격 추적
- 포지션 손익/목표 도달 상태 표시

5. RESULT
- 승패 + LP 변화
- agent별 적중 여부
- spec unlock 알림

데이터 소스:
1. match lifecycle: `/api/arena/match/*`
2. progression: `progressionStore`
3. price: `priceService.livePrice`

## 3.2 `/terminal`

주요 컴포넌트:
1. `WarRoom.svelte`
2. chart 영역
3. Intel/Agent chat

규칙:
1. WarRoom은 scan 실행 트리거 + 결과 렌더링만 수행
2. indicator 계산은 서비스/BE 결과를 사용
3. Agent chat 입력창은 항상 visible이어야 함
4. 지표 상태바는 접기/끄기 가능해야 함

데이터 소스:
1. scan 결과: `scanService` 또는 `/api/market/snapshot` 기반
2. 가격: `priceService.livePrice`

## 3.3 `/oracle`

규칙:
1. `AGENT_POOL` 기준 8-agent 렌더링
2. 정렬 기준: `wilson`, `accuracy`, `sample`, `calibration`
3. 구형 AGDEFS 의존 금지

## 3.4 `/passport`

규칙:
1. tier/LP/metrics는 progression+passport API 기준으로 렌더링
2. 에이전트별 match count와 unlocked spec 상태 표시

## 4. Component Responsibility Split

## 4.1 Arena

1. `+page.svelte`
- phase routing
- API orchestration
- page-local aggregate state

2. `Lobby.svelte`
- agent/spec/weight 입력 UI
- 검증 실패 메시지 표기

3. `ChartPanel.svelte`
- 차트 렌더링/드로잉/price 표시
- 계산 로직 최소화

## 4.2 Terminal

1. `WarRoom.svelte`
- scan 탭 관리
- 시그널 리스트/선택/추적 UI

2. `TerminalChat.svelte`
- 에이전트 질의 UI
- 인텔 요약 텍스트 표시

## 5. Event Flow (FE)

## 5.1 Arena Main Flow

1. create match
2. submit draft
3. run analyze
4. submit hypothesis
5. poll/get result
6. apply progression update

## 5.2 WarRoom Scan Flow

1. user clicks scan
2. current pair/timeframe 기반 scan 요청
3. scan tab 누적 저장
4. selected signal track/quick trade 동작
5. intel panel에 요약 반영

## 6. UI Consistency Rules

1. 헤더 크기 증대는 유지하되 차트 본문 가시성 우선
2. 모바일은 chart-first 흐름 유지
3. 접기/펼치기 버튼은 항상 visible
4. 지표 라벨은 색상 + 텍스트 동시 표기
5. emoji 기반 의미 전달 최소화, 텍스트 우선

## 7. FE Migration Checklist

1. AGDEFS 소비부를 bridge 기반으로 우선 전환
2. `progressionStore` read-only 적용
3. Header/Chart/Terminal 가격 구독 단일화
4. Lobby/SquadConfig DraftSelection UI 재작성
5. Arena phase 화면을 API 응답 기반으로 연결
6. WarRoom 800라인 이하로 분해

## 8. FE Definition of Done

1. Arena 5-phase가 명확하게 구분되어 보인다.
2. Draft에서 3-agent/spec/weight(100) 검증이 동작한다.
3. 차트/헤더/터미널 가격이 동일하다.
4. Agent/Spec/Progression 수치가 페이지마다 일치한다.
5. 모바일에서 스캔/차트/입력이 막히지 않는다.

## 9. Terminal Scan + Intel State (세부)

## 9.1 Scan History State

CURRENT:
1. `WarRoom.scanTabs[]`가 스캔 히스토리 원본
2. `activeScanId`로 활성 히스토리 선택
3. `localStorage(stockclaw.warroom.scanstate.v1)`로 복원

TARGET:
1. `scanHistoryStore`를 분리하고 서버 동기화 상태를 포함
2. 상태 필드: `records[]`, `activeScanId`, `isHydrating`, `syncError`
3. optimistic append 후 서버 응답 ID로 reconcile

## 9.2 Intel Result State

CURRENT:
1. `/terminal/+page.svelte`의 `latestScan`이 단일 소스
2. `IntelPanel`은 `latestScan`을 표시만 수행

TARGET:
1. `intelStore.latestBrief` + `intelStore.history[]` 분리
2. `scanId` 기준으로 동일 스캔을 다시 열어도 동일 브리프 복원
3. `consensus/risk/setup/derivatives/flow` 블록을 구조화 데이터로 관리

## 9.3 Agent Chat State

CURRENT:
1. `chatMessages[]`는 page local
2. 텍스트 입력만 처리

TARGET:
1. `chatStore.messages[]`를 채널(`terminal`) 단위로 관리
2. 입력 payload: `text`, `mentions[]`, `attachments[]`, `context{pair,timeframe,scanId}`
3. 전송 상태: `pending/sent/failed`와 재시도 큐 보유

상세 플로우는 `docs/references/active/TERMINAL_SCAN_E2E_SPEC.md`를 따른다.
