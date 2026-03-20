# STOCKCLAW Frontend / Backend Boundary Map (2026-03-06)

작성일: 2026-03-06  
대상 정본: `/Users/ej/Downloads/maxidoge-clones/frontend`  
목적: `frontend/` 정본 내부에서 무엇이 프론트이고 무엇이 백엔드인지, 그리고 어디가 경계 침범 후보인지 분류한다.

---

## 1) 한 줄 결론

`frontend/`는 하나의 SvelteKit 풀스택 앱이다.  
따라서 분리는 폴더 이름이 아니라 **런타임 책임 기준**으로 봐야 한다.

---

## 2) 정식 경계

### 2.1 프론트엔드

아래는 기본적으로 프론트엔드 영역이다.

| 경로 | 역할 |
| --- | --- |
| `src/routes/**/*.svelte` | 페이지 UI, 레이아웃, 브라우저 상호작용 |
| `src/components/**/*.svelte` | UI 컴포넌트 |
| `src/lib/stores/**` | 클라이언트 상태, hydration 캐시, optimistic UI |
| `src/lib/api/**` | 브라우저에서 호출하는 API wrapper |
| `src/lib/services/**` | 브라우저 런타임 서비스 |
| `src/lib/chart/**`, `src/lib/utils/**` | UI/차트/일반 유틸 |

대표 예시:

- [`src/routes/terminal/+page.svelte`](../src/routes/terminal/+page.svelte)
- [`src/components/terminal/IntelPanel.svelte`](../src/components/terminal/IntelPanel.svelte)
- [`src/components/terminal/WarRoom.svelte`](../src/components/terminal/WarRoom.svelte)
- [`src/components/arena/ChartPanel.svelte`](../src/components/arena/ChartPanel.svelte)
- [`src/lib/stores/quickTradeStore.ts`](../src/lib/stores/quickTradeStore.ts)

### 2.2 백엔드

아래는 기본적으로 백엔드 영역이다.

| 경로 | 역할 |
| --- | --- |
| `src/routes/api/**/+server.ts` | HTTP API 엔드포인트 |
| `src/lib/server/**` | DB, 인증, rate limit, 시장 데이터, 스캔 엔진, LLM, projection |

대표 예시:

- [`src/routes/api/chat/messages/+server.ts`](../src/routes/api/chat/messages/+server.ts)
- [`src/routes/api/quick-trades/open/+server.ts`](../src/routes/api/quick-trades/open/+server.ts)
- [`src/routes/api/signals/track/+server.ts`](../src/routes/api/signals/track/+server.ts)
- [`src/lib/server/db.ts`](../src/lib/server/db.ts)
- [`src/lib/server/scanEngine.ts`](../src/lib/server/scanEngine.ts)
- [`src/lib/server/requestGuards.ts`](../src/lib/server/requestGuards.ts)

---

## 3) 좋은 신호

현재 코드에서 확인된 긍정적인 경계 신호:

1. 브라우저 코드에서 `$lib/server`를 직접 import하는 흔적은 찾지 못했다.
2. DB 접근은 `src/lib/server/db.ts`로 모여 있다.
3. 인증은 대부분 `getAuthUserFromCookies(...)` 패턴으로 `routes/api`에서 처리한다.
4. 최근 리팩터 파일들은 `requestGuards`, `authSecurity`, `profileProjection` 같은 서버 전용 유틸을 경계 안에서 재사용하려는 방향이다.

즉, **물리적 폴더 구조는 혼란스럽지만 런타임 import 경계는 완전히 무너진 상태는 아니다.**

---

## 4) 경계 침범 후보

문제는 import 위반보다 **책임 과다**에 있다. 아래는 당장 리팩터 대상으로 보는 것이 맞는 지점들이다.

### 4.1 Store가 서버 진실을 너무 많이 흉내내는 경우

#### `src/lib/stores/userProfileStore.ts`

