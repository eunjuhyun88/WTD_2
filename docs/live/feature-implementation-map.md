# Feature Implementation Map — 전체 기능 목록

Version: v3.0 (code-verified, 전체 포함)
Agent: A023
Updated: 2026-04-26

---

## 읽는 법

- **BUILT** = 코드 존재, 동작 확인됨
- **PARTIAL** = 코드 있지만 완성 안 됨 (설명 포함)
- **NOT BUILT** = 코드 없음, 이슈 등록 대상
- 각 섹션 = 도메인 단위 그룹 (이슈 등록 시 label로 활용)

---

## A. INPUT — 패턴 입력 모드

| Feature ID | 기능 | 상태 | 엔진 위치 | 앱 위치 |
|------------|------|------|-----------|---------|
| A-01 | Catalog select (기존 패턴 선택) | BUILT | `GET /patterns/library` | `app/src/routes/patterns/+page.svelte` |
| A-02 | Pattern search (이름/슬러그 검색) | BUILT | `GET /search/catalog` | `app/src/routes/patterns/search/+page.svelte` |
| A-03 | **F-0b AI Parser** — 텍스트 → PatternDraft | NOT BUILT | 라우트 없음 | UI 없음 |
| A-04 | **F-0a Chart Drag** — range → PatternDraft | NOT BUILT | 라우트 없음 | UI 없음 |
| A-05 | Pattern register (새 패턴 등록) | BUILT | `POST /patterns/register` | — |
| A-06 | PatternDraft 스키마 | BUILT | `engine/api/schemas_pattern_draft.py` | — |
| A-07 | query-spec transform (search hint → filter) | BUILT | `POST /search/query-spec/transform` | — |

### NOT BUILT 상세: A-03 (F-0b AI Parser)

**이슈 등록 단위**: 2개 (engine 1 + app 1)

**Issue A-03-eng**: Engine 라우트 `POST /patterns/parse`
- 입력: `{ text, symbol_hint?, timeframe_hint? }`
- 처리: ContextAssembler → Claude Haiku/Sonnet → PatternDraftBody
- AC: 200 PatternDraftBody / Claude 미설정 422 / 빈 텍스트 422

**Issue A-03-app**: App UI — 텍스트 입력창 + Parse 버튼 + 결과 미리보기
- 위치: terminal 또는 lab
- AC: Parse → loading → PatternDraft 미리보기 → 저장 → capture 생성

### NOT BUILT 상세: A-04 (F-0a Chart Drag)

**이슈 등록 단위**: 2개 (engine 1 + app 1)

**Issue A-04-eng**: Engine 라우트 `POST /patterns/draft-from-range`
- 입력: `{ symbol, timeframe, start_ts, end_ts }`
- 처리: 12 feature 추출 (oi_change, funding_rate, cvd, liquidation_volume, price_change, volume, btc_correlation, higher_lows, lower_highs, compression_ratio, smart_money_flow, venue_divergence)
- AC: 200 PatternDraftBody + feature_snapshot 12 keys / range < 4h → 422

**Issue A-04-app**: App UI — 차트 range 드래그 → draft-from-range 호출
- AC: 드래그 → 하이라이트 → 확인 팝업 → PatternDraft 미리보기 → 저장

---

## B. RESOLVE — 패턴 평가

| Feature ID | 기능 | 상태 | 엔진 위치 | 앱 위치 |
|------------|------|------|-----------|---------|
| B-01 | Pattern evaluate (현재 phase 평가) | BUILT | `POST /patterns/{slug}/evaluate` | `app/src/routes/lab/+page.svelte` |
| B-02 | PatternState 조회 | BUILT | `GET /patterns/states` | — |
| B-03 | Pattern candidates 조회 | BUILT | `GET /patterns/candidates`, `GET /patterns/{slug}/candidates` | — |
| B-04 | Challenge scan | BUILT | `POST /challenge/{slug}/scan` | — |
| B-05 | Similar live (현재 활성 유사 패턴) | BUILT | `GET /patterns/{slug}/similar-live` | — |
| B-06 | Alpha world model (전체 시장 상태) | BUILT | `GET /alpha/world-model` | `app/src/routes/api/cogochi/alpha/world-model/+server.ts` |
| B-07 | Alpha token (심볼별 상태) | BUILT | `GET /alpha/token/{symbol}` | — |
| B-08 | Alpha token history | BUILT | `GET /alpha/token/{symbol}/history` | — |
| B-09 | Alpha anomalies | BUILT | `GET /alpha/anomalies` | — |

