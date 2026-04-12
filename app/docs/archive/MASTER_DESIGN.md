# STOCKCLAW v3 Refactor Master Design

작성일: 2026-02-22  
목표: 구현 전에 설계를 고정해 FE/BE 혼재 리팩토링을 방지한다.
Doc index: `docs/README.md`

## 1. Scope

이 문서는 v3 리팩토링의 상위 설계 문서다.

1. Shared 계약(도메인/타입/상태 규약)
2. Backend 설계(API/DB/데이터 파이프라인)
3. Frontend 설계(UI 상태머신/스토어 소비 규칙)
4. 트랙별 실행 순서와 머지 게이트

## 2. Current State Summary (As-Is)

1. 코어 일부(v3 5-Phase, 8-Agent engine, specs/constants, v3 SQL)는 이미 존재한다.
2. UI/스토어 다수는 구형 AGDEFS(7-Agent)와 분산 progression 규칙을 사용한다.
3. 가격 파이프라인이 다중 source(Header/Chart/Terminal)로 분산되어 표시 불일치 위험이 있다.
4. Arena/LIVE API는 v3 경로가 완성되지 않았고 legacy `/api/matches` 중심이다.

## 3. Design Principles

1. Single Source of Truth
- Agent: `src/lib/engine/agents.ts`
- Phase: `DRAFT/ANALYSIS/HYPOTHESIS/BATTLE/RESULT`
- Tier/LP: `src/lib/engine/constants.ts`

2. Contract First
- Shared 계약 확정 전 FE/BE 구현 변경 금지.

3. Track Isolation
- 한 커밋/PR에서 FE와 BE를 섞지 않는다.

4. Backward Compatibility
- 구형 호출은 adapter로 유지 후 단계적 제거.

5. Incremental Migration
- 화면 동작 유지 + 내부 교체 우선.

## 4. Target Architecture

## 4.1 Shared

책임:
1. Agent/Spec/Phase/Match 타입 계약
2. Progression 규칙 계약
3. Price event/store 계약

핵심 파일:
1. `src/lib/engine/types.ts`
2. `src/lib/engine/agents.ts`
3. `src/lib/engine/specs.ts`
4. `src/lib/engine/constants.ts`
5. `src/lib/stores/progressionStore.ts` (신규)
6. `src/lib/services/priceService.ts` (신규)

## 4.2 Backend

책임:
1. Arena match lifecycle API
2. Indicator/scan/agent pipeline 계산
3. DB persistence + progression update
4. 외부 데이터 수집 및 snapshot 저장
5. RAG memory 저장/검색

핵심 파일:
1. `src/routes/api/arena/**`
2. `src/routes/api/live/**`
3. `src/routes/api/market/**`
4. `src/lib/engine/agentPipeline.ts`
5. `src/lib/engine/indicators.ts`
6. `src/lib/engine/trend.ts`
7. `src/lib/engine/memory.ts`

## 4.3 Frontend

책임:
1. 5-Phase UI 렌더링
2. Draft(3-agent, spec, weight) UX
3. WarRoom/Terminal 가시성 개선
4. 단일 progression/price store 소비

핵심 파일:
1. `src/routes/arena/+page.svelte`
2. `src/components/arena/Lobby.svelte`
3. `src/components/arena/SquadConfig.svelte`
4. `src/components/terminal/WarRoom.svelte`
5. `src/components/layout/Header.svelte`
6. `src/components/arena/ChartPanel.svelte`
7. `src/routes/terminal/+page.svelte`

## 5. Execution Plan (Locked Order)

## Phase A: Structure Alignment (Shared + Partial FE)
1. AGDEFS bridge (`data/agents.ts`)를 AGENT_POOL 기반으로 전환
2. `progressionStore.ts` 신설 및 wallet/profile/agentData 위임
3. `priceService.ts` 신설 및 Header/Chart/Terminal 단일 구독 전환

완료 조건:
1. AGDEFS 표시 개수 8
2. 가격 표시 source 1개
3. LP/Tier/Matches 수치가 화면 간 동일

## Phase B: Indicator Extraction (BE + FE thin client)
1. `indicators.ts`/`trend.ts` 순수 함수화
2. scan orchestration을 서비스 계층으로 이동
3. WarRoom은 render/controller 역할만 유지

완료 조건:
1. WarRoom 컴포넌트 800라인 이하
2. 기존 스캔 결과 품질 회귀 없음

## Phase C: Agent Pipeline (BE)
1. `agentPipeline.ts` + 8개 scoring 모듈
2. spec weight 기반 scoring 합산
3. `exitOptimizer.ts` 연동

완료 조건:
1. 동일 agent, 다른 spec에서 결과 차이 발생 확인

## Phase D: Data Infrastructure (BE)
1. external API clients
2. snapshot collector route
3. proxy routes

완료 조건:
1. `indicator_series` 시계열 누적 확인

## Phase E: Draft UI v3 (FE)
1. Lobby/SquadConfig를 DraftSelection 기반으로 재작성
2. 8-agent 중 3개 선택 + weight 합 100 + spec 선택

완료 조건:
1. Draft payload에 `agentId/specId/weight` 포함

## Phase F: Match Engine API (BE)
1. `/api/arena/match/*` create/draft/analyze/hypothesis/result 구현
2. legacy `/api/matches` adapter 제공

완료 조건:
1. create -> draft -> analyze -> hypothesis -> result E2E 동작

## Phase G: RAG Memory (BE)
1. memory store/retrieve/augment 구현
2. agentPipeline에 memory context 주입

완료 조건:
1. 유사 시장 top-k 검색 + confidence 보정 로그 확인

## Phase H: Arena Phase UI Completion (FE)
1. ANALYSIS/HYPOTHESIS/BATTLE/RESULT 시각화 재구성
2. agent factors, confidence, thesis, exit 옵션 표시

완료 조건:
1. 5-Phase 전 구간 UX 완성

## 6. Branch and PR Policy

브랜치:
1. `codex/contract-*` — Shared 트랙
2. `codex/be-*` — BE 트랙
3. `codex/fe-*` — FE 트랙

규칙:
1. Shared 변경 먼저 merge
2. BE가 Shared를 따라간 뒤 merge
3. FE는 BE contract 확정 후 merge
4. FE/BE 혼합 PR 금지

## 7. Validation Gates

각 티켓 종료마다:
1. `vite build`
2. `svelte-check`
3. smoke flow 수동 테스트

통합 전:
1. Arena 5-Phase end-to-end
2. Terminal 가격 동기성
3. Oracle/Passport 통계 일관성

## 8. Open Risks and Mitigation

1. AGDEFS 제거 시 UI break
- 완화: bridge export 유지 + 내부만 AGENT_POOL 기반으로 교체

2. 가격 source 통합 중 깜빡임/지연
- 완화: `priceService`에 reconnect/backoff/buffer 적용

3. WarRoom 분해 시 결과 회귀
- 완화: scan fixture snapshot 테스트 도입

4. API 전환 중 legacy 클라이언트 충돌
- 완화: `/api/matches` adapter 유지 기간 명시

## 9. Definition of Done (Program-Level)

1. 전역 Agent 정의가 8-agent로 통일된다.
2. 전역 match phase가 5-phase로 통일된다.
3. Draft는 3-agent + spec + weight(100)로 동작한다.
4. Arena match API lifecycle이 서버에서 종결된다.
5. 가격 표시가 단일 스트림을 소비한다.
6. Spec/LP/Tier/Passport 지표가 동일 계약으로 계산된다.
