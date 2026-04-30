# W-0357 — Cogochi TV-Style Indicators + AI Results List UX

> Wave: 4 | Priority: P0 | Effort: M
> Issue: #781
> Status: ✅ Merged PR #782
> Created: 2026-04-30

## Goal

`/cogochi` 차트에 TV 수준의 모든 지표를 그리고, AI 스캔 결과를 클릭 가능한 리스트로 보여준다 — 클릭 시 차트 심볼 전환. W-0356 미완성 debt(chartAIOverlay 미연결) 완결.

---

## UX 워크플로

```
1. 심볼 선택 (WatchlistRail 클릭 또는 검색)
2. Center: 차트 + 서브패널(RSI · MACD · Vol · CVD · OI · Funding)
3. Right AI 입력: "BTC 스캔" / "전체 스캔" / "BTC 분석"
4. 결과 → AI 패널 카드 리스트업 (스크롤 가능)
5. 리스트 항목 클릭 → Center 차트 해당 심볼로 전환
6. 차트 위에 AI entry/stop price line 표시 (ANALYZE 결과)
```

---

## Scope

### Phase A — chartAIOverlay → ChartBoard 연결 (W-0356 debt)

| 파일 | 변경 |
|---|---|
| `app/src/lib/chart/usePriceLines.ts` | `setAILines(lines: AIPriceLine[])` 메서드 추가 |
| `app/src/components/terminal/workspace/ChartBoard.svelte` | `chartAIOverlay` 스토어 subscribe → `priceLineMgr.setAILines()` |

### Phase B — AI 스캔 결과 리스트 + 심볼 전환

| 파일 | 변경 |
|---|---|
| `app/src/lib/cogochi/AIPanel.svelte` | scan card 리스트 UX 강화: 각 항목 클릭 → `shellStore.setSymbol()` |

AIPanel은 `shellStore`를 직접 import해서 `shellStore.setSymbol(symbol)` 호출.
심볼 전환 시 AI 패널은 그 심볼의 "분석 요청 중..." 상태 표시 옵션 제공.

### Phase C — CVD / OI / Funding 차트 서브패널

| 파일 | 변경 |
|---|---|
| `engine/api/routes/chart.py` | `GET /chart/indicators?symbol=&tf=` 추가 — CVD·OI·Funding 시계열 반환 |
| `app/src/routes/api/chart/indicators/+server.ts` | 신규 — engine proxy |
| `app/src/components/terminal/workspace/ChartBoard.svelte` | CVD / OI / Funding 서브패널 렌더링 (Lightweight Charts `addHistogramSeries` / `addLineSeries`) |
| `app/src/lib/chart/chartIndicators.ts` | `indicatorKeys`에 `cvd`, `oi`, `funding` 추가 |

서브패널 우선순위: `RSI → MACD → Vol → CVD → OI → Funding` (순서 고정, 토글 가능).
CVD: 누적 거래량 델타 히스토그램 (녹색/빨간).
OI: 라인 시리즈 (파란색, normalized).
Funding: 히스토그램 (양수=초록, 음수=빨간, 기준선 0.01%).

### Phase D — Pine Script 제거

| 파일 | 변경 |
|---|---|
| `app/src/components/terminal/workspace/TerminalCommandBar.svelte` | Pine Script 버튼(라인 84–95, 132–135) 제거 |

---

## Non-Goals

- WatchlistRail 실시간 가격/스파크라인 (W-0358로 분리)
- TradeMode drawer 완전 삭제 (UI 진입점만 hide → 별도 W-item)
- 모바일 레이아웃 변경
- CVD/OI 데이터 계산 로직 변경 (기존 `data_cache/fetch_binance_perp.py` 그대로 사용)
- `chartSaveMode` 구간선택 → AI 자동분석 워크플로 (W-0358)

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| ChartBoard 서브패널 개수 증가 → 높이 계산 복잡 | 중 | 중 | paneHeights 배열 정규화, 최소 60px 보장 |
| engine `/chart/indicators` 응답 latency | 중 | 중 | Redis cache (klines와 동일 패턴), 200ms SLA |
| scan 결과 심볼 클릭 → shellStore 전파 → ChartBoard 리렌더 | 낮 | 낮 | 기존 `shellStore.setSymbol()` 동일 경로, 이미 검증됨 |
| chartAIOverlay symbol 불일치 (다른 심볼 lines 잔류) | 중 | 중 | `clearAIOverlay()` — 심볼 전환 시 AppShell `$effect` 호출 |

