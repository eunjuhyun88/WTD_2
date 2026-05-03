# W-0397 — TradingView-Parity Indicator Catalog & Multi-Instance Panes

> Wave: 6 | Priority: P1 | Effort: L
> Charter: In-Scope L4 (chart UX, TV parity)
> Status: 🟡 Design Draft
> Created: 2026-05-03
> Issue: #967
> Depends on: W-0395 (shipped 95c0f844)

## Goal

Jin이 `/`를 누르면 카탈로그 모달이 열리고, "rsi 7" 또는 "상대강도"로 검색해 RSI(7) 인스턴스를 기존 RSI(14) 옆 별도 패인에 추가할 수 있으며 — 우리가 계산하는 100+ 지표 전부가 패밀리별로 탐색 가능하고 즐겨찾기·최근 사용 탭이 TV와 동등하게 동작한다.

## Owner

engine+app (Phase 1 = app-only, Phase 2 = engine+app contract 확장)

## Scope

### Phase 1 — UX 패리티 (existing engineKey ~10개, app-only)

- **IndicatorCatalogModal**: TV-style dialog, 좌측 카테고리 트리(Price/Volume/Momentum/Derivatives/Sentiment/Liquidity), 우측 그리드+검색바+Recents+Favorites 탭
- **IndicatorCatalogTrigger**: 차트 툴바 `+` 버튼, 단축키 `/`
- **Search** (`catalogSearch.ts`): Fuse.js, aiSynonyms+label+id+family 가중치 매칭, KO/EN 양방향
- **Favorites/Recents**: localStorage `wtd.chart.indicators.favorites.v1` (max 25 LRU)
- **Multi-instance**: `IndicatorInstance[]` 모델, 2× RSI(14+7) 별도 패인 동시 마운트
- **Importance-ordered defaults**: registry `priority` sort
- **Archetype-aware placement**: overlay→pane[0], separate→sub-pane 자동 할당, histogram→단독
- **MAX 6→12 상향** (paneLayoutStore + paneLayoutStore 상수)
- **chartIndicators.ts v2→v3 마이그레이션** (localStorage key 변경)

**파일 (Phase 1)**:
- 신규: `app/src/lib/indicators/types.ts`, `app/src/lib/indicators/catalogSearch.ts`
- 신규: `app/src/lib/stores/indicatorFavorites.ts`, `app/src/lib/stores/migrations/indicators_v2_to_v3.ts`
- 신규: `app/src/lib/components/chart/indicators/IndicatorCatalogModal.svelte`
- 신규: `app/src/lib/components/chart/indicators/IndicatorCatalogTrigger.svelte`
- 신규: `scripts/check_bundle_delta.ts`
- 수정: `app/src/lib/indicators/registry.ts` (120개 확장 + KO 동의어 top 30)
- 수정: `app/src/lib/stores/chartIndicators.ts` (v3 스토어)
- 수정: `app/src/lib/chart/paneIndicators.ts` (IndicatorMountSpec + IndicatorKind 7개)
- 수정: `app/src/lib/chart/mountIndicatorPanes.ts` (multi-instance 시그니처)
- 수정: `app/src/lib/chart/paneCrosshairSync.ts` (CrosshairChip 타입)
- 수정: `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` (trigger + `/` 단축키)
- 수정: `app/src/lib/chart/paneLayoutStore.ts` (MAX 12, resolvePanePlacement)
- 수정: `app/src/components/chart/PaneInfoBar.svelte` (chipLabel())

### Phase 2 — 전 지표 노출 (~100개, engine+app)

- Engine `GET /indicators/series` endpoint + LRU cache + param 검증
- `ChartSeriesPayload.indicator_extras?` additive optional field
- registry ↔ engine 카탈로그 100% 일치 CI gate
- archetype/dimensions → LWC SeriesType 자동 매핑
- Param overrides (RSI length, SMA period 등)

