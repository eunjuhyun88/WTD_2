# STOCKCLAW Clone Consolidation Audit (2026-03-06)

작성일: 2026-03-06  
대상: `/Users/ej/Downloads/maxidoge-clones/frontend`, `/Users/ej/Downloads/maxidoge-clones/backend`  
목적: `frontend/`와 `backend/`가 실제로 무엇인지 판별하고, 정본을 기준으로 어떤 파일을 가져오고 어떤 파일을 버릴지 결정한다.

---

## 1) 결론

현재 저장소는 `frontend = 화면`, `backend = 서버`로 분리된 구조가 아니다.

- `frontend/`와 `backend/`는 둘 다 **SvelteKit 풀스택 앱**이다.
- 둘 다 `src/routes`, `src/routes/api`, `src/lib/server`, `src/components`를 갖고 있다.
- 둘 다 같은 원격 저장소 `git@github.com:eunjuhyun88/Maxidoge.git`를 바라본다.
- 따라서 현재 구조는 "프론트/백엔드 분리"가 아니라 **같은 앱의 복제본 두 벌을 병렬로 수정한 상태**로 보는 것이 맞다.

정본 판정은 문서 기준으로 이미 내려져 있다.

- 루트 [`CLAUDE.md`](../CLAUDE.md)는 `frontend/`를 메인 코드베이스로 지정한다.
- [`README.md`](../README.md)와 [`docs/README.md`](./README.md)는 sibling clone을 비정본으로 간주한다.
- [`backend/CLAUDE.md`](/Users/ej/Downloads/maxidoge-clones/backend/CLAUDE.md)는 `backend/`가 deprecated이며 `frontend/`로 통합되었다고 명시한다.

따라서 **앞으로의 정본은 `frontend/` 하나로 고정**한다.

---

## 2) 실제 런타임 구조

현재 정본 `frontend/`에서의 실제 동작 경계는 아래와 같다.

| 경로 | 런타임 | 역할 |
| --- | --- | --- |
| `src/routes/**/*.svelte` | browser + SSR | 페이지 UI |
| `src/components/**/*.svelte` | browser + SSR | 화면 조각 |
| `src/routes/api/**/+server.ts` | server | HTTP API 엔드포인트 |
| `src/lib/server/**` | server only | DB, 외부 API, 스캔 엔진, LLM, 권한, rate limit |
| `src/lib/stores/**` | mostly browser | 화면 상태, hydration, optimistic UI |

예시 흐름:

1. [`src/routes/terminal/+page.svelte`](../src/routes/terminal/+page.svelte)가 터미널 화면을 렌더한다.
2. 이 화면은 `/api/chat/messages`, `/api/terminal/intel-policy`, `/api/terminal/opportunity-scan` 같은 API를 호출한다.
3. 각 API는 `+server.ts`에서 실행된다.
4. 서버 핸들러는 [`src/lib/server/db.ts`](../src/lib/server/db.ts), [`src/lib/server/scanEngine.ts`](../src/lib/server/scanEngine.ts), [`src/lib/server/llmService.ts`](../src/lib/server/llmService.ts) 같은 서버 모듈을 호출한다.
5. 결과를 JSON으로 다시 UI에 반환한다.

즉, `frontend/` 안에 이미 UI와 서버가 함께 있다. 별도의 "진짜 백엔드 전용 앱"이 따로 존재하는 구조가 아니다.

---

## 3) 확인 근거

### 3.1 Git / 저장소 근거

- `frontend/` git top-level: `/Users/ej/Downloads/maxidoge-clones/frontend`
- `backend/` git top-level: `/Users/ej/Downloads/maxidoge-clones/backend`
- 두 repo의 remote는 동일:
  - `git@github.com:eunjuhyun88/Maxidoge.git`
- 현재 브랜치:
  - `frontend`: `codex/terminal-uiux-gtm-wip`
  - `backend`: `feat/chart-trade-overlay`

이 조합은 "역할별 repo 분리"보다 "같은 원격의 복제 작업본 분기"에 가깝다.

### 3.2 디렉터리 근거

두 폴더 모두 아래 경계를 가진다.

- `src/routes/api`
- `src/lib/server`
- `src/routes/terminal`
- `src/components`

즉 이름과 다르게 둘 다 풀스택이다.

### 3.3 파일 비교 근거

비교 결과:

- `src` 공통 파일 368개 중 178개만 완전 동일
- `src/routes/api` 공통 파일 111개 중 54개만 완전 동일
- `src/lib/server` 공통 파일 60개 중 37개만 완전 동일

