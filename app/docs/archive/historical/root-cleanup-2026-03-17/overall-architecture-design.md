# STOCKCLAW 전체 구조 설계 문서

Date: 2026-02-21  
Workspace: `/Users/ej/Downloads/stockclaw-unified`

## 1) 목적

이 문서는 현재 코드베이스 구조를 실제 파일 기준으로 정리하고, 다음 리팩토링의 목표 아키텍처를 정의한다.

핵심 목표:
- 대형 페이지 파일 분해(특히 Home/Arena/Terminal)
- PC/모바일 UI/UX 일관성 복원
- 스크롤/간격/반응형 레이아웃 충돌 제거
- 상태 저장(localStorage) + 서버 동기화 규칙 표준화

## 2) 현재 구조(As-Is)

### 2.1 기술 스택
- Svelte 5 + SvelteKit 2 + TypeScript + Vite
- 서버 API: SvelteKit `+server.ts` + `pg`
- 영속: PostgreSQL (마이그레이션 `db/migrations`, `supabase/migrations`)
- 클라이언트 상태: Svelte store + localStorage + API hydrate

### 2.2 디렉토리 책임
- `src/routes`: 페이지 및 API 라우트
- `src/components`: 화면 컴포넌트 (arena/terminal/shared/modals/layout/live)
- `src/lib/stores`: 도메인 상태 및 로컬 영속
- `src/lib/api`: 클라이언트 API 래퍼
- `src/lib/server`: DB/세션/인증 가드/검증 유틸
- `db/migrations`: Postgres schema migration

### 2.3 파일 복잡도(상위)
- `src/routes/arena/+page.svelte` (2208 lines)
- `src/routes/+page.svelte` (1161 lines)
- `src/routes/signals/+page.svelte` (968 lines)
- `src/components/modals/WalletModal.svelte` (866 lines)
- `src/components/arena/ChartPanel.svelte` (850 lines)
- `src/routes/terminal/+page.svelte` (672 lines)

### 2.4 런타임 흐름
1. `+layout.svelte`에서 전역 Header/Modal/Notification 렌더
2. 페이지 진입 시 `hydrateDomainStores()`로 서버 데이터 동기화 시도
3. 각 store는 localStorage 즉시 반영 + 서버 API 비동기 반영(optimistic)
4. 서버 API는 `getAuthUserFromCookies()` 인증 후 DB 쿼리 수행

## 3) 핵심 진단

### 3.1 레이아웃/스크롤 충돌
- 글로벌 `html, body { overflow: hidden; }` + 레이아웃 `#app`, `#main-content`도 `overflow: hidden`
- 페이지별로 자체 스크롤 컨테이너를 또 구성하여, PC/모바일에서 스크롤 축/높이 기준이 분산됨
- Home은 `homeEl` 스크롤 + `hero-left/right` sticky 조합으로 breakpoint별 간격/스크롤 불일치가 발생하기 쉬움

### 3.2 UI 책임 과집중
- Home/Arena/Terminal 페이지가 상태, 오케스트레이션, 뷰 렌더를 동시에 담당
- `ChartPanel`이 차트/WS/인디케이터/드로잉/TV모드까지 단일 컴포넌트에 집중

### 3.3 상태 계층 이중화 관리 비용
- localStorage와 서버 상태를 병행 사용하며, 도메인마다 hydrate/merge 규칙이 조금씩 다름
- 현재는 동작하나, 장기적으로 동기화 순서와 충돌 처리 규칙 문서화가 더 필요

### 3.4 API 계약 일관성 부족
- 인증/검증/에러 포맷은 전반적으로 개선됐지만, 스키마 검증 방식이 route별 수기 구현 중심
- 공통 에러 shape, 입력 검증 레이어 표준화 여지가 있음

## 4) 목표 아키텍처(To-Be)

### 4.1 레이어 원칙
- View Layer: 순수 렌더 + 사용자 이벤트 전달
- Page Orchestrator: 페이지 상태 조합, 도메인 액션 호출
- Domain Services: 시뮬레이션/거래/시그널/프로필 비즈니스 로직
- Infrastructure: API client, storage adapter, auth/session, DB repository

### 4.2 목표 폴더 구조(안)
```txt
src/
  features/
    home/
      components/
      sections/
      orchestrator/
      model/
    arena/
      components/
      orchestrator/
      services/
    terminal/
      components/
      orchestrator/
      services/
  shared/
    ui/
    layout/
    api/
    storage/
    types/
```

기존 코드를 한 번에 이동하지 않고, 신규 파일부터 위 구조로 생성 후 점진 이전한다.

## 5) Home UI/UX 리팩토링 설계