**파일 (Phase 2)**:
- 신규: `engine/indicators/{__init__,base,registry,compute,cache}.py`
- 신규: `engine/api/routers/indicators.py`
- 신규: `app/src/lib/chart/engineSeriesAdapter.ts`
- 신규: `scripts/generate_indicator_params.ts`, `scripts/check_indicator_params_parity.ts`
- 수정: `engine/api/schemas/chart_series.py`, `engine/api/openapi_paths.py`
- 수정: `app/src/lib/indicators/registry.ts` (engineKey + display 필드)

## Non-Goals

- **드래그 패인 재정렬** — W-0317 SplitPane과 의존성 충돌 가능. 별도 W
- **Pine Script 등 사용자 정의 지표** — Wave 7+ scope
- **Strategies 탭** — 별도 도메인 (W-0387 judge/save 흐름)
- **Phase 2 WS streaming for extras** — W-0370 signal feed와 합쳐 별도 처리
- **Per-instance 컬러 피커 UI** — Phase 2는 preset까지만

## Facts (코드 실측)

- `IndicatorKind = 'cvd'|'funding'|'oi'|'liq'` — `app/src/lib/chart/paneIndicators.ts`
- `MAX_PANE_INDICATORS = 6` — `app/src/lib/stores/chartIndicators.ts`
- `wtd.chart.indicators.v2` — localStorage key (현행)
- `IndicatorToggles`: showVolume/showRSI/showMACD/showOI/showCVD/showFundingPane/showLiqPane (7 boolean)
- `registry.ts` ~1683줄, `IndicatorDef` with archetype/dimensions/priority/aiSynonyms/engineKey
- Phase 1에서 engineKey 없는 항목 (~90개) → disabled + "Phase 2 예정" tooltip

## Data Model Changes

### 1. `IndicatorInstance` type (신규 `app/src/lib/indicators/types.ts`)

```typescript
export interface IndicatorInstance {
  instanceId: string;      // nanoid(8) — 생성 시 한 번, 재사용 금지
  defId: string;           // FK → IndicatorDef.id in registry.ts
  params: Record<string, number | string | boolean>;
  style: {
    color?: string;        // hex, default = family palette 회전
    lineWidth?: 1 | 2 | 3;
    visible: boolean;      // soft hide (series 유지, opacity 0)
  };
  paneIndex: number;       // 0=overlay, 1..N=sub-pane, -1=auto
  source: 'local' | 'engine';
  createdAt: number;       // ms epoch, pane 배치 determinism 기준
}
```

### 2. `chartIndicators.ts` v2 → v3

**Old (v2):** `{ enabled: Set<IndicatorKey>; activeCount: number }` (`wtd.chart.indicators.v2`)

**New (v3):** localStorage key `wtd.chart.indicators.v3`

```typescript
export interface IndicatorStoreV3 {
  version: 3;
  instances: IndicatorInstance[];            // ordered by createdAt — order is load-bearing
  paneAssignment: Record<string, number>;    // instanceId → paneIndex (denormalized cache)
  activeCount: number;
}
```

배열 사용 이유: pane 배치 결정론적 재현에 순서 필요 (Record는 순서 비보장).

마이그레이션 (`app/src/lib/stores/migrations/indicators_v2_to_v3.ts`):

```typescript
const KIND_PANE: Record<string, number> = {
  volume:1, cvd:2, macd:3, rsi:4, oi:5, funding:6, liq:7
};
const KIND_PARAMS: Record<string, Record<string, unknown>> = {
  rsi: { length: 14, source: 'close' },
  macd: { fast: 12, slow: 26, signal: 9 },
  cvd: {}, oi: {}, funding: {}, liq: {}, volume: {},
};
export function migrateV2toV3(v2Raw: string): IndicatorStoreV3 {
  // parse v2 (Set serialized as array), filter known 7 keys
  // map each to IndicatorInstance with KIND_PANE + KIND_PARAMS defaults
  // unknown keys → drop + console.warn (no toast)
  // return IndicatorStoreV3
}
```