---

## C. SEARCH — 유사 케이스 탐색

| Feature ID | 기능 | 상태 | 엔진 위치 | 앱 위치 |
|------------|------|------|-----------|---------|
| C-01 | 유사 search (3-layer blend) | BUILT | `POST /search/similar` | `app/src/routes/api/search/[...path]/+server.ts` |
| C-02 | Search 결과 재조회 | BUILT | `GET /search/similar/{run_id}` | — |
| C-03 | Seed search (seed 기반) | BUILT | `POST /search/seed` | — |
| C-04 | Scan search | BUILT | `POST /search/scan` | — |
| C-05 | Search quality judge | BUILT | `POST /search/quality/judge` | — |
| C-06 | Search quality stats | BUILT | `GET /search/quality/stats` | — |
| C-07 | Benchmark pack draft | BUILT | `POST /captures/{id}/benchmark_pack_draft` | `app/src/routes/api/terminal/pattern-captures/[id]/benchmark/+server.ts` |
| C-08 | Benchmark search from capture | BUILT | `POST /captures/{id}/benchmark_search` | `app/src/routes/api/terminal/pattern-captures/similar/+server.ts` |
| C-09 | Layer A (weighted L1, 40+dim) | BUILT | `engine/search/similar.py` | — |
| C-10 | Layer B (LCS phase path) | BUILT | `engine/research/similarity_ranker.py` | — |
| C-11 | Layer C (LightGBM P(win)) | PARTIAL | `engine/scoring/lightgbm_engine.py` | — |

**C-11 PARTIAL 설명**: 코드 있음, predict_one() 구현됨. 단, 미훈련 시 None 반환 → Layer C fallback. 모델 훈련 후 자동 활성화됨.

---

## D. WATCH — 모니터링 등록

| Feature ID | 기능 | 상태 | 엔진 위치 | 앱 위치 |
|------------|------|------|-----------|---------|
| D-01 | Alpha watch (심볼 모니터링) | BUILT | `POST /alpha/watch` | — |
| D-02 | Alpha find (조건 기반 탐색) | BUILT | `POST /alpha/find` | — |
| D-03 | **1-click Watch** (capture → monitoring) | NOT BUILT | 라우트 없음 | Watch 버튼 없음 |
| D-04 | Pattern scan (수동 트리거) | BUILT | `POST /patterns/scan` | — |
| D-05 | Scanner run | BUILT | `POST /scanner/run` | — |
| D-06 | Jobs trigger (수동 실행) | BUILT | `POST /jobs/pattern_scan/run` 등 | — |
| D-07 | APScheduler 4개 jobs | BUILT | `engine/scanner/scheduler.py` | — |

**APScheduler 등록 jobs:**
- `pattern_scan` — 15분 주기
- `auto_evaluate` — 15분 주기
- `outcome_resolver` — 1시간 주기
- `refinement_trigger` — 매일

### NOT BUILT 상세: D-03 (1-click Watch)

**Issue D-03-eng**: Engine `POST /captures/{id}/watch`
- 입력: capture_id에서 pattern_slug + symbol 읽음
- 처리: monitoring row 생성 → scanner가 다음 사이클에 포함
- AC: 200 `{ watch_id, status: "live", activated_at }` / 중복 → idempotent 200

**Issue D-03-app**: App Watch 버튼 (Verdict Inbox 카드)
- AC: 버튼 클릭 → POST → "Watching" 상태 표시

---

## E. CAPTURE — 상태 저장

