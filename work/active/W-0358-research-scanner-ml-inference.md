# W-0358 — Research Scanner ML Model Inference (하드코딩 제거)

> Wave: 5 | Priority: P1 | Effort: M
> Charter: In-Scope (기존 MODEL_REGISTRY_STORE 활용 — 신규 ML 시스템 아님)
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: TBD

## Goal
research scanner가 학습된 LightGBM registry 모델을 실제로 호출하고, 임계값도 registry의
`threshold_policy_version`에 따라 동적으로 결정되도록 만든다. 현재 하드코딩된
`predicted_prob=0.6` / `threshold=0.55`는 ML 파이프라인의 학습 성과를 전혀 반영하지 못한다.

## Scope
- 포함:
  - `engine/research/pattern_scan/scanner.py:392`
    - 현행: `predicted_prob = 0.6` (모든 패턴 동일)
    - 신규: registry 조회 → `LightGBMEngine.predict_feature_row(snapshot)` → `P(win) ∈ [0,1]`
    - **정확한 호출 경로 (코드 검증 완료)**:
      ```python
      from engine.patterns.model_registry import MODEL_REGISTRY_STORE, current_definition_id
      from engine.scoring.lightgbm_engine import get_engine

      model_ref = MODEL_REGISTRY_STORE.get_preferred_scoring_model(
          pattern_slug,
          definition_id=current_definition_id(pattern_slug),
      )
      if model_ref is not None:
          engine = get_engine(model_ref.model_key)   # cached LightGBMEngine instance
          p_win = engine.predict_feature_row(feature_snapshot)  # dict[str, Any] -> float|None
      ```
    - `predict_feature_row`는 내부적으로 `encode_features_df(pd.DataFrame([dict(row)]))` →
      `model.predict_proba(X)[0, 1]` 호출. 즉 **class label이 아닌 P(win) 확률**.
    - `predict_feature_row` 반환값이 `None`이면 모델이 아직 학습되지 않은 상태 → fallback.
  - `engine/research/pattern_scan/scanner.py:418` `threshold=0.55` →
    `resolve_threshold(model_ref.threshold_policy_version)` (registry-driven).
  - `engine/patterns/model_registry.py`에 `resolve_threshold(policy_version, default=0.55)` 추가:
    - `_THRESHOLD_POLICY = {1: 0.55, 2: 0.60, 3: 0.50}` (v1 baseline / v2 strict / v3 recall-max)
    - `policy_version is None` → `default=0.55` 반환 (구버전 entry 호환).
  - `engine/research/training_service.py` `_AUTO_PROMOTE_MIN_AUC` `0.60 → 0.65`
    (기존 `_AUTO_PROMOTE_MIN_RECORDS=30`은 유지).
  - `engine/scanner/alerts_pattern.py:44`
    - 현행: `P_WIN_GATE = float(os.environ.get("PATTERN_ALERT_P_WIN_GATE", "0.55"))`
    - 신규: `resolve_threshold(model_ref.threshold_policy_version)`을 1차로 사용, env var는
      manual override로 유지 (운영에서 긴급 차단 가능).
  - 결과 row에 `model_source` 컬럼 추가: `"registry"` (predict_feature_row 성공) /
    `"fallback"` (no model / None / exception).
  - 모든 fallback 경로는 graceful degradation: `predicted_prob=0.6`, `threshold=0.55`.
- 파일:
  - `engine/research/pattern_scan/scanner.py` (수정)
  - `engine/patterns/model_registry.py` (`resolve_threshold` helper 추가)
  - `engine/scanner/alerts_pattern.py` (P_WIN_GATE 동적화)
  - `engine/research/training_service.py` (`_AUTO_PROMOTE_MIN_AUC` 변경)
  - `engine/tests/research/test_scanner_ml_inference.py` (신규)
- API: 없음 (내부 pipeline 변경)

