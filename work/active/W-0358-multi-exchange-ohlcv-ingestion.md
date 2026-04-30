# W-0358 — Multi-Exchange OHLCV Ingestion + ParquetStore Schema Extension

> Wave: 5 | Priority: P1 | Effort: M
> Charter: In-Scope (L5 Search 데이터 다양성)
> Status: 🟡 Design Draft
> Issue: #785
> Created: 2026-05-01

## Goal
ParquetStore OHLCV 경로에 `exchange + market_type` 차원을 도입하고,
상위 5거래소 × Spot/Futures를 1h OHLCV로 backfill 가능한 ingestion framework를 구축.

## Scope
- 포함:
  - `engine/data_cache/parquet_store.py` — OHLCV 경로 스키마에 `exchange`, `market_type` 추가
  - `engine/data_cache/exchanges/` (신규 디렉토리)
    - `base.py` — `ExchangeAdapter` ABC
    - `binance_spot.py`, `binance_futures.py`, `okx_spot.py`, `okx_swap.py`
    - `bybit_spot.py`, `bybit_linear.py`, `coinbase_spot.py`, `kraken_spot.py`
  - `engine/data_cache/multi_exchange_backfill.py`
  - `engine/data_cache/symbol_registry.py`
  - `engine/scripts/migrate_ohlcv_layout.py` (one-shot migration)
- API: 내부 전용 (외부 surface 변화 없음)

## Non-Goals
- Funding/OI/LS multi-exchange 확장 (W-0337)
- Order book / trade tape 수집
- Real-time WebSocket streaming
- Feature 통합 (W-0359)
- Coinbase Futures

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 기존 572개 parquet 경로 깨짐 | 중간 | **Critical** | migration 스크립트 + .bak 보존 |
| Consumer 6+ 모듈 호환성 | 중간 | High | default args `exchange="binance", market="futures"` 유지 |
| 거래소별 rate limit | 높음 | Medium | per-exchange semaphore (Binance 10, OKX 20, Bybit 10, Coinbase 3, Kraken 1 RPS) |
| Symbol naming 불일치 | 높음 | Medium | `symbol_registry.py` canonical=Binance perp 표기 |
| Initial backfill 시간 | 중간 | High | async + concurrency cap, target ≤ 2h |

### Dependencies
- ccxt >= 4.0
- W-0337과 영역 분리 (OHLCV only)

### Rollback
- Dual-write 1주: 신규 경로 + 구 경로 동시 write
- 문제 시: 신규 경로 디렉토리 삭제, 구 경로 그대로 살아있음

### Canonical Files
- `engine/data_cache/parquet_store.py`
- `engine/data_cache/exchanges/`
- `engine/data_cache/multi_exchange_backfill.py`
- `engine/data_cache/symbol_registry.py`
- `engine/scripts/migrate_ohlcv_layout.py`

## AI Researcher 관점

### Data Impact
- Tier 1 (top-20 × 5 exchanges × Spot+Futures): ~700MB compressed
- 기존 포함 총 ~1.1GB

### 거래소별 심볼 커버리지 (추정)
| 거래소 | top-20 | top-100 | top-300 |
|---|---|---|---|
| Binance Spot | 100% | 95% | 70% |
| Binance Futures | 100% | 100% | 100% |
| OKX Spot/Swap | 100% | 80% | 40% |
| Bybit Spot/Linear | 100% | 75% | 35% |
| Coinbase Spot | 60% | 30% | 5% |
| Kraken Spot | 50% | 25% | 5% |

### Statistical Validation
- BTC Spot-Futures basis 분포: ±0.5% 정상, ±5% 극단 (Hou et al. 2020)
- Cross-exchange 가격 stddev: 동일 1h close BTC ≤ 0.05% (데이터 품질 게이트)

### Failure Modes
- Listing date asymmetry → `min_history_days=180` 미달 skip
- Stale price (low-volume venue) → forward-fill 금지, NaN 보존
- Timezone drift → Adapter가 candle 마감 시각 정규화 책임

## Decisions
- **D-0001**: ccxt + 직접 REST 하이브리드 (Binance=직접, 나머지=ccxt)
- **D-0002**: 경로 스키마 = 디렉토리 분리 `ohlcv/{exchange}/{market}/`
- **D-0003**: Tier 1 top-20 × 5 exchanges, Tier 2 top-100 × 3 exchanges, Tier 3 그대로
- **D-0004**: 증분 업데이트 = `get_last_ts` 기반 incremental
- **D-0005**: Dual-write 1주 → Cutover migration

## Open Questions
- [ ] [Q-0001] ccxt fetch_ohlcv가 5 exchanges에서 동일 인터페이스로 작동하는지 spike 필요
- [ ] [Q-0002] top-100 universe 정의 — 어느 모듈/기준?
- [ ] [Q-0003] 기존 `fetch_binance.py` CSV cache 처리 — 본 W 포함 vs 별도?

## Implementation Plan
1. ParquetStore `_ohlcv_path(symbol, tf, exchange, market)` 확장 + backward shim (PR 1)
2. ExchangeAdapter ABC + symbol_registry.py + 9 adapters (PR 2)
3. multi_exchange_backfill.py async orchestrator + CLI (PR 3)
4. migrate_ohlcv_layout.py + consumer 호환성 검증 (PR 4)
5. Initial backfill 실행 (operational)

## Exit Criteria
- [ ] AC1: 기존 572 parquet read 회귀 없음 (row 수 / 첫·마지막 ts 동일)
- [ ] AC2: Tier 1 top-20 × 5 exchanges × Spot+Futures 365일 ≥ 160 streams
- [ ] AC3: Tier 2 top-100 × Binance/OKX/Bybit 180일, 70% 이상 ≥ 4000 rows
- [ ] AC4: Initial backfill ≤ 2시간
- [ ] AC5: 증분 업데이트 1h tick ≤ 5분
- [ ] AC6: BTC cross-exchange price stddev ≤ 0.05%
- [ ] AC7: 신규 모듈 line coverage ≥ 80%, pytest green
- [ ] AC8: Consumer 6 모듈 default-arg 회귀 없음
- [ ] AC9: disk footprint ≤ 1.5GB

## Owner
engine

## Facts
- 현재 OHLCV = `ohlcv/{symbol}_{tf}.parquet` (Binance Futures only, 암묵적)
- ccxt 미설치
- Bybit/OKX funding rate 일부 수집 중 (fetch_venue_funding.py)
- MEXC/Bitget live ticker snapshot 있음 (fetch_multi_exchange.py)
- Coinbase premium, Upbit write 메서드 ParquetStore에 존재

## Assumptions
- ccxt 설치 후 OKX/Bybit/Coinbase/Kraken adapter 구현 가능
- top-20 universe = 시가총액 상위 20 (BTC/ETH/SOL 등)