### 3. `IndicatorKind` + `IndicatorMountSpec` (`paneIndicators.ts`)

```typescript
// Phase 1: 4개 → 7개
export type IndicatorKind = 'cvd'|'funding'|'oi'|'liq'|'rsi'|'macd'|'volume';
// Phase 2: | 'engine' 추가

export interface IndicatorMountSpec {
  instanceId: string;
  kind: IndicatorKind;
  paneIndex: number;        // 0=overlay, 1..N=sub-pane, -1=auto
  params: Record<string, unknown>;
  style: IndicatorInstance['style'];
}
```

### 4. `mountIndicatorPanes()` 시그니처

```typescript
// before
mountIndicatorPanes(chart, payload, klines, ind, toggles: IndicatorToggles, tf)
// after
mountIndicatorPanes(
  chart: IChartApi,
  candles: Candle[],
  specs: IndicatorMountSpec[],
  ctx: { engineExtras?: Record<string, EngineSeriesPoints> }
): IndicatorSeriesRefs

// 마이그레이션 브리지 (Phase 1 기간만, 종료 시 삭제):
function togglesToSpecs(toggles: IndicatorToggles): IndicatorMountSpec[]
```

`IndicatorSeriesRefs` 변경: `byInstance: Map<instanceId, {kind, series[], paneIndex}>` 단일 맵으로 교체 (legacy kind map 제거).

## Component Architecture

### `IndicatorCatalogModal.svelte`

```svelte
interface Props {
  open: boolean;                            // $bindable
  onAdd: (defId: string, params?: Record<string, unknown>) => void;
  onClose: () => void;
  initialQuery?: string;                    // '/' 단축키로 열 때 pre-fill
  activeInstances: IndicatorInstance[];
}
// Layout (CSS grid):
// ┌─ header: SearchBar + Close ──────────────────────┐
// │ left 180px: FamilyTree │ right: ResultGrid+Tabs  │
// └─ footer: 선택 N개 + 추가 버튼 ──────────────────┘
```

### `IndicatorCatalogTrigger.svelte`

```svelte
interface Props { onOpen: () => void; }
// 가격 패인 툴바 우측에 "+" 버튼 + "(/) 지표 추가" 라벨
// '/' 단축키는 ChartBoard window.addEventListener로 등록
```

검색바: 별도 컴포넌트 없음 — 모달 헤더 내 `<input type="search">`.

## Catalog Search (`catalogSearch.ts`)

```typescript
const FUSE_OPTIONS: IFuseOptions<IndicatorDef> = {
  keys: [
    { name: 'label',      weight: 0.50 },
    { name: 'id',         weight: 0.25 },
    { name: 'aiSynonyms', weight: 0.20 },
    { name: 'family',     weight: 0.05 },
  ],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 1,
  shouldSort: false,        // 우리가 직접 sort
};
// sort 순서: (1) fuse score asc, (2) favorites first, (3) priority asc
// KO aiSynonyms: top 30 지표 curated 필수 (rsi → '상대강도지수', '알에스아이' 등)
```

## `indicatorFavorites.ts`

localStorage key: `wtd.chart.indicators.favorites.v1`, max 25 LRU (oldest evict)

```typescript
export const indicatorFavorites = {
  get list(): string[] { ... },   // $state getter
  has(id: string): boolean { ... },
  toggle(id: string): void { ... },  // front insert / remove; trim to 25
  clear(): void { ... },
};
```

## Pane 배치 규칙 (`resolvePanePlacement` in `paneLayoutStore.ts`)

| 조건 | 결과 |
|---|---|
| `archetype = 'overlay'` | paneIndex = 0 (항상) |
| `archetype = 'separate'`, 슬롯 있음 | 다음 빈 1..12 |
| `archetype = 'separate'`, 12 슬롯 만석 | -1 반환 → toast "최대 12개 보조 지표까지" |
| `archetype = 'histogram'` | 같은 kind 기존 패인에 병합; 없으면 separate |
| 같은 kind 두 번째 인스턴스 | 항상 새 패인 (chip 구분 명확) |
| `volume` 두 번째 | 예외 — 항상 pane 1 공유 |