| Feature ID | 기능 | 상태 | 엔진 위치 | 앱 위치 |
|------------|------|------|-----------|---------|
| E-01 | Capture 생성 | BUILT | `POST /runtime/captures` | `app/src/routes/api/captures/+server.ts` |
| E-02 | Capture 목록 조회 | BUILT | `GET /runtime/captures` | 동일 |
| E-03 | Capture 상세 조회 | BUILT | `GET /runtime/captures/{id}` | — |
| E-04 | Capture bulk import | BUILT | `POST /captures/bulk_import` | — |
| E-05 | Chart annotations (캡처 차트 표시) | BUILT | `GET /captures/chart-annotations` | `app/src/routes/api/captures/chart-annotations/+server.ts` |
| E-06 | Pattern capture (패턴별 캡처) | BUILT | `POST /patterns/{slug}/capture` | `app/src/routes/api/patterns/[slug]/capture/+server.ts` |
| E-07 | Terminal pattern captures | BUILT | — | `app/src/routes/api/terminal/pattern-captures/+server.ts` |
| E-08 | Workspace pins | BUILT | `POST /runtime/workspace/pins` | `app/src/routes/api/terminal/pins/+server.ts` |
| E-09 | Workspace bundle | BUILT | `GET /runtime/workspace/{symbol}` | `app/src/routes/api/cogochi/workspace-bundle/+server.ts` |
| E-10 | Research context 생성/조회 | BUILT | `POST /runtime/research-contexts` | — |
| E-11 | Setup 생성/조회 | BUILT | `POST /runtime/setups` | — |

---

## F. VERDICT — 결과 판정

| Feature ID | 기능 | 상태 | 엔진 위치 | 앱 위치 |
|------------|------|------|-----------|---------|
| F-01 | Verdict 3-cat (valid/invalid/missed) | BUILT | `POST /captures/{id}/verdict` | `app/src/routes/api/captures/[id]/verdict/+server.ts` |
| F-02 | **Verdict 5-cat** (+near_miss/too_early/too_late) | NOT BUILT | 타입 확장 필요 | UI 버튼 추가 필요 |
| F-03 | Verdict Inbox (결과 대기 목록) | BUILT | `GET /captures?status=outcome_ready` | `app/src/routes/dashboard/+page.svelte` |
| F-04 | Auto verdict (72h 자동 판정) | BUILT | APScheduler outcome_resolver | — |
| F-05 | Pattern verdict (패턴별 평가) | BUILT | `POST /patterns/{slug}/verdict` | `app/src/routes/api/patterns/[slug]/verdict/+server.ts` |
| F-06 | Live signals verdict | BUILT | `POST /live-signals/verdict` | `app/src/routes/api/live-signals/verdict/+server.ts` |
| F-07 | Captures outcomes 조회 | BUILT | `GET /captures/outcomes` | `app/src/routes/api/captures/outcomes/+server.ts` |
| F-08 | Ledger 4-type records (entry/score/outcome/verdict) | BUILT | `engine/ledger/types.py` | — |
| F-09 | Ledger 조회 | BUILT | `GET /runtime/ledger`, `GET /runtime/ledger/{id}` | — |

### NOT BUILT 상세: F-02 (Verdict 5-cat)

**Issue F-02**: 단독 이슈 (Effort: S)
- 변경: `engine/ledger/types.py:54` + `captures.py:66` + `verdict.py` + 앱 버튼
- **검토 필요**: "missed" → "too_late" 통합 여부 결정 후 진행
- AC: 5개 verdict 값 모두 200 / 기존 3개 여전히 작동

---

## G. REFINEMENT — 개선 루프

| Feature ID | 기능 | 상태 | 엔진 위치 | 앱 위치 |
|------------|------|------|-----------|---------|
| G-01 | Refinement stats (전체) | BUILT | `GET /refinement/stats` | `app/src/routes/api/refinement/stats/+server.ts` |
| G-02 | Refinement stats (패턴별) | BUILT | `GET /refinement/stats/{slug}` | — |
| G-03 | Refinement suggestions | BUILT | `GET /refinement/suggestions` | `app/src/routes/api/refinement/suggestions/+server.ts` |
| G-04 | Refinement leaderboard | BUILT | `GET /refinement/leaderboard` | `app/src/routes/api/refinement/leaderboard/+server.ts` |
| G-05 | Hill Climbing weight optimizer | BUILT | engine 내부 | — |
| G-06 | LightGBM training | BUILT | `POST /patterns/{slug}/train-model` | — |
| G-07 | Model promotion | BUILT | `POST /patterns/{slug}/promote-model` | — |
| G-08 | Model registry 조회 | BUILT | `GET /patterns/{slug}/model-registry` | — |
| G-09 | Model history 조회 | BUILT | `GET /patterns/{slug}/model-history` | — |
| G-10 | Training records 조회 | BUILT | `GET /patterns/{slug}/training-records` | — |
| G-11 | Train report | BUILT | `GET /train/report` | — |
| G-12 | Train trigger | BUILT | `POST /train` | — |
| G-13 | Active variants (per-user threshold) | BUILT | `GET /patterns/active-variants` | `app/src/routes/api/patterns/+server.ts` |
| G-14 | Alert policy (패턴별 alert 설정) | BUILT | `GET/PUT /patterns/{slug}/alert-policy` | — |

