# W-0337 — Coinalyze Venue Funding + Per-Venue OI Delta Pipeline

> Wave: Core Closure | Priority: P0 | Effort: M | Owner: engine
> Status: Design Draft | Created: 2026-04-30

## Goal

`venue_funding_spread_extreme` + `venue_oi_divergence` 블록을 실제 활성화한다.
현재 두 블록은 registered but ALWAYS_FALSE: 필요한 feature column이 feature_calc에 없음.

## Owner

Engine

## Scope

### PR-1: fetch_coinalyze_funding.py 신규

`engine/data_cache/fetch_coinalyze_funding.py` 신규 작성:
- `fetch_coinalyze_funding.py` OI 패턴 동일: `_BASE_URL = "https://api.coinalyze.net/v1"`, endpoint `funding-rate-history`
- 심볼: `BTCUSDT_PERP.BINANCE`, `BTCUSDT_PERP.BYBIT`, `BTCUSDT_PERP.OKX` (Q-0337-1에서 검증 필요)
- 반환: `binance_funding`, `bybit_funding`, `okx_funding` columns
- COINALYZE_API_KEY env var 사용 (기존 OI fetcher와 동일)

### PR-2: registry + feature_calc 연결

| 파일 | 변경 내용 |
|---|---|
| `engine/data_cache/registry.py` | `exchange_funding` DataSource 추가 (3 columns) |
| `engine/scanner/feature_calc.py` | 6개 컬럼 추가 |

feature_calc 추가 컬럼:
1. `binance_funding` (Coinalyze, direct)
2. `bybit_funding` (Coinalyze, direct)
3. `okx_funding` (Coinalyze, direct)
4. `binance_oi_change_1h` = `binance_oi.pct_change(1)` (기존 절대값에서 파생)
5. `bybit_oi_change_1h` = `bybit_oi.pct_change(1)` (기존 절대값에서 파생)
6. `okx_oi_change_1h` = `okx_oi.pct_change(1)` (기존 절대값에서 파생)

`_PERP_PASSTHROUGH_COLS` 패턴 또는 `compute_features_table()` 내 injection 함수 추가.

## Non-Goals

- MEXC/Bitget venue funding (W-0330 scope)
- Coinalyze aggregated OI 변경 없음 (기존 `binance_oi`/`bybit_oi`/`okx_oi` 건드리지 않음)
- venue_funding_spread_extreme 블록 로직 변경 없음 (기존 그대로 활성화)

## Facts

- `engine/building_blocks/confirmations/venue_funding_spread_extreme.py`: `binance_funding`, `bybit_funding`, `okx_funding` 컬럼 필요, None 시 False fallback
- `engine/building_blocks/confirmations/venue_oi_divergence.py`: `binance_oi_change_1h`, `bybit_oi_change_1h`, `okx_oi_change_1h` 필요
- `engine/data_cache/fetch_coinalyze_oi.py`: template — OI history 패턴 동일
- `engine/scanner/feature_calc.py`: `binance_oi`, `bybit_oi`, `okx_oi` 절대값 이미 ONCHAIN_SOURCES에서 로드됨
- 두 블록 모두 `engine/scoring/block_evaluator.py`에 이미 registered

## Canonical Files

- `engine/data_cache/fetch_coinalyze_funding.py` (신규)
- `engine/data_cache/fetch_coinalyze_oi.py` (template reference, 수정 없음)
- `engine/data_cache/registry.py`
- `engine/scanner/feature_calc.py`
- `engine/building_blocks/confirmations/venue_funding_spread_extreme.py` (수정 없음, 활성화 검증)
- `engine/building_blocks/confirmations/venue_oi_divergence.py` (수정 없음, 활성화 검증)
- `engine/tests/test_venue_funding_pipeline.py` (신규)

## Assumptions

- D-0337-1: per-exchange pct_change(1) 방식이 OI delta 산출에 충분. 일봉 데이터 기준.
- D-0337-2: Coinalyze per-exchange 심볼 suffix `.BINANCE`/`.BYBIT`/`.OKX` 지원 가정 (PR-1에서 API 호출로 검증)

## Open Questions

- Q-0337-1: Coinalyze funding-rate-history에서 `.BINANCE`/`.BYBIT`/`.OKX` suffix 심볼 지원 여부 → PR-1 착수 전 curl 테스트로 확인

## Decisions

- D-0337-1: per-venue OI delta는 기존 절대값에서 `pct_change(1)` 파생 — 새 Coinalyze fetch 불필요
- D-0337-2: registry 패턴 재사용 (ONCHAIN_SOURCES 등 기존 DataSource 구조)

## Exit Criteria

- [ ] `fetch_coinalyze_funding.py` 존재 + API 호출 성공 (Q-0337-1 검증)
- [ ] 3개 funding 컬럼 feature_calc compute_features_table() 출력에 존재
- [ ] 3개 oi_change_1h 컬럼 feature_calc 출력에 존재
- [ ] `venue_funding_spread_extreme` block이 test fixture에서 False fallback 없이 True/False 반환
- [ ] `venue_oi_divergence` block 동일 검증
- [ ] `test_venue_funding_pipeline.py` CI green