### 5.1 목표
- PC/모바일 모두 동일한 정보 구조를 유지하되, 상호작용 방식만 분기
- 스크롤 축은 “페이지 1개”를 기본으로 통일
- 클릭 시 상세 정보가 예측 가능한 위치에 열리도록 설계

### 5.2 PC 설계
- Hero를 3영역(Left copy / Center divider / Right feature list)으로 유지
- Right feature list 내부 독립 스크롤 제거, 페이지 스크롤로 통합
- sticky는 Header만 유지, Hero 내부 sticky 최소화
- 섹션 간 vertical rhythm(공통 간격 토큰) 도입

### 5.3 모바일 설계
- Feature 카드는 accordion 패턴으로 전환
- 카드 클릭 시 “해당 카드 바로 아래” 상세가 확장되도록 고정
- 좌/우 분할 레이아웃 제거, 단일 컬럼 흐름으로 재배치
- CTA/Quick nav는 sticky 하단 버튼 대신 섹션 내 명시적 버튼으로 단순화

### 5.4 스크롤 정책
- 전역: body 스크롤 허용
- 레이아웃: 페이지 컨테이너 `min-height: 100dvh`, 불필요한 `overflow: hidden` 제거
- 예외적으로 내부 스크롤이 필요한 경우(채팅/긴 리스트)만 컴포넌트 단위로 제한

## 6) 상태/동기화 설계

### 6.1 공통 저장 어댑터
`shared/storage`에 공통 API를 둔다.
- `load(key, schemaVersion)`
- `save(key, data)`
- `remove(key)`
- `migrate(version)`

### 6.2 동기화 규칙 표준화
- 최초 진입: localStorage 즉시 렌더 → 서버 hydrate → merge
- merge 우선순위: 서버 ID 기반 최신 레코드 우선, 로컬 임시 ID(`tmp-`)는 보존 후 치환
- 실패 처리: API 실패 시 local optimistic state 유지 + 재시도 큐

## 7) API/DB 설계 방향

### 7.1 API
- route별 수기 검증을 `schema validator`(예: Zod)로 통일
- 에러 응답 표준:
```json
{ "error": { "code": "...", "message": "...", "details": {} } }
```

### 7.2 DB
- 현재 테이블(`users`, `sessions`, `matches`, `quick_trades`, `tracked_signals`, `user_preferences`, `user_ui_state` 등)을 기준으로 유지
- 쓰기 경로는 activity/audit 테이블(`activity_events`, `signal_actions`)에 선택적 기록
- 인덱스/제약은 migration 기준 유지, 신규 기능만 추가 migration으로 확장

## 8) 단계별 실행 계획

### Phase 1: Layout Stabilization
- 전역 overflow 정책 정리
- Home/Terminal/Settings 스크롤 컨테이너 단순화
- Header 높이/콘텐츠 영역 계산을 CSS 토큰화

### Phase 2: Home 분해
- `src/routes/+page.svelte`를 섹션 컴포넌트로 분할
- PC/모바일 인터랙션 분리(accordion 포함)
- Intersection/scroll effect 유틸 공통화

### Phase 3: Arena/Chart 분해
- Arena 오케스트레이션 서비스 추출
- ChartPanel의 WS/indicator/drawing/TV 모드 분리

### Phase 4: State/API 표준화
- storage adapter 도입
- API 요청/응답 스키마 검증 통일
- 에러 포맷 및 로깅 규격화

### Phase 5: 테스트 베이스라인
- timeframe/session/storage migration 단위 테스트
- 핵심 화면(홈/터미널/아레나) 회귀 체크 시나리오 자동화

## 9) 완료 기준(DoD)
- `npm run check` 통과
- Home/Terminal/Arena의 PC/모바일 스크롤 충돌 재현 불가
- 모바일 Feature 클릭 시 상세가 카드 하단에서 일관되게 열림
- 상태 hydrate 후 중복/유실 없는지 확인(quick trade/signal/match/profile)
- 인증 세션/지갑 플로우 회귀 없음

## 10) 리스크 및 완화
- 리스크: 기존 애니메이션/스타일 회귀
- 완화: Home 리팩토링을 기능 플래그 또는 작은 PR 단위로 분할

- 리스크: optimistic update와 서버 데이터 충돌
- 완화: `tmp-*` ID 치환 규칙과 merge 우선순위를 공통 유틸로 강제

- 리스크: 대형 파일 분해 중 이벤트 누락
- 완화: 분해 전 인터랙션 체크리스트 작성 후 단계별 snapshot 검증

---

이 문서는 현재 코드베이스의 실제 구조를 기준으로 작성되었으며, 다음 개발 라운드에서 “Layout Stabilization → Home 분해”를 첫 우선순위로 권장한다.
