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

## ✅ CHECKPOINT — 2026-04-13 (SESSION 4 — DOUNI Phase 2: Runtime + 4-mode routing)

### 현재 상태
- **브랜치**: `claude/cool-darwin`
- **마지막 커밋**: `6b90865` — feat(douni): Phase 2 runtime store + 4-mode routing
- **Phase 2 완료**: 4개 파일 (douniRuntime, settings AI탭, terminal 분기, server 처리)
- **Phase 3**: 다음 세션 (fallback chain + delta 감지)

### Phase 2 완료 파일

| 파일 | 경로 | 역할 |
|------|------|------|
| `douniRuntime.ts` | `app/src/lib/stores/` | 4-mode store (TERMINAL/HEURISTIC/OLLAMA/API) + localStorage 영속 |
| `settings/+page.svelte` | `app/src/routes/settings/` | AI 탭: 모드 선택, provider, API 키, ollama 설정, 테스트 버튼 |
| `terminal/+page.svelte` | `app/src/routes/terminal/` | sendCommand() 분기 — TERMINAL 배너, runtimeConfig body 전송 |
| `message/+server.ts` | `app/src/routes/api/cogochi/terminal/message/` | HEURISTIC 템플릿, API user-key 스트림, OLLAMA provider 강제 |

### 4-mode 동작 정리

| 모드 | 서버 동작 | 비고 |
|------|-----------|------|
| TERMINAL | 클라이언트 배너만 표시 | 서버 미호출 |
| HEURISTIC | `buildHeuristicText()` → SSE 스트림 | LLM 없음, 스냅샷 템플릿 |
| OLLAMA | `resolvedProvider = 'ollama'` | 서버 env OLLAMA_BASE_URL 사용 |
| API | `streamWithUserKey()` — 사용자 키로 직접 호출 | tool loop 없음 (MVP) |

### 다음 세션 작업 (Phase 3)

1. **fallback chain** — API 실패 → HEURISTIC 자동 전환 → 침묵 버그 완전 제거
2. **delta 감지** — prevSnapshot vs currentSnapshot diff → 변화 없으면 "변화 없음" 한 줄
3. **API mode tool support** — `callLLMStreamWithTools`에 `userApiKey` 오버라이드 추가
4. **OLLAMA custom endpoint** — runtimeConfig.ollamaEndpoint → 서버 전달

---

## ✅ CHECKPOINT — 2026-04-13 (SESSION 3 — DOUNI AI Researcher 설계)

### 현재 상태
- **브랜치**: `main` (최신)
- **마지막 커밋**: `92cf3a9` — fix(douni): market snapshot pinning + pattern memory
- **설계 문서**: `app/docs/DOUNI_AI_RESEARCHER_DESIGN.md`
- **Phase 1**: 완료 + 리뷰 수정 완료
- **Phase 2**: 대기 중 (`douniRuntime.ts`부터 시작)

### DOUNI Phase 1 완료 파일

| 파일 | 경로 | 역할 |
|------|------|------|
| `douniPersonality.ts` | `app/src/lib/engine/cogochi/douni/` | 섹션 배열 시스템 프롬프트, Evidence Chain, 다국어 |
| `tradeMemory.ts` | `app/src/lib/server/douni/` | 4타입 메모리 (user/feedback/patterns/market) |
| `contextCompact.ts` | `app/src/lib/server/douni/` | Auto-compact (20턴) + market snapshot pinning |
| `contextBuilder.ts` | `app/src/lib/server/douni/` | 전체 통합 + pattern memory → Evidence Chain Layer C |

### 설계 리뷰 반영 수정사항 (`92cf3a9`)

| 항목 | 내용 |
|------|------|
| **market snapshot 보존** | compact 후 마지막 analysis 턴 pinning — compact 직후 "OI 어때?" 시 market data 유실 방지 |
| **pattern memory → Evidence Chain** | `memory.patterns` → `[Historical Pattern Match]` — LLM BASE RATE 근거 제공, `signal_stats.py` 연결 대응 구조 |

### DOUNI Phase 2 다음 세션 작업 (우선순위 순)

1. `app/src/lib/stores/douniRuntime.ts` — 4-mode store (TERMINAL/HEURISTIC/OLLAMA/API)
2. `app/src/routes/settings/+page.svelte` — Settings > AI 탭 (모드 선택 + 키 + 테스트)
3. `app/src/routes/terminal/+page.svelte` — `sendCommand()` 4-mode 분기
4. `app/src/routes/api/cogochi/terminal/message/+server.ts` — `runtimeConfig` 수신
5. `engine/scoring/signal_stats.py` — 블록 조합 승률 조회 (backtest 재활용)
6. Delta 감지 — prevSnapshot diff → 반복 버그 제거
7. Fallback 체인 — 침묵 버그 완전 제거

### 핵심 설계 원칙 (변경 불가)
- **LLM = 핵심, optional 아님** — LLM 없으면 데이터 터미널, AI researcher 아님
- **LLM 역할 = 번역, 예측 X** — 엔진 팩트 → 자연어 설명만
- **기본 모드 = HEURISTIC** — 설정 없어도 템플릿 합성으로 의미있는 출력
- **진입 장벽 최소화** — Groq 무료 키 30초 설정으로 full AI 모드 진입

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
