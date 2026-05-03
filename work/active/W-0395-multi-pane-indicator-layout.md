# W-0395 — Multi-Pane Indicator Layout System (Time-Synced Stack)

> Wave: 6 | Priority: P1 | Effort: M
> Charter: In-Scope L4 (chart UX) — Frozen 전면 해제(2026-05-01) 이후
> Status: 🔵 Implementation
> Created: 2026-05-03
> Issue: #960
> Depends on: W-0304 (per-pane indicator scope), PR #959 (priceFracPct dynamic + PaneInfoBar TV-native)

## Goal

사용자가 멀티 패인 차트에서 Price/Volume/RSI(MACD)/OI/CVD/Funding/Liq 지표를 켜고 끄는 즉시, **모든 서브패인이 가격 차트와 동일한 캔들스틱 시간축에 픽셀 단위로 정렬**되고 패인 라벨(legend)이 크로스헤어 타임에 따라 갱신되는 Velo/TradingView 동급 레이아웃을 얻는다.

## Owner

app

## Scope

- **포함**:
  - 결정론적 패인 스택 정책: `[0]Price+Volume → [1]RSI|MACD → [2]OI → [3]CVD → [4]Funding → [5]Liq` (6 슬롯, 동적 압축)
  - LWC v5.1 native multi-pane 단일 chart instance 기반 — 시간축 1개를 모든 패인이 공유 (built-in time alignment)
  - `priceFracPct = 4/(4+N)*100%` 동기화
  - PaneInfoBar 크로스헤어 값 라이브 업데이트 (rAF throttled)
  - 패인 show/hide 토글 + close 버튼
  - localStorage persistence: `pane_layout::v1` (visibility + stretchFactors)

- **파일**:
  - `app/src/lib/chart/mountIndicatorPanes.ts` (신규) — pure LWC series factory, `IndicatorSeriesRefs` 반환
  - `app/src/lib/chart/paneCrosshairSync.ts` (신규) — subscribeCrosshairMove → rAF-throttled chip updates
  - `app/src/lib/chart/paneLayoutStore.ts` (신규) — Svelte 5 $state + localStorage persistence
  - `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` — 3 모듈 wire-up, crosshairChips fallback

- **API**: 변경 없음 (frontend-only)

## Non-Goals

- per-pane 인디케이터 스코핑 (W-0304 별도 진행) — 본 W는 stack 레이아웃만
- SplitPane 4-grid (W-0317) — 본 W는 단일 차트 내 vertical pane stack만
- 사용자 정의 pane 순서 drag-reorder — Phase 2
- 인디케이터 신규 추가 (Bollinger sub-pane 등) — 별도 W

## Facts

- LWC v5.1 native multi-pane: 단일 chart instance가 모든 패인 time-scale 공유 → 시간 정렬 free
- `mountIndicatorPanes.ts`: `IndicatorToggles` + `tf` → `{ positions, seriesRefs }` 반환
- `paneCrosshairSync.ts`: `param.seriesData.get(seriesRef)` → 크로스헤어 타임 값 추출, rAF throttle
- `paneLayoutStore.ts`: `createPaneLayoutStore()` → `$state`-backed, `pane_layout::v1` localStorage
- ChartBoard chip fallback: `crosshairChips?.oi ?? oiChips.chips` — 크로스헤어 없으면 last-bar
- svelte-check: 0 new errors (22 errors 모두 pre-existing)

## Canonical Files