- [`src/lib/stores/userProfileStore.ts`](../src/lib/stores/userProfileStore.ts)
- local cache + hydrate + client-derived metrics + optimistic mutation이 한 파일에 섞여 있다.
- `localStorage` 로드/저장:
  - [`src/lib/stores/userProfileStore.ts#L68`](../src/lib/stores/userProfileStore.ts#L68)
  - [`src/lib/stores/userProfileStore.ts#L89`](../src/lib/stores/userProfileStore.ts#L89)
- 서버 hydration:
  - [`src/lib/stores/userProfileStore.ts#L117`](../src/lib/stores/userProfileStore.ts#L117)
- match history를 보고 secondary metric을 클라이언트에서 재계산:
  - [`src/lib/stores/userProfileStore.ts#L158`](../src/lib/stores/userProfileStore.ts#L158)
- `incrementTrackedSignals()` 같은 UI 주도 optimistic 통계 변경:
  - [`src/lib/stores/userProfileStore.ts#L196`](../src/lib/stores/userProfileStore.ts#L196)

판정:
- 프론트엔드 파일은 맞다.
- 하지만 **서버 projection cache**만 해야 하는데, 아직 일부 authority를 들고 있다.

#### `src/lib/stores/agentData.ts`

- [`src/lib/stores/agentData.ts`](../src/lib/stores/agentData.ts)
- localStorage persistence와 서버 fan-out sync를 동시에 가진다.
- local persistence:
  - [`src/lib/stores/agentData.ts#L106`](../src/lib/stores/agentData.ts#L106)
- 전체 payload fan-out sync:
  - [`src/lib/stores/agentData.ts#L129`](../src/lib/stores/agentData.ts#L129)
  - [`src/lib/stores/agentData.ts#L203`](../src/lib/stores/agentData.ts#L203)

판정:
- 프론트엔드 파일이다.
- 하지만 서버 truth를 캐시하는 수준을 넘어서 **클라이언트가 통계 체계를 사실상 운영**하고 있다.

#### `src/lib/stores/quickTradeStore.ts`

- [`src/lib/stores/quickTradeStore.ts`](../src/lib/stores/quickTradeStore.ts)
- optimistic open/close, local reconcile, hydration merge를 모두 가진다.
- hydration merge:
  - [`src/lib/stores/quickTradeStore.ts#L189`](../src/lib/stores/quickTradeStore.ts#L189)
- fuzzy duplicate reconcile:
  - [`src/lib/stores/quickTradeStore.ts#L109`](../src/lib/stores/quickTradeStore.ts#L109)
  - [`src/lib/stores/quickTradeStore.ts#L122`](../src/lib/stores/quickTradeStore.ts#L122)
- optimistic open + server sync:
  - [`src/lib/stores/quickTradeStore.ts#L252`](../src/lib/stores/quickTradeStore.ts#L252)

판정:
- 프론트엔드 파일이다.
- 하지만 authority를 너무 많이 들고 있어서 **백엔드 정합성 문제의 영향을 직접 받는 경계 파일**이다.

#### `src/lib/stores/trackedSignalStore.ts`

- [`src/lib/stores/trackedSignalStore.ts`](../src/lib/stores/trackedSignalStore.ts)
- optimistic local staging과 server reconciliation이 섞여 있다.
- hydration merge:
  - [`src/lib/stores/trackedSignalStore.ts#L193`](../src/lib/stores/trackedSignalStore.ts#L193)
- `clientMutationId`를 local id로 보내는 부분:
  - [`src/lib/stores/trackedSignalStore.ts#L255`](../src/lib/stores/trackedSignalStore.ts#L255)

판정:
- 프론트엔드 파일이다.
- 하지만 서버 idempotency 계약과 강결합된 **경계 파일**이다.

### 4.2 컴포넌트가 API orchestration을 과하게 가지는 경우

#### `src/components/terminal/IntelPanel.svelte`

- [`src/components/terminal/IntelPanel.svelte`](../src/components/terminal/IntelPanel.svelte)
- 이 컴포넌트는 단순 뷰가 아니라 API orchestration layer처럼 동작한다.
- 직접 호출하는 API 예시:
  - `/api/market/alerts/onchain`
  - `/api/market/news`
  - `/api/terminal/intel-policy`
  - `/api/terminal/intel-agent-shadow`
  - `/api/market/events`
  - `/api/market/flow`
  - `/api/market/trending`
  - `/api/terminal/opportunity-scan`
- 대표 위치:
  - [`src/components/terminal/IntelPanel.svelte#L385`](../src/components/terminal/IntelPanel.svelte#L385)
  - [`src/components/terminal/IntelPanel.svelte#L465`](../src/components/terminal/IntelPanel.svelte#L465)
  - [`src/components/terminal/IntelPanel.svelte#L535`](../src/components/terminal/IntelPanel.svelte#L535)
  - [`src/components/terminal/IntelPanel.svelte#L590`](../src/components/terminal/IntelPanel.svelte#L590)

판정:
- 프론트엔드 컴포넌트다.
- 하지만 현재는 **뷰 + polling + fetch orchestration + sync loop**를 동시에 가진다.

#### `src/components/terminal/WarRoom.svelte`

- [`src/components/terminal/WarRoom.svelte`](../src/components/terminal/WarRoom.svelte)
- local scan tab persistence, server history merge, derivative fetch, scan execution orchestration을 동시에 가진다.
- localStorage persistence:
  - [`src/components/terminal/WarRoom.svelte#L208`](../src/components/terminal/WarRoom.svelte#L208)
- server scan/history hydrate:
  - [`src/components/terminal/WarRoom.svelte#L151`](../src/components/terminal/WarRoom.svelte#L151)
  - [`src/components/terminal/WarRoom.svelte#L648`](../src/components/terminal/WarRoom.svelte#L648)
- scan run orchestration:
  - [`src/components/terminal/WarRoom.svelte#L438`](../src/components/terminal/WarRoom.svelte#L438)

판정:
- 프론트엔드 컴포넌트다.
- 하지만 **도메인 컨트롤러 성격**이 너무 강하다.

#### `src/routes/terminal/+page.svelte`

- [`src/routes/terminal/+page.svelte`](../src/routes/terminal/+page.svelte)
- 페이지가 레이아웃, 브레이크포인트, fetch, chat send, GTM, density persistence를 함께 가진다.
- 대표 위치:
  - density localStorage: [`src/routes/terminal/+page.svelte#L123`](../src/routes/terminal/+page.svelte#L123)
  - pair bootstrap fetch: [`src/routes/terminal/+page.svelte#L379`](../src/routes/terminal/+page.svelte#L379)
  - chat POST: [`src/routes/terminal/+page.svelte#L793`](../src/routes/terminal/+page.svelte#L793)

판정:
- 프론트엔드 페이지다.
- 하지만 현재는 **shell + layout controller + action dispatcher**를 같이 가진다.

### 4.3 백엔드 안에서 계약이 불균일한 경우

#### `src/routes/api/**/+server.ts`

백엔드 파일이지만 아직 내부 일관성이 완전하지 않다.

- 좋은 예:
  - [`src/routes/api/quick-trades/open/+server.ts`](../src/routes/api/quick-trades/open/+server.ts)
  - `runIpRateLimitGuard`, `readJsonBodySafely`를 사용한다.

- 아직 정리 필요한 예:
  - [`src/routes/api/ui-state/+server.ts#L70`](../src/routes/api/ui-state/+server.ts#L70)
  - [`src/routes/api/arena/analyze/+server.ts#L17`](../src/routes/api/arena/analyze/+server.ts#L17)
  - [`src/routes/api/matches/+server.ts#L227`](../src/routes/api/matches/+server.ts#L227)
  - 아직 `request.json()` 직접 사용이 남아 있다.

판정:
- 백엔드 경계 안에 있긴 하다.
- 하지만 **입력 검증과 body size guard 표준화가 덜 됐다.**

---

## 5) 분류표

### 5.1 프론트엔드로 봐야 하는 것

| 파일/영역 | 분류 | 이유 |
| --- | --- | --- |
| `src/routes/**/*.svelte` | 프론트 | 페이지 렌더링 |
| `src/components/**/*.svelte` | 프론트 | UI 조합 |
| `src/lib/stores/**` | 프론트 | 브라우저 상태와 hydration cache |
| `src/lib/api/**` | 프론트 | 서버 API wrapper |
| `src/lib/chart/**` | 프론트 | 차트 표현/계산 유틸 |

### 5.2 백엔드로 봐야 하는 것

| 파일/영역 | 분류 | 이유 |
| --- | --- | --- |
| `src/routes/api/**/+server.ts` | 백엔드 | HTTP 요청 처리 |
| `src/lib/server/db.ts` | 백엔드 | DB pool/transaction |
| `src/lib/server/authGuard.ts` | 백엔드 | 인증 |
| `src/lib/server/authSecurity.ts` | 백엔드 | abuse guard |
| `src/lib/server/requestGuards.ts` | 백엔드 | body parsing / request guard |
| `src/lib/server/scanEngine.ts` | 백엔드 | 스캔 엔진 |
| `src/lib/server/marketSnapshotService.ts` | 백엔드 | 시장 데이터 집계 |
| `src/lib/server/llmService.ts` | 백엔드 | LLM 호출 |

### 5.3 경계 침범 후보로 분류해야 하는 것

| 파일 | 현재 성격 | 침범 이유 |
| --- | --- | --- |
| `src/lib/stores/userProfileStore.ts` | 프론트 store | 서버 projection + local truth + client-derived metrics 혼합 |
| `src/lib/stores/agentData.ts` | 프론트 store | local DB 역할 + 서버 sync fan-out |
| `src/lib/stores/quickTradeStore.ts` | 프론트 store | optimistic mutation + id reconciliation 과다 |
| `src/lib/stores/trackedSignalStore.ts` | 프론트 store | local staging + mutation id coupling |
| `src/components/terminal/IntelPanel.svelte` | 프론트 component | 뷰가 아니라 fetch/orchestrator 역할 과다 |
| `src/components/terminal/WarRoom.svelte` | 프론트 component | 화면 + persistence + scan control 혼합 |
| `src/routes/terminal/+page.svelte` | 프론트 page | shell/layout/action dispatch 혼합 |
| 여러 `src/routes/api/*` | 백엔드 handler | `request.json()` 직접 사용으로 계약 일관성 부족 |

---

## 6) 리팩터 기준

이 문서를 기준으로 앞으로는 아래 규칙으로 정리한다.

1. `src/routes/api/**/+server.ts`와 `src/lib/server/**`만 서버 진실을 가진다.
2. `src/lib/stores/**`는 server projection cache + optimistic UI까지만 허용한다.
3. 대형 컴포넌트는 직접 다수 API를 호출하지 말고 view-model 또는 query scheduler를 둔다.
4. 서버 mutation 엔드포인트는 `requestGuards` + `authSecurity` 표준을 따른다.
5. 클라이언트 localStorage는 UX 캐시로만 쓰고 authority로 쓰지 않는다.

---

## 7) 우선 정리 순서

1. [`src/lib/stores/userProfileStore.ts`](../src/lib/stores/userProfileStore.ts)
2. [`src/lib/stores/agentData.ts`](../src/lib/stores/agentData.ts)
3. [`src/lib/stores/quickTradeStore.ts`](../src/lib/stores/quickTradeStore.ts)
4. [`src/lib/stores/trackedSignalStore.ts`](../src/lib/stores/trackedSignalStore.ts)
5. [`src/components/terminal/IntelPanel.svelte`](../src/components/terminal/IntelPanel.svelte)
6. [`src/components/terminal/WarRoom.svelte`](../src/components/terminal/WarRoom.svelte)
7. `request.json()` 직접 호출이 남아 있는 `src/routes/api/*`

이 순서가 경계 정리 효과가 가장 크다.
