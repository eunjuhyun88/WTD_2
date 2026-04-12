# Refactor Issue Drafts (GitHub)

아래 이슈 템플릿은 `README`의 Execution Tickets를 GitHub Issue 형식으로 옮긴 초안입니다.

---

## 1) [P0] Timeframe 도메인 표준화 및 매핑 유틸 통합

**Labels**: `refactor`, `tech-debt`, `priority:high`, `area:domain`, `area:api`

### Description
코드 전반에 `1h/4h`와 `1H/4H` 표기가 혼재되어 Binance/Coinalyze interval 매핑이 불안정합니다. timeframe 표현을 단일 표준으로 통합하고, 변환 로직을 공통 유틸로 중앙화합니다.

### Scope
- `src/lib/stores/gameState.ts`
- `src/lib/api/binance.ts`
- `src/lib/api/coinalyze.ts`
- `src/components/arena/SquadConfig.svelte`
- `src/components/terminal/WarRoom.svelte`

### Checklist
- [ ] Timeframe canonical type 정의
- [ ] UI 표기값 ↔ API interval 변환 유틸 추가
- [ ] 기존 하드코딩 매핑 제거/대체
- [ ] Pair/timeframe 전환 시 요청 파라미터 회귀 확인

### Acceptance Criteria
- pair/timeframe 변경 시 Binance/Coinalyze 요청 interval이 항상 일관됨
- timeframe 관련 fallback(`4hour`)에 의존하는 케이스가 제거됨

---

## 2) [P0] Auth Session 검증 강화 (쿠키 포맷 의존 제거)

**Labels**: `security`, `backend`, `priority:high`, `area:auth`

### Description
현재 세션 체크 로직이 쿠키 형식만 맞으면 인증된 것으로 처리될 여지가 있습니다. 최소한의 세션 유효성 검증을 추가합니다.

### Scope
- `src/routes/api/auth/session/+server.ts`
- `src/routes/api/auth/register/+server.ts`

### Checklist
- [ ] 세션 쿠키 파싱 실패/비정상 포맷 방어
- [ ] userId 조회 기반 최소 검증 추가
- [ ] 인증 실패 응답 포맷 정리

### Acceptance Criteria
- 임의 문자열 쿠키로 `authenticated: true`가 반환되지 않음
- 비정상 세션 입력에 일관된 실패 응답 제공

---

## 3) [P0] Settings Reset localStorage 키 동기화

**Labels**: `bug`, `frontend`, `priority:high`, `area:state`

### Description
설정 페이지의 reset 로직과 실제 store 저장 키가 일치하지 않아 일부 데이터가 초기화되지 않습니다.

### Scope
- `src/routes/settings/+page.svelte`
- `src/lib/stores/*.ts`

### Checklist
- [ ] store별 storage key 인벤토리 작성
- [ ] reset 대상 키를 실제 사용 키와 일치시킴
- [ ] reset 후 초기 상태 검증 시나리오 추가

### Acceptance Criteria
- Reset 실행 시 주요 persisted 데이터가 문서대로 초기화됨

---

## 4) [P1] 공통 Storage Adapter 도입

**Labels**: `refactor`, `tech-debt`, `priority:medium`, `area:state`

### Description
여러 store에서 localStorage 접근 코드가 중복되어 예외 처리/파싱 로직이 분산되어 있습니다. 공통 adapter를 도입해 로딩/저장/삭제를 일관화합니다.

### Scope
- `src/lib/stores/` (공통 유틸 신규 + 기존 store 적용)

### Checklist
- [ ] `load/save/remove` 공통 유틸 구현
- [ ] JSON parse 실패 처리 일관화
- [ ] debounce 저장 패턴 재사용 가능화

### Acceptance Criteria
- store별 localStorage 직접 접근 코드가 유의미하게 감소
- 파싱 실패 시 앱이 안전하게 fallback

---

## 5) [P1] Storage Key 상수화 + 스키마 버전 마이그레이션

**Labels**: `refactor`, `tech-debt`, `priority:medium`, `area:state`

### Description
스토리지 키와 구조가 파일별로 분산되어 변경 시 회귀 위험이 큽니다. key 상수 모듈과 schema version 기반 마이그레이션을 도입합니다.

### Scope
- `src/lib/stores/` 전반

### Checklist
- [ ] key 상수 파일 추가
- [ ] `schemaVersion` 필드 도입
- [ ] 구버전 데이터 마이그레이션 루틴 작성

### Acceptance Criteria
- 구버전 persisted 데이터도 안전하게 로드됨
- 키 변경 시 단일 위치만 수정하면 반영 가능

---

## 6) [P2] ChartPanel 책임 분리 (data/ws/indicator/drawing)

**Labels**: `refactor`, `frontend`, `priority:medium`, `area:chart`

