# W-0341 — TradeMode/ChartBoard 파이프라인 분해

> Wave: 4 | Priority: P2 | Effort: L
> Charter: In-Scope §"surface and orchestration: app/" — Frozen 영역 미접촉
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: #734

## Goal
TradeMode/ChartBoard의 데이터 파이프라인·WebSocket·상태를 레이어별로 분리하여, 기능 추가·디버깅·테스트가 컴포넌트 파일 전체를 읽지 않고도 가능한 구조로 만든다.

## 아키텍처 레이어

```
┌─────────────────────────────────────────────┐
│  Component (.svelte)                        │  ← UI 렌더링 + 이벤트만
│  TradeMode.svelte / ChartBoard.svelte       │
└────────────────┬────────────────────────────┘
                 │ imports
┌────────────────▼────────────────────────────┐
│  Composable (.svelte.ts)                    │  ← $state/$derived/$effect
│  useTradeData / useMicrostructureSocket     │  ← Svelte 5 runes 호환
│  indicatorVisibility / useChartSocket       │
└────────────────┬────────────────────────────┘
                 │ calls
┌────────────────▼────────────────────────────┐
│  Pure Module (.ts)                          │  ← 순수 함수, 단위 테스트 가능
│  dataFetch.ts / payloadTypes.ts             │
│  chartMetrics.ts                            │
└─────────────────────────────────────────────┘
```

## Scope

### 신규 파일
| 파일 | 역할 |
|---|---|
| `app/src/lib/trade/payloadTypes.ts` | WS/API 페이로드 타입 중앙화 |
| `app/src/lib/trade/dataFetch.ts` | refreshVenueDivergence 등 fetch 순수 함수 |
| `app/src/lib/trade/useMicrostructureSocket.svelte.ts` | WS connect/reconnect/lifecycle composable |
| `app/src/lib/trade/useTradeData.svelte.ts` | $state 오케스트레이션 |
| `app/src/lib/chart/indicatorVisibility.svelte.ts` | showVWAP/showBB/showEMA 등 indicator toggle 상태 |
| `app/src/lib/chart/chartMetrics.svelte.ts` | depthRatio/bidPct/contextSummaryItems 등 $derived |
| `app/src/lib/chart/useChartSocket.svelte.ts` | ChartBoard WebSocket + currentPrice/$state |

CSS: `app/src/app.css`에 `.trade-mode__*` / `.chartboard__*` BEM prefix 이동

### 수정 파일
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/app.css`

## Non-Goals
- TrainMode.svelte — 분해 패턴 정착 후 별도 W
- dashboard/+page.svelte — 합의 제외
- DecisionHUD.svelte — W-0309 wiring과 충돌 위험
- Frozen: copy_trading, leaderboard, AI 차트 분석, 자동매매, 신규 메모리 stack
- 기능 변경 / 신규 indicator 추가

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| CSS scoped→global 충돌 | 중 | 중 | BEM prefix 강제 + preview 5화면 스모크 |
| Svelte 5 runes hook 추출 시 reactivity 손실 | 중 | 고 | `.svelte.ts` 모듈 사용, 추출 직후 typecheck + preview |
| WS reconnect race condition | 저 | 고 | 기존 시그니처 보존, $effect lifecycle만 컴포넌트에 잔존 |
| 동적 className 오인 제거 | 저 | 중 | `grep -r "class=.*{var}"` 사전 검사 |
| W-0309 머지 충돌 (ChartBoard 인접) | 중 | 저 | W-0309 머지 후 ChartBoard Phase 시작 |

### Dependencies / Rollback
- Phase 1(ChartBoard)은 W-0309 머지 후 시작
- Phase 2(TradeMode)는 Phase 1 검증 후 시작
- atomic commit 단위 (CSS이동 / fetch추출 / WS추출 분리) → `git revert` 가능

## AI Researcher 관점
- 데이터 흐름/계산 변경 없음 — UI 레이어만
- indicator 표시 로직은 trade signal 가시성에 직결 → 시각 회귀 = 의사결정 회귀
- F1: $derived 추출 후 의존성 누락 → 정적 값 고착 (preview에서 가격 안 움직이면 감지)
- F2: 글로벌 CSS specificity 충돌 → 다른 모드 시각 깨짐
- F3: WS lifecycle $effect 매칭 실수 → 소켓 다중 연결 메모리 leak

## Open Questions
- [ ] [Q-0341-1] Q-0341-4 연계: indicator visibility state 구조가 W-0304(per-pane scoping) 설계와 충돌 여부 — Phase 1 착수 전 W-0304 설계 확인 필요

## Implementation Plan

### Phase 1 — ChartBoard (W-0309 머지 후)
1. `pnpm check 2>&1 | grep "Unused CSS"` → 미사용 selector 일괄 제거
2. `indicatorVisibility.svelte.ts` 추출 (showVWAP/BB/EMA/ATRBands/CVD/MACD/$chartIndicators 바인딩)
3. `chartMetrics.svelte.ts` 추출 (depthRatio, bidPct, askPct, liqAnchor, liqLong, liqShort, contextSummaryItems, metricStripItems)
4. `useChartSocket.svelte.ts` 추출 (WebSocket _ws, currentPrice/Time/ChangePct/OiDelta)
5. CSS BEM 분류 → `.chartboard__*` app.css 이동
6. typecheck + preview 스모크

### Phase 2 — TradeMode
1. `payloadTypes.ts` 추출 → ad-hoc interface 제거
2. `dataFetch.ts` 추출 (refreshMicrostructure, refreshVenueDivergence, refreshLiqClusters 등)
3. `useMicrostructureSocket.svelte.ts` 추출 (connect/reconnect/onmessage/cleanup)
4. `useTradeData.svelte.ts` 오케스트레이션 ($state + composable 연결)
5. style 분류 → `.trade-mode__*` app.css 이동 (style 블록 ≤300줄)
6. typecheck + preview 스모크

### Phase 3 — 검증
1. AC grep 스크립트 일괄 실행
2. `madge --circular app/src/lib/trade app/src/lib/chart`
3. preview 5화면 (Trade/Chart/Wallet/Train/Dashboard) 시각 회귀 스모크
4. `./tools/verify.py` PASS

## Exit Criteria
- [ ] AC1: `grep -n "new WebSocket" TradeMode.svelte` → 0 hits (인라인 WS 제거)
- [ ] AC2: `grep -n "async function refresh" TradeMode.svelte` → 0 hits (fetch 분리)
- [ ] AC3: `grep -n "^  interface " TradeMode.svelte` → 0 hits (타입 분리)
- [ ] AC4: TradeMode `<style>` 블록 ≤ 300줄
- [ ] AC5: `pnpm check 2>&1 | grep -c "Unused CSS selector"` → 0 (ChartBoard)
- [ ] AC6: `madge --circular app/src/lib/trade app/src/lib/chart` → 0 cycles
- [ ] AC7: `pnpm check` 0 errors, warnings ≤ 51 (베이스라인 유지)
- [ ] AC8: `pnpm build` exit 0
- [ ] AC9: `./tools/verify.py` PASS
- [ ] AC10: preview 스모크 — Trade/Chart WS live price 정상, indicator toggle 동작 (스크린샷 PR 첨부)
- [ ] AC11: PR merged + CURRENT.md SHA 업데이트
