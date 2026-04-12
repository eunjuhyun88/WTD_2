# STOCKCLAW P0 정렬 체크리스트 (Latest Baseline)

작성일: 2026-02-22  
기준 문서:
1. `docs/STOCKCLAW_Final_Integrated_Spec_v1.md`
2. `docs/STOCKCLAW_FlowSpec_v2_0.md`
3. `docs/STOCKCLAW_UserJourney_v1.md`
4. `docs/terminal-ia-reset-v1.md`
5. `docs/structure-mismatch-audit-latest.md`

---

## 0) 목표

P0 범위에서 아래 4가지를 먼저 맞춘다.

1. Agent 모델 단일화 (8-Agent)
2. Phase 모델 단일화 (5-Phase)
3. Spec 해금 연결 (Draft 반영)
4. Arena/LIVE API 계약 스캐폴딩 정렬

---

## 1) P0-A Agent 모델 단일화

## 작업

- [ ] `src/lib/data/agents.ts`의 구형 7-Agent 의존 제거 계획 확정
- [ ] `src/lib/engine/agents.ts`를 UI 단일 소스로 승격
- [ ] `AGDEFS` 참조 파일 전수 치환 대상 확정
- [ ] UI에서 사용하는 `id/name/icon/color/role` 필드 호환 어댑터 정의
- [ ] `commander/scanner/guardian` 구형 역할 처리 방안 확정
- [ ] `/arena`, `/terminal`, `/oracle`에서 동일 Agent 풀 렌더링 확인

## 점검 파일

- `src/lib/data/agents.ts`
- `src/lib/engine/agents.ts`
- `src/routes/arena/+page.svelte`
- `src/components/arena/Lobby.svelte`
- `src/components/arena/SquadConfig.svelte`
- `src/routes/terminal/+page.svelte`
- `src/components/terminal/WarRoom.svelte`
- `src/routes/oracle/+page.svelte`
- `src/lib/stores/agentData.ts`

## 완료 기준

- [ ] 런타임에서 `AGDEFS` import 0건
- [ ] 화면별 Agent 수/이름/역할 불일치 0건

---

## 2) P0-B Phase 모델 단일화

## 작업

- [ ] 표준 매치 Phase를 `DRAFT/ANALYSIS/HYPOTHESIS/BATTLE/RESULT`로 고정
- [ ] 기존 11+ 내부 phase를 transition/internal status로 격리
- [ ] UI 분기 로직을 표준 Phase 기준으로 정리
- [ ] `gameState.phase`와 엔진 타입 간 매핑 제거
- [ ] 배틀/결과 이벤트 타이밍을 FlowSpec 단계와 일치시킴

## 점검 파일

- `src/lib/engine/types.ts`
- `src/lib/engine/phases.ts`
- `src/lib/engine/gameLoop.ts`
- `src/lib/stores/gameState.ts`
- `src/routes/arena/+page.svelte`
- `src/components/arena/BattleStage.svelte`
- `src/components/arena/ChartPanel.svelte`

## 완료 기준

- [ ] UI에서 11-phase 직접 조건분기 제거
- [ ] 라우트/스토어/엔진 간 phase 타입 충돌 0건

---

## 3) P0-C Spec 해금 연결

## 작업

- [ ] Draft UI에서 Agent별 Spec 목록 표시 연결
- [ ] 해금 상태 계산을 `unlocked_specs` 기준으로 연결
- [ ] 사용자 선택 spec이 match payload에 포함되도록 연결
- [ ] 결과 반영 시 Spec 해금 갱신 훅 추가
- [ ] Spec 미해금 시 fallback/base 처리 일관화

## 점검 파일

- `src/lib/engine/specs.ts`
- `src/lib/engine/types.ts`
- `src/components/arena/Lobby.svelte`
- `src/components/arena/SquadConfig.svelte`
- `src/routes/arena/+page.svelte`
- `src/lib/stores/agentData.ts`
- `src/routes/api/matches/+server.ts`

## 완료 기준

- [ ] 스펙 선택 UI 표시됨
- [ ] 제출 payload에 `specId` 포함됨
- [ ] 해금 전/후 표시 상태 전환 확인됨

---

## 4) P0-D Arena/LIVE API 계약 정렬 (스캐폴딩 우선)

## 작업

- [ ] `/api/arena/match/create` 엔드포인트 스캐폴딩
- [ ] `/api/arena/match/:id/draft` 엔드포인트 스캐폴딩
- [ ] `/api/arena/match/:id/hypothesis` 엔드포인트 스캐폴딩
- [ ] `/api/live/sessions/:matchId/start` 엔드포인트 스캐폴딩
- [ ] `/api/live/sessions/:id/stream` SSE 스캐폴딩
- [ ] `/api/live/sessions/active` 목록 엔드포인트 스캐폴딩
- [ ] 기존 `/api/matches`와 병행 운영 어댑터 규칙 명시

## 점검 파일

- `src/routes/api/matches/+server.ts`
- `src/routes/api/` 하위 신규 arena/live 라우트 파일
- `src/routes/live/+page.ts`
- `src/lib/server/db.ts`

## 완료 기준

- [ ] FlowSpec 핵심 경로 200/4xx/5xx 기본 응답 구조 마련
- [ ] 클라이언트에서 신규 경로 호출 가능한 최소 연결 확보

---

## 5) 검증 체크리스트

- [ ] Agent 기준선 점검: 8-Agent만 노출
- [ ] Phase 기준선 점검: 5-Phase만 외부 노출
- [ ] Spec 선택/해금 점검: Draft -> Result 반영 확인
- [ ] API 계약 점검: arena/live 스캐폴딩 응답 확인
- [ ] 터미널 가격 표시 점검: 헤더/차트 값 동기 기준 문서화

---

## 6) 리스크

1. 기존 UI가 구형 ID에 강결합되어 초기 치환 비용이 큼
2. phase 단일화 시 애니메이션/이펙트 로직 회귀 가능성
3. API 경로 전환 중 프런트 호출 혼용 이슈 가능성

---

## 7) 작업 순서 제안 (실행용)

1. Agent 단일화
2. Phase 단일화
3. Spec 연결
4. API 스캐폴딩
5. 회귀 점검 및 문서 동기화

