# STOCKCLAW 구조 정합성 감사서 (최신 기준 분리본)

작성일: 2026-02-22  
대상 코드베이스: `stockclaw-unified`  
목적: 최신 스펙 기준으로 현재 구현의 구조 불일치를 분리 정리

---

## 1) 기준 문서 (Latest Baseline)

아래 문서를 최신 기준선으로 사용했다.

1. `docs/STOCKCLAW_Final_Integrated_Spec_v1.md`
2. `docs/STOCKCLAW_FlowSpec_v2_0.md`
3. `docs/STOCKCLAW_UserJourney_v1.md`
4. `docs/terminal-ia-reset-v1.md`
5. `docs/STOCKCLAW_Implementation_Priority_v1.md`

---

## 2) 핵심 결론

현재 구조는 "문서상 최신 설계"와 "실행 코드"가 분리되어 있다.

1. 엔진 계층은 최신 스펙(8 Agent, Spec, 5-Phase 타입)을 일부 반영함.
2. UI/스토어/라우트는 구형 모델(7 Agent, 11-Phase, mock 중심) 의존이 큼.
3. 결과적으로 사용자 체감 이슈(가격 불일치, 흐름 중복, 화면 정보 혼선)가 구조적으로 재발하기 쉬움.

---

## 3) 불일치 매트릭스 (우선순위)

## P0-1. Agent 도메인 이중화 (가장 치명적)

- 스펙 기준: 8 Agent Pool (`STRUCTURE/VPA/ICT/DERIV/VALUATION/FLOW/SENTI/MACRO`)
- 실제:
  - 구형 7-Agent 정의 사용: `src/lib/data/agents.ts`
  - 엔진 8-Agent 정의 별도 존재: `src/lib/engine/agents.ts`
  - UI 주요 화면은 여전히 `AGDEFS` 의존 (`/arena`, `/terminal`, `/oracle`)
- 영향:
  - 같은 앱 내에서 에이전트 정의가 화면마다 다르게 보임
  - Spec 시스템, Oracle/Passport 통계 기준 불일치

## P0-2. Phase 모델 3중 분리

- 스펙 기준: Draft -> Analysis -> Hypothesis -> Battle -> Result
- 실제:
  - 엔진 타입: 5-Phase (`src/lib/engine/types.ts`)
  - 게임 루프/상태: 11+Phase (`src/lib/engine/phases.ts`, `src/lib/stores/gameState.ts`)
  - UI 조건문도 11-Phase에 맞춰 렌더링 (`src/routes/arena/+page.svelte`)
- 영향:
  - FlowSpec과 화면 이벤트가 1:1 매핑되지 않음
  - API/분석 타이밍 설계가 코드와 다르게 해석됨

## P0-3. Spec 해금 시스템 미연결

- 스펙 기준: `user_agent_progress.unlocked_specs` 기반 해금/선택
- 실제:
  - Spec 정의는 존재: `src/lib/engine/specs.ts`
  - 앱 런타임에서 실제 사용 경로 없음 (UI/스토어 import 부재)
  - 진행 로직은 match 수/레벨업 중심(`walletStore`, `agentData`)
- 영향:
  - "스펙 기반 성장"이 핵심인데 체감 기능으로 드러나지 않음

## P0-4. Arena API 계약 불일치

- 스펙 기준 API:
  - `/api/arena/match/create`
  - `/api/arena/match/:id/draft`
  - `/api/arena/match/:id/hypothesis`
  - `/api/live/sessions/*`
- 실제 API:
  - `/api/matches`
  - `/api/agents/stats`
  - `/api/profile/passport`
  - `/live` 라우트는 `/signals` 리다이렉트
- 영향:
  - 문서 기반 개발/테스트 시 endpoint 대응표가 깨짐

## P1-1. 스캔/분석 책임이 UI 컴포넌트에 과집중

- 스펙 기준: 분석 파이프라인은 서버 중심(Indicator/RAG/LLM/합산)
- 실제: `WarRoom.svelte`에서 스캔 실행, 지표 계산, 점수 합성, 신호 생성까지 수행
- 영향:
  - 컴포넌트 비대화, 테스트 난이도 증가
  - 서버-클라 역할 경계가 흐려짐

