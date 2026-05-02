# W-0391-A — 차트 정확성 (RSI/MACD/BB + CrossHair)

> Wave: 5 | Priority: P1 | Effort: M (3-4d)
> Charter: In-Scope
> Status: 🟡 Design Draft
> Parent: W-0391 #937
> Created: 2026-05-03
> Absorbs: W-0212 (crosshair), W-0374 chart accuracy

## Goal

RSI/MACD/BB 인디케이터 빈 라인 0% + CrossHair 멀티-페인 동기화 ≤16ms.

## Gap (실측)

| 버그 | 파일 | 원인 |
|---|---|---|
| RSI 빈 라인 | `ChartBoard.svelte:1244` | `ind.rsi14` = undefined (`/chart/klines` indicators 필드 `{}` 반환) |
| MACD 빈 라인 | `ChartBoard.svelte:1222` | `ind.macd` = undefined |
| BB 빈 라인 | `ChartBoard.svelte` | 동일 |
| CrossHair 미동기화 | `MultiPaneChart.svelte::syncCrosshair` | rAF throttle 미적용 |
| PaneInfoBar 정적 | `PaneInfoBar.svelte` | crosshair 위치 추적 미구현 |

## Scope

### Phase A1 — Indicator 데이터 수리 (2d)
파일:
- `engine/api/routes/chart.py` — `/chart/klines` 응답에 indicators 필드 계산 추가
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` — ind 필드 소비 코드 수정

계산 방식: 클라이언트 OHLCV 기반 client-side 계산 (번들 경량 우선)
- RSI14: 표준 Wilder smoothing
- MACD(12,26,9): EMA 기반
- BB(20, 2σ): SMA + stddev
- 서버 사이드는 Phase 2 (backtest 정확도 필요 시)

### Phase A2 — CrossHair + PaneInfoBar (1d)
파일:
- `app/src/lib/hubs/terminal/workspace/MultiPaneChart.svelte`
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte`
- (신규) `app/src/lib/hubs/terminal/workspace/paneCurrentValues.ts`

구현:
- `subscribeCrosshairMove` → rAF throttle 16ms
- 멀티 페인 sync: 메인 차트 crosshair → 서브 페인 x축 동기화
- PaneInfoBar: crosshair 위치 기준 OHLCV + 인디케이터 값 표시 (현재 바 값)

## Non-Goals

- 서버사이드 실시간 indicator push (W-0392 이후)
- Pine Script 연동
- ChartBoard.svelte 2557줄 분해 (W-0392)

## Exit Criteria

- [ ] AC1: vitest — RSI/MACD/BB 계산 9 cases 100% (알려진 OHLCV 데이터로 검증)
- [ ] AC2: CrossHair 이벤트 핸들러 rAF wrapper 존재 확인 (grep)
- [ ] AC3: PaneInfoBar crosshair 값 변경 e2e 1 case PASS
- [ ] AC4: `grep -E "ind\.(rsi14|macd|bb)" app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` → 빈 fallback 없는 실제 값 참조
- [ ] AC5: svelte-check errors 증가 0
- [ ] CI green

## Files Touched (stream-exclusive)

```
engine/api/routes/chart.py
app/src/lib/hubs/terminal/workspace/ChartBoard.svelte  ← 핵심 지뢰 (2557줄)
app/src/lib/hubs/terminal/workspace/MultiPaneChart.svelte
app/src/lib/hubs/terminal/workspace/PaneInfoBar.svelte  (신규 또는 기존)
app/src/lib/hubs/terminal/workspace/paneCurrentValues.ts  (신규)
engine/tests/test_chart_indicators.py  (신규)
app/src/lib/hubs/terminal/workspace/chartIndicatorCalc.ts  (신규)
```

⚠️ ChartBoard.svelte는 이 스트림만 접근. 다른 스트림과 충돌 위험 최고.
