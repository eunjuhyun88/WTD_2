# W-0279 — V-05 + V-11 pipeline 연결: regime_results 실충전 + GateV2 export

> Wave: MM Hunter Track 2 | Priority: **P0** | Effort: **S (1d)**
> Charter: ✅ In-Scope L5 Search + L7 Refinement
> Status: ✅ Design Approved (2026-04-28)
> Created: 2026-04-28
> Depends on: PR #507 (V-05 regime.py) ✅ 머지 + PR #508 (V-11 gates.py) ✅ 머지

## Goal (1줄)

`pipeline.py`의 `regime_results` 플레이스홀더를 실제 V-05 호출로 채우고,
V-11 GateV2 타입을 `__init__.py`에서 export하여 호출자가
`evaluate_gate_v2(report, existing_pass)` 패턴으로 full V-11 평가를 할 수 있게 한다.

## Scope

### 포함
- `engine/research/validation/pipeline.py`
  - `ValidationPipelineConfig`에 `btc_returns: pd.Series | None = None` 추가
  - `run_validation_pipeline()` 끝: V-05 호출로 `regime_results`/`regime_pass_count` 채움
- `engine/research/validation/__init__.py`
  - V-05 export: `RegimeLabel`, `RegimeGateResult`, `label_regime`, `measure_regime_conditional_return`
  - V-11 export: `Gate`, `GateV2Config`, `GateV2Result`, `evaluate_gate_v2`

### Non-Goals
- ❌ `run_validation_pipeline()` 내에서 `evaluate_gate_v2()` 직접 호출 (augment-only 위반)
- ❌ `pattern_search.py` 수정
- ❌ V-04 sequence pipeline 통합 (이미 __init__.py export)

## Decisions

| ID | 결정 | 거절 옵션 |
|---|---|---|
| D-W0273-1 | `evaluate_gate_v2()`는 pipeline 밖 (호출자 책임) | 내부 호출 — pattern_search import 필요 → augment-only 위반 |
| D-W0273-2 | `btc_returns: pd.Series | None = None` Optional | 필수 — 기존 callers 전부 깨짐 |
| D-W0273-3 | `regime_results: list[dict]` (to_dict()) | dataclass 직접 — JSON 직렬화 추가 작업 |

## Implementation Plan

1. `pipeline.py` `ValidationPipelineConfig`에 `btc_returns: pd.Series | None = None`
2. `run_validation_pipeline()` 끝:
   ```python
   if config.btc_returns is not None:
       from research.validation.regime import label_regime, measure_regime_conditional_return
       regime_result = measure_regime_conditional_return(
           pack, phase_name, config.btc_returns,
           horizon_hours=config.horizons_hours[0] if config.horizons_hours else 4
       )
       regime_results_list = [regime_result.to_dict()]
       regime_pass_count = 1 if regime_result.g7_pass else 0
   else:
       regime_results_list, regime_pass_count = [], 0
   ```
3. `__init__.py` V-05 + V-11 export 추가
4. `uv run pytest engine/research/validation/ -v --tb=short`

## Exit Criteria

- [ ] AC1: `btc_returns=None`(기본) 시 기존 `test_pipeline.py` 전체 통과
- [ ] AC2: `btc_returns=Series` 주입 시 `report.regime_results` 비어있지 않음
- [ ] AC3: `from engine.research.validation import evaluate_gate_v2, Gate` import 가능
- [ ] AC4: `from engine.research.validation import label_regime, RegimeLabel` import 가능
- [ ] CI green

## References

- `engine/research/validation/pipeline.py:221-237` — regime_results 플레이스홀더
- PR #507 V-05 ✅, PR #508 V-11 ✅ (머지됨)
- commit `6254c867` — W-0259 cancelled (V-08으로 대체됨)
