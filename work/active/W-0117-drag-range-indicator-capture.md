# W-0117 — 드래그 구간 선택 + 지표 자동 수집

## Status
`PLANNED` — 미착수

## Goal
차트에서 드래그로 구간을 선택하면 해당 범위의 OHLCV + 모든 활성 지표를 자동 수집해서
SaveStrip에 미리보기로 보여주고, 저장 시 전체 payload를 포함한다.

현재: 두 번 클릭 → `indicators: {}` 빈 payload 저장
목표: 드래그 → 지표 풀 슬라이스 저장

## Context
- `RangePrimitive.ts` — LWC 프리미티브, setRange(A, B)로 파란 사각형 렌더링 ✅
- `chartSaveMode.ts` — anchorA/B 상태, enterRangeMode/setAnchor/adjustAnchor/save ✅
- `chartViewportCapture.ts` — `slicePayloadToViewport(payload, t0, t1)` OHLCV+지표 슬라이싱 ✅ (미연결)
- `CanvasHost.svelte` — `chart.subscribeClick()` 클릭 앵커 설정 (드래그 미구현)
- `SaveStrip.svelte` — anchorA+B 완료 시 표시, `chartSaveMode.save({ ohlcvBars })` 호출
- **버그**: `chartSaveMode.save()`가 `indicators: {}`로 하드코딩 — slicePayloadToViewport 미호출

## Scope

### Slice A — 드래그 인터랙션 (CanvasHost.svelte)
- [ ] `chart.subscribeClick()` 핸들러 제거 (range mode 용)
- [ ] 차트 컨테이너에 native DOM 이벤트 등록:
  - `mousedown` → `chart.timeScale().coordinateToTime(e.offsetX)` → `chartSaveMode.setAnchor(t)`
  - `mousemove` (button held) → `adjustAnchor('B', t)` → RangePrimitive 실시간 업데이트
  - `mouseup` → anchorB 확정 (SaveStrip은 스토어 상태 기반으로 자동 표시)
  - `keydown Escape` → `exitRangeMode()`
- [ ] range mode가 아닐 때 pan/zoom 정상 동작 보장
- [ ] 커서: range mode → `crosshair`, 기본 → `default`

### Slice B — 지표 수집 (chartSaveMode.ts + ChartBoard.svelte + SaveStrip.svelte)
- [ ] `chartSaveMode.save()` 시그니처 확장:
  ```ts
  save(opts: {
    symbol: string;
    tf: string;
    ohlcvBars?: Bar[];
    payload?: ChartSeriesPayload;  // 추가
  })
  ```
- [ ] `payload` 있으면 `slicePayloadToViewport(payload, anchorStart, anchorEnd)` 호출
- [ ] 결과 `indicators` 슬라이스를 capture payload의 `snapshot.viewport.indicators`에 포함
- [ ] `ChartBoard.svelte` → `SaveStrip`에 `chartPayload` prop 패스다운
- [ ] `SaveStrip.svelte` → `chartSaveMode.save({ ..., payload: chartPayload })` 전달

### Slice C — SaveStrip 미리보기 (SaveStrip.svelte)
- [ ] 수집된 지표 목록 pill 표시: `EMA · BB · CVD · MACD · OI`
  - `chartPayload.indicators`의 non-empty 키를 기반으로 계산
- [ ] 구간 내 가격 통계:
  - `high` = 선택 범위 내 ohlcvBars 최고가
  - `low` = 선택 범위 내 ohlcvBars 최저가
  - `change%` = (close_last - open_first) / open_first * 100
- [ ] UI 배치: `[구간 레이블] [지표 pills] [H/L/변동률]` → `[메모]` → `[버튼]`

## Non-Goals
- 지표 선택 UI (어떤 지표를 수집할지 고를 수 없음 — 현재 활성 지표 전부 수집)
- 모바일 드래그 (터치 이벤트) — 별도 작업
- 유사 캡처 미리보기 — SaveSetupModal 기존 로직 유지

## Exit Criteria
- [ ] 차트에서 드래그하면 파란 사각형이 실시간으로 그려짐
- [ ] mouseup 후 SaveStrip에 구간 + 지표 이름 + H/L/변동률 표시됨
- [ ] 저장된 capture의 `snapshot.viewport.indicators`가 빈 객체가 아님
- [ ] Escape로 모드 취소 동작
- [ ] `/terminal`에서 기존 pan/zoom 인터랙션 무변경

## Key Files
| 파일 | 변경 |
|---|---|
| `app/src/components/terminal/chart/CanvasHost.svelte` | Slice A |
| `app/src/lib/stores/chartSaveMode.ts` | Slice B |
| `app/src/components/terminal/workspace/ChartBoard.svelte` | Slice B (prop 패스) |
| `app/src/components/terminal/workspace/SaveStrip.svelte` | Slice B + C |
| `app/src/lib/terminal/chartViewportCapture.ts` | 읽기 전용 (재사용) |

엔진 변경 없음. 앱 전용 4파일.

## Decisions
- `chart.subscribeClick()` 완전 제거하지 않고 range mode 시에만 disable (다른 기능에서 사용 가능성)
- drag 중 anchorA는 고정, anchorB만 live update — 드래그 시작점이 바뀌지 않도록
- `slicePayloadToViewport` 결과를 save 전 계산 (저장 시 payload가 null이면 indicators: {} fallback 유지)
