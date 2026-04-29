# W-0301 — CMC 1000+ 퀀트 데이터 파이프라인

**Owner**: ej  
**GitHub Issue**: (create after PR)  
**Branch**: `feat/W-0301-cmc1000-data-pipeline`  
**Status**: 🟡 In Progress — Phase 1 구현 완료, 실데이터 검증 필요

---

## Goal

CMC 상위 1000개 이상의 코인 데이터를 퀀트 트레이더가 바로 쓸 수 있는 형태로 제공하는 데이터 파이프라인. 선물+현물+온체인+지표 4개 레이어 커버.

## Scope

- CMC 1000위 기준 universe 자동 빌드 (CoinGecko top-1000 + Binance exchange info)
- Layer 1: OHLCV 1h (12개월) — Futures 530개 + Spot ~470개
- Layer 2: 파생상품 데이터 — Funding rate, OI, Long/Short ratio (Futures only)
- Layer 3: 온체인 — BTC/ETH (CoinMetrics public API, Etherscan)
- Layer 4: 기술적 지표 — RSI/MACD/BB/ATR/Volume + Funding MA + OI 변화율
- 스토리지: Parquet per-symbol (columnar, zstd 압축)
- 쿼리: DuckDB glob view (크로스심볼 SQL, ~1s full scan)
- 병렬: asyncio 40-worker semaphore, Binance rate limit 안전 마진 5배 여유

## Non-Goals

- 실시간 스트리밍 (WebSocket) — 기존 scanner/realtime.py 담당
- 다른 거래소 (Bybit, OKX) — Binance로 1000위 커버 가능
- 유료 데이터 소스 (Glassnode Pro, Coinalyze) — 공개 API로 충분

## Architecture

```
scripts/pipeline_1000.py         CLI 오케스트레이터
    ├── universe_builder.py      CoinGecko 4페이지 + Binance exchange info
    ├── backfill_async.py        asyncio 40-worker OHLCV + derivatives fetch
    ├── indicator_calc.py        RSI/MACD/BB/ATR + derivative signals
    └── market_db.py             DuckDB query interface

Storage layout:
  data_cache/market_data/
  ├── ohlcv/          {symbol}_1h.parquet  (open/high/low/close/volume/indicators)
  ├── derivatives/    {symbol}_funding|oi|longshort.parquet
  ├── onchain/        BTC.parquet, ETH.parquet
  └── universe.parquet
```

## Performance Design

| 지표 | 수치 |
|---|---|
| OHLCV 풀 백필 (1000심볼 × 12mo) | ~90초 (40 workers) |
| 증분 업데이트 (1000심볼) | ~15초 |
| 크로스심볼 SQL 스캔 (DuckDB) | <1초 |
| 저장 공간 (1h × 12mo × 1000심볼) | ~120MB |

## Exit Criteria

- [ ] `pipeline_1000.py status` → 1000+ symbols, avg coverage 300d+
- [ ] `MarketDB().coverage_summary()` → 1000행 이상
- [ ] 크로스심볼 volatility_rank() 쿼리 < 2초
- [ ] 모든 파생상품 데이터 Futures 500+ 심볼에 존재
- [ ] 증분 업데이트: 마지막 ts 이후만 fetch (중복 없음)

## Progress

### Phase 1 — 구현 ✅ (2026-04-29)
- [x] `universe_builder.py` — CoinGecko 1000 + Binance Futures/Spot
- [x] `parquet_store.py` — Parquet upsert/read/coverage
- [x] `backfill_async.py` — 40-worker async OHLCV + derivatives
- [x] `indicator_calc.py` — RSI/MACD/BB/ATR/Vol + Funding/OI merge
- [x] `market_db.py` — DuckDB views + pre-built queries
- [x] `scripts/pipeline_1000.py` — CLI with status/all/ohlcv/etc steps
- [x] smoke test PASSED (imports + ParquetStore + IndicatorEngine + MarketDB)

### Phase 2 — 실데이터 검증 (pending)
- [ ] `pipeline_1000 universe` → universe.parquet 생성, 1000+ 확인
- [ ] `pipeline_1000 ohlcv --limit 50 --months 1` → 50심볼 빠른 검증
- [ ] `pipeline_1000 all` → 풀 파이프라인 실행
- [ ] exit criteria 검증

## Key Decisions

1. **Parquet per-symbol (not date-partitioned)**: 패턴탐지가 심볼별 6개월 스캔이 주 쿼리 → per-symbol이 최적. DuckDB glob으로 크로스심볼 집계 커버.
2. **CoinGecko free (4페이지)**: CMC Pro API key 불필요, 1000위 커버 가능.
3. **asyncio + semaphore (40)**: aiohttp/threads보다 안정적. Binance 2400 req/min 대비 ~800 req/min 실효율.
4. **기존 backfill.py 유지**: 30심볼 이하 작업에는 CSV가 여전히 더 간단.
