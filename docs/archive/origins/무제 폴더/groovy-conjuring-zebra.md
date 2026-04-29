# Slice A: Terminal Route Shell Decomposition

## Context

`src/routes/terminal/+page.svelte`가 3453줄 god file.
Foundation Refactor Plan (2026-03-20)의 Slice A: "Terminal 안정화 — controller 추출, 타이머/폴링/패널 로직 분리, UI 동작 유지".

**목표**: 3453줄 → ~800-1000줄 (coordinator + markup + CSS)로 축소.
**방법**: 5개 모듈을 `src/lib/terminal/`로 순차 추출, 각 단계마다 check+build 통과.

## Baseline (Before)

| 항목 | 값 |
|------|-----|
| terminal/+page.svelte | 3453줄 (script 1254, markup 527, CSS 1670) |
| IntelPanel.svelte | 2775줄 (이번 스코프 아님) |
| npm run check | 0 errors / 47 warnings |
| build terminal chunk | 149.34 kB |

## 추출 순서 (5 Steps)

### Step 1: GTM Analytics Helper → `src/lib/terminal/terminalAnalytics.ts`
- **대상**: gtmEvent 함수 + 관련 호출 패턴 (~12줄 정의)
- **내용**: `createTerminalGtmTracker(getViewport)` factory 함수
- **리스크**: LOW — 순수 함수, 의존성 없음
- **검증**: check + build

### Step 2: Ticker Service → `src/lib/terminal/tickerService.ts`
- **대상**: Fear/Greed + CoinGecko fetch, ticker 상태, segmentClass (~50줄)
- **내용**: `createTickerService()` factory → `{ state, fetch, destroy }`
- **내부 state는 Svelte 5 `$state` 사용** (기존 패턴: `alertEngine.ts` 참조)
- **리스크**: LOW — 읽기 전용 데이터, 외부 store 미사용
- **검증**: check + build + ticker 렌더링 확인

### Step 3: URL Param Parser → `src/lib/terminal/terminalUrlParams.ts`
- **대상**: onMount 내 copyTrade URL 파싱 블록 (~36줄)
- **내용**: `parseCopyTradeParams()` + `cleanCopyTradeParams()` 순수 함수
- **리스크**: LOW — fire-once, 반응성 없음
- **검증**: check + build + `?copyTrade=1` URL 테스트

### Step 4: Chat Controller → `src/lib/terminal/chatController.ts` ⚠️ 핵심
- **대상**: 채팅 상태/메시지/LLM API/오프라인 폴백/패턴스캔 (~400줄)
- **내용**: `createChatController(deps)` factory
  - deps: `{ getPair, getTimeframe, getLivePrices, gtmEvent, triggerPatternScan }`
  - 노출: `messages`, `isTyping`, `tradeReady`, `connectionStatus`, `activeTradeSetup`, `sendMessage()`, `handleScanComplete()`, `handleShowOnChart()`
- **scan coordinator (handleScanStart/Complete)**: route shell에 thin bridge(~15줄)로 잔류
- **decision rail 파생**: route shell에 `$derived()` 로 잔류 (~15줄)
- **리스크**: MEDIUM — `$state` 반응성 바인딩, chartRef 콜백 주입
- **검증**: check + build + 채팅 송수신 + 스캔→채팅 메시지 + 오프라인 폴백

### Step 5: Resize Controllers (Desktop/Tablet/Mobile) → 3 files
- `src/lib/terminal/desktopResizeController.ts` — 드래그/휠 리사이즈, attach/detachListeners
- `src/lib/terminal/tabletResizeController.ts` — 스플릿 드래그, 패널 리사이즈
- `src/lib/terminal/mobileResizeController.ts` — 포인터+터치 드래그
- **대상**: ~500줄 (상태 + 이벤트 핸들러)
- **기존 `terminalLayoutController.ts`의 순수 계산 함수에 위임** (이미 추출됨)
- **리스크**: MEDIUM — global event listener 생명주기, body style 변경
- **검증**: check + build + 3 viewport 모두 리사이즈 테스트

## 추출 후 예상

| 항목 | Before | After |
|------|--------|-------|
| Script | 1254줄 | ~300-350줄 |
| Markup | 527줄 | ~500줄 (변수명만 변경) |
| CSS | 1670줄 | 1670줄 (후속 작업으로 분리 가능) |
| **Total** | **3453줄** | **~800-1050줄** |

## 새 파일 구조

```
src/lib/terminal/
  scanCardMapper.ts              (기존, 변경 없음)
  terminalAnalytics.ts           (NEW - Step 1)
  tickerService.ts               (NEW - Step 2)
  terminalUrlParams.ts           (NEW - Step 3)
  chatController.ts              (NEW - Step 4)
  desktopResizeController.ts     (NEW - Step 5)
  tabletResizeController.ts      (NEW - Step 5)
  mobileResizeController.ts      (NEW - Step 5)
```

## 기존 재사용 모듈

- `src/components/terminal/terminalLayoutController.ts` — 순수 레이아웃 계산 (resize controller가 위임)
- `src/components/terminal/terminalHelpers.ts` — 채팅/에러/패턴 헬퍼 (chatController가 import)
- `src/lib/services/alertEngine.ts` — factory 패턴 참조 모델
- `src/lib/api/terminalApi.ts` — API fetch 래퍼

## 패턴 규칙

- **Factory function** (class X) — `createXxxController(deps)` 형태
- **Svelte 5 `$state`** for mutable state in controllers
- **Callback injection** for cross-boundary deps (chartRef 접근 등)
- **Global store는 건드리지 않음** — `gameState`, `priceStore` 그대로 유지
- **기존 타입 co-location** 유지 — 새 타입은 각 controller 파일에 정의

## 검증 체크리스트 (매 Step 후)

1. `npm run check` — 0 errors, 47 이하 warnings
2. `npm run build` — pass, terminal chunk 149 kB 이하
3. Desktop 3-panel 리사이즈 (드래그, 휠, 더블클릭 리셋)
4. Tablet 스플릿 리사이즈
5. Mobile 포인터/터치 드래그
6. 채팅 송수신 + 오프라인 폴백
7. 스캔 트리거 → 채팅 메시지 + 차트 오버레이
8. Ticker 세그먼트 렌더링
9. `?copyTrade=1` URL → 모달 오픈
10. Decision rail 라벨 상태 전환

## 커밋 전략

- Step별 1 atomic commit (총 5 commits)
- 각 커밋 시점에 check + build pass 보장
- 모든 완료 후 PR 생성
