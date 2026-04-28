---
name: indicator_visual_design_2026_04_22
description: 지표 시각화 설계 결정사항 (2026-04-22) — 아키타입, 우선순위, 레이아웃
type: project
---

# Indicator Visual Design 결정사항 (2026-04-22)

설계 문서: `.claude/plans/indicator-visual-design-v2.md`

**Why:** CTO+Researcher+Trader 3자 관점에서 지표 시각화 우선순위를 정하고 구현 설계를 확정하기 위해 작성.
**How to apply:** 지표 시각화 구현 시 이 설계 문서를 먼저 읽고 아키타입/우선순위/레이아웃 따를 것.

---

## 레이아웃 결정

- **C SIDEBAR = primary layout**. 차트 왼쪽 60% + 우측 ANALYZE/SCAN/JUDGE 사이드바.
- Indicator panel은 **차트 하단 고정** (TV RSI 서브패널과 시각적으로 동일 위치, HTML div).
- **D PEEK = 차트 집중 모드**. peek 올리면 indicator + ANALYZE 함께 표시.
- Regime Alert(E) + Gauge row(A): 항상 표시. Venue/Liq: collapsed 토글.

## 7개 아키타입

| 타입 | 역할 | 주요 지표 |
|------|------|-----------|
| A | Percentile Gauge + Sparkline | OI, Funding, Vol, Netflow, SSR |
| B | Actor-Stratified Multi-Line | CVD by size, COT |
| C | Price×Time Heatmap | Liq Heatmap |
| D | Divergence | CVD↔Price |
| E | Regime Badge + Flip Clock | Funding Flip, Gamma Flip |
| F | Venue Divergence Strip | OI per venue, Funding per venue |
| G | Options Curve (신규) | P/C Ratio, 25d Skew, DVOL |

## 구현 우선순위 (6 슬라이스)

1. Funding Flip E + Gamma Flip (1일) — 데이터 있음
2. Deribit Options P1 (2일) — REST API
3. Stablecoin SSR (1일) — CoinGecko
4. Exchange Netflow (2일) — Arkham
5. Confluence Engine 5축 스코어 (2일)
6. Liq Heatmap Phase 2 Canvas (3일) — SVG→Canvas

## 색상 원칙

- **amber = 극단** (방향 중립). bear/bull 색은 Regime E만.
- Divergence badge = 두 라인 반대 방향일 때만 등장.
- 데이터 없으면 hide (빈 박스 없음).
- 디자인 시스템: `#0a0a0a` bg, `#f0b847` amber, `#4fb872` green, `#d66c7a` red, JetBrains Mono.
