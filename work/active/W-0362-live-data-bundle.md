# W-0362 — Live Market Data Bundle

> Wave: 5 | Priority: P1 | Effort: M
> Charter: In-Scope (L5 Search 가속)
> Status: 🟡 Design Draft
> Created: 2026-05-01
> Issue: #796
> Depends-on: W-0359 (Spot-Futures Basis features schema)

## Goal
유저가 심볼 검색 시 collector가 Spot+Futures+Basis+Coinbase Premium을 실시간 수집해 엔진에 전달하고, AI 분석이 cross-venue 데이터 기반으로 실제 basis/premium을 포함한 거래 가이드를 제공한다.

## Scope
- 포함:
  - `collector.ts` fetch 11개 → 15개 (Binance Spot klines, Spot ticker, Coinbase BTC/ETH, Redis signals 조회)
  - `types.ts` `MarketDataBundle` 필드 4개 추가 (`spot_klines`, `spot_ticker`, `coinbase_spot`, `signals`)
  - `service.ts` 엔진 payload에 `spot_price`, `coinbase_premium` 추가
  - `chartSeriesService.ts` basis overlay 시리즈 (optional)
  - `engine/api/schemas_train_deep_universe.py` DeepRequest 확장
  - `engine/api/routes/deep_thread.py` spot data ctx 주입
  - `engine/market_engine/l2/oi_basis.py` `s20_basis()` real basis 분기
  - `app/src/lib/server/analyze/symbolMap.ts` futures→spot symbol 변환
- 파일:
  - `app/src/lib/server/analyze/collector.ts`
  - `app/src/lib/server/analyze/types.ts`
  - `app/src/lib/server/analyze/service.ts`
  - `app/src/lib/server/analyze/symbolMap.ts` (신규)
  - `app/src/lib/server/chart/chartSeriesService.ts`
  - `engine/api/schemas_train_deep_universe.py`
  - `engine/api/routes/deep_thread.py`
  - `engine/market_engine/l2/oi_basis.py`
- API: 기존 `/deep` schema 확장 (신규 엔드포인트 없음)

## Non-Goals
- TradingView 대체 / 범용 스크리너 — Charter Frozen
- Coinbase 전 종목 — BTC/ETH only
- WebSocket 실시간 push — REST 폴링 유지
- Spot 거래 실행 — read-only

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 15 fetch tail latency (한 endpoint 느리면 전체 대기) | 高 | 中 | Promise.allSettled + 2s timeout/fetch, 실패는 null |
| Coinbase rate limit (10 req/s public) | 中 | 中 | BTC/ETH만, 60s 캐시 |
| 1000-prefix symbol mismatch (1000PEPE) | 高 | 中 | `symbolMap.ts` — futures→spot mapping, 없으면 spot=null |
| s20_basis 변경으로 backtest drift | 中 | 高 | flag `USE_REAL_BASIS=false` 기본, opt-in 점진 전환 |
| DeepRequest payload 비대 (720 spot bars) | 中 | 低 | gzip 압축, 30d만 전송 |

### Dependencies
- Binance Spot API: `api.binance.com/api/v3/klines` (공개)
- Coinbase Exchange API: `api.exchange.coinbase.com/products/BTC-USD/candles`
- W-0361 `GET /research/signals/{symbol}` (signals 조회용)

### Rollback
- Feature flag `LIVE_BUNDLE_V2=false` → collector 기존 11 fetch
- DeepRequest 신규 필드 전부 Optional — 미전송 시 기존 동작
- `USE_REAL_BASIS=false` 기본값 — s20_basis 변경 격리

### Canonical Files
- `app/src/lib/server/analyze/collector.ts`
- `app/src/lib/server/analyze/types.ts`
- `engine/api/schemas_train_deep_universe.py`
- `engine/market_engine/l2/oi_basis.py`

## AI Researcher 관점