### Description
`ChartPanel`에 데이터 fetch, websocket, 지표 계산, 드로잉/UI 제어가 집중되어 유지보수성이 낮습니다. 기능 단위로 분리합니다.

### Scope
- `src/components/arena/ChartPanel.svelte`
- `src/lib/` 신규 모듈(예: chart data/indicator/drawing)

### Checklist
- [ ] 데이터 fetch/ws 로직 분리
- [ ] 지표 계산 함수 모듈화
- [ ] 드로잉/상호작용 로직 분리
- [ ] 기존 UI 동작 회귀 테스트

### Acceptance Criteria
- `ChartPanel.svelte` 라인 수 및 책임 축소
- 기능 회귀 없이 동일 UX 유지

---

## 7) [P2] Arena 페이지 오케스트레이션 로직 분리

**Labels**: `refactor`, `frontend`, `priority:medium`, `area:arena`

### Description
`arena/+page.svelte`가 phase 진행, replay, feed, UI 상태를 동시에 관리해 복잡도가 매우 높습니다. 서비스/엔진 레이어로 분리합니다.

### Scope
- `src/routes/arena/+page.svelte`
- `src/lib/engine/` 신규/확장 모듈

### Checklist
- [ ] phase orchestration 로직 분리
- [ ] replay 처리 분리
- [ ] feed 업데이트 책임 분리

### Acceptance Criteria
- 페이지 컴포넌트는 상태 바인딩/뷰 렌더 중심으로 단순화
- phase 전환 동작 회귀 없음

---

## 8) [P3] API Request/Response 스키마 검증 및 에러 표준화

**Labels**: `backend`, `refactor`, `priority:medium`, `area:api`

### Description
API 핸들러별 입력 검증/에러 응답 형식이 제각각입니다. 스키마 검증과 표준 에러 포맷을 도입합니다.

### Scope
- `src/routes/api/auth/*`
- `src/routes/api/matches/+server.ts`
- `src/routes/api/coinalyze/+server.ts`

### Checklist
- [ ] 요청 파라미터 검증 추가
- [ ] 공통 에러 응답 형식 정의
- [ ] 4xx/5xx 경계 재정의

### Acceptance Criteria
- 잘못된 요청에 일관된 4xx 응답
- 클라이언트가 에러 케이스를 예측 가능

---

## 9) [P3] In-memory 저장소 의존 분리 인터페이스 도입

**Labels**: `backend`, `refactor`, `priority:medium`, `area:data`

### Description
auth/matches API가 in-memory 저장소에 직접 결합되어 있습니다. 저장 인터페이스를 추출해 영속 DB 전환을 준비합니다.

### Scope
- `src/routes/api/auth/register/+server.ts`
- `src/routes/api/matches/+server.ts`

### Checklist
- [ ] 저장소 인터페이스 정의
- [ ] 핸들러에서 구현체 직접 참조 제거
- [ ] 메모리 구현체는 기본 어댑터로 유지

### Acceptance Criteria
- 핸들러가 저장 구현 디테일과 느슨하게 결합
- 후속 DB 교체 시 핸들러 수정 최소화

---

## 10) [P4] 핵심 회귀 테스트 추가 (domain/session/storage)

**Labels**: `test`, `quality`, `priority:medium`

### Description
회귀가 잦은 핵심 경로에 자동 테스트가 필요합니다. timeframe/session/storage 중심 최소 테스트를 추가합니다.

### Scope
- `src/lib/api/*`
- `src/lib/stores/*`
- `src/routes/api/*` 관련 테스트

### Checklist
- [ ] timeframe mapping 테스트
- [ ] session parsing 테스트
- [ ] storage migration/reset 테스트

### Acceptance Criteria
- 핵심 회귀 구간이 CI에서 자동 검증됨

---

## 11) [P4] Indicator/Scoring 계산 테스트 보강

**Labels**: `test`, `quality`, `priority:medium`, `area:engine`

### Description
지표 계산과 스코어 계산은 기능 영향도가 높아 변경 시 리스크가 큽니다. fixture 기반 테스트를 추가합니다.

### Scope
- `src/lib/engine/scoring.ts`
- indicator 관련 모듈(분리 후 경로 반영)

### Checklist
- [ ] scoring 경계값 테스트
- [ ] indicator 계산 fixture 테스트
- [ ] 결과 포맷/정밀도 테스트

### Acceptance Criteria
- 계산 로직 변경 시 테스트로 즉시 영향 탐지 가능

---

## Suggested Milestones

- `M1 Stabilize (Week 1)`: #1 #2 #3
- `M2 State Foundation (Week 2)`: #4 #5
- `M3 Decompose UI (Week 3-4)`: #6 #7
- `M4 API Hardening (Week 5)`: #8 #9
- `M5 Quality Gate (Week 6)`: #10 #11
