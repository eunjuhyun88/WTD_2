# WTD v2 Monorepo

## Structure

```
engine/   Python — feature calc, building blocks, backtest, data cache
app/      SvelteKit — frontend + Supabase + API routes
```

## Read Order

1. This file
2. `engine/pyproject.toml` — Python engine dependencies
3. `app/docs/COGOCHI.md` — product truth (single source)
4. `app/ARCHITECTURE.md` — app structure overview

## Engine (Python)

- Entry: `engine/scanner/feature_calc.py` — compute_features_table() (92 features)
- Blocks: `engine/building_blocks/` — 29 blocks (triggers, confirmations, entries, disqualifiers)
- Data: `engine/data_cache/` — Binance klines fetch + CSV cache + MTF resample
- Tests: `engine/tests/` — 302 tests, run with `cd engine && python -m pytest`

## App (SvelteKit)

- Dev: `npm --prefix app run dev` (port 5173)
- Product docs: `app/docs/COGOCHI.md`
- Frontend: `app/src/routes/`, `app/src/components/`
- Python bridge: `app/cogochi/` — thin wrapper (to be replaced by engine/ imports)

## Rules

- Engine changes: edit `engine/` directly, run tests before commit
- App changes: edit `app/` directly
- Never commit `.env*` files

---

## ✅ CHECKPOINT — 2026-04-13 (PR #18 merged)

### 현재 상태
- **브랜치**: `main` (최신)
- **마지막 커밋**: `7e8f728` — fix(engine): add fastapi and apscheduler to pyproject.toml
- **Engine 테스트**: 415/415 pass

---

### PR 히스토리

| PR | 제목 | 상태 |
|----|------|------|
| #13 | Terminal Bloomberg Cockpit | merged |
| #14 | market_engine 4-layer pipeline + 108 tests | merged |
| #16 | /deep pipeline wire-up + CMC token universe | merged |
| #17 | GlobalCtx cache + deep.layers UI + scanner alerts | merged |
| #18 | SymbolPicker + 17-layer visual proof charts | merged |

---

### Engine ✅

| 모듈 | 상태 |
|------|------|
| `feature_calc.py` | 92 features (Groups I–AB), 공식 검증 완료 |
| `building_blocks/` | 29 blocks |
| `data_cache/loader.py` | MTF resample 지원 — `load_klines(symbol, tf='4h')` |
| `data_cache/resample.py` | `resample_klines(df_1h, target_minutes)` |
| `data_cache/fetch_onchain.py` | MVRV Z-score, Puell Multiple, Etherscan |
| `data_cache/registry.py` | mvrv_zscore, puell_multiple DataSource 등록 |
| `market_engine/pipeline.py` | `run_deep_analysis()` — 17-layer pipeline |
| `market_engine/ctx_cache.py` | GlobalCtx singleton (10분 TTL, asyncio.Lock) |
| `api/main.py` | verdict + scanner + /ctx routes, startup warm-up |
| `api/routes/deep.py` | `ensure_fresh_ctx()` |
| `api/routes/ctx.py` | `GET /ctx/status` + `POST /ctx/refresh` |
| `api/routes/universe.py` | CMC 30 token universe |
| Tests | 415/415 pass |

---

### App — Terminal Bloomberg Cockpit ✅

#### 신규 (PR #18)
```
app/src/components/terminal/workspace/
  SymbolPicker.svelte       — 토큰 검색/섹터필터/정렬 + 스파크라인
  Sparkline.svelte          — SVG 미니 스파크라인
  MiniIndicatorChart.svelte — 17개 레이어별 증빙 미니차트

app/src/routes/api/market/
  sparklines/+server.ts     — Binance 24h klines 배치 (상위 20 토큰)
  ohlcv/+server.ts          — OHLCV + taker buy volume → CVD 계산
```

#### EvidenceCard 시각화 매핑
| 레이어 | 차트 타입 |
|--------|-----------|
| wyckoff, mtf, breakout | 미니 캔들차트 |
| cvd | CVD 라인 (제로라인) |
| vsurge, onchain | 볼륨 델타 바 (green/red) |
| flow, liq_est, real_liq | 볼륨 델타 바 |
| oi | 가격 + 볼륨 오버레이 |
| bb14, bb16 | 볼린저밴드 스파크라인 (violet) |
| atr | 범위 스파크라인 (amber) |
| fear/greed | 게이지 아크 |
| basis, kimchi | 스프레드 라인 (제로라인) |

#### API 연결
| 엔드포인트 | 주기 | 용도 |
|-----------|------|------|
| `/api/cogochi/analyze` | mount + pair change | 버딕트/에비던스 |
| `/api/market/ohlcv` | 분석 시 병렬 fetch | 17-layer 증빙 차트 데이터 |
| `/api/market/sparklines` | SymbolPicker open | 상위 20 토큰 스파크라인 |
| `/api/cogochi/alerts` | 5분 폴링 | scanner alerts (left rail) |
| `/api/market/flow` | 15초 폴링 | flow bias badge |
| `/api/market/trending` | 60초 폴링 | left rail movers |
| `/api/market/news` | mount | catalysts 탭 |
| `/api/cogochi/terminal/message` | SSE | 보드 리렌더 |

---

### 알려진 제한사항

| 항목 | 현황 |
|------|------|
| `sector` 레이어 | 항상 0점 — `compute_sector_scores()` 결과가 ctx에 없음 |
| MiniIndicatorChart | OHLCV 데이터 공유 — 레이어별 전용 데이터(OI/펀딩 히스토리) 미구현 |
| 모바일 증빙차트 | MobileActiveBoard에 bars 미전달 |

---

### 다음 작업 후보

1. **레이어별 전용 데이터** — OI 히스토리, 펀딩레이트, Fear/Greed 히스토리 별도 fetch
2. **Book Panel** — `DEPTH_L2_20` websocket → 오더북 패널
3. **Trade Tape** — `AGG_TRADES_LIVE` → 체결 테이프
4. **Liquidation Feed** — `FORCE_ORDERS` → 청산 표시
5. **sector 레이어 활성화** — `compute_sector_scores()` → ctx_cache
6. **모바일 증빙차트** — MobileActiveBoard에 bars 전달