## PaneInfoBar 다중 인스턴스 chip

```typescript
function chipLabel(inst: IndicatorInstance, def: IndicatorDef): string {
  const pKey = Object.keys(inst.params)[0] ?? 'length';
  const v = inst.params[pKey];
  return v != null ? `${def.label} ${v}` : def.label;
  // RSI(14) → "RSI 14", RSI(7) → "RSI 7"
  // 동일 params 중복 시 → "RSI 14", "RSI 14 (2)" (createdAt 순)
}
```

`CrosshairChip` 새 타입 (`paneCrosshairSync.ts`):
```typescript
interface CrosshairChip {
  instanceId: string;
  kind: IndicatorKind;
  label: string;          // chipLabel() 결과
  values: (number | null)[];  // dimension 수만큼
  paneIndex: number;
}
```

## Keyboard / a11y

- **`/` 단축키**: `ChartBoard.svelte` `$effect`에서 `window.addEventListener('keydown')`. `target`이 `input|textarea|[contenteditable]`이면 스킵
- **모달 오픈 후**: `tick()` 뒤 `searchInputRef.focus()`
- **Escape**: `role="dialog" aria-modal="true"` wrapper의 `onkeydown`에서 `onClose()`. backdrop 클릭도 동일
- **Arrow key grid nav**: Phase 2 defer. Phase 1은 Tab 사이클링

## CSS / 레이아웃

| 속성 | 값 |
|---|---|
| 모달 크기 | `clamp(560px, 70vw, 720px)` × `clamp(480px, 75vh, 640px)` |
| 위치 | `position: fixed; inset: 0` flex-centered, backdrop `rgba(0,0,0,0.55)` |
| z-index | `1100` |
| 모바일 <768px | `inset: 0; border-radius: 0` 전체화면 |
| 카테고리 트리 | 폭 180px, 독립 overflow-y, 활성 상태 2px 좌 accent border |
| 결과 그리드 행 | 64px, hover `--surface-2`, 추가됨 ✓ 우측 |
| Phase 2 미지원 항목 | `opacity: 0.4; cursor: not-allowed; pointer-events: none` + tooltip |

## Phase 2 엔진 API

### 엔드포인트

```
GET /indicators/series
  ?symbol=BTCUSDT&timeframe=15m
  &indicator=sma&params=length:20,source:close
  &since=1714694400000&limit=1500
```

응답:
```typescript
interface IndicatorSeriesResponse {
  instance_key: string;
  indicator: string;
  params: Record<string, string | number | boolean>;
  series: { name: string; points: { time: number; value: number }[] }[];
  meta: { computed_at: number; bar_count: number; cache_hit: boolean; schema_version: 1 };
}
```

### `ChartSeriesPayload` 확장 (additive)

```python
indicator_extras: dict[str, IndicatorSeriesResponse] | None = None
```

### LRU cache

- **위치**: in-process `cachetools.TTLCache(maxsize=2048)` per FastAPI worker
- **key**: `f"{symbol}|{tf}|{indicator}|{sorted_params_kv}|{last_closed_bar_ts}"`
- **TTL**: closed bar = 3600s, live bar = `tf_seconds / 4`
- **Redis 거부 이유**: 데이터 결정론적이라 eviction 무해, 추가 레이턴시 + ops 불필요
- **stampede 방지**: `asyncio.Lock` singleflight per cache key

### engine → LWC SeriesType 매핑

