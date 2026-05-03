# W-0400 — TradingView-Parity Indicator Catalog & Multi-Instance Panes (Full)

> Wave: 6 | Priority: P1 | Effort: L
> Charter: In-Scope L4 (chart UX, TV parity)
> Issue: #976
> Status: 🟡 Design Draft
> Created: 2026-05-03
> Depends on: W-0399 Phase 1 (PR #970 merged f9452455), W-0399-P2

## Goal
진이 `/`를 누르면 카탈로그 모달이 열리고, "rsi 7" 또는 "상대강도"로 검색해 RSI(7) 인스턴스를 기존 RSI(14) 옆 별도 패인에 추가할 수 있으며 — 우리가 계산하는 100+ 지표 전부가 패밀리별로 탐색 가능하고 즐겨찾기·최근 사용 탭이 TV와 동등하게 동작한다.

---

## Phase 1 — UX 패리티 (기존 engineKey ~10개)

- **IndicatorCatalogModal**: TV-style dialog, 좌측 카테고리 트리(Price/Volume/Momentum/Derivatives/Sentiment/Liquidity), 우측 그리드+검색바+Recents+Favorites 탭
- **CatalogTrigger**: 차트 툴바 `fx` 버튼, 단축키 `/`
- **Search**: aiSynonyms+label+id 토큰 매칭 (한영 양방향, Fuse.js lazy-import)
- **Favorites/Recents**: localStorage `wtd.chart.indicators.favorites.v1` (max 25 LRU)
- **Multi-instance**: `IndicatorInstance[]` 모델, RSI(14)+RSI(7) 별도 패인 동시
- **Importance-ordered defaults**: registry priority sort
- **Archetype-aware placement**: overlay→pane[0], separate→sub-pane 자동 할당, histogram→단독
- **MAX 6→12 상향** (LWC v5.1 perf budget)

## Phase 2 — 전 지표 노출 (~100개)

- Engine `engine/api/routers/indicators.py` + `GET /indicators/series?symbol=&timeframe=&indicator=&params=` + LRU cache (size=2048, TTL=3600s closed / tf_seconds/4 live)
- `ChartSeriesPayload.indicator_extras` optional field (additive contract)
- registry ↔ engine 카탈로그 100% 일치 CI gate
- archetype/dimensions → LWC SeriesType 자동 매핑
- Param overrides (RSI length, SMA period 등)

---

## Data Model Changes

### `IndicatorInstance` type (`app/src/lib/indicators/types.ts`)

```typescript
export interface IndicatorInstance {
  instanceId: string;      // nanoid(8)
  defId: string;           // FK → IndicatorDef.id in registry.ts
  params: Record<string, number | string | boolean>;
  style: {
    color?: string;
    lineWidth?: 1 | 2 | 3;
    visible: boolean;
  };
  paneIndex: number;       // 0=overlay, 1..N=sub-pane, -1=auto
  source: 'local' | 'engine';
  createdAt: number;
}
```

### `chartIndicators.ts` v2 → v3 마이그레이션

localStorage key `wtd.chart.indicators.v3`:

```typescript
export interface IndicatorStoreV3 {
  version: 3;
  instances: IndicatorInstance[];        // ordered by createdAt
  paneAssignment: Record<string, number>; // instanceId → paneIndex
  activeCount: number;
}
```

마이그레이션: `app/src/lib/stores/migrations/indicators_v2_to_v3.ts`
- v2 키 보존 → 다음 세션에 삭제
- unknown keys → drop + console.warn

### `mountIndicatorPanes()` 시그니처 변경

```typescript
// after
mountIndicatorPanes(
  chart: IChartApi,
  candles: Candle[],
  specs: IndicatorMountSpec[],
  ctx: { engineExtras?: Record<string, EngineSeriesPoints> }
): IndicatorSeriesRefs

// migration bridge (Phase 1 기간만):
function togglesToSpecs(toggles: IndicatorToggles): IndicatorMountSpec[]
```

---

## Component Architecture

### `IndicatorCatalogModal.svelte` (신규)

```svelte
interface Props {
  open: boolean;                   // $bindable
  onAdd: (defId: string, params?) => void;
  onClose: () => void;
  initialQuery?: string;
  activeInstances: IndicatorInstance[];
}
// Layout:
// ┌─ header: SearchBar + Close ──────────────────┐
// │ left 180px: FamilyTree │ right: ResultGrid   │
// └─ footer: 선택된 지표 N개 + 추가 버튼 ──────────┘
```

### Catalog Search (`catalogSearch.ts`)

Fuse.js keys: `label(0.50)`, `id(0.25)`, `aiSynonyms(0.20)`, `family(0.05)`, threshold=0.4
Sort: fuse score asc → favorites first → priority asc
Top 30 지표 curated KO 동의어 필수 (rsi → '상대강도지수', '알에스아이' 등)

---

## Pane 배치 규칙

| 조건 | 결과 |
|---|---|
| `archetype = 'overlay'` | paneIndex = 0 |
| `archetype = 'separate'`, 슬롯 있음 | 다음 빈 1..12 |
| `archetype = 'separate'`, 12 슬롯 만석 | -1 → toast "최대 12개 보조 지표까지" |
| `archetype = 'histogram'` | 같은 kind 기존 pane에 병합; 없으면 separate |
| 같은 kind 두 번째 인스턴스 | 항상 새 패인 |
| `volume` 두 번째 | 예외 — 항상 pane 1 공유 |

---

## Phase 2 엔진 API

```
GET /indicators/series
  ?symbol=BTCUSDT&timeframe=15m
  &indicator=sma&params=length:20,source:close
  &since=1714694400000&limit=1500
```

응답: `{ instance_key, indicator, params, series[]{name, points[]{time,value}}, meta{computed_at, bar_count, cache_hit} }`

캐시: `cachetools.TTLCache(maxsize=2048)`, key=`f"{symbol}|{tf}|{indicator}|{sorted_params}|{last_closed_bar_ts}"`. Redis 거부 — 추가 레이턴시 + ops 비용 대비 이점 없음 (데이터 결정론적).

engine → LWC SeriesType 매핑:

| archetype | dimensions | LWC type |
|---|---|---|
| overlay | 1 | LineSeries |
| overlay | 2–3 | LineSeries × N |
| separate | 1–3 | LineSeries × N (own pane) |
| histogram | 1 | HistogramSeries |
| histogram | 2 | HistogramSeries + Line |

---

## CTO 리스크 매트릭스

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| v2→v3 기존 사용자 데이터 손실 | M | H | read-then-write; 구 키 보존; e2e 테스트 v2 fixture |
| multi-instance로 byKindLegacy 소비자 깨짐 | H | M | Phase 1 기간 legacy map 유지, 동시 마이그레이션 |
| Fuse.js 번들 +12KB gzip | L | L | lazy-import (모달 열릴 때); 번들 델타 ≤15KB CI gate |
| `/` 단축키 Firefox quick-find 충돌 | M | M | chart 포커스 있을 때만 preventDefault |
| 12 패인 × 1500 bars FPS 저하 | L | H | Phase 1 bench; fps ≥ 55 gate |
| engine 캐시 cold-start stampede | M | M | `asyncio.Lock` singleflight per cache key |
| 파라미터 스키마 클라이언트/엔진 drift | M | H | codegen `indicator_params.json` → CI gate |
| KO 동의어 미달 → KO 검색 품질 저하 | H | M | top 30 curated 필수 |

---

## Keyboard / a11y

- **`/` 단축키**: `$effect`에서 `window.addEventListener('keydown')`; `input|textarea|[contenteditable]`이면 스킵
- **모달 열기 후**: `tick()` 뒤 `searchInputRef.focus()`
- **Escape**: `role="dialog" aria-modal="true"` wrapper onkeydown + backdrop 클릭

---

## CSS / 레이아웃

| 속성 | 값 |
|---|---|
| 모달 크기 | `clamp(560px, 70vw, 720px)` × `clamp(480px, 75vh, 640px)` |
| 위치 | `position: fixed; inset: 0;` flex-centered, backdrop `rgba(0,0,0,0.55)` |
| z-index | `1100` |
| 모바일 <768px | `inset: 0; border-radius: 0` |
| Phase 2 미지원 항목 | `opacity: 0.4; cursor: not-allowed` + tooltip |

---

## Exit Criteria

**Phase 1 (AC1–AC9)**
- [ ] AC1: `/` 단축키 → 모달 오픈; Playwright `chart_catalog.spec.ts` pass
- [ ] AC2: "rsi" / "상대강도" 검색 → RSI top 1; `catalogSearch.test.ts` unit test
- [ ] AC3: RSI(14) + RSI(7) 동시 마운트 → 별도 패인, 별도 chip; Playwright DOM assertion
- [ ] AC4: v2 7-key fixture → v3 인스턴스 7개 손실 0; vitest snapshot
- [ ] AC5: Favorites 25개 상한 + reload 보존; vitest + jsdom
- [ ] AC6: 13번째 separate 추가 시 toast; Playwright
- [ ] AC7: fps ≥ 55 (12 panes × 1500 bars Chrome desktop); Playwright trace
- [ ] AC8: 번들 델타 ≤ 15KB gzip; CI gate
- [ ] AC9: W-0399 기존 테스트 전원 통과 (zero regression)

**Phase 2 (AC10–AC15)**
- [ ] AC10: `GET /indicators/series` p95 ≤ 50ms (cache miss, 1500 bars SMA)
- [ ] AC11: cache hit rate ≥ 85% (200req/s 60min synthetic, 16 symbols)
- [ ] AC12: `indicator_extras` contract test green; openapi.d.ts 재생성 clean
- [ ] AC13: SMA(20) 추가 → network request 정확히 1회; Playwright network recorder
- [ ] AC14: `scripts/check_indicator_params_parity.ts` exit 0
- [ ] AC15: Prometheus p99 indicator compute ≤ 100ms (24h staging soak)

---

## 구현 플랜

**Phase 1 (5일, app-only)**
- PR1 — `types.ts` + `chartIndicators.ts` v3 + 마이그레이션 (1d)
- PR2 — `IndicatorCatalogModal`, `catalogSearch.ts`, `indicatorFavorites.ts` (2d)
- PR3 — ChartBoard 배선 + `/` 단축키 + `paneCrosshairSync` CrosshairChip 업데이트 (1d)
- PR4 — perf bench + a11y; fps gate; bundle delta (1d)

**Phase 2 (7일, engine+app, Phase 1 merge 후)**
- PR5 — engine indicators module + endpoint + LRU cache + codegen (3d)
- PR6 — `ChartSeriesPayload.indicator_extras` + `engineSeriesAdapter.ts` (2d)
- PR7 — catalog Phase-2 활성화 + observability + e2e (2d)

---

## Handoff Checklist

**신규 파일 (Phase 1)**
- `app/src/lib/indicators/types.ts`
- `app/src/lib/indicators/catalogSearch.ts`
- `app/src/lib/stores/migrations/indicators_v2_to_v3.ts`
- `app/src/lib/components/chart/indicators/IndicatorCatalogModal.svelte`
- `app/src/lib/components/chart/indicators/IndicatorCatalogTrigger.svelte`
- `scripts/check_bundle_delta.ts`

**수정 파일 (Phase 1)**
- `app/src/lib/indicators/registry.ts` — KO 동의어 top 30
- `app/src/lib/stores/chartIndicators.ts` — v3 스토어
- `app/src/lib/chart/paneIndicators.ts` — `IndicatorMountSpec`, IndicatorKind 확장
- `app/src/lib/chart/mountIndicatorPanes.ts` — multi-instance 시그니처
- `app/src/lib/chart/paneCrosshairSync.ts` — CrosshairChip 타입
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` — trigger, `/` 단축키
- `app/src/lib/chart/paneLayoutStore.ts` — MAX 12, `resolvePanePlacement`

**신규 파일 (Phase 2)**
- `engine/indicators/{__init__,base,registry,compute,cache}.py`
- `engine/api/routers/indicators.py`
- `app/src/lib/chart/engineSeriesAdapter.ts`
- `scripts/generate_indicator_params.ts`, `scripts/check_indicator_params_parity.ts`

**수정 파일 (Phase 2)**
- `engine/api/schemas/chart_series.py`
- `engine/api/openapi_paths.py`
- `app/src/lib/indicators/registry.ts` — `engineKey` + `display` 필드 추가
