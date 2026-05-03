# W-0400 Phase 2A — Engine Indicators API

> Wave: 7 | Priority: P1 | Effort: M (~3d)
> Charter: In-Scope (TV parity, chart UX)
> Issue: #976
> Status: 🟡 Ready to Implement
> Created: 2026-05-04
> Depends on: W-0400 Phase 1 ✅ merged (#1010, #1020, #1024)

## Goal
`GET /indicators/series` engine endpoint + 결정론적 LRU 캐시 + 100+ 지표 compute 모듈. 진이 모달에서 SMA/EMA 등 엔진 계산 지표를 클릭 시 실시간 series가 차트에 mount된다.

## Owner
engine — engine/indicators/ 신규 모듈 + engine/api/routes/indicators.py

## Scope
- 신규: `engine/indicators/__init__.py`
- 신규: `engine/indicators/base.py` (IndicatorComputer ABC)
- 신규: `engine/indicators/registry.py` (100+ IndicatorMeta)
- 신규: `engine/indicators/compute.py` (TA-Lib + self-impl)
- 신규: `engine/indicators/cache.py` (`cachetools.TTLCache(maxsize=2048)` + asyncio.Lock singleflight)
- 신규: `engine/api/routes/indicators.py` (`GET /indicators/series`)
- 수정: `engine/api/main.py` — router include (`prefix="/indicators"`)
- 수정: `engine/api/openapi_paths.py` — schema 추가
- 신규: `engine/tests/test_indicators_endpoint.py` (15+ cases)

## Non-Goals
- Phase 2B app adapter (별도 W-0400-2B)
- Redis 캐시 (in-process LRU only — D-0400-05)
- Paid provider 지표 (env mock only — Q-0400-01)

## Exit Criteria
- AC2A-1: `GET /indicators/series?symbol=BTCUSDT&timeframe=15m&indicator=sma&params=length:20&limit=1500` → 200, `series.points.length == 1481`. pytest pass.
- AC2A-2: p95 latency ≤ **50ms** cache miss (1500 bars SMA, pytest-benchmark, 100 runs).
- AC2A-3: cache hit rate ≥ **85%** (200 req/s × 60s synthetic, 16 symbols × 5 indicator × 4 param). pytest report.
- AC2A-4: singleflight — 동일 cache miss 키 동시 100req → compute 함수 호출 1회. asyncio test green.
- AC2A-5: engine catalog ≥ **100 IndicatorMeta** 등록. `len(REGISTRY) >= 100` assertion.
- AC2A-6: openapi-typescript 재생성 후 빌드 clean (CI Contract gate green).
- AC2A-7: 잘못된 indicator key → 404 + `{error: "unknown_indicator"}`. 잘못된 params → 400.

## Facts (실측 2026-05-04)
- `engine/indicators/` 디렉토리 미존재 — 신규 패키지 생성 필요
- `engine/api/routes/` 기존 패턴: router 파일 per-domain (chart.py, facts.py 등)
- `engine/api/main.py:312` `_include_public_engine_routes()` — `include_router(router, prefix="...", tags=[...])`
- `engine/market_engine/indicator_catalog.py` 기존 catalog 파일 있음 (IndicatorCatalogEntry dataclass) — 별도 목적이라 그대로 유지
- 마이그레이션 파일: `051_tv_imports.sql` 이 마지막 → Phase 2A migration 필요없음 (compute stateless)

## Canonical Files
```
engine/indicators/__init__.py          신규
engine/indicators/base.py              신규
engine/indicators/registry.py         신규
engine/indicators/compute.py          신규
engine/indicators/cache.py            신규
engine/api/routes/indicators.py       신규
engine/api/main.py                    수정 (router include)
engine/api/openapi_paths.py           수정 (schema)
engine/tests/test_indicators_endpoint.py  신규
```

## Assumptions
- A3: engine indicator compute는 stateless이며, `(symbol,tf,indicator,params,last_closed_bar_ts)` 키로 결정론적 캐시 가능.
- A5: TA-Lib already installed in engine env (check `engine/pyproject.toml`).

## Next Steps (구현자용)
1. `engine/indicators/` 패키지 생성 (base → registry → compute → cache 순)
2. `engine/api/routes/indicators.py` FastAPI router + endpoint
3. `engine/api/main.py` router include
4. `engine/tests/test_indicators_endpoint.py` 15+ cases
5. `./tools/verify.py W-0400 Phase 2A AC2A-1~7`

## Handoff Checklist
- [ ] AC2A-1: series endpoint 200 + correct length
- [ ] AC2A-2: p95 ≤ 50ms cache miss
- [ ] AC2A-3: cache hit ≥ 85%
- [ ] AC2A-4: singleflight verified
- [ ] AC2A-5: ≥100 IndicatorMeta
- [ ] AC2A-6: Contract CI green
- [ ] AC2A-7: error codes 404/400