| archetype | dimensions | LWC type |
|---|---|---|
| overlay | 1 | LineSeries |
| overlay | 2–3 | LineSeries × N |
| separate | 1–3 | LineSeries × N (own pane) |
| histogram | 1 | HistogramSeries |
| histogram | 2 | HistogramSeries + Line |

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 | Owner |
|---|---|---|---|---|
| v2→v3 기존 데이터 손실 | M | H | read-then-write; 구 키 보존 → 다음 세션 삭제; e2e v2 fixture | app |
| multi-instance로 byKindLegacy 소비자 깨짐 | H | M | Phase 1 기간 legacy map 유지, step 6 동시 마이그레이션 | app |
| Fuse.js +12KB gzip 번들 | L | L | lazy-import (모달 열릴 때), delta ≤ 15KB CI gate | app |
| `/` 단축키 Firefox quick-find 충돌 | M | M | chart 포커스 있을 때만 preventDefault | app |
| 12 패인 × 1500 bars FPS 저하 | L | H | Phase 1 step 7 bench; fps ≥ 55 gate | app |
| engine cold-start cache stampede | M | M | asyncio.Lock singleflight per cache key | engine |
| 파라미터 스키마 클라/엔진 drift | M | H | codegen `indicator_params.json` → CI gate | engine+app |
| KO 동의어 미달 → 검색 품질 저하 | H | M | top 30 curated 필수; search miss 익명 로그 (기존 consent) | app |
| LRU maxsize 초과 OOM | L | M | maxsize=2048, Prometheus eviction_total metric | engine |
| Phase 2 engine 레이턴시 차트 오픈 지연 | H | M | 배치 endpoint `?indicators=a,b,c` 병렬 요청 | engine |

### Dependencies / Rollback

- **Depends**: W-0395 (shipped). W-0304 (per-pane) 동시 OK. W-0317 (SplitPane) mutex
- **Rollback Phase 1**: chartIndicators.ts revert. instances는 single-instance 백워드 호환
- **Rollback Phase 2**: `indicator_extras` optional → engine PR 단독 revert 가능

## AI Researcher 관점

### Data Impact / Failure Modes

- **Cache**: indicator series = deterministic given (symbol, tf, indicator, params, last_closed_bar_ts). LRU safe.
- **registry ↔ engine parity**: CI gate 100% 일치 (drift → build 실패)
- **Failure Modes**:
  - engineKey 없는 항목 클릭 (Phase 1) → disabled + tooltip, fail-soft
  - 엔진 계산 실패 (NaN/exception) → series 미마운트 + PaneInfoBar 경고 chip, 차트 정상 동작
  - Param 범위 밖 → engine 클램프 + 경고 헤더, UI toast

## Decisions

- **[D-0397-01]** TV-style 모달 (accept) vs sidebar drawer (reject — 차트 영역 잠식, 모바일 적응 어려움) vs k-bar (reject — 100+ entry 탐색 비효율)
- **[D-0397-02]** on-demand query (accept) vs precompute all (reject — 100×N×M 비용 폭증, 99% unused) vs WS push (reject — Phase 2 스코프 초과)
- **[D-0397-03]** `instances` 배열 (accept) vs `Record<kind, Instance[]>` (reject — 100+ kind이면 sparse, 순서 비보장)
- **[D-0397-04]** 모달 내 param 조정 (accept Phase 1 후) vs 우클릭 컨텍스트 (reject Phase 1 — 모바일 미지원)
- **[D-0397-05]** `registry.ts` 단일 진실 (accept) + `indicatorRegistry.ts` deprecate. Phase 1에서 engineKey 백포팅
- **[D-0397-06]** MAX 12 (accept) vs 무제한 (reject — LWC v5.1 12+ 패인 FPS bench 미측정). 12가 안전 상한
- **[D-0397-07]** Phase 분리 (accept) — Phase 1 즉시 사용자 가치. Phase 2는 engine contract 변경으로 risk profile 다름
- **[D-0397-08]** in-process LRU (accept) vs Redis (reject — 레이턴시 + ops 오버킬; 데이터 결정론적)

## Open Questions

