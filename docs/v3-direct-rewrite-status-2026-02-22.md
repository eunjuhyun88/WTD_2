# STOCKCLAW v3 Direct Rewrite Status (2026-02-22)

## Scope
- Arena page: 11-phase 분기 제거, 5-phase(`DRAFT → ANALYSIS → HYPOTHESIS → BATTLE → RESULT`) 기준으로 전환
- WarRoom: 컴포넌트 내부 스캔 로직 분리 + 구형 에이전트 참조 교체
- Oracle: `AGDEFS` 의존 제거 + 통계 산식 교체
- `gameState`: Phase 타입 자체 교체
- `walletStore + agentData`: 진행 로직 공통 규칙으로 통합

## Applied Changes

### 1) Phase Model (Core)
- `src/lib/stores/gameState.ts`
  - `Phase` 타입을 5-phase로 교체
  - 기본/복원 phase를 `DRAFT`로 통일
- `src/lib/engine/phases.ts`
  - 5-phase 순서/라벨/지속시간으로 재정의
- `src/lib/engine/gameLoop.ts`
  - 5-phase 전환 로직으로 변경
  - `startAnalysisFromDraft()` 추가

### 2) Arena Rewrite
- `src/routes/arena/+page.svelte`
  - phase init switch를 5-phase로 재작성
  - `onSquadDeploy` 이후 `DRAFT → ANALYSIS` 직접 진입
  - `HYPOTHESIS` 제출 시 `pos` 동기화
  - 결과 확정 시 `walletStore.recordMatch`, `agentData.recordAgentMatch` 연동
- `src/components/arena/ChartPanel.svelte`
  - phase 상태 표기를 5-phase 기준으로 교체
- `src/components/arena/BattleStage.svelte`
  - phase 조건식을 5-phase 기준으로 교체
- `src/components/layout/BottomBar.svelte`
  - phase fallback을 `PHASE_LABELS.DRAFT`로 교체

### 3) WarRoom Refactor
- `src/lib/engine/warroomScan.ts` (new)
  - 스캔 계산/합성 로직 분리
  - v3 agent set 기준(`STRUCTURE/FLOW/DERIV/SENTI/MACRO`)으로 스캔 결과 생성
- `src/components/terminal/WarRoom.svelte`
  - 스캔 계산 로직 제거, `runWarRoomScan()` 호출형으로 단순화
- `src/lib/data/warroom.ts`
  - preset 신호의 `guardian` 참조를 `macro`로 교체

### 4) Oracle Rewrite
- `src/routes/oracle/+page.svelte`
  - `AGDEFS` import 제거 (`AGENT_POOL` 기반 계산)
  - 지표를 `raw accuracy` 중심에서 `Wilson score + calibration + CI` 중심으로 변경
  - 정렬 옵션 재구성 (`WILSON/ACCURACY/SAMPLE/CALIBRATION`)

### 5) Progression Unification
- `src/lib/stores/progressionRules.ts` (new)
  - lifecycle phase 계산 규칙 공통화
  - agent level/xp 계산 규칙 공통화
- `src/lib/stores/walletStore.ts`
  - phase 계산을 공통 규칙으로 교체
- `src/lib/stores/agentData.ts`
  - `recordAgentMatch()` 추가
  - match 기반 level/xp 재계산 공통 규칙 적용

## Verification Status
- 로컬 실행 검증 미완료 (현재 환경: `node/npm/pnpm/bun` 미설치)
- 정적 코드 변경만 완료

## Follow-up Needed
1. `node` 설치 후 `svelte-check`/build 실행
2. Arena의 잔존 구형 UI 블록(`preview/compare/verdict` 오버레이) 정리 여부 확정
3. AGDEFS 데이터 소스를 `AGENT_POOL` 단일화할지(현재 일부 화면은 구형 AGDEFS 유지) 결정