- `app/src/lib/chart/mountIndicatorPanes.ts` — series 마운트 팩토리 (시간 정렬 핵심)
- `app/src/lib/chart/paneCrosshairSync.ts` — crosshair → chip sync
- `app/src/lib/chart/paneLayoutStore.ts` — visibility/stretch persistence
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` — 오케스트레이터

## Assumptions

- LWC v5.0.8+ (`setStretchFactor` available) — fallback try/catch 유지
- engine payload의 `oiBars/cvdBars/fundingBars/liqBars` timestamps는 UTC bucket 정렬됨
- Svelte 5 rune (`$state`, `$derived`) 환경

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| LWC v5.1 `setStretchFactor` 전 버전 호환 | 낮음 | 중 | try/catch 유지, fallback to equal split |
| pib-anchor `top` 계산 오차 | 중 | 중 | `--price-frac` + `--pane-step` 두 변수로만 계산 |
| 크로스헤어 콜백 jank | 낮음 | 낮음 | rAF throttle (W-0391-A 검증 패턴) |
| stretchFactor 사용자 변경 시 priceFracPct desync | 중 | 높음 | Phase 5 resize handle에서 panePixelHeights 측정 → CSS var 직접 set |
| localStorage 마이그레이션 누락 | 낮음 | 낮음 | versioned key `v1`, 미일치 시 default reset |

### Dependencies / Rollback

- 선행: PR #959 머지 → 베이스
- 동시: W-0304 (per-pane store) — 독립, 충돌 없음
- 후행: W-0317 (SplitPane 4-grid)
- Rollback: `paneLayoutStore.ts` 삭제 시 default visibility/stretch graceful fallback

## AI Researcher 관점

### Data Impact

- 시간축 정렬: LWC 보장. `klines[i].time === oiBars[j].time` 매칭은 engine UTC bucket 정렬로 보장
- 크로스헤어 콜백에서 `param.time`으로 모든 패인 chip을 동일 timestamp로 sync

### Failure Modes

| Mode | 검출 | 대응 |
|---|---|---|
| oiBars 비어있음 | `panePositions.oi === -1` | 패인 mount skip, `activePanelCount` 자동 감소 |
| 일부 timestamp 누락 | LWC line gap | 라벨에 `—` 표시 (fmtByKind null path) |
| stretchFactor → 0 | resize handle min clamp | `Math.max(stretch, 0.5)` |

## Decisions

- **[D-0395-01]** Native LWC multi-pane 유지 (단일 chart instance + setStretchFactor)
- **[D-0395-02]** 결정론적 패인 순서 (RSI/MACD → OI → CVD → Funding → Liq)
- **[D-0395-03]** pib-anchor CSS 변수 2개만 사용 (`--price-frac`, `--pane-step`)
- **[D-0395-04]** 크로스헤어 sync는 rAF throttle (W-0391-A 패턴)

## Open Questions

- [ ] [Q-0395-01] resize handle UX — TV 2px hover-grab line vs Velo explicit divider
- [ ] [Q-0395-02] localStorage 키 namespace — 멀티차트(W-0317) 시 `pane_layout::v1::chart_${id}` 확장?
- [ ] [Q-0395-03] 모바일 <768px 패인 최소 높이 — 모든 indicator 활성 시 ~60-80px 허용?

## Next Steps

1. Phase 4: resize handle (pane 경계 drag → setStretchFactor + store update)
2. Phase 5: Playwright 시각 회귀 테스트 1개
3. PR #959 → PR #960 통합 후 merge

## Exit Criteria

- [x] **AC1**: 모든 활성 패인의 캔들스틱 x-position이 price 차트와 동일 (LWC native multi-pane)
- [x] **AC2**: PaneInfoBar 라벨이 크로스헤어 이동 시 rAF throttle → 16ms 이내 갱신
- [x] **AC3**: 5개 indicator 패인 모두 활성 시 priceFracPct = 4/9 ≈ 44.44%
- [ ] **AC4**: pib-anchor가 어떤 패인 조합에서도 해당 패인 영역 내 위치 — Playwright assertion
- [x] **AC5**: 패인 close 버튼 클릭 시 layout 즉시 재배치 (onClose → removeChartIndicator)
- [x] **AC6**: localStorage `pane_layout::v1` reload 후 visibility/stretch 복원
- [ ] **AC7**: 모바일 viewport 375px 패인 ≥ 50px (Q-0395-03 결정 후 확정)
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

## Handoff Checklist

- [x] `chart/mountIndicatorPanes.ts` 신규 — pure factory, IndicatorSeriesRefs 반환
- [x] `chart/paneCrosshairSync.ts` 신규 — rAF throttled crosshair → chip sync
- [x] `chart/paneLayoutStore.ts` 신규 — $state + localStorage::pane_layout::v1
- [x] ChartBoard.svelte 리팩터 — 인라인 mountIndicatorPanes 160줄 제거, 3 모듈 wire
- [x] crosshairChips fallback 패턴 (`crosshairChips?.oi ?? oiChips.chips`)
- [x] svelte-check 0 new errors
- [x] commit 7e2c350c pushed to feat/W-0364-rebase
- [x] Phase 4: resize handle (commit 95c0f844) — pane-resizer + pibTops + priceStretch
- [ ] Playwright 시각 회귀 테스트
- [ ] PR merge