### Data Impact
- 페이로드: ~50KB → ~150KB (spot 720 bars + coinbase)
- Latency: collector ~1.2s → ~2.0s 예상 (parallel)
- 신규 시그널: real_basis (spot-futures spread), coinbase_premium

### Statistical Validation
- A/B: `USE_REAL_BASIS=true` vs false hit_rate 비교
- Real basis vs mark-index correlation r < 0.95 이면 독립적 신규 시그널
- Coinbase premium 분포 측정 후 outlier (>3σ) clamp 정책

### Failure Modes
- F1: Spot 미상장 심볼 → spot_klines=null → fallback to mark-index basis
- F2: Coinbase 다운 → coinbase_spot=null, kimchi premium fallback
- F3: 시간 정렬 불일치 → 엔진에서 timestamp nearest-join, mismatch drop
- F4: 1000-prefix futures → symbolMap이 PEPE×1000 환산 책임

## Decisions
- **[D-0001]**: Spot 양 = **30d 1h klines (720 bars)** (ticker-only 거절 — trend 계산 불가, 1y 거절 — payload 5x)
- **[D-0002]**: Coinbase 커버리지 = **BTC+ETH만** (전체 거절 — rate limit, Top10 거절 — mapping 복잡)
- **[D-0003]**: DeepRequest = **klines 배열 + ticker 객체 둘 다** (scalar만 거절 — 시계열 basis 불가)

## Open Questions
- [ ] [Q-0001]: Coinbase premium — USD 직접 비교 vs KRW 환산? (USD 직접이 정합성 높음)
- [ ] [Q-0002]: 1000-prefix 환산 정책 — collector vs 엔진 중 어디서?
- [ ] [Q-0003]: `USE_REAL_BASIS` default=true flip 시점 — 별도 W로 분리?

## Implementation Plan
1. (0.5d) `symbolMap.ts` futures→spot symbol 변환 (1000-prefix 포함)
2. (1d) `collector.ts` Spot/Coinbase fetch 4개 추가 + Promise.allSettled
3. (0.5d) `types.ts` 확장 + Vitest snapshot 갱신
4. (0.5d) `service.ts` payload 확장
5. (1d) 엔진 `DeepRequest` schema + `deep_thread.py` ctx 주입
6. (1d) `s20_basis()` real basis 분기 + `USE_REAL_BASIS` flag
7. (0.5d) `chartSeriesService.ts` basis overlay
8. (1d) E2E test: BTCUSDT analyze → 15 fetches → real_basis + coinbase_premium 포함 검증
9. (0.5d) A/B hit_rate 비교 스크립트

## Exit Criteria
- [ ] AC1: collector 15 fetch p95 ≤ 2.5s
- [ ] AC2: BTCUSDT/ETHUSDT/SOLUSDT analyze 응답에 `real_basis`, `coinbase_premium`, `spot_klines.length=720` 포함
- [ ] AC3: Spot 미상장 심볼 → `spot_klines=null`, 엔진 200 정상 응답
- [ ] AC4: Coinbase rate limit hit ≤ 0.1%/h (60s 캐시 검증)
- [ ] AC5: USE_REAL_BASIS A/B — real basis hit_rate ≥ 기존 -0.5%p
- [ ] AC6: Vitest collector 신규 fetch 4종 mock pass
- [ ] AC7: pytest `engine/test_l2_real_basis.py` ≥ 8 tests (edge case 포함)
- [ ] AC8: 1000-prefix 3개 심볼 spot mapping 정상
- [ ] CI green
- [ ] PR merged

## Owner
engine + app

## Facts
- `collector.ts` — 11 fetches, 전부 Binance FAPI futures (실측)
- `chartSeriesService.ts` — Binance FAPI only (실측)
- `s20_basis()` — mark_price vs index_price, real spot-futures basis 없음 (실측)
- `l8_kimchi()` — ctx.usd_krw + ctx.upbit_map 작동 중 (실측)
- `DeepRequest.spot_price` 필드 없음 (실측)
- 다음 migration 번호: 034 (033 최신)
