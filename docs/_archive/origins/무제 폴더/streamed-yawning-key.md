# Slice B: ChartPanel 분해 계획

## Context

`src/components/arena/ChartPanel.svelte`는 4003줄 (script 2397줄 + template 433줄 + CSS 173줄).
이전에 이미 순수 함수/타입 모듈이 준비되어 있지만 ChartPanel에 아직 연결되지 않은 상태:

### 이미 준비된 모듈 (미연결)
| 파일 | 줄 | 내용 |
|------|------|------|
| `src/lib/chart/chartCoordinates.ts` | 53 | formatPrice, formatCompact, clampRoundPrice, normalizeChartTime |
| `src/lib/chart/chartHelpers.ts` | 59 | clampToCanvas 등 |
| `src/lib/chart/chartIndicators.ts` | 102 | computeSMA, computeRSI, updateRSIIncremental, 상수 |
| `src/lib/chart/chartTradePlanner.ts` | 136 | trade plan 순수 함수 |
| `src/lib/chart/chartTypes.ts` | 196 | ChartContext, IndicatorSeries, DrawingItem 등 타입 |
| `src/components/arena/chart/chartDrawingEngine.ts` | 607 | 캔버스 렌더링 (CoordProvider 인터페이스) |
| `src/components/arena/chart/chartOverlayRenderer.ts` | 149 | 오버레이 오케스트레이션 |
| `src/components/arena/chart/chartDrawingSession.ts` | 140 | 드로잉 세션 상태 |

**총 이미 추출된 코드: 1,442줄** — ChartPanel에서 중복 코드를 제거하면 됨.

---

## 전략: "연결 + 중복 제거"

새 모듈을 만드는 것이 아니라, **이미 존재하는 모듈을 ChartPanel에 import하고 중복 함수를 삭제**하는 것이 핵심.

### Batch 1: 순수 함수 연결 (가장 안전)
1. `$lib/chart/chartCoordinates.ts`에서 `formatPrice`, `formatCompact`, `clampRoundPrice` import
2. `$lib/chart/chartIndicators.ts`에서 `computeSMA`, `computeRSI`, `updateRSIIncremental`, 상수 import
3. `$lib/chart/chartHelpers.ts`에서 `clampToCanvas` import
4. ChartPanel 내부의 동일한 함수 정의 삭제

**예상 감소**: ~80-100줄

### Batch 2: 타입 연결
1. `$lib/chart/chartTypes.ts`에서 `ChartContext`, `IndicatorSeries`, `DrawingItem`, `DrawingMode` 등 import
2. ChartPanel 내부의 중복 타입 정의 삭제

**예상 감소**: ~60-80줄

### Batch 3: Drawing Engine 연결
1. `chartDrawingEngine.ts`의 `CoordProvider` 인터페이스에 맞춰 ChartPanel에서 coord provider 객체 생성
2. `renderDrawings()`, `drawTradePreview()`, `drawAgentTradeOverlay()`, `drawPatternOverlays()` 를 engine 함수로 교체
3. ChartPanel 내부의 중복 렌더링 코드 삭제

**예상 감소**: ~400-500줄 (가장 큰 절감)

---

## 실행 순서

1. **Batch 1** — 순수 함수 import + 중복 제거
   - verify: `npm run check` + `npm run build`

2. **Batch 2** — 타입 import + 중복 제거
   - verify: `npm run check` + `npm run build`

3. **Batch 3** — Drawing Engine 연결 + 중복 렌더링 코드 제거
   - verify: `npm run check` + `npm run build`
   - commit

---

## 목표 결과

| 지표 | Before | After |
|------|--------|-------|
| ChartPanel.svelte | 4003줄 | ~3400줄 이하 |
| ChartPanel script | 2397줄 | ~1800줄 이하 |
| npm run check | 0 err / 47 warn | 0 err / ≤47 warn |
| npm run build | PASS | PASS |
| UI 동작 | — | 변경 없음 |

---

## 수정 대상 파일

| 파일 | 작업 |
|------|------|
| `src/components/arena/ChartPanel.svelte` | **EDIT** (import 추가, 중복 함수/타입 삭제) |

기존 `$lib/chart/` 및 `src/components/arena/chart/` 모듈은 변경 없음 (이미 준비됨).

---

## 리스크 & 대응

1. **함수 시그니처 불일치** — 추출된 모듈의 함수 시그니처가 ChartPanel 내부 버전과 다를 수 있음
   → 먼저 diff 확인 후 교체

2. **Drawing Engine의 CoordProvider** — ChartPanel의 `series`/`chart` ref를 클로저로 래핑해야 함
   → CoordProvider 객체를 생성하는 헬퍼 함수 추가

3. **Incremental RSI state** — `_rsiAvgGain`/`_rsiAvgLoss`가 `updateRSIIncremental`로 대체됨
   → RSIState 타입을 사용하여 상태 관리

---

## Verification

```bash
npm run check    # 0 errors, ≤47 warnings
npm run build    # PASS
wc -l src/components/arena/ChartPanel.svelte  # 감소 확인
```
