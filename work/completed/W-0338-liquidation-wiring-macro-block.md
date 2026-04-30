# W-0338 — Liquidation Wiring + Macro Extreme Block

> Wave: Core Closure | Priority: P1 | Effort: S~M | Owner: engine
> Status: Design Draft | Created: 2026-04-30

## Goal

1. 기존 `fetch_coinalyze_liquidation_history()` fetcher를 feature_calc에 연결 (`long_liq_usd`, `short_liq_usd`)
2. 이미 feature_calc에 있는 macro features (`fear_greed`, `vix_close`, `btc_dominance`)를 감싸는 신규 building block 생성

두 작업 모두 "코드는 있지만 파이프라인에 연결 안 된" 상태를 닫는다.

## Owner

Engine

## Scope

### Part A: Liquidation → feature_calc

| 파일 | 변경 내용 |
|---|---|
| `engine/data_cache/registry.py` | `coinalyze_liquidations` DataSource 추가 |
| `engine/scanner/feature_calc.py` | `long_liq_usd`, `short_liq_usd` 컬럼 주입 |

`fetch_coinalyze_liquidation_history()` 이미 존재 → 신규 fetcher 불필요.
기존 `long_liq_usd`, `short_liq_usd` 컬럼명 그대로 사용.

### Part B: macro_regime_extreme 블록 신규

`engine/building_blocks/confirmations/macro_regime_extreme.py` 신규:

```python
# 4 modes (any True → block True)
MODE_FEAR:     fear_greed < 20
MODE_GREED:    fear_greed > 80
MODE_VIX_HIGH: vix_close > 40
MODE_BTC_DOM:  btc_dominance > 60
```

`engine/scoring/block_evaluator.py`: 4개 entry 추가
```
macro_fear_extreme, macro_greed_extreme, macro_vix_spike, macro_btc_dominance_extreme
```

## Non-Goals

- `dxy_slope_5d`, `spx_slope_5d` 블록화 — 이번 scope 외 (관찰 후 추가)
- macro block이 pattern에 연결되는 부분 (기존 패턴 재분류 불필요, 신규 패턴 생성 불필요)
- liquidation fetcher 로직 변경 없음

## Facts

- `engine/data_cache/fetch_coinalyze_liquidations.py`: `fetch_coinalyze_liquidation_history()` 존재, 반환 컬럼 `long_liq_usd`, `short_liq_usd`
- `engine/scanner/feature_calc.py`: `fear_greed`, `btc_dominance`, `vix_close`, `dxy_slope_5d`, `spx_slope_5d` 이미 computed
- `engine/building_blocks/confirmations/macro_regime_extreme.py`: 미존재 (신규)
- `engine/scoring/block_evaluator.py`: 기존 블록 등록 패턴 확인 필요

## Canonical Files

- `engine/data_cache/fetch_coinalyze_liquidations.py` (template reference, 수정 없음)
- `engine/data_cache/registry.py`
- `engine/scanner/feature_calc.py`
- `engine/building_blocks/confirmations/macro_regime_extreme.py` (신규)
- `engine/scoring/block_evaluator.py`
- `engine/tests/test_macro_extreme_block.py` (신규)

## Assumptions

- macro_regime_extreme은 4개 mode를 각각 별도 block_id로 등록 (any_mode 단일 블록 아님)
- liquidation 컬럼은 `_PERP_PASSTHROUGH_COLS` 또는 별도 injection 함수로 추가

## Decisions

- D-0338-1: 4-mode 개별 블록 등록 — 패턴 설계자가 원하는 조합만 선택 가능하도록
- D-0338-2: liquidation은 existing fetcher 재사용, 신규 API 호출 추가 없음

## Exit Criteria

- [ ] `long_liq_usd`, `short_liq_usd` feature_calc 출력에 존재
- [ ] `macro_regime_extreme.py` 블록 4개 mode 정상 동작
- [ ] `block_evaluator.py`에 4개 entry 등록 확인
- [ ] `test_macro_extreme_block.py` CI green
- [ ] `evaluate_blocks()` 호출 시 macro 블록이 ALWAYS_FALSE 아님 (fear_greed 픽스처 테스트)