---

## H. STATS & OBSERVABILITY

| Feature ID | 기능 | 상태 | 엔진 위치 | 앱 위치 |
|------------|------|------|-----------|---------|
| H-01 | PatternStats Engine (5min TTL 캐시) | BUILT | `engine/stats/engine.py` | — |
| H-02 | Pattern stats (전체) | BUILT | `GET /patterns/stats/all` | `app/src/routes/api/patterns/stats/+server.ts` |
| H-03 | Pattern stats (패턴별) | BUILT | `GET /patterns/{slug}/stats` | `app/src/routes/api/patterns/[slug]/stats/+server.ts` |
| H-04 | Flywheel health check | BUILT | `GET /observability/flywheel/health` | `app/src/routes/api/observability/flywheel/+server.ts` |
| H-05 | Observability metrics | BUILT | — | `app/src/routes/api/observability/metrics/+server.ts` |
| H-06 | Pattern library (per-slug) | BUILT | `GET /patterns/{slug}/library` | — |
| H-07 | **F-60 Gate** (verdict count + accuracy) | NOT BUILT | 라우트 없음 | UI 없음 |
| H-08 | **per-user verdict accuracy** | NOT BUILT | `engine/stats/engine.py`에 추가 필요 | — |

### NOT BUILT 상세: H-07/H-08 (F-60 Gate)

**Issue H-07**: Effort S-M / 선행조건: F-02 (5-cat verdict) 권장
- `GET /users/{user_id}/f60-status` → `{ verdict_count, accuracy, gate_passed, threshold, remaining }`
- accuracy = (valid + near_miss) / resolved
- gate_passed = count ≥ 200 AND accuracy ≥ THRESHOLD (config, 기본 0.55)
- App: progress bar + "X건 / 200건"

---

## I. MARKET DATA

| Feature ID | 기능 | 상태 | 앱 API 위치 |
|------------|------|------|------------|
| I-01 | OI (미결제약정) | BUILT | `api/market/oi` |
| I-02 | Funding rate | BUILT | `api/market/funding` |
| I-03 | Liquidations | BUILT | `api/market/liq-clusters`, `api/market/liquidation-clusters` |
| I-04 | Derivatives | BUILT | `api/market/derivatives/[pair]` |
| I-05 | Market snapshot | BUILT | `api/market/snapshot` |
| I-06 | OHLCV | BUILT | `api/market/ohlcv` |
| I-07 | Orderbook depth | BUILT | `api/market/depth-ladder` |
| I-08 | CVD / Flow | BUILT | `api/market/flow` |
| I-09 | Funding flip | BUILT | `api/market/funding-flip` |
| I-10 | Venue divergence | BUILT | `api/market/venue-divergence` |
| I-11 | Microstructure | BUILT | `api/market/microstructure` |
| I-12 | Options snapshot | BUILT | `api/market/options-snapshot` |
| I-13 | RV cone | BUILT | `api/market/rv-cone` |
| I-14 | Sparklines | BUILT | `api/market/sparklines` |
| I-15 | Trending | BUILT | `api/market/trending` |
| I-16 | Symbols 목록 | BUILT | `api/market/symbols` |
| I-17 | Market news | BUILT | `api/market/news` |
| I-18 | Macro calendar | BUILT | `api/market/macro-calendar` |
| I-19 | Macro overview | BUILT | `api/market/macro-overview` |
| I-20 | Stablecoin SSR | BUILT | `api/market/stablecoin-ssr` |
| I-21 | Indicator context | BUILT | `api/market/indicator-context` |
| I-22 | Chain intel | BUILT | `api/market/chain-intel` |
| I-23 | Onchain alerts | BUILT | `api/market/alerts/onchain` |
| I-24 | Influencer metrics | BUILT | `api/market/influencer-metrics` |
| I-25 | Events | BUILT | `api/market/events` |
| I-26 | Fear & Greed index | BUILT | `api/feargreed` |
| I-27 | CoinGecko global | BUILT | `api/coingecko/global` |
| I-28 | CoinAnalyze | BUILT | `api/coinalyze` |
| I-29 | Etherscan onchain | BUILT | `api/etherscan/onchain` |
| I-30 | CryptoQuant | BUILT | `api/onchain/cryptoquant` |
| I-31 | Yahoo finance | BUILT | `api/yahoo/[symbol]` |
| I-32 | FRED macro | BUILT | `api/macro/fred` |
| I-33 | Macro indicators | BUILT | `api/macro/indicators` |