## Non-Goals
- 신규 ML 모델 아키텍처 — 기존 LGBMClassifier 그대로 사용
- 실시간 모델 재학습 트리거 — `training_service` 스케줄 변경 없음
- live scanner (alerts_pattern.py) 외 경로 (예: backtest harness) — 별도 W-item

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `predict_feature_row` 호출 latency 증가 | 중 | 중 | `get_engine(model_key)` 자체가 LRU 캐시되어 있음. wall-clock ≤ 20% 허용 |
| active 모델 없는 패턴 다수 → 대부분 fallback | 고 | 중 | `model_source="fallback"` 비율 metrics로 노출, coverage % 모니터링 |
| `_AUTO_PROMOTE_MIN_AUC` 0.65 상향으로 promote 정체 | 중 | 중 | 기존 active entry는 불변, 신규 학습분부터 적용. 0.60≤AUC<0.65 "orphan candidate" 모니터링 |
| `threshold_policy_version` null (legacy entry) | 중 | 저 | `resolve_threshold(None)` → 0.55 default |
| live alert 빈도 변화 (P_WIN_GATE 동적화) | 중 | 중 | 변경 전 7일 alert rate baseline 기록 후 비교 |
| `feature_snapshot` 키가 `FEATURE_COLUMNS`와 mismatch | 중 | 고 | `encode_features_df`는 누락 키를 0.0으로 채워 silent degradation. Schema validation 가드 추가 (F1 참조) |

### Dependencies / Rollback / Files Touched
- **Dependencies**:
  - `MODEL_REGISTRY_STORE.get_preferred_scoring_model()` (engine/patterns/model_registry.py:172, 검증 완료)
  - `LightGBMEngine.predict_feature_row()` (engine/scoring/lightgbm_engine.py:74, 검증 완료)
  - `current_definition_id()` (model_registry 동일 모듈)
- **Rollback**: env flag `SCANNER_ML_INFERENCE_ENABLED=false` → 기존 하드코딩 0.6/0.55 경로
- **Files Touched**:
  - 수정: `scanner.py`, `model_registry.py`, `alerts_pattern.py`, `training_service.py`
  - 신규: `test_scanner_ml_inference.py`

## AI Researcher 관점

### Data Impact (paper-precision)

**Feature space (검증된 코드 기반):**
- `engine/scanner/feature_calc.py:1252` `FEATURE_COLUMNS = _CORE_FEATURE_COLUMNS + _REGISTRY_COLUMNS`.
  `N_FEATURES = len(FEATURE_NAMES)` (engine/scoring/feature_matrix.py).
- **Numeric (float64, NaN→0.0)**: `ema20_slope`, `ema50_slope`, `price_vs_ema50`, `rsi14`,
  `rsi14_slope`, `macd_hist`, `roc_10`, `atr_pct`, `atr_ratio_short_long`, `bb_width`,
  `bb_position`, `volume_24h`, `vol_ratio_3`, `obv_slope`, `dist_from_20d_high`,
  `dist_from_20d_low`, `swing_pivot_distance`, `funding_rate`, `oi_change_1h`,
  `oi_change_24h`, `oi_change_1h_zscore`, `oi_change_24h_zscore`, `vol_velocity_zscore`,
  `funding_change_zscore`, `cvd_change_zscore`, `long_short_ratio`, `taker_buy_ratio_1h`,
  `cvd_cumulative`, `oi_raw`, `oi_zscore`, `funding_rate_zscore`, `funding_flip_flag`,
  `volume_percentile`, `pullback_depth_pct`, `cvd_price_divergence`, `price_change_1h`,
  `price_change_4h` (+ registry-additional columns).
- **Categorical (ordinal encoded, unknown→0)**:
  - `ema_alignment`: bearish=0 / neutral=1 / bullish=2
  - `htf_structure`: downtrend=0 / range=1 / uptrend=2
  - `cvd_state`: selling=0 / neutral=1 / buying=2
  - `regime`: risk_off=0 / chop=1 / risk_on=2

