# Lab Redesign — Chart-First (TradingView × Binance × ChartGame)

## Context

현재 Lab은 전략 빌더(좌) + 결과(우) + 사이클바(하)로 구성됨. 숫자 중심이고 차트가 없다.
ChartGame(chartgame.com) 스타일의 인터랙티브 차트 + 주문 시스템을 Lab에 통합한다.
TradingView(차트 중심) + Binance Futures(주문 패널) + ChartGame(바 하나씩 공개) 세 가지의 최선을 합친 설계.

## 핵심 원칙

1. **차트가 70%** — 차트가 메인. 나머지는 차트를 보조하는 패널
2. **2모드** — 자동 백테스트 / 수동 차트 연습을 같은 차트에서
3. **30초 안에 첫 결과** — 프리셋 선택 → 사이클 선택 → ▶ → 차트에 트레이드 표시
4. **조건 바꾸고 → 돌리고 → 차트에서 비교** — 이 루프가 중독성

## 레이아웃

```
┌─ TOOLBAR ──────────────────────────────────────────────────────────────┐
│ [전략▼] CVD Rev v4  │  [사이클▼] 2022 Bear  │  [자동│수동]  │  4H  │  ▶ │
└────────────────────────────────────────────────────────────────────────┘
┌─ CHART (좌, 65%) ──────────────────────┐┌─ PANEL (우, 35%) ──────────┐
│                                         ││                            │
│  캔들차트 (lightweight-charts v5)        ││ [전략] [결과] [주문] [트레이드]│
│  + 볼륨 (하단 pane)                     ││                            │
│  + 지표 오버레이 (RSI/CVD/BB 토글)       ││  --- 자동모드 ---            │
│  + 진입▲ / 청산● 마커                   ││  [전략] = StrategyBuilder   │
│  + SL 수평선(빨강) / TP 수평선(초록)     ││  [결과] = ResultPanel       │
│  + Trailing stop 점선                   ││                            │
│                                         ││  --- 수동모드 ---            │
│                                         ││  [주문] = OrderPanel        │
│                                         ││  [트레이드] = 체결 목록      │
│                                         ││                            │
└─────────────────────────────────────────┘└────────────────────────────┘
┌─ POSITION BAR (하) ────────────────────────────────────────────────────┐
│ 자동: 127건 │ Win 61% │ Sharpe 1.4 │ PnL +42% │ ◀ 23/127 ▶            │
│ 수동: LONG 63,200 │ PnL +2.1% │ SL 62,800 │ TP 65,500 │ [Close]       │
└────────────────────────────────────────────────────────────────────────┘
```

### 모바일 (≤768px)
차트 풀너비 → 포지션바 → 패널(탭) 스택

## Toolbar 상세

- **전략 드롭다운**: 내 전략 목록 + [새 전략] + [프리셋에서]
- **사이클 드롭다운**: 체크박스 리스트 (복수 선택)
- **자동/수동 토글**: 모드 전환
- **간격**: 1H / 4H / 1D
- **▶ 실행**: 자동모드=백테스트 실행, 수동모드=[Next Bar]로 변환

## 자동 모드

### 실행 후 차트
- kline 위에 진입/청산 마커 + SL/TP 수평선 오버레이
- ▲ 초록 = Long 진입, ▼ 빨강 = Short 진입
- ● 초록 = TP 히트, ● 빨강 = SL 히트
- ─ ─ 수평선 = SL/TP 레벨
- 우측 패널 [결과] 탭 자동 활성
- **트레이드 클릭 → 차트가 해당 시점으로 스크롤**

## 수동 모드 (ChartGame)

- [Next Bar] → 캔들 1개 공개
- [Long] [Short] [Close] 원클릭 버튼 (Simple Mode)
- 또는 Limit/Stop/Market 상세 주문 (Advanced Mode)
- 포지션 바에 실시간 PnL
- SL 도달 시 자동 청산 → 차트에 마커

## 구현 파일

### 신규 (4개)
| 파일 | 역할 |
|------|------|
| `src/components/lab/LabChart.svelte` | lightweight-charts + 마커 + SL/TP 라인 + 지표 토글 |
| `src/components/lab/LabToolbar.svelte` | 전략/사이클 드롭다운 + 모드 토글 + 실행 |
| `src/components/lab/PositionBar.svelte` | 하단 상태 바 (자동/수동 분기) |
| `src/components/lab/TradeList.svelte` | 체결 트레이드 목록 + 통계 |

### 수정 (2개)
| 파일 | 변경 |
|------|------|
| `src/routes/lab/+page.svelte` | 전면 재설계 — 차트 중심 레이아웃, 2모드 |
| `src/components/lab/ResultPanel.svelte` | 트레이드 클릭 → 차트 스크롤 연동 |

### 재사용 (수정 없음)
| 파일 | 재사용 방식 |
|------|-----------|
| `BattleChart.svelte` (189줄) | LabChart 차트 초기화 패턴, addSingleBar |
| `OrderPanel.svelte` (354줄) | 수동모드 주문 UI |
| `battleStore.ts` | 주문 체결 로직 패턴 |
| `backtestEngine.ts` | 자동 백테스트 실행 |
| `strategyStore.ts` | 전략 CRUD |
| `StrategyBuilder.svelte` | 자동모드 전략 편집 |
| `CycleSelector.svelte` | 사이클 선택 (Toolbar 내장) |

## 검증

1. 자동: 전략 → 사이클 → ▶ → 차트에 마커 + 결과 패널
2. 자동: 트레이드 클릭 → 차트 스크롤
3. 수동: [Next Bar] → 캔들 공개 → [Long] → 포지션바 업데이트
4. 수동: SL 도달 → 자동 청산 → 마커
5. 모드 전환 시 차트 데이터 유지
6. `npm run check` + `npm run build` 통과