이 수치는 "한쪽은 프론트, 한쪽은 백엔드"가 아니라 "같은 앱이 서로 다른 방향으로 갈라짐"을 의미한다.

---

## 4) 정본 판정 근거

`frontend/`를 정본으로 유지해야 하는 이유:

1. 루트 문서가 이미 `frontend/`를 canonical로 선언했다.
2. `frontend/`에는 문서/게이트/가드가 더 많이 정리되어 있다.
3. `frontend/`에는 `backend/`에 없는 신규 모듈이 있다.
4. 서버 쪽에서도 `frontend/`가 더 최근 리팩터 상태를 반영한다.

`frontend/`에만 있는 대표 신규 파일:

- `src/lib/server/compositeDataFetchers.ts`
- `src/lib/server/dataFetchInfra.ts`
- `src/lib/server/profileProjection.ts`
- `src/lib/server/taskUtils.ts`
- `src/components/terminal/terminalViewModel.ts`
- `src/components/terminal/TerminalDesktopLayout.svelte`
- `src/components/terminal/TerminalTabletLayout.svelte`
- `src/components/terminal/TerminalMobileLayout.svelte`
- `src/components/arena/chart/chartDataRuntime.ts`

특히 서버 경계에서 `frontend/`는 다음 방향으로 더 앞서 있다.

- 공통 body parsing 강화
- idempotency 보강
- profile projection 동기화
- composite fetch infra 추출
- chart/terminal 분해 진행

---

## 5) `backend` 전용 파일 판단

`backend/`에만 있고 `frontend/`에는 없는 파일은 6개다.

| 파일 | 판단 | 이유 | 조치 |
| --- | --- | --- | --- |
| `src/components/arena-war/warMockData.ts` | 폐기 | mock prototype 데이터. 현행 구조와 분리된 레거시 | archive 후보 |
| `src/components/terminal/PredictPanel.svelte` | 수동 검토 후 폐기 가능성 높음 | 현행 `frontend`는 terminal panel을 재구성했고 Polymarket surface가 다른 컴포넌트로 분산됨 | copy/UI 문구만 확인 |
| `src/components/terminal/QuickTradePanel.svelte` | 수동 검토 후 폐기 가능성 높음 | quick trade surface가 store + Intel/terminal layout로 흡수됨 | UX 문구만 확인 |
| `src/components/terminal/ScanBriefCards.svelte` | 수동 검토 필요 | 카드 카피나 IA 아이디어는 재사용 가능하지만 현재 경로에서는 미사용 | 디자인 참조용 |
| `src/lib/engine/warroomScan.ts` | 폐기 | 파일 자체가 deprecated 주석을 갖고 있고 서버 `scanEngine.ts`가 대체 | 삭제/보관만 |
| `src/lib/stores/dbStore.ts` | 폐기 | localStorage DB CRUD 레이어. 현재 서버 정본 방향과 충돌 | 사용 금지 |

추가 근거:

- 위 파일명으로 import 검색 시 실사용 흔적이 사실상 없었다.
- `warroomScan.ts`는 파일 상단에서 직접 deprecated라고 밝힌다.
- `dbStore.ts`는 서버 권한 회수 방향과 정면 충돌한다.

따라서 `backend` 전용 파일은 **대부분 기능 이관 대상이 아니라 참조용 잔재**다.

---

## 6) 같은 경로인데 내용이 갈라진 파일

핵심 위험은 여기다. 같은 경로의 파일들이 절반 가까이 서로 다른 내용으로 유지되고 있다.

### 6.1 P0: 먼저 수동 3-way diff 해야 하는 서버/API 파일

이 파일들은 데이터 정합성, 보안, 권한, 서버 계약에 직접 영향을 준다.

| 파일 | 관찰 | 판정 |
| --- | --- | --- |
| `src/routes/api/copy-trades/publish/+server.ts` | `frontend`가 `clientMutationId`, `readJsonBodySafely`, `profileProjection` sync까지 반영 | `frontend` base 유지 |
| `src/routes/api/quick-trades/open/+server.ts` | 동일 책임이지만 구현 상태가 갈라짐 | `frontend` base 유지, `backend` delta 확인만 |
| `src/routes/api/quick-trades/[id]/close/+server.ts` | 정합성/close flow 민감 | `frontend` base 유지 |
| `src/routes/api/signals/track/+server.ts` | signal tracking 계약 경계 | `frontend` base 유지 |
| `src/routes/api/profile/+server.ts` | 프로필 authority 경계 | `frontend` 우선 |
| `src/routes/api/chat/messages/+server.ts` | guest/LLM/context/scan 연결부 | 수동 diff 필요 |
| `src/lib/server/requestGuards.ts` | `frontend`에 `readJsonBodySafely` 추가 | `frontend` 우선 |
| `src/lib/server/scanEngine.ts` | `frontend`가 composite infra 분해와 공통 유틸 이동을 반영 | `frontend` 우선 |
| `src/lib/server/marketSnapshotService.ts` | 시장 데이터 집계 핵심 | 수동 diff 필요 |
| `src/lib/server/db.ts` | connection/pool/security 경계 | `frontend` 우선, delta 검토 |