**Model:** `lgb.LGBMClassifier`, persisted as pickle at `models/lgbm/{model_key}/latest.pkl`,
walk-forward CV `n_splits=5`, replacement gate `new_AUC > current_AUC - 0.02`.
Prediction is `predict_proba(X)[:, 1]` (P(win), NOT class label) — see
`engine/scoring/lightgbm_engine.py:84`.

**Distribution shift (pre/post W-0358):**
- 현행: 모든 scanner 행에 `predicted_prob ≡ 0.6` → 분산 0, 정렬 정보 없음.
- 사후: `predicted_prob ∈ [0, 1]`, 패턴별 모델 출력. 두 분포의 KL-divergence는 사실상 무한
  (degenerate → continuous). 통계적 의미는 모델 학습 후 처음 발생.
- `model_source` 컬럼: ML coverage rate = `sum(model_source=='registry') / len(rows)`. 베타
  운영 초기에는 30~60% 예상, 신규 패턴 학습 누적에 따라 상승.

### Statistical Validation (paper-level)

1. **Coverage check** —
   `coverage = #{rows with model_source=='registry'} / #{total rows}`. Threshold:
   coverage ≥ 30% (베타) / ≥ 70% (정상 운영). 30% 미만은 학습 파이프라인 막힘 시그널.
2. **Calibration sanity** —
   `model_source=='registry'` 행만 모아 `predicted_prob` 분포의 표준편차 σ를 측정.
   - σ < 0.02 (모든 값이 [0.58, 0.62] 좁은 대역) → 모델이 사실상 상수 반환 → bad model alert.
   - σ ≥ 0.05 → 정상.
3. **Determinism test** — 동일 `feature_snapshot` dict로 `predict_feature_row`를 N=10회 호출
   시 결과 분산 = 0. LightGBM `predict_proba`는 deterministic, dropout 없음.
4. **Threshold impact (estimation)** — registry에 저장된 backtest 분포를 사용해
   `P(predicted_prob ≥ τ)`를 τ ∈ {0.50, 0.55, 0.60, 0.65}별로 산출. 임계값 0.55→0.60 상승은
   통상 signal volume을 30~50% 감소시키며, precision은 4~8%p 상승 (Wave 4 backtest 추정).
5. **AUC gate justification (`_AUTO_PROMOTE_MIN_AUC` 0.60 → 0.65)** —
   - AUC=0.50 = random.
   - AUC=0.60 = 현행 gate, random 대비 +0.10 (+20% relative). n=30에서 95% CI는 통상
     ±0.10이라 0.50 포함 가능 → 통계적 유의성 약함.
   - AUC=0.65 = random 대비 +0.15 (+30% relative). n=30, σ_AUC≈0.05 가정 시 z=3.0,
     p<0.01. 즉 **n≥30 + AUC≥0.65**가 paper-level "non-random" 최소 기준.

### Failure Modes (expanded)

- **F1 — `feature_snapshot` 키 mismatch (silent degradation)**:
  `encode_features_df`는 `FEATURE_COLUMNS`에 없는 키를 무시하고, 누락 키를 0.0으로 채운다
  (engine/scoring/feature_matrix.py 동작). 즉 mismatch가 있어도 **예외가 아닌 silent 0**.
  **완화**: scanner side에서 `assert set(FEATURE_COLUMNS).issubset(snapshot.keys())` 또는
  최초 호출 시 차이를 log.warn → metrics counter (`feature_schema_mismatch_total`).
- **F2 — categorical 값이 `_CAT_MAPS`에 없음 (silent 0)**:
  `ema_alignment="sideways"`처럼 mapping에 없는 값은 0으로 매핑되어 "bearish"와 동일 취급.
  **완화**: scanner의 categorical 생성 지점에서 화이트리스트 검증.
