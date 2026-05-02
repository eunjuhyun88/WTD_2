# W-0374 — Chart: Symbol Search + Indicator Data Accuracy

> Wave: 5 | Priority: P1 | Effort: M (2d)
> Charter: ADR-012 해제 (In-Scope)
> Status: 🟡 Design Draft
> Issue: #832
> Created: 2026-05-01
> Related: ADR-012, W-0334, W-0304

## Goal

ChartPane을 TradingView 수준의 **티커별 즉시 전환 + 지표 데이터 정확성** 두 축으로 끌어올린다 — 화려함이 아닌 OHLCV 기반 클라이언트 계산으로 RSI/MACD/BB가 항상 보이게 만들고, 모든 페인에 데이터 출처를 1줄로 명시한다.

## 실측 현황 (Gap)

| 항목 | 상태 | 근거 |
|---|---|---|
| `GET /chart/klines` indicators 필드 | ❌ 항상 `{}` | `engine/api/routes/chart.py` — OHLCV raw만 반환 |
| RSI 페인 | ❌ 빈 라인 | `ChartBoard.svelte:1244` `ind.rsi14` = undefined |
| MACD 페인 | ❌ 빈 라인 | `ChartBoard.svelte:1222` `ind.macd` = undefined |
| `computeRSI()` 함수 | ✅ 존재 | `chartIndicators.ts:40` Wilder smoothing — **미사용** |
| `calcBollingerBands()` 함수 | ✅ 존재 | `analysisPrimitives.ts:68` — **미사용** |
| MACD 시계열 계산 함수 | ❌ 없음 | backend scalar `macd_hist`만 존재 |
| ChartPane 심볼 입력 | 🟡 text input | `ChartPane.svelte:77-78` 자동완성 없음 |
| `/api/market/symbols` API | ✅ 존재 | Binance USDT perps universe — **ChartPane에서 미사용** |
| PaneInfoBar 출처 표시 | ❌ 없음 | 레이블만 있고 출처 불명확 |

## Scope

### Phase 1 — 심볼 검색 UI (Day 1)

**현재**: `ChartPane.svelte` L77-78 text input 직접 타이핑 → validation 없음
**목표**: `/api/market/symbols` 기반 자동완성 드롭다운

구현:
- `app/src/components/terminal/workspace/SymbolSearchInput.svelte` 신규 (+180 LOC)
  - prefix/substring 매치, ≤8 results, 50ms debounce
  - 키보드 nav: ↑↓ Enter Esc
  - 최근 사용 5개 (localStorage `chart.recentSymbols`)
  - 잘못된 심볼 → "No results" 메시지
- `ChartPane.svelte` L57-85 교체 (-30 / +10 LOC)

### Phase 2 — 지표 클라이언트 계산 (Day 1-2)

**현재**: 백엔드 `indicators: {}` 의존 → RSI/MACD 페인 항상 빈 차트
**목표**: klines 로드 후 클라이언트 직접 계산

- **RSI(14)**: `computeRSI()` 이미 존재 → ChartBoard L1244 wiring 교체
  - 증분 업데이트: `updateRSIIncremental()` 활용 (live tick)
- **MACD(12,26,9)**: `computeMACD()` 신규 작성
  - fast=12 EMA, slow=26 EMA 차이 + signal=9 EMA + hist
  - `updateMACDIncremental()` 신규 (live tick 성능)
  - `alpha = 2/(period+1)`, seed = 첫 period의 SMA
- **BB(20, 2σ)**: `calcBollingerBands()` 이미 존재 → price pane overlay 연결
  - opacity 0.4, line-only (band fill 없음 — 캔들 가독성)
  - population std (ddof=0) — TradingView 동일

모두 **lookahead-free**: 마지막 bar mutate가 N-2 이전 값에 영향 없어야 함.

### Phase 3 — 출처 명시 + N 부족 처리 (Day 2)

**PaneInfoBar 레이블 (모든 페인)**:
- Price: `"OHLCV · Binance · {tf}"`
- RSI: `"RSI(14) · Wilder · client-side"`
- MACD: `"MACD(12,26,9) · client-side"`
- BB: `"BB(20, 2σ) · client-side"`
- CVD: `"CVD · Binance perps · {tf} bars"`
- OI: `"OI · Bybit · {tf}"`
- Funding: `"Funding · Binance perps · 8h"`
- Liq: `"Liquidations · Binance · {tf}"`

**N 부족 시**: `"insufficient bars (N={n} < {period})"` 한 줄 표시, 라인 그리기 skip (NaN mislead 금지).

## Non-Goals

