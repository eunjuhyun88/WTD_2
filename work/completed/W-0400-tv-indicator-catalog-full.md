# W-0400 — TradingView-Parity Indicator Catalog (Phase 1A → Phase 2B)

> Wave: 6 | Priority: P1 | Effort: L
> Charter: In-Scope (TV parity, chart UX)
> Issue: #976
> Status: 🟡 Design Draft (Re-phased 2026-05-04)
> Created: 2026-05-03
> Updated: 2026-05-04
> Depends on: W-0399-P2 (PR #997 merged 0cd3ee2a — multi-instance store + 10-kind mount + Active 탭)

## Owner
app — hjj032549@gmail.com

## Goal
진이 차트에서 `/`를 누르면 TV-style 카탈로그 모달이 열리고, "rsi 7"·"상대강도"로 검색해 RSI(7)을 RSI(14) 옆 새 패인에 추가할 수 있으며, Phase 2 머지 후엔 100+ 엔진 계산 지표 전부가 같은 모달에서 탐색 가능하다.

## Scope
- 신규 모달 `IndicatorCatalogModal.svelte` + `/` 단축키 진입점 (`ChartBoard.svelte` 수정).
- 기존 `app/src/lib/indicators/registry.ts` (시장데이터 IndicatorDef)에 **TV TA archetype + `engineKey` 옵션 필드** 추가하고, 클라이언트 계산 가능한 10종 (W-0399-P2 IndicatorKind)을 등록.
- Fuse.js 기반 `catalogSearch.ts` (기존 `search.ts`는 AIPanel intent용으로 그대로 유지).
- Favorites/Recents localStorage (`wtd.chart.indicators.favorites.v1`, `wtd.chart.indicators.recents.v1`).
- Phase 2: `engine/api/routes/indicators.py` `GET /indicators/series` + LRU cache + `engineSeriesAdapter.ts` (app).

## Non-Goals
- v3 store 마이그레이션 — **드롭** (W-0399-P2가 이미 `wtd.chart.indicator-instances.v1`로 multi-instance 모델을 정착시킴; v2→v3 재마이그레이션은 사용자 데이터 손실 위험만 추가).
- IndicatorLibrary 사이드패널 재설계 — **드롭** (Active 탭은 W-0399-P2에서 이미 inline param edit까지 완료; 카탈로그 모달과 공존).
- Drawing tools, alert system — Wave 7 별도 W-itemize.
- Custom Pine Script — TV parity 범위 밖, 별도 W로 분리.

## Canonical Files

**기존 (수정 대상)**
- `app/src/lib/indicators/registry.ts` (377 LoC, 21 IndicatorDef)
- `app/src/lib/indicators/types.ts` (264 LoC, IndicatorDef 인터페이스)
- `app/src/lib/indicators/search.ts` (97 LoC, AIPanel intent용 — 변경 없음)
- `app/src/lib/chart/indicatorInstances.ts` (W-0399-P2 multi-instance store, 변경 없음)
- `app/src/lib/chart/mountIndicatorPanes.ts` (W-0399-P2 10-kind mount, 변경 없음)
- `app/src/lib/chart/paneIndicators.ts` (`IndicatorKind = 'cvd' | 'funding' | 'oi' | 'liq'`)
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` (Phase 1B에서 `/` 단축키 추가)
- `app/src/lib/hubs/terminal/workspace/IndicatorLibrary.svelte` (Active 탭 — 변경 없음)
- `engine/api/routes/chart.py` (Phase 2 ChartSeriesPayload 참조)

**신규 (생성)**
- `app/src/lib/indicators/catalogSearch.ts` (Fuse.js, lazy-import)
- `app/src/lib/indicators/catalogFavorites.ts` (Favorites/Recents store)
- `app/src/lib/components/chart/indicators/IndicatorCatalogModal.svelte`
- `app/src/lib/components/chart/indicators/IndicatorCatalogTrigger.svelte` (`fx` 버튼)
- `app/scripts/check_bundle_delta.ts` (Phase 1C CI gate)
- `engine/api/routes/indicators.py` (Phase 2A)
- `engine/indicators/{__init__,base,registry,compute,cache}.py` (Phase 2A)
- `app/src/lib/chart/engineSeriesAdapter.ts` (Phase 2B)
- `scripts/check_indicator_params_parity.ts` (Phase 2B CI gate)

## Facts
- W-0399-P2 PR #997 머지(0cd3ee2a). `indicatorInstances.ts` 이미 nanoid+localStorage v1, mount 10종 완료.
- `registry.ts` 21개 IndicatorDef는 모두 시장데이터(OI/Funding/CVD/Liq/Options/Netflow/Vol). TV TA 10종은 미등록 — Phase 1A에서 등록 필요.
- `search.ts`는 AIPanel `convertPromptToSetup` 진입점이라 **유지**. 카탈로그 모달은 별도 `catalogSearch.ts` (Fuse.js fuzzy)로 분리.
- 마이그레이션 번호: `051_tv_imports.sql`이 마지막 → Phase 2A는 `052_indicator_compute_log.sql` (필요 시).
- engine routers는 `engine/api/routes/` 디렉토리 (NOT `routers/`). Phase 2A 신규 파일은 `engine/api/routes/indicators.py`.

## Assumptions
- A1: Fuse.js는 dynamic `import()`로 lazy-load 하면 모달 초기 close 상태에서 번들에서 빠짐. → Phase 1C에서 측정 검증.
- A2: 12-pane 차트는 lightweight-charts v5.1+ multi-pane API로 fps≥55 유지. → Phase 1C bench로 검증.
- A3: 엔진 indicator compute는 stateless이며, `(symbol,tf,indicator,params,last_closed_bar_ts)` 키로 결정론적 캐시 가능. → Phase 2A 단위 테스트로 검증.
- A4: Phase 1에선 TV TA 10종 + 시장 21종 = **31개**로 시작, Phase 2에서 100+로 확장.

---

## Phase 1A — Registry + IndicatorDef 확장 (PR1, ~0.5d)

### 목표
`IndicatorDef`에 TV TA용 `engineKey?`/`paramSchema?`/`category?` 옵션 필드를 **추가만** 하고, W-0399-P2의 10종 IndicatorKind (rsi/macd/ema/bb/vwap/atr_bands/volume/oi/cvd/derivatives)를 `INDICATOR_REGISTRY`에 등록한다.

### 파일
- 수정: `app/src/lib/indicators/types.ts` — `IndicatorDef`에 옵션 필드 3개 추가 + `IndicatorCategory` 타입
- 수정: `app/src/lib/indicators/registry.ts` — TV TA 10개 IndicatorDef append + KO 동의어
- 신규: `app/src/lib/indicators/__tests__/registry.test.ts` — 31개 정합성 unit

### Exit Criteria
- AC1A-1: `Object.keys(INDICATOR_REGISTRY).length === 31` (기존 21 + TV TA 10). unit test green.
- AC1A-2: TV TA 10종 모두 `engineKey` 필드 있음, `category === 'TA'`. unit test green.
- AC1A-3: 기존 21개 IndicatorDef 중 어떤 필드도 변경되지 않음 (snapshot diff 0).
- AC1A-4: KO 동의어 — TV TA 10종 각각 최소 2개 ('rsi'→['상대강도','알에스아이'] 등). assertion test green.
- AC1A-5: `pnpm typecheck` 0 errors, `pnpm test indicators/` green, 기존 W-0399-P2 테스트 0 regression.

---

## Phase 1B — IndicatorCatalogModal + `/` 단축키 (PR2, ~2d)

### 목표
TV-style 모달 컴포넌트 + Fuse.js 검색 + `/` 단축키 진입점. 모달에서 `Add` 클릭 → 기존 `indicatorInstances.add(defId, params)`로 위임 (mount 로직 재구현 금지).

### 파일
- 신규: `app/src/lib/components/chart/indicators/IndicatorCatalogModal.svelte`
- 신규: `app/src/lib/components/chart/indicators/IndicatorCatalogTrigger.svelte` (`fx` toolbar 버튼)
- 신규: `app/src/lib/indicators/catalogSearch.ts` (Fuse.js dynamic import)
- 수정: `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` — `/` 단축키 + 모달 마운트
- 신규: `app/src/lib/indicators/__tests__/catalogSearch.test.ts`
- 신규: `app/tests/e2e/chart_catalog.spec.ts` (Playwright)

### Exit Criteria
- AC1B-1: `/` 키 누르면 모달 open. input/textarea/contenteditable 포커스 시 미발동. Playwright `chart_catalog.spec.ts` pass (3 cases).
- AC1B-2: "rsi" 검색 → top 1 = RSI; "상대강도" 검색 → top 1 = RSI. unit test 6 cases green.
- AC1B-3: 모달에서 RSI(14) Add → `indicatorInstances.add` 호출 1회, paneCount +1. Playwright DOM assertion.
- AC1B-4: 같은 RSI를 length=7로 다시 Add → 별도 instanceId, 별도 패인. Playwright DOM count assertion (RSI chip ×2).
- AC1B-5: Escape / backdrop 클릭 / Close 버튼 모두 모달 close. `aria-modal="true"`, focus trap. axe-core a11y 0 violations.
- AC1B-6: 검색 응답 `< 16ms` (31 IndicatorDef × 5회 평균, jsdom bench).

---

## Phase 1C — Favorites/Recents + 번들/FPS 게이트 (PR3, ~1d)

### 목표
Favorites/Recents localStorage 스토어, 모달의 Favorites/Recents 탭, perf/bundle CI gate.

### 파일
- 신규: `app/src/lib/indicators/catalogFavorites.ts` (LRU 25, localStorage v1)
- 신규: `app/src/lib/indicators/__tests__/catalogFavorites.test.ts`
- 수정: `app/src/lib/components/chart/indicators/IndicatorCatalogModal.svelte` — Favorites/Recents 탭
- 신규: `app/scripts/check_bundle_delta.ts` (Phase 1A baseline 대비 gzip delta 측정)
- 신규: `app/tests/e2e/chart_catalog_perf.spec.ts` (Playwright trace fps)

### Exit Criteria
- AC1C-1: Favorites 25개 상한; 26번째 추가 시 가장 오래된 항목 제거. unit 4 cases green.
- AC1C-2: localStorage reload 보존; jsdom 시뮬레이션 + Playwright reload 모두 pass.
- AC1C-3: Recents 최근 10개, 중복 시 맨 앞으로 이동. unit 3 cases green.
- AC1C-4: 번들 델타 ≤ **15KB gzip** (Phase 1A baseline 대비). `check_bundle_delta.ts` exit 0.
- AC1C-5: 12 panes × 1500 bars × Chrome desktop에서 fps ≥ **55** (5초 평균). Playwright trace.
- AC1C-6: `IndicatorCatalogModal` 첫 open 시 Fuse.js chunk 동적 로드 1회만, 두 번째 open 0회. Network recorder 검증.

---

## Phase 2A — Engine indicators API (PR4, ~3d)

### 목표
`GET /indicators/series` + 결정론적 LRU 캐시 + 100+ 지표 compute 모듈. Phase 1에서 등록 안 된 70+ 지표는 engine 카탈로그에만 존재 (app은 Phase 2B에서 sync).

### 파일
- 신규: `engine/indicators/__init__.py`, `engine/indicators/base.py` (IndicatorComputer ABC)
- 신규: `engine/indicators/registry.py` (engine catalog, 100+ 지표 메타)
- 신규: `engine/indicators/compute.py` (TA-Lib + 자체 구현)
- 신규: `engine/indicators/cache.py` (`cachetools.TTLCache(maxsize=2048)` + asyncio.Lock singleflight)
- 신규: `engine/api/routes/indicators.py` (`GET /indicators/series`)
- 수정: `engine/api/main.py` — router include
- 수정: `engine/api/openapi_paths.py` — schema 추가
- 신규: `engine/tests/test_indicators_endpoint.py` (15+ cases)

### Exit Criteria
- AC2A-1: `GET /indicators/series?symbol=BTCUSDT&timeframe=15m&indicator=sma&params=length:20&limit=1500` → 200, `series.points.length == 1481`. pytest pass.
- AC2A-2: p95 latency ≤ **50ms** cache miss (1500 bars SMA, pytest-benchmark, 100 runs).
- AC2A-3: cache hit rate ≥ **85%** (200 req/s × 60s synthetic, 16 symbols × 5 indicator × 4 param). pytest report.
- AC2A-4: singleflight — 동일 cache miss 키 동시 100req → compute 함수 호출 1회. asyncio test green.
- AC2A-5: engine catalog ≥ **100 IndicatorMeta** 등록. `len(REGISTRY) >= 100` assertion.
- AC2A-6: openapi-typescript 재생성 후 빌드 clean (CI Contract gate green).
- AC2A-7: 잘못된 indicator key → 404 + `{error: "unknown_indicator"}`. 잘못된 params → 400.

---

## Phase 2B — App adapter + catalog Phase-2 활성화 (PR5, ~2d)

### 목표
App `engineSeriesAdapter`로 engine indicator series를 fetch → Lightweight-Charts SeriesApi에 mount. 카탈로그 모달이 engine-only 지표도 enabled로 노출.

### 파일
- 신규: `app/src/lib/chart/engineSeriesAdapter.ts` (`fetch + setData + applyOptions` 래퍼)
- 수정: `app/src/lib/components/chart/indicators/IndicatorCatalogModal.svelte` — engine-only 지표 enabled 처리
- 수정: `app/src/lib/indicators/registry.ts` — engine 카탈로그와 sync (70+ 지표 IndicatorDef 추가)
- 신규: `scripts/check_indicator_params_parity.ts` (engine `/indicators/registry` ↔ app diff exit code)
- 신규: `app/src/lib/chart/__tests__/engineSeriesAdapter.test.ts` (8+ cases, fetch mock)
- 신규: `app/tests/e2e/chart_catalog_engine.spec.ts`
- 수정: `.github/workflows/contract-check.yml` — `check_indicator_params_parity` 추가

### Exit Criteria
- AC2B-1: 모달에서 SMA(20) Add → 정확히 1회 `GET /indicators/series` 호출, mount 후 chart에 라인 1개 추가. Playwright network recorder.
- AC2B-2: archetype `histogram` 지표 → `HistogramSeries`로 mount. DOM assertion.
- AC2B-3: app/engine catalog parity diff = **0 키**. `check_indicator_params_parity.ts` exit 0.
- AC2B-4: app `INDICATOR_REGISTRY` 항목 ≥ **100** (Phase 1A baseline 31 → 100+).
- AC2B-5: Prometheus engine `indicator_compute_seconds_p99 ≤ 100ms` (24h staging soak).
- AC2B-6: 연결 실패 (engine 503) → 모달은 retry/cached 표기, 차트 미파괴. error e2e 1 case.

---

## CTO 관점

### Risk Matrix

| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| 모달 도입 후 IndicatorLibrary 사이드패널과 UX 중복 | M | M | 모달 = 추가, 사이드패널 = 활성 관리. 모달 footer에 "사이드패널에서 편집" 안내. |
| Fuse.js +12KB로 Phase 1C 번들 게이트 위반 | L | L | dynamic import; lazy chunk 검증; 게이트 위반 시 Phase 1C revert. |
| `/` 단축키 Firefox quick-find 충돌 | M | M | chart 컨테이너 포커스 + `e.preventDefault()` 분기. |
| Phase 2A 캐시 stampede (cold start) | M | M | `asyncio.Lock` per cache key; AC2A-4 검증. |
| engine ↔ app catalog drift → 모달 클릭 시 404 | M | H | Phase 2B `check_indicator_params_parity.ts` CI gate. |
| 12-pane fps 미달 | L | H | AC1C-5 게이트; 위반 시 MAX 8 임시 다운그레이드. |
| Phase 2A `cachetools` 메모리 누수 | L | M | maxsize 강제; pytest memory soak 1h. |

### 의사결정 단계
- Phase 1A → 1B → 1C 순차 머지 (병렬 PR 금지; UX 회귀 차단).
- Phase 2A는 Phase 1C 머지 후 시작 가능.
- Phase 2B는 Phase 2A 머지 + 24h staging soak 통과 후 ship.

---

## AI Researcher 관점

### Data Impact
- Phase 2A 엔진 compute는 OHLCV bars만 입력 → 결정론적, lookahead 없음. 캐시 키에 `last_closed_bar_ts` 포함해 미완료 캔들 누설 방지.
- Phase 1B 검색은 IndicatorDef metadata만 사용 → 사용자 데이터 노출 없음.

### Failure Modes
- **F1**: Fuse.js threshold 0.4 → 한글 단음절 ('볼' 등) 노이즈 매치. 완화: minQueryLength=2.
- **F2**: Engine compute가 NaN 반환 시 LWC line break. 완화: NaN drop on engine side, meta.bar_count 반환.
- **F3**: Favorites LRU에서 deprecated defId 잔존 → 모달 mount 시 unknown 자동 정리.
- **F4**: param schema drift (engine vs app default) → AC2B-3 parity gate가 차단.

---

## Decisions

[D-0400-01] **v3 store 마이그레이션 드롭** — W-0399-P2의 `wtd.chart.indicator-instances.v1` 그대로 사용. 거절옵션: v3 재마이그레이션 (사용자 데이터 손실 위험), v2 폐기 (기존 favorites 손실).

[D-0400-02] **`catalogSearch.ts` 별도 파일** — 기존 `search.ts`는 AIPanel intent용으로 유지. 거절옵션: search.ts 통합 (convertPromptToSetup 회귀 위험).

[D-0400-03] **Phase 1A 카탈로그 31개 시작** — 시장 21 + TV TA 10. 거절옵션: Phase 1A에 100+ 등록 (registry.ts 700+ LoC 한 PR).

[D-0400-04] **engine routers 디렉토리 = `engine/api/routes/`** (NOT `engine/api/routers/`). 실측 기반.

[D-0400-05] **Phase 2 캐시는 in-process LRU만** — Redis 거부 (operational cost > benefit, compute 결정론적).

[D-0400-06] **MAX panes = 12** (LWC v5.1 perf budget). 13번째 추가 시 toast.

## Open Questions

[Q-0400-01] Phase 2A engine catalog 중 `paid` provider (Coinalyze 등) 지표는 staging key 어떻게 주입? **잠정**: env mock + feature flag.

[Q-0400-02] Phase 2B에서 `defaultVisible=false` 지표(70+)를 dim 처리할지, 별도 "추가 지표" 카테고리로 분리할지. → Phase 2B 시작 전 사용자 검토.

[Q-0400-03] `/` 단축키가 IME(한글 입력 모드)에서도 trigger되어야 하는지. → Phase 1B 구현 시 확인.

---

## Exit Criteria

**Phase 1 (PR1+PR2+PR3 모두 머지 후)**
- [ ] AC1A-1~5 (registry 31개)
- [ ] AC1B-1~6 (모달 + `/` + 검색)
- [ ] AC1C-1~6 (favorites + 번들 ≤15KB + fps≥55)
- [ ] W-0399-P2 0 regression

**Phase 2 (PR4+PR5 모두 머지 후)**
- [ ] AC2A-1~7 (engine API + cache)
- [ ] AC2B-1~6 (app adapter + catalog 100+)
- [ ] Phase 1 0 regression

---

## Next Steps

1. Phase 1A 구현 착수 (PR1 — `feat/W-0400-1A-registry-extend`).
2. PR1 머지 후 Phase 1B (PR2 — `feat/W-0400-1B-catalog-modal`).
3. PR2 머지 후 Phase 1C (PR3 — `feat/W-0400-1C-favorites-perf`).
4. Phase 1C 머지 후 Phase 2A (PR4 — `feat/W-0400-2A-engine-indicators`).
5. PR4 staging soak 24h → Phase 2B (PR5 — `feat/W-0400-2B-app-adapter`).

---

## Handoff Checklist

### 신규 파일 (Phase 1A) — 1개
- `app/src/lib/indicators/__tests__/registry.test.ts`

### 수정 파일 (Phase 1A) — 2개
- `app/src/lib/indicators/types.ts`
- `app/src/lib/indicators/registry.ts`

### 신규 파일 (Phase 1B) — 5개
- `app/src/lib/components/chart/indicators/IndicatorCatalogModal.svelte`
- `app/src/lib/components/chart/indicators/IndicatorCatalogTrigger.svelte`
- `app/src/lib/indicators/catalogSearch.ts`
- `app/src/lib/indicators/__tests__/catalogSearch.test.ts`
- `app/tests/e2e/chart_catalog.spec.ts`

### 수정 파일 (Phase 1B) — 1개
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte`

### 신규 파일 (Phase 1C) — 4개
- `app/src/lib/indicators/catalogFavorites.ts`
- `app/src/lib/indicators/__tests__/catalogFavorites.test.ts`
- `app/scripts/check_bundle_delta.ts`
- `app/tests/e2e/chart_catalog_perf.spec.ts`

### 수정 파일 (Phase 1C) — 1개
- `app/src/lib/components/chart/indicators/IndicatorCatalogModal.svelte`

### 신규 파일 (Phase 2A) — 8개
- `engine/indicators/__init__.py`
- `engine/indicators/base.py`
- `engine/indicators/registry.py`
- `engine/indicators/compute.py`
- `engine/indicators/cache.py`
- `engine/api/routes/indicators.py`
- `engine/tests/test_indicators_endpoint.py`

### 수정 파일 (Phase 2A) — 2개
- `engine/api/main.py`
- `engine/api/openapi_paths.py`

### 신규 파일 (Phase 2B) — 4개
- `app/src/lib/chart/engineSeriesAdapter.ts`
- `app/src/lib/chart/__tests__/engineSeriesAdapter.test.ts`
- `scripts/check_indicator_params_parity.ts`
- `app/tests/e2e/chart_catalog_engine.spec.ts`

### 수정 파일 (Phase 2B) — 3개
- `app/src/lib/components/chart/indicators/IndicatorCatalogModal.svelte`
- `app/src/lib/indicators/registry.ts`
- `.github/workflows/contract-check.yml`