---

## J. TERMINAL 서페이스

| Feature ID | 기능 | 상태 | 앱 위치 |
|------------|------|------|---------|
| J-01 | Terminal 메인 페이지 | BUILT | `app/src/routes/terminal/+page.svelte` |
| J-02 | Terminal peek | BUILT | `app/src/routes/terminal/peek/+page.svelte` |
| J-03 | Chart feed (OHLCV WebSocket) | BUILT | `api/chart/feed` |
| J-04 | Chart klines (REST) | BUILT | `api/chart/klines`, `engine/api/routes/chart.py` |
| J-05 | Terminal alerts | BUILT | `api/terminal/alerts` |
| J-06 | Terminal anomalies | BUILT | `api/terminal/anomalies` |
| J-07 | Terminal watchlist | BUILT | `api/terminal/watchlist` |
| J-08 | Terminal scan | BUILT | `api/terminal/scan` |
| J-09 | Terminal scan history | BUILT | `api/terminal/scan/history` |
| J-10 | Terminal opportunity scan | BUILT | `api/terminal/opportunity-scan` |
| J-11 | Terminal compare | BUILT | `api/terminal/compare` |
| J-12 | Terminal intel agent shadow | BUILT | `api/terminal/intel-agent-shadow` |
| J-13 | Terminal intel policy | BUILT | `api/terminal/intel-policy` |
| J-14 | Terminal research | BUILT | `api/terminal/research` |
| J-15 | Terminal exports | BUILT | `api/terminal/exports` |
| J-16 | Terminal session | BUILT | `api/terminal/session` |
| J-17 | Terminal status | BUILT | `api/terminal/status` |
| J-18 | Terminal query presets | BUILT | `api/terminal/query-presets` |
| J-19 | Pattern captures (terminal) | BUILT | `api/terminal/pattern-captures` |
| J-20 | Pattern captures project | BUILT | `api/terminal/pattern-captures/[id]/project` |
| J-21 | **Chart range drag → PatternDraft** | NOT BUILT | UI 없음 (A-04 참조) |

---

## K. LAB 서페이스

| Feature ID | 기능 | 상태 | 앱 위치 |
|------------|------|------|---------|
| K-01 | Lab 메인 페이지 | BUILT | `app/src/routes/lab/+page.svelte` |
| K-02 | Lab autorun | BUILT | `api/lab/autorun` |
| K-03 | Lab forward-walk | BUILT | `api/lab/forward-walk` |
| K-04 | Pattern-seed judge | BUILT | `api/terminal/pattern-seed/judge` |
| K-05 | Pattern-seed match | BUILT | `api/terminal/pattern-seed/match` |
| K-06 | **AI Parser UI** | NOT BUILT | UI 없음 (A-03 참조) |

---

## L. DASHBOARD 서페이스

| Feature ID | 기능 | 상태 | 앱 위치 |
|------------|------|------|---------|
| L-01 | Dashboard 메인 | BUILT | `app/src/routes/dashboard/+page.svelte` |
| L-02 | Verdict Inbox (3-cat) | BUILT | dashboard |
| L-03 | Live signals | BUILT | `api/live-signals` |
| L-04 | **Verdict Inbox (5-cat)** | NOT BUILT | 버튼 UI 추가 필요 (F-02 참조) |
| L-05 | **F-60 progress bar** | NOT BUILT | H-07 선행 필요 |
| L-06 | **Watch 버튼** | NOT BUILT | D-03 선행 필요 |
| L-07 | Notifications | BUILT | `api/notifications` |
| L-08 | Confluence (current/history) | BUILT | `api/confluence/current`, `api/confluence/history` |
| L-09 | Signals | BUILT | `api/signals` |

---

## M. BRANDING & SOCIAL