- **F3 — `predict_proba` 비정상 값**: LightGBM이 [0,1] 밖 값을 반환할 가능성은 0이지만,
  방어적으로 `0.0 <= p_win <= 1.0` 클램프. 위반 시 fallback + WARN.
- **F4 — Orphan candidate (AUC 0.60≤x<0.65)**: gate 상향으로 auto-promote 못 받는 candidate
  누적. **모니터링 쿼리**:
  `SELECT slug, auc, created_at FROM model_registry WHERE rollout_state='candidate'
   AND auc BETWEEN 0.60 AND 0.65 AND created_at < now() - interval '7 days'`.
  7일 이상 정체 시 수동 promote 또는 retrain.
- **F5 — Model file corruption**: `LightGBMEngine` 로드 시 pickle error → `_model=None` →
  `predict_feature_row` returns `None` → fallback. 이미 안전.

## Decisions

- [D-0357-01] `predict_feature_row` 호출은 try/except + None 체크로 감싸 fallback 보장 —
  scanner 중단 금지.
- [D-0357-02] `_THRESHOLD_POLICY = {1: 0.55, 2: 0.60, 3: 0.50}` — 버전별 임계값 명시.
- [D-0357-03] `get_engine(model_key)` 자체가 캐싱 — 추가 LRU 불필요.
- [D-0357-04] `_AUTO_PROMOTE_MIN_AUC` 0.65 — paper-level 통계 유의성 기준, 기존 entry 소급 미적용.
- [D-0357-05] **`predict_feature_row()` 사용 (NOT `predict_one()`)**.
  이유: scanner는 dict 기반 feature snapshot으로 동작한다. `predict_one(SignalSnapshot)`은
  fully-hydrated `SignalSnapshot` 객체를 요구하지만 scanner loop 시점에는 그 객체가 존재하지
  않는다. `predict_feature_row(Mapping[str, Any])`가 정확한 contract.
- [D-0357-06] **`get_preferred_scoring_model()` 사용 (NOT `get_active()`)**.
  이유: candidate 모델도 shadow scoring에 사용 가능. `entry_scorer.py`가 이미 동일 helper를
  사용 중이라 일관성 유지. active 부재 시 candidate fallback이 자동.

## Open Questions

- [x] [Q-0357-01] ~~`predict_one(features)` API 시그니처 확인~~ **RESOLVED**:
  `predict_feature_row(row: Mapping[str, Any]) -> float | None` 사용. 새 질문:
  scanner의 기존 EntrySignal feature dict가 `FEATURE_COLUMNS`와 정확히 일치하는가?
  → Implementation Step 0에서 grep 검증.
- [ ] [Q-0357-02] `alerts_pattern.py P_WIN_GATE`는 이미 env override를 지원
  (`PATTERN_ALERT_P_WIN_GATE`). W-0358은 `resolve_threshold(threshold_policy_version)`을
  1차 소스로, env var를 manual override로 유지하는 2-layer 설계 확정 필요.
- [ ] [Q-0357-03] live scanner와 research scanner가 동일 `MODEL_REGISTRY_STORE` 인스턴스를
  공유하는지 (process-singleton 가정). 현재 `MODEL_REGISTRY_STORE` import 동일 모듈이므로 ✓
  예상, AC3로 검증.

## Implementation Plan

0. **(Schema 검증)** scanner의 `EntrySignal` 또는 동등 dict 구성 지점을 grep해
   `FEATURE_COLUMNS`와의 키 차이를 확인. 차이가 있다면 `_build_feature_snapshot(combo, ctx, ts)`
   helper를 추가하여 누락 키를 명시적으로 0.0으로 채우고 categorical 값을 화이트리스트
   검증한다.
1. `engine/patterns/model_registry.py` 읽기 — `get_preferred_scoring_model()` 반환 타입 확인,
   `model_key`/`threshold_policy_version` 필드 검증.
2. `resolve_threshold(policy_version, default=0.55)` helper 추가
   (`_THRESHOLD_POLICY` dict + None handling).