## P1-2. 가격 파이프라인 다중 소스 동시 갱신

- 실제 갱신 채널:
  - Header miniTicker
  - ChartPanel klines + miniTicker
  - Terminal interval sync
- 영향:
  - 헤더/차트/패널 가격 미세 불일치 발생
  - 디버깅 시 어느 소스가 최종값인지 추적이 어려움

## P1-3. Progression 계층 중복

- 스펙 기준: P0~P5 + LP + 해금의 단일 진행 축
- 실제:
  - `walletStore.phase`
  - `userProfileStore.tier` 별도 규칙
  - 에이전트 경험치는 `agentData` 별도 축
- 영향:
  - 유저 상태가 화면마다 다르게 보일 수 있음

## P2-1. Terminal IA 문서와 일부 계약 미일치

- 문서: 모바일 4탭(Chart/War Room/Intel/Position), 패널폭/접힘 영속화
- 실제:
  - 모바일 3탭
  - left/right panel width 및 collapse 상태 영속화 미구현
- 영향:
  - 기획/문서 기반 QA 시 불합격 항목 누적

## P2-2. Mock 데이터 잔존

- `src/lib/data/warroom.ts` 정적 시그널/헤드라인/커뮤니티 데이터가 핵심 패널에 잔존
- 영향:
  - 실시간/실데이터 기반 UX 의도와 괴리

---

## 4) 원인 요약

1. "신규 엔진"과 "기존 UI"가 병행 개발되며 통합 단계가 중간에 멈춤.
2. 라우트 단위 대형 파일(예: `ChartPanel`, `WarRoom`, `arena/+page`)이 책임을 과도하게 흡수.
3. 문서 버전은 최신이나, 코드 경계(API, 상태, 도메인 모델) 표준화가 미완료.

---

## 5) 최신버전 정렬 원칙 (결정사항)

아래 5가지를 단일 기준으로 고정해야 한다.

1. 에이전트 단일 모델: 8-Agent만 사용 (`AGDEFS` 단계적 제거)
2. 매치 단일 페이즈: 5-Phase를 정식 상태모델로 채택
3. Spec 단일 해금축: `user_agent_progress.unlocked_specs`를 진실원으로
4. Arena/LIVE API 단일 계약: FlowSpec v2.0 경로 네이밍으로 통일
5. 가격 단일 소스: 중앙 가격 스토어(WS 1개 ingest -> 전 패널 fan-out)

---

## 6) 실행 순서 (권장)

## Step 1 (P0): 모델 통합

1. `AGDEFS` 의존 컴포넌트를 엔진 8-Agent로 치환
2. `gameState.phase`를 5-Phase 호환 계층으로 정리

## Step 2 (P0): API 계약 정렬

1. `/api/arena/*`, `/api/live/*` route scaffold 추가
2. 기존 `/api/matches`는 adapter 계층으로 축소

## Step 3 (P1): Spec/Progression 연결

1. `SPEC_REGISTRY`를 Draft UI와 연결
2. `walletStore/userProfileStore/agentData`의 진행값 단일화

## Step 4 (P1): 가격/스캔 파이프라인 정리

1. 가격 업데이트 ingress를 1개로 고정
2. War Room 분석 로직을 서비스 계층으로 이동

## Step 5 (P2): IA 완성

1. 모바일 4탭 복구 여부 확정
2. 패널 상태 영속화 구현

---

## 7) 완료 기준 (DoD)

아래 항목을 모두 만족하면 "최신 버전 정합 완료"로 판단한다.

1. UI 전역에서 8-Agent 외 정의 사용 0건
2. Arena phase 분기에서 5-Phase 외 직접 분기 0건
3. Spec 해금/선택이 실제 Draft 결과에 반영됨
4. `/api/arena/*` + `/api/live/*` 기본 플로우 동작
5. 헤더/차트/터미널 가격 불일치 재현 불가
6. Terminal IA 문서 항목(상태/탭/영속화) 검수 통과

---

## 8) 참고 (현재 관찰된 고복잡도 파일)

복잡도 축소 우선 후보:

1. `src/components/arena/ChartPanel.svelte`
2. `src/components/terminal/WarRoom.svelte`
3. `src/routes/arena/+page.svelte`
4. `src/routes/terminal/+page.svelte`