- 색상/테마/애니메이션 (ADR-012 금지선)
- Pine Script / Custom indicator editor
- TradingView alerts
- 백엔드 indicator endpoint 신설 (별도 W-####)
- Drawing tools — W-0335
- MTF 지표 오버레이 — W-0304
- 지표 파라미터 커스터마이징 UI (RSI 9/14/21 토글) — W-0375 이후

## CTO Risk Matrix

| Risk | 확률 | 영향 | 완화 |
|---|---|---|---|
| RSI/MACD 계산 off-by-one, lookahead | M | H | known-value unit test 필수 (AC blocking), shift(1) 패턴 강제 |
| N>5000 bars에서 매 tick 재계산 jank | M | M | `updateRSIIncremental` / `updateMACDIncremental` — 마지막 bar만 mutate |
| Symbol search stale (universe 변동) | L | L | `/api/market/symbols` 기존 캐시 정책 유지 |
| BB overlay가 캔들 가독성 해침 | L | M | opacity 0.4, line-only |
| MACD 미세 차이 (라이브러리별) | H | L | 공식 명시 + tolerance 0.001 테스트 |
| ChartBoard 2506줄 추가 비대화 | M | M | 계산 로직 `chartIndicators.ts` 격리, ChartBoard는 wiring만 |

## Files Touched (실측 기반)

```
# Phase 1
app/src/components/terminal/workspace/SymbolSearchInput.svelte  (신규, +180)
app/src/components/terminal/workspace/ChartPane.svelte           (L57-85, -30/+10)

# Phase 2
app/src/lib/chart/chartIndicators.ts                             (computeMACD, updateMACDIncremental, +120)
app/src/components/terminal/workspace/ChartBoard.svelte          (L1222/L1244 wiring, BB overlay, +80/-20)

# Phase 3
app/src/components/terminal/workspace/PaneInfoBar.svelte         (source prop, +30)

# Tests
app/src/lib/chart/__tests__/chartIndicators.test.ts             (신규, +200)
app/src/lib/chart/__tests__/symbolSearch.test.ts                (신규, +80)
```

## Decisions

**D-0374-1: 심볼 검색 구현**
- ~~HTML5 datalist~~ (키보드 nav 불일관, 스타일 한계)
- ~~외부 combobox lib~~ (deps 추가)
- **채택: 커스텀 Svelte dropdown** — Phase 1.5 즐겨찾기 확장 고려, full control

**D-0374-2: MACD 계산 위치**
- **채택: 클라이언트 only** — 엔진 변경 0, 즉시 작동
- 거절: 백엔드 endpoint (범위 폭증, 별도 W로 분리)

**D-0374-3: BB 위치**
- **채택: price pane overlay** — TradingView 기본 동작, 사용자 mental model 부합
- 거절: 서브페인 (공간 낭비)

## Open Questions

- [ ] Q-1: 즐겨찾기 심볼 동기화 — localStorage only vs user profile DB?
- [ ] Q-2: 지표 파라미터 토글 (RSI 9/14/21) — W-0374 포함? 또는 W-0375?
- [ ] Q-3: BB std multiplier 토글 (1.5σ/2σ/2.5σ) — Phase 3 vs 후속?

## AI Researcher 관점

지금 RSI/MACD 페인은 **정보 없음** 상태. 사용자가 페인 토글 → 빈 차트 → "버그?" 인식.
클라이언트 계산 전환 후 risk 변환:
- Before: 정보 없음 (지표 무시, 판단에 미영향)
- After: 정보 있음 → **계산 정확성이 trade decision에 직접 영향**

따라서 known-value 단위 테스트는 nice-to-have가 아닌 **AC blocking 조건**.

**정확도 표준**:
- RSI(14): TradingView 동일 공식. tolerance ≤ 0.01
- MACD(12,26,9): alpha = 2/(period+1), seed = 첫 period SMA. tolerance ≤ 0.001
- BB(20, 2σ): population std (ddof=0). tolerance ≤ 0.001

**Validation source**: Binance BTCUSDT 1h 100 bars frozen fixture JSON (pandas-ta로 1회 생성 후 repo 커밋).

## Implementation Plan

**Day 1**
1. `/api/market/symbols` 응답 구조 확인 → `SymbolSearchInput.svelte` 작성
2. `ChartPane.svelte` L57-85 교체
3. `symbolSearch.test.ts` — filter 로직, 키보드 nav, 빈 결과

**Day 1-2**
4. BTCUSDT 1h 100 bars fixture JSON 생성 (pandas-ta 기준)
5. `chartIndicators.ts` `computeMACD`, `updateMACDIncremental` 추가
6. `chartIndicators.test.ts` — RSI/MACD/BB 정확도 테스트
7. `ChartBoard.svelte` L1222/L1244 wiring 교체, BB overlay 추가
8. lookahead-free 검증 테스트

**Day 2**
9. `PaneInfoBar.svelte` source prop 추가
10. `ChartBoard` 각 페인 source 문자열 주입
11. N 부족 메시지 처리
12. `pnpm typecheck` + vitest + svelte-check

## Exit Criteria

- [ ] AC1: ChartPane 심볼 입력창에 ≥10개 자동완성 드롭다운, 50ms debounce
- [ ] AC2: RSI 페인 — N≥14 시 항상 라인 렌더링 (OHLCV 클라이언트 계산)
- [ ] AC3: MACD 페인 — N≥26 시 hist+signal+macd 3 시리즈 렌더링
- [ ] AC4: RSI(14) 단위 테스트 — fixture 대비 max 절대오차 ≤ 0.01
- [ ] AC5: MACD(12,26,9) 단위 테스트 — fixture 대비 macd/signal/hist 각각 ≤ 0.001
- [ ] AC6: BB(20, 2σ) 단위 테스트 — upper/middle/lower 각각 ≤ 0.001
- [ ] AC7: PaneInfoBar 출처 레이블 — 8개 페인 모두 표시
- [ ] AC8: N < period 시 `"insufficient bars (N={n} < {period})"` 표시, 라인 없음
- [ ] AC9: lookahead-free 테스트 — 마지막 bar mutate 시 N-2 이전 RSI/MACD byte-identical
- [ ] AC10: 키보드 nav (↑↓ Enter Esc) 단위 테스트 PASS
- [ ] AC11: `pnpm typecheck` 0 errors, vitest 신규 ≥ 8 PASS, svelte-check 0 errors
- [ ] AC12: CI green
- [ ] PR merged + CURRENT.md SHA 업데이트