3. `scanner.py` 수정:
   - fallback 래퍼 `_predict_safe(slug, snapshot) -> tuple[float, float, str]` (returns
     `(predicted_prob, threshold, model_source)`).
   - line 392: 하드코딩 0.6 제거 → `_predict_safe` 호출 결과 사용.
   - line 418: 하드코딩 0.55 제거 → 동일.
   - 결과 dict / parquet row에 `model_source` 컬럼 추가.
4. `training_service.py` `_AUTO_PROMOTE_MIN_AUC` 0.60 → 0.65.
5. `alerts_pattern.py:44` 동적 threshold:
   `threshold = float(os.environ.get("PATTERN_ALERT_P_WIN_GATE",
                                     resolve_threshold(model_ref.threshold_policy_version)))`.
6. pytest:
   - registry hit 경로 (predict_feature_row 호출 횟수 = 1, p_win != 0.6).
   - registry miss 경로 (`get_preferred_scoring_model` returns None → fallback).
   - `predict_feature_row` returns None (untrained) → fallback.
   - `_THRESHOLD_POLICY` 각 version (1/2/3/None).
   - schema mismatch 시 silent 0 발생 검증 (방어 로직 발동).
   - wall-clock benchmark (mock model로 100회 호출, baseline 대비 ≤ 20%).

## Exit Criteria

- [ ] AC1: registry에 모델이 있는 패턴은 100% `model_source=="registry"` + `predicted_prob != 0.6`
  (≤ 1e-6 tolerance with 0.6).
- [ ] AC2: registry에 모델이 없거나 `predict_feature_row`가 None을 반환하는 경우
  `model_source=="fallback"` + `predicted_prob == 0.6` + `threshold == 0.55`.
- [ ] AC3: live scanner와 research scanner의 동일 input(`feature_snapshot`)에 대한
  `predicted_prob` 차이 < 1e-6 (deterministic).
- [ ] AC4: scanner wall-clock 증가 ≤ 20% (LRU 캐시된 `get_engine` 적용 후 pytest timeit).
- [ ] AC5: pytest ≥ 6 신규 PASS + 기존 scanner 테스트 0 회귀.
- [ ] AC6: `_AUTO_PROMOTE_MIN_AUC=0.65` 적용 후 training_service 단위 테스트 갱신
  (0.62 AUC → no auto-promote, 0.66 AUC → auto-promote).
- [x] CI green
- [x] PR merged (#805) + CURRENT.md SHA 업데이트

## Owner
engine

## Canonical Files
- `engine/research/pattern_scan/scanner.py`
- `engine/patterns/model_registry.py`
- `engine/scanner/alerts_pattern.py`
- `engine/research/training_service.py`
- `engine/tests/research/test_scanner_ml_inference.py`

## Facts
- `scanner.py:392` 하드코딩 `predicted_prob=0.6` 확인 (코드 grep)
- `scanner.py:418` 하드코딩 `threshold=0.55` 확인 (코드 grep)
- `MODEL_REGISTRY_STORE.get_preferred_scoring_model()` 존재 확인 (model_registry.py:172)
- `LightGBMEngine.predict_feature_row()` 존재 확인 (lightgbm_engine.py:74)
- `_AUTO_PROMOTE_MIN_AUC=0.60` 현행값 확인

## Assumptions
- LRU 캐시된 `get_engine(model_key)` 호출은 캐시 히트 기준 < 1ms
- scanner 루프 frequency: 5분 주기, 패턴 수 ≤ 200

## Next Steps
- PR #805 머지 완료
- W-0352 구현 시 `model_source` 컬럼이 parquet에 포함되는지 확인

## Handoff Checklist
- [x] PR #805 merged — feat(W-0358) scanner ML inference
- [x] 15 tests PASS (engine/tests/research/test_scanner_ml_inference.py)
- [x] resolve_threshold / _predict_safe 구현 완료
