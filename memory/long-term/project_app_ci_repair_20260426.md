---
name: App CI TypeScript 에러 전체 수리 (2026-04-26)
description: App CI 127 → 0 TypeScript 에러 수리. PR #293 오픈. merge conflict 아티팩트 19개 파일 수정.
type: project
---

# App CI TypeScript 에러 전체 수리

PR #291 머지 이후 main에 남아있던 merge conflict 아티팩트 제거. 127개 TS 에러 → 0.

**Why:** 3개 에이전트가 동시에 작업한 merge conflict 산물. 변수명 불일치, 중복 선언, 고아 코드가 산재.

**How to apply:** App CI 에러가 다시 나타나면 이 세션에서 수정한 패턴을 참고 (아래 파일 목록 확인).

## 브랜치 / 커밋

- 브랜치: `fix/app-ci-ts-errors`
- 커밋: `0575515d`
- PR: #293 (base: main, 오픈 상태)

## 수정된 파일 (19개)

| 파일 | 수정 내용 |
|------|-----------|
| `intel-policy/+server.ts` | `fetchJsonSafe` + `loadMacroOverview` 헬퍼 추가, `newsRes`→`newsData` 등 destructure 변수명 통일 |
| `TradeMode.svelte` | `(data as any).phases` 캐스트 (AlphaWorldModelResponse = Record<string,unknown>) |
| `planeClients.test.ts` | 중복 `perp` 제거 → `referenceStack` 교체, `fetchFactReferenceStackProxy` + `fetchFactMarketCapProxy` import 추가, `secondUrl`/`secondInit` 선언 추가 |
| `marketEvents.ts` | `enginePerp?.metrics?.funding_rate`, `enginePerp?.regime?.crowding` (옵셔널 체이닝) |
| `marketFlow.ts` | `enginePerp?.metrics?.funding_rate`, `enginePerp?.metrics?.long_short_ratio` |
| `pattern-seed/match/+server.ts` | 고아 `return json(payload)` 삭제 (이미 return된 코드 뒤에 있었음) |
| `CenterPanel.svelte` | PeekDrawer에 없는 props(`reviewCount`, `openTab`, `analyze`, `scan`, `judge`, `review`) 제거 |
| `TerminalLeftRail.svelte` | `coin.change24h` → `coin.preview?.change24h`, `coin.price` → `coin.preview?.price` |
| `TerminalCommandBar.svelte` | `canonicalChange24h` import 추가 |
| `terminalBackend.ts` | `AlphaWorldModelResponse`, `RecentCaptureSummary`, `ConfluenceHistoryEntry`, `TradeOutcomeResult` 타입 추가 |
| `terminalBackend.test.ts` | `(worldModel as any).phases` 캐스트 |
| `chartSeriesService.ts` | 중복 import 제거, 고아 `getChartSeries` 제거, `FAPI` 상수 + `parseKlines` 함수 추가 |
| `contracts/index.ts` | `SearchQuery*` 중복 export 블록 제거 |
| `rateLimit.ts` | `chartFeedLimiter`, `douniMessageLimiter` 추가 |
| `facts.ts` | `fetchFactPerpContextProxy` alias, `PerpContextPayload` 타입, `fetchFactMarketCapProxy` 스텁 추가 |
| `engine/[...path]/+server.ts` | `ENGINE_URL` import, `isBlockedPath`/`isAllowedPath` 스텁 추가 |
| `chart/klines/+server.ts` | `startTime` URL 파라미터 파싱 추가 |
| `seedSearch.ts` | `SearchCandidate` import 추가 |
| `peek/+page.svelte` | `.pair.replace('/', '')` 수정, `(analysisData as any).verdict` 캐스트 |

## 결과

```
COMPLETED 2913 FILES  0 ERRORS  32 WARNINGS (CSS unused selectors only)
```
