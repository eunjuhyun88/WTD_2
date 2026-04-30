# W-0357 — Research Scanner ML Model Inference (하드코딩 제거)

> Wave: 5 | Priority: P1 | Effort: M
> Charter: In-Scope (기존 MODEL_REGISTRY_STORE 활용 — 신규 ML 시스템 아님)
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: TBD

## Goal
research scanner가 학습된 MODEL_REGISTRY active model을 실제로 사용하고, 임계값도 registry 기반으로 동작한다.

## Scope
- 포함:
  - `scanner.py:392` `predicted_prob=0.6` → `MODEL_REGISTRY_STORE.get_active(slug).predict_one(features)`
  - `scanner.py:418` `threshold=0.55` → `resolve_threshold(entry.threshold_policy_version)`
  - `model_registry.py`에 `resolve_threshold(policy_version, default=0.55)` helper 추가
    - `_THRESHOLD_POLICY = {1: 0.55, 2: 0.60, 3: 0.50}`
  - `training_service.py` `_AUTO_PROMOTE_MIN_AUC` 0.60 → 0.65
  - `alerts_pattern.py:43` `P_WIN_GATE` → threshold_policy 동적화
  - 결과 row에 `model_source` (registry/fallback) 컬럼 추가
  - active model 없으면 0.6/0.55 fallback (graceful degradation)
- 파일:
  - `engine/research/pattern_scan/scanner.py` (수정)
  - `engine/patterns/model_registry.py` (resolve_threshold helper 추가)
  - `engine/scanner/alerts_pattern.py` (P_WIN_GATE 동적화)
  - `engine/research/training_service.py` (_AUTO_PROMOTE_MIN_AUC 변경)
  - `engine/tests/research/test_scanner_ml_inference.py` (신규)
- API: 없음 (내부 pipeline 변경)

## Non-Goals
- 신규 ML 모델 아키텍처 — 기존 registry 모델 그대로 사용
- 실시간 모델 재학습 트리거 — training_service 스케줄 변경 없음
- live scanner (alerts_pattern.py 이외 경로) — 별도 W-item

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| predict_one 호출 latency 증가 | 중 | 중 | LRU cache로 모델 객체 재사용, wall-clock ≤20% 허용 |
| active model 없는 패턴에서 exception | 고 | 고 | try/except → fallback (0.6/0.55) + model_source="fallback" |
| _AUTO_PROMOTE_MIN_AUC 0.65 상향으로 auto-promote 중단 | 중 | 중 | 기존 registry 항목 불변, 신규 학습분부터 적용 |
| threshold_policy_version null (구버전 registry entry) | 중 | 중 | `resolve_threshold(None)` → default=0.55 반환 |
| alerts_pattern.py P_WIN_GATE 변경으로 live alert 빈도 변화 | 중 | 중 | 변경 전 기존 alert rate 기록 후 비교 |

### Dependencies / Rollback / Files Touched
- **Dependencies**: MODEL_REGISTRY_STORE (이미 존재), predict_one API (registry entry에 존재 확인 필요)
- **Rollback**: env flag `SCANNER_ML_INFERENCE_ENABLED=false` → 하드코딩 0.6/0.55 경로 활성
- **Files Touched**:
  - 수정: `scanner.py`, `model_registry.py`, `alerts_pattern.py`, `training_service.py`
  - 신규: `test_scanner_ml_inference.py`

## AI Researcher 관점

### Data Impact
- scanner 결과 `predicted_prob` 값 분포 변화 — 기존 단일값 0.6 → 패턴별 실제 예측값
- `model_source` 신규 컬럼: registry/fallback 비율이 ML 파이프라인 건강도 지표

### Statistical Validation
- AC1: active model 있는 패턴 80% 이상에서 predicted_prob ≠ 0.6 확인
- AC3: live scanner와 research scanner 동일 input → predicted_prob 차이 < 1e-6 (결정론성)
- AC4: LRU cache 적용 후 wall-clock ≤ 20% 증가 (기준: 기존 scanner 실행 시간)

### Failure Modes
- F1: 모델 파일 corrupt/missing → predict_one raise → fallback
- F2: feature vector shape mismatch → ValueError → fallback + error log
- F3: registry entry threshold_policy_version 미정의 → default 0.55

## Decisions
- [D-0357-01] predict_one 호출은 try/except로 감싸서 fallback 보장 — scanner 중단 금지
- [D-0357-02] `_THRESHOLD_POLICY = {1: 0.55, 2: 0.60, 3: 0.50}` — 버전별 임계값 명시
- [D-0357-03] LRU cache: `@lru_cache(maxsize=32)` on model load (slug 기준)
- [D-0357-04] `_AUTO_PROMOTE_MIN_AUC` 0.65 — 품질 기준 강화, 기존 entry 소급 미적용

## Open Questions
- [ ] [Q-0357-01] `predict_one(features)` API 시그니처 확인 필요 — registry entry에 해당 메서드 존재하는지?
- [ ] [Q-0357-02] alerts_pattern.py `P_WIN_GATE` 현재 값과 threshold_policy 어떻게 매핑?
- [ ] [Q-0357-03] live scanner와 research scanner가 동일 MODEL_REGISTRY_STORE 인스턴스를 공유하는지?

## Implementation Plan
1. `engine/patterns/model_registry.py` 읽기 — `get_active()` 반환 타입, `predict_one` 메서드 존재 여부 확인
2. `resolve_threshold(policy_version, default=0.55)` helper 추가 (`_THRESHOLD_POLICY` dict)
3. `scanner.py` 수정:
   - fallback wrapper 함수 `_predict_safe(slug, features) -> (float, str)` 작성
   - line 392: `predicted_prob=0.6` → `_predict_safe` 호출
   - line 418: `threshold=0.55` → `resolve_threshold(entry.threshold_policy_version)`
   - 결과 dict에 `model_source` 추가
4. `training_service.py` `_AUTO_PROMOTE_MIN_AUC` 0.60 → 0.65
5. `alerts_pattern.py:43` threshold 동적화 (`resolve_threshold` import + 적용)
6. pytest: fallback 경로, registry hit 경로, wall-clock benchmark, threshold_policy 각 버전

## Exit Criteria
- [ ] AC1: active model 있는 패턴 predicted_prob ≠ 0.6 비율 ≥ 80% (pytest fixture 기반)
- [ ] AC2: active model 없는 패턴 → `model_source="fallback"` + `predicted_prob=0.6` 정확히 유지
- [ ] AC3: live/research scanner 동일 input → predicted_prob 차이 < 1e-6
- [ ] AC4: scanner wall-clock 증가 ≤ 20% (모델 LRU cache 적용 후 pytest timeit)
- [ ] AC5: pytest ≥ 6 신규 PASS + 기존 scanner 테스트 0 회귀
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트