- [ ] [Q-0397-01] `indicatorRegistry.ts` (engineKey 보유) → `registry.ts` 머지 시점: Phase 1 후반 vs Phase 2 동시?
- [ ] [Q-0397-02] Favorites Supabase 클라우드 sync: Phase 2와 같이? 아니면 로컬만 유지? (default: 로컬만)
- [ ] [Q-0397-03] 모달 arrow key grid nav — Phase 1 필수 vs defer? (default: Phase 2)
- [ ] [Q-0397-04] v2→v3 자동 마이그레이션 사용자 동의 없이 OK? (default: OK — 데이터 손실 없음)
- [ ] [Q-0397-05] Phase 2 param schema canonical 위치 — codegen TS→JSON→Python vs Python Pydantic 원본? (default: codegen TS→JSON)

## Implementation Plan

### Phase 1 (5d, app-only)

**PR1 — Types + Store (1d)**
- 신규: `types.ts` (IndicatorInstance)
- 수정: `registry.ts` 120개 확장 + KO 동의어 top 30
- 신규: `migrations/indicators_v2_to_v3.ts` + `chartIndicators.ts` v3
- Test: `registry.test.ts`, `indicators_v2_to_v3.test.ts`, `chartIndicators.test.ts`

**PR2 — Catalog Modal + Search + Favorites (2d)**
- 신규: `IndicatorCatalogModal.svelte`, `IndicatorCatalogTrigger.svelte`
- 신규: `catalogSearch.ts`, `indicatorFavorites.ts`
- Test: `catalogSearch.test.ts`, `IndicatorCatalogModal.test.ts`

**PR3 — Multi-instance mount + ChartBoard wire-up (1d)**
- 수정: `paneIndicators.ts`, `mountIndicatorPanes.ts`, `paneCrosshairSync.ts`
- 수정: `ChartBoard.svelte` (trigger + `/` 단축키 + instances prop)
- 수정: `PaneInfoBar.svelte` (chipLabel), `paneLayoutStore.ts` (MAX 12)
- 신규: `togglesToSpecs.ts` 브리지 (Phase 1 기간만)
- Test: mount 2× RSI assertion, crosshair chip label

**PR4 — Perf bench + a11y + bundle gate (1d)**
- 신규: `__bench__/multiInstance.bench.ts` (fps trace via Playwright)
- 신규: `scripts/check_bundle_delta.ts`
- Manual: keyboard nav, screen reader modal

### Phase 2 (7d, Phase 1 merge 후)

**PR5 — Engine indicators module + endpoint + LRU cache (3d)**
- 신규: `engine/indicators/{__init__,base,registry,compute,cache}.py`
- 신규: `engine/api/routers/indicators.py`
- 신규: `scripts/generate_indicator_params.ts`, `scripts/check_indicator_params_parity.ts`
- Test: `test_basic.py` (parity vs TA-Lib <1e-6), `test_cache.py`, `test_indicators_endpoint.py`

**PR6 — ChartSeriesPayload.indicator_extras + app adapter (2d)**
- 수정: `engine/api/schemas/chart_series.py`, `engine/api/openapi_paths.py`
- 신규: `app/src/lib/chart/engineSeriesAdapter.ts`
- 수정: `mountIndicatorPanes.ts` (engine kind dispatch)
- Test: contract test, engineSeriesAdapter unit test

**PR7 — Catalog Phase-2 활성화 + observability + e2e (2d)**
- 수정: `IndicatorCatalogModal.svelte` (Phase-2 disabled 해제)
- 신규: `docs/runbooks/indicators.md`
- Playwright: `chart_catalog_engine.spec.ts`

## Exit Criteria