### Dependencies

- Phase A: `usePriceLines.ts`, `ChartBoard.svelte` (이미 연결된 `priceLineMgr` 사용)
- Phase B: `shellStore.setSymbol()` (기존 API, `AppShell.svelte:289` 동일 패턴)
- Phase C: `engine/data_cache/fetch_binance_perp.py` — `fetch_funding_rate()` (라인 104) 기존 함수 활용
- Phase D: 독립 — 다른 Phase 없이 진행 가능

### Rollback

- Phase A/B: Svelte store unsubscribe → 즉시 롤백 가능
- Phase C: engine endpoint 추가이므로 기존 기능 영향 없음; app 렌더링 오류 시 indicator toggle off
- Phase D: git revert 1 파일

---

## AI Researcher 관점

### Failure Modes

- **CVD 계산 drift**: 누락된 거래 → CVD 값 왜곡. 완화: `fetch_binance_perp.py` 기존 로직 그대로, 추가 계산 없음.
- **OI spike 잘못 해석**: 가격과 다른 시간축 → 라벨 명시 (OI 단위: USD).
- **Funding 0.01% 기준선**: 양/음 판단 기준 명시화 필요. 기준선을 0.01%로 고정 표시.
- **스캔 리스트 stale**: `/api/terminal/scan` 결과 캐싱 없음 → 현재 설계 유지 (매 호출 fresh).

---

## Decisions

- **[D-01]** Phase B에서 AIPanel → shellStore 직접 import (Svelte 스토어는 모듈 전역 — prop drilling 불필요). 거절 옵션: `onSelectSymbol` prop으로 AppShell에 위임. 거절 이유: 이미 WatchlistRail이 같은 패턴 사용, 일관성.
- **[D-02]** CVD/OI/Funding 서브패널은 기본값 OFF, 첫 ANALYZE 호출 시 자동 ON. 거절 옵션: 기본 ON. 이유: 처음 로드 시 화면 공간 보존.
- **[D-03]** engine `/chart/indicators` 는 klines와 동일한 Redis-first 캐싱 패턴 사용. TTL = 60s.

---

## Open Questions

- [ ] [Q-01] CVD 데이터가 현재 `score_thread.py`에서만 사용 중 (단일 값). 시계열 배열 생성 필요 → `fetch_binance_perp.py`에 `fetch_cvd_series()` 추가 or aggregation on klines?
- [ ] [Q-02] OI 정규화 단위: USD 절대값 vs 이전 값 대비 % 변화? → 초기 구현은 USD raw, 이후 스케일 조정.

---

## Implementation Plan

### Phase A — chartAIOverlay wiring (30분)

1. `usePriceLines.ts`: `private aiLines: PriceLine[] = []` + `setAILines(lines: AIPriceLine[])` 메서드 추가
2. `ChartBoard.svelte`: `import { chartAIOverlay } from '$lib/stores/chartAIOverlay'` + `$effect(() => { const state = $chartAIOverlay; if (state.symbol === activeSymbol) priceLineMgr.setAILines(state.lines); })`
3. AppShell에 심볼 전환 시 `clearAIOverlay()` wiring

### Phase B — AI 리스트 UX (45분)

1. `AIPanel.svelte` scan 카드: `{ symbol, score, direction, p_win }[]` 형태로 렌더
2. 각 항목: 클릭 핸들러 → `shellStore.setSymbol(item.symbol)` + `clearAIOverlay()`
3. 리스트 max-height: 280px, overflow-y: auto (스크롤)
4. 클릭된 항목 highlight (border-left: 2px solid brand-color)

### Phase C — CVD/OI/Funding 서브패널 (2시간)