| Feature ID | 기능 | 상태 | 엔진 위치 | 앱 위치 |
|------------|------|------|-----------|---------|
| M-01 | PnL card 이미지 생성 (Pillow) | BUILT | `engine/branding/pnl_renderer.py` | `api/pnl` |
| M-02 | KOL caption 생성 (Claude Haiku) | BUILT | `engine/branding/kol_style_engine.py` | — |
| M-03 | Twitter 자동 포스팅 | BUILT | `engine/social/twitter_client.py` | — |
| M-04 | SNS 포스터 | BUILT | `engine/branding/analysis_compare.py` | — |
| M-05 | Dalkkak gainers | BUILT | `GET /dalkkak/gainers` | — |
| M-06 | Dalkkak positions | BUILT | `GET /dalkkak/positions` | — |
| M-07 | Dalkkak caption | BUILT | `POST /dalkkak/caption` | — |
| M-08 | Dalkkak risk plan | BUILT | `GET /dalkkak/risk` | — |

---

## N. COPY TRADING & MARKETPLACE

| Feature ID | 기능 | 상태 | 엔진 위치 | 앱 위치 |
|------------|------|------|-----------|---------|
| N-01 | Copy trading leaderboard | BUILT | `engine/copy_trading/leaderboard.py` | `api/copy-trading/leaderboard` |
| N-02 | Leader score 계산 | BUILT | `engine/copy_trading/leader_score.py` | — |
| N-03 | Copy trading subscribe | BUILT (schema) | — | `api/copy-trading/subscribe` |
| N-04 | **F-60 Gate** | NOT BUILT | — | — (H-07 참조) |
| N-05 | **Marketplace listing** | NOT BUILT | 없음 | 없음 |
| N-06 | **Marketplace publish** | NOT BUILT | 없음 | 없음 |

### NOT BUILT 상세: N-05/N-06 (Marketplace)

**Issue N-05**: Effort L / 선행조건: H-07 (F-60 Gate)
- `POST /marketplace/signals/publish` → F-60 통과 유저만 가능
- `GET /marketplace/signals` → 공개 신호 목록
- `POST /marketplace/signals/{id}/subscribe` → copy_trading row 생성
- App: `app/src/routes/marketplace/+page.svelte` (신규)

---

## O. AUTH & 보안

| Feature ID | 기능 | 상태 | 엔진 위치 | 앱 위치 |
|------------|------|------|-----------|---------|
| O-01 | Wallet 기반 로그인 | BUILT | — | `api/auth/wallet-auth`, `api/auth/verify-wallet` |
| O-02 | Session 관리 | BUILT | — | `api/auth/session` |
| O-03 | Nonce 발급 | BUILT | — | `api/auth/nonce` |
| O-04 | Logout | BUILT | `POST /auth/logout` | `api/auth/logout` |
| O-05 | RS256 JWT 검증 | BUILT | `engine/security_runtime.py` | — |
| O-06 | 토큰 블랙리스트 | BUILT | 동일 | — |
| O-07 | JWKS 캐싱 (1000x 성능) | BUILT | 동일 | — |
| O-08 | 에러 노출 방지 | BUILT | 14개 라우트 수정 완료 | — |

---

## P. PROFILE & PASSPORT

| Feature ID | 기능 | 상태 | 앱 위치 |
|------------|------|------|---------|
| P-01 | Profile 조회/수정 | BUILT | `api/profile` |
| P-02 | Passport 페이지 | BUILT | `app/src/routes/passport/+page.svelte` |
| P-03 | Learning datasets | BUILT | `api/profile/passport/learning/datasets` |
| P-04 | Learning evals | BUILT | `api/profile/passport/learning/evals` |
| P-05 | Learning reports | BUILT | `api/profile/passport/learning/reports` |
| P-06 | Learning train jobs | BUILT | `api/profile/passport/learning/train-jobs` |
| P-07 | Learning workers run | BUILT | `api/profile/passport/learning/workers/run` |
| P-08 | Preferences (설정) | BUILT | `api/preferences` |
| P-09 | Progression | BUILT | `api/progression` |

---

## Q. DeFi / Trading

| Feature ID | 기능 | 상태 | 앱 위치 |
|------------|------|------|---------|
| Q-01 | GMX 포지션 조회 | BUILT | `api/gmx/positions` |
| Q-02 | GMX 포지션 오픈 | BUILT | `api/gmx/prepare → confirm` |
| Q-03 | GMX 포지션 클로즈 | BUILT | `api/gmx/close` |
| Q-04 | Polymarket 마켓 | BUILT | `api/polymarket/markets` |
| Q-05 | Polymarket 오더북 | BUILT | `api/polymarket/orderbook` |
| Q-06 | Predictions (예측 포지션) | BUILT | `api/predictions` |
| Q-07 | Quick trades | BUILT | `api/quick-trades` |
| Q-08 | Exchange connect | BUILT | `api/exchange/connect` |
| Q-09 | Unified positions | BUILT | `api/positions/unified` |
| Q-10 | Portfolio holdings | BUILT | `api/portfolio/holdings` |
| Q-11 | Wallet intel | BUILT | `api/wallet/intel` |