### Phase 1
- [ ] **AC1**: `/` 단축키 → 모달 오픈; Playwright `chart_catalog.spec.ts` pass
- [ ] **AC2**: "rsi" / "상대강도" 검색 → RSI top 1; `catalogSearch.test.ts`
- [ ] **AC3**: RSI(14) + RSI(7) 동시 마운트 → 별도 패인 + 별도 chip; Playwright DOM assertion
- [ ] **AC4**: v2 7-key fixture → v3 인스턴스 7개, 손실 0; vitest snapshot
- [ ] **AC5**: Favorites max 25 + reload 보존; vitest + jsdom localStorage
- [ ] **AC6**: 13번째 separate 추가 → toast "최대 12개 보조 지표까지"; Playwright
- [ ] **AC7**: fps ≥ 55 (12 panes × 1500 bars Chrome desktop); Playwright trace
- [ ] **AC8**: 번들 델타 ≤ 15KB gzip; `scripts/check_bundle_delta.ts` CI gate
- [ ] **AC9**: W-0395 기존 테스트 전원 통과 (zero regression)
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

### Phase 2
- [ ] **AC10**: `GET /indicators/series` p95 ≤ 50ms (cache miss, SMA 1500 bars); pytest timer
- [ ] **AC11**: cache hit rate ≥ 85% (200req/s 60min, 16 symbols); pytest
- [ ] **AC12**: `indicator_extras` contract test green; engine-openapi.d.ts 재생성 clean
- [ ] **AC13**: catalog SMA(20) 추가 → network request 1회; Playwright network recorder
- [ ] **AC14**: `scripts/check_indicator_params_parity.ts` exit 0 (TS ↔ engine parity)
- [ ] **AC15**: Prometheus p99 indicator compute ≤ 100ms (24h staging soak)
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

## Handoff Checklist

### New files (Phase 1)
- [ ] `app/src/lib/indicators/types.ts`
- [ ] `app/src/lib/indicators/catalogSearch.ts`
- [ ] `app/src/lib/stores/indicatorFavorites.ts`
- [ ] `app/src/lib/stores/migrations/indicators_v2_to_v3.ts`
- [ ] `app/src/lib/components/chart/indicators/IndicatorCatalogModal.svelte`
- [ ] `app/src/lib/components/chart/indicators/IndicatorCatalogTrigger.svelte`
- [ ] `scripts/check_bundle_delta.ts`

### Modified files (Phase 1)
- [ ] `app/src/lib/indicators/registry.ts`
- [ ] `app/src/lib/stores/chartIndicators.ts`
- [ ] `app/src/lib/chart/paneIndicators.ts`
- [ ] `app/src/lib/chart/mountIndicatorPanes.ts`
- [ ] `app/src/lib/chart/paneCrosshairSync.ts`
- [ ] `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte`
- [ ] `app/src/lib/chart/paneLayoutStore.ts`
- [ ] `app/src/components/chart/PaneInfoBar.svelte`

### New files (Phase 2)
- [ ] `engine/indicators/{__init__,base,registry,compute,cache}.py`
- [ ] `engine/api/routers/indicators.py`
- [ ] `app/src/lib/chart/engineSeriesAdapter.ts`
- [ ] `scripts/generate_indicator_params.ts`
- [ ] `scripts/check_indicator_params_parity.ts`

### Modified files (Phase 2)
- [ ] `engine/api/schemas/chart_series.py`
- [ ] `engine/api/openapi_paths.py`
- [ ] `app/src/lib/indicators/registry.ts` (engineKey + display 필드)

### Test files
- [ ] `app/src/lib/indicators/registry.test.ts`
- [ ] `app/src/lib/indicators/catalogSearch.test.ts`
- [ ] `app/src/lib/stores/chartIndicators.test.ts`
- [ ] `app/src/lib/stores/migrations/indicators_v2_to_v3.test.ts`
- [ ] `app/src/lib/components/chart/indicators/IndicatorCatalogModal.test.ts`
- [ ] `app/src/lib/chart/__bench__/multiInstance.bench.ts`
- [ ] `app/tests/e2e/chart_catalog.spec.ts` (Playwright)
- [ ] `engine/tests/indicators/test_basic.py` (Phase 2)
- [ ] `engine/tests/indicators/test_cache.py` (Phase 2)
- [ ] `engine/tests/api/test_indicators_endpoint.py` (Phase 2)
- [ ] `app/tests/e2e/chart_catalog_engine.spec.ts` (Phase 2)