### 6.2 P1: 다음으로 비교할 서버/API 파일

| 파일 그룹 | 이유 |
| --- | --- |
| `src/routes/api/terminal/*` | intel-policy, scan, shadow 계층이 사용자 체감에 직접 영향 |
| `src/routes/api/market/*` | snapshot/flow/events/trending이 scan/policy의 입력값 |
| `src/routes/api/profile/passport/learning/*` | ML/learning pipeline drift 가능성 |
| `src/lib/server/llmService.ts`, `intelPolicyRuntime.ts`, `multiTimeframeContext.ts` | LLM 응답, 정책, 멀티 TF 컨텍스트의 핵심 |
| `src/lib/server/rateLimit.ts`, `distributedRateLimit.ts` | abuse guard 일관성 |

### 6.3 비교 우선순위 수치

변경량 기준으로 먼저 볼 파일:

- API:
  - `copy-trades/publish/+server.ts`
  - `quick-trades/[id]/close/+server.ts`
  - `profile/+server.ts`
  - `quick-trades/open/+server.ts`
  - `terminal/scan/+server.ts`
- Server:
  - `scanEngine.ts`
  - `marketSnapshotService.ts`
  - `requestGuards.ts`
  - `rateLimit.ts`
  - `llmService.ts`

---

## 7) 통합 원칙

이제부터의 통합 규칙은 아래로 고정한다.

1. **정본은 `frontend/` 단일**
   - 새로운 작업은 모두 `frontend/`에서만 한다.

2. **`backend/`는 읽기 전용 참조본**
   - 구현 작업 금지
   - 필요한 내용만 수동으로 가져온다.

3. **같은 경로 파일은 `frontend`를 base로 3-way diff**
   - `backend`를 덮어쓰는 방식 금지
   - `backend`의 고유 delta만 cherry-pick 성격으로 반영

4. **`backend` 전용 파일은 기본 폐기**
   - 직접 import 없이 남은 prototype은 archive 후보

5. **서버 정합성 관련 파일부터 우선**
   - UI보다 API와 `lib/server`를 먼저 통합

---

## 8) 실행 순서

### Step 1. `backend/` 동결

- 새 수정 금지
- 문서상 "reference-only"로 취급

### Step 2. P0 서버/API 비교

순서:

1. `requestGuards.ts`
2. `copy-trades/publish/+server.ts`
3. `quick-trades/open/+server.ts`
4. `quick-trades/[id]/close/+server.ts`
5. `signals/track/+server.ts`
6. `profile/+server.ts`
7. `scanEngine.ts`
8. `db.ts`

### Step 3. P1 운영 계층 비교

- `terminal/*`
- `market/*`
- `marketSnapshotService.ts`
- `llmService.ts`
- `intelPolicyRuntime.ts`

### Step 4. `backend` 전용 잔재 정리

- mock / dead UI / localStorage DB layer를 archive 목록으로 분류

### Step 5. 아카이브 또는 worktree 전환

- `backend/`를 계속 보존해야 하면 read-only archive
- 아니면 `git worktree` 기반으로 운영 방식을 전환

---

## 9) 완료 기준 (DoD)

아래를 만족하면 clone 통합이 끝난 것으로 본다.

1. 새 구현이 `backend/`에 더 이상 들어가지 않는다.
2. `frontend/`만 canonical이라는 문서/실행 규칙이 충돌 없이 유지된다.
3. P0 서버/API 파일의 수동 diff가 끝나고 필요한 delta만 `frontend/`에 반영된다.
4. `backend` 전용 dead file의 보존/폐기 판단이 끝난다.
5. 이후 작업 계획 문서가 `frontend` 기준 하나로만 작성된다.

---

## 10) 권장 다음 작업

바로 다음 배치는 아래가 적절하다.

1. `src/lib/server/requestGuards.ts`
2. `src/routes/api/copy-trades/publish/+server.ts`
3. `src/routes/api/quick-trades/open/+server.ts`
4. `src/routes/api/quick-trades/[id]/close/+server.ts`
5. `src/lib/server/scanEngine.ts`

이 순서가 가장 먼저 서버 정합성과 clone drift를 줄인다.
