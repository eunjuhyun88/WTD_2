# W-0353 — composite_score → IntelPanel + VerdictInbox 렌더

> Wave: 5 | Priority: P1 | Effort: M
> Charter: In-Scope (W-0352 API 위에 UI 레이어 — 신규 데이터 없음)
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: TBD

## Goal
IntelPanel에서 패턴을 composite_score 기준으로 보고, quality_grade 배지로 한눈에 비교할 수 있다.

## Scope
- 포함:
  - `TopPatternsPanel.svelte` 신규 — composite_score DESC 정렬 테이블
  - quality_grade 배지: S=emerald, A=blue, B=amber, C=gray
  - IntelPanel에 mount, collapsible (기본 expanded)
  - `app/src/lib/engine/cogochiTypes.ts` `TopPattern` 타입 추가
  - `app/src/lib/engine/research.ts` `fetchTopPatterns()` 추가
- 파일:
  - `app/src/lib/components/intel/TopPatternsPanel.svelte` (신규)
  - `app/src/lib/engine/cogochiTypes.ts` (TopPattern 타입 추가)
  - `app/src/lib/engine/research.ts` (fetchTopPatterns 추가)
  - `app/src/lib/components/intel/IntelPanel.svelte` (TopPatternsPanel mount)
  - `app/src/lib/components/intel/TopPatternsPanel.test.ts` (신규)
- API:
  - `GET /research/top-patterns?limit=20&min_grade=B` (W-0352 의존)

## Non-Goals
- VerdictInbox 직접 수정 — W-0346 scope
- composite_score 기준 alert/push notification — 별도 W-item
- 테이블 내 inline 필터링 UI — 추후 W-0358+

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| W-0352 API 미완성 시 블로킹 | 고 | 중 | mock fetchTopPatterns로 UI 독립 개발 가능 |
| IntelPanel 레이아웃 깨짐 (새 컴포넌트 추가) | 중 | 저 | collapsible 기본값 expanded, 높이 max-h 제한 |
| cogochiTypes.ts 타입 drift | 중 | 중 | Zod schema로 런타임 검증 (research.ts boundary) |

### Dependencies / Rollback / Files Touched
- **Dependencies**: W-0352 (`GET /research/top-patterns`) — 선행 필수
- **Rollback**: `IntelPanel.svelte`에서 `TopPatternsPanel` import 제거 1줄
- **Files Touched**:
  - 수정: `cogochiTypes.ts`, `research.ts`, `IntelPanel.svelte`
  - 신규: `TopPatternsPanel.svelte`, `TopPatternsPanel.test.ts`

## AI Researcher 관점

### Data Impact
- 읽기 전용 — W-0352 REST API 폴링
- 사용자가 볼 때마다 최신 composite_score 반영 (TTL=60s)

### Statistical Validation
- 테이블 정렬 정확성: vitest에서 mock 데이터 혼합 후 상위 row의 composite_score ≥ 다음 row 검증
- grade 배지 색상 4가지 모두 렌더 확인

### Failure Modes
- F1: API 없거나 500 → 빈 상태 표시 (에러 메시지 없이 "패턴 없음" 텍스트)
- F2: composite_score null → 정렬 시 하단으로 이동 (null-safe sort)
- F3: patterns 배열 20개 초과 응답 → limit=20 slice 클라이언트 방어

## Decisions
- [D-0353-01] quality_grade 배지 색상: S=emerald-500, A=blue-500, B=amber-500, C=gray-400 (Tailwind)
- [D-0353-02] collapsible 기본값 expanded — IntelPanel 최초 진입 시 즉시 가시성
- [D-0353-03] fetchTopPatterns는 SvelteKit load function이 아닌 클라이언트 사이드 fetch (반응형 polling)

## Open Questions
- [ ] [Q-0353-01] composite_score 소수점 몇 자리 표시? (2자리 vs. 3자리)
- [ ] [Q-0353-02] IntelPanel에서 TopPatternsPanel 위치: 최상단 vs. 기존 섹션 아래?
- [ ] [Q-0353-03] 테이블 컬럼 중 기본 노출 vs. 토글 컬럼 구분 필요한지?

## Implementation Plan
1. `cogochiTypes.ts`에 `TopPattern` interface + `TopPatternsResponse` interface 추가
2. `research.ts`에 `fetchTopPatterns(limit, minGrade)` 함수 추가 (Zod 검증 포함)
3. `TopPatternsPanel.svelte` 구현: fetch → 정렬 → 테이블 렌더, collapsible wrapper
4. grade 배지 컴포넌트 인라인 또는 별도 `GradeBadge.svelte` (기존 배지 패턴 미러링)
5. `IntelPanel.svelte`에 `TopPatternsPanel` mount (import + 최상단 or 지정 위치)
6. vitest: 정렬, 배지 색상 4종, 빈 상태, API 실패 시나리오

## Exit Criteria
- [ ] AC1: composite_score DESC 정렬 상위 20개 렌더 (vitest mock data 기반)
- [ ] AC2: S/A/B/C 배지 색상 구분 — 4개 vitest assertions (각 grade별 CSS class 확인)
- [ ] AC3: API 없거나 빈 배열 반환 시 에러 없이 빈 상태 처리
- [ ] AC4: vitest ≥ 3 PASS (신규 테스트 파일 기준)
- [ ] CI green (app vitest + svelte-check)
- [ ] PR merged + CURRENT.md SHA 업데이트