---

## R. PINE SCRIPT & INDICATORS

| Feature ID | 기능 | 상태 | 앱 위치 |
|------------|------|------|---------|
| R-01 | Pine Script 생성 | BUILT | `api/pine/generate` |
| R-02 | Pine Script 템플릿 | BUILT | `api/pine/templates` |
| R-03 | Cogochi pine-script | BUILT | `api/cogochi/pine-script` |
| R-04 | Facts (price/perp/reference/chain/market-cap) | BUILT | `api/facts/[...path]` |
| R-05 | Confluence current/history | BUILT | `api/confluence` |
| R-06 | Features window | BUILT | `engine/api/routes/features.py` |
| R-07 | Features pattern events | BUILT | 동일 |

---

## S. INFRASTRUCTURE

| Feature ID | 기능 | 상태 | 위치 |
|------------|------|------|------|
| S-01 | SQLite WAL primary store | BUILT | `engine/db/` |
| S-02 | Supabase dual-write | BUILT | `engine/ledger/supabase_store.py` |
| S-03 | Feature windows (138,915 rows) | BUILT | Supabase |
| S-04 | PatternStats 5min TTL cache | BUILT | `engine/stats/engine.py` |
| S-05 | GCP Cloud Run (engine) | BUILT | GCP cogotchi-00013-c7n |
| S-06 | APScheduler 4 jobs | BUILT | `engine/scanner/scheduler.py` |
| S-07 | Pattern Wiki | BUILT | `engine/wiki/` |
| S-08 | ContextAssembler | PARTIAL | `engine/agents/context.py` — 토큰 버짓만, LLM 미연결 |
| S-09 | RAG (terminal/quick-trade/signal-action) | BUILT | `engine/api/routes/rag.py` |
| S-10 | Memory (query/feedback/debug) | BUILT | `engine/api/routes/memory.py` |
| S-11 | Backtest | BUILT | `engine/api/routes/backtest.py` |
| S-12 | Screener | BUILT | `engine/api/routes/screener.py` |
| S-13 | Universe | BUILT | `engine/api/routes/universe.py` |
| S-14 | Opportunity scanner | BUILT | `engine/api/routes/opportunity.py` |
| S-15 | Deep analysis | BUILT | `engine/api/routes/deep.py` |
| S-16 | Score | BUILT | `engine/api/routes/score.py` |
| S-17 | **동시 100명 이상** | PARTIAL | read-heavy Supabase 라우팅 검증 필요 |

---

## 이슈 등록 대상 요약 (NOT BUILT / PARTIAL)

| 이슈 | Feature | Effort | 선행조건 |
|------|---------|--------|----------|
| A-03-eng | AI Parser engine 라우트 | M | — |
| A-03-app | AI Parser UI | M | A-03-eng |
| A-04-eng | Chart Drag engine 라우트 | M | — |
| A-04-app | Chart Drag UI | M-L | A-04-eng |
| D-03-eng | 1-click Watch engine 라우트 | M | — |
| D-03-app | 1-click Watch 버튼 UI | S | D-03-eng |
| F-02 | Verdict 5-cat 확장 | S | 검토 Q1 먼저 |
| H-07 | F-60 Gate | S-M | F-02 권장 |
| N-05 | Copy Signal Marketplace | L | H-07 |

**총 9개 이슈** (independent 4개, dependent 5개)

---

## 확정 필요 항목 (개발 전)

| # | 질문 | 영향 이슈 |
|---|------|-----------|
| Q1 | "missed" + "too_late" 통합? | F-02 |
| Q2 | F-60 accuracy threshold (0.55 / 0.60 / 다른 값?) | H-07 |
| Q3 | F-0a Chart Drag — 실제 드래그 UI vs form input? | A-04-app |
| Q4 | F-0b AI Parser — 자유 텍스트 vs 단계별 템플릿? | A-03-app |
| Q5 | AI Parser 모델 — Haiku vs Sonnet? | A-03-eng |