1. `engine/api/routes/chart.py`: `GET /chart/indicators` — `symbol`, `tf`, `limit` params
   - Returns: `{ cvd: [{time, value}], oi: [{time, value}], funding: [{time, value}] }`
   - Data source: `fetch_binance_perp.py` 기존 함수 조합
2. `app/src/routes/api/chart/indicators/+server.ts`: engine proxy (klines proxy 동일 패턴)
3. `ChartBoard.svelte`: 서브패널 3개 추가 (기존 RSI 패턴 복사)
4. `chartIndicators.ts`: 새 키 추가 + toggle support

### Phase D — Pine Script 제거 (15분)

1. `TerminalCommandBar.svelte` 라인 84–95, 132–135 제거
2. `pnpm typecheck` 확인

---

## Exit Criteria

- [ ] AC01: ANALYZE 결과 → 차트에 entry(초록 실선) + stop(빨간 점선) price line 표시
- [ ] AC02: 심볼 전환(WatchlistRail 클릭 또는 스캔 결과 클릭) → 이전 AI overlay 자동 제거
- [ ] AC03: AI "스캔" → 결과 카드에 심볼 리스트 표시, 클릭 → 차트 심볼 전환
- [ ] AC04: CVD 히스토그램 서브패널 ChartBoard에 렌더 (토글 OFF 시 숨김)
- [ ] AC05: OI 라인 서브패널 ChartBoard에 렌더 (토글 OFF 시 숨김)
- [ ] AC06: Funding 히스토그램 서브패널 ChartBoard에 렌더 (0.01% 기준선 표시)
- [ ] AC07: `/api/chart/indicators?symbol=BTCUSDT&tf=4h` → 200, JSON `{cvd, oi, funding}` 반환
- [ ] AC08: TerminalCommandBar Pine Script 버튼 없음
- [ ] AC09: `pnpm typecheck` 0 errors
- [ ] AC10: CI green
- [ ] AC11: 1280px 화면 — 3컬럼 + RSI + MACD + CVD 서브패널 동시 표시, x-scroll 없음

---

## Canonical Files

```
app/src/lib/chart/usePriceLines.ts      — setAILines() 추가
app/src/components/terminal/workspace/ChartBoard.svelte  — chartAIOverlay 구독 + clearAIOverlay
app/src/lib/cogochi/AIPanel.svelte      — scan list active UX + shellStore.setSymbol()
app/src/lib/cogochi/WatchlistRail.svelte — subscribeMiniTicker 실시간 가격
app/src/components/terminal/workspace/TerminalCommandBar.svelte  — Pine Script 제거
```

---

## Owner

app (Svelte) — W-0356 debt 완결 + UI 개선

---

## Facts

- CVD/OI/Funding 서브패널: W-0356 이전부터 `chartIndicators.ts`에 구현됨 (기본값 ON). Phase C 불필요했음.
- `subscribeMiniTicker`: `app/src/lib/api/binance.ts:179` — 이미 구현됨, 재사용.
- `shellStore.setSymbol()`: AppShell에서 이미 `onSelectSymbol={(s) => shellStore.setSymbol(s)}`로 연결됨.

---

## Assumptions

- Binance WebSocket 접근 가능 (miniTicker stream). 불가 시 WatchlistRail은 "…" 상태 유지.
- `chartAIOverlay` store는 컴포넌트 마운트 후 동작 (SSR 없음, browser-only).

---

## Next Steps

- W-0358: WatchlistRail 스파크라인 + 내 패턴 클릭 → 차트 전환
- W-0358: chartSaveMode 구간선택 → AI 자동분석 워크플로

---

## Handoff Checklist

- [x] PR #782 merged — SHA `a654ea26`
- [x] typecheck 0 errors
- [x] CI green (App CI, Contract CI, Engine Tests, Design Verify)
- [x] chartAIOverlay → ChartBoard 연결 완료
- [x] WatchlistRail Binance miniTicker 실시간 가격
- [x] scan-row 클릭 → shellStore.setSymbol() 심볼 전환
- [x] Pine Script 완전 제거
