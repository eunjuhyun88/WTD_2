# W-0344 — Refinement Loop Closure (verdict→retrain→live variant)

> Wave: 5 | Priority: P1 | Effort: M
> Charter: In-Scope (existing refinement infra stabilization)
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: #735

## Goal
Jin이 패턴에 verdict 10개를 누적하면 자동으로 LightGBM 재학습이 돌고, 다음 라이브 스캔이 새 variant를 즉시 반영해 더 정확한 신호를 본다.

## Scope
- 포함:
  - `refinement_trigger_job()` → `pattern_refinement_job()` 호출 wiring
  - `pattern_refinement.py`가 `training_service.train_variant()` → `model_registry.register()` → `active_variant_registry.promote()`까지 end-to-end 실행
  - live scanner(`engine/research/pattern_scan/scanner.py`)가 매 호출 시 `active_variant_registry.get_active(pattern_id)` 조회
  - flywheel KPI 측정 (`verdicts_to_refinement_count_7d`, `promotion_gate_pass_rate_30d`)
- 파일:
  - `engine/scanner/jobs/refinement_trigger.py` (트리거 게이트 — 이미 존재)
  - `engine/scanner/jobs/pattern_refinement.py` (executor — 호출 wiring 필요)
  - `engine/patterns/training_service.py`
  - `engine/patterns/model_registry.py`
  - `engine/patterns/active_variant_registry.py`
  - `engine/research/pattern_scan/scanner.py` (registry read 추가)
- API: 신규 없음 (내부 잡 체인). KPI는 기존 `compute_flywheel_health()` 확장.

## Non-Goals
- 새로운 모델 아키텍처 도입 (LightGBM 유지)
- Online learning / streaming retrain (배치 7일 게이트 유지)
- Feature engineering 변경 (W-0340 Phase 1 스키마 재사용)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Bad variant promotion → live alert quality 하락 | 중 | 고 | promotion gate (BH-FDR p<0.05 + recall@10 ≥ 기존 variant) 필수 통과, 실패 시 baseline rollback |
| Retrain job 동시 실행 race | 중 | 중 | `pattern_refinement_job`에 file-lock (`engine/patterns/pattern_active_variants/.lock`) |
| active_variant cache stale | 고 | 중 | scanner가 매 호출 mtime 체크 또는 60s TTL in-memory cache |
| Trigger storm (10 verdicts 직후 연속 발화) | 중 | 저 | 7d cooldown 유지 + per-pattern dedup |

### Dependencies
- W-0335 (verdict pipeline) — merged ✅
- W-0340 Phase 1 features — merged ✅
- 독립: B/C/D와 병렬 가능

### Rollback
- `active_variant_registry.promote()`에 `previous_variant_id` 기록 → 한 줄 복원
- KPI 회귀(promotion_gate_pass_rate < 50%) 시 `REFINEMENT_LOOP_ENABLED=false` env flag

### Files Touched
- 수정: `refinement_trigger.py`, `pattern_refinement.py`, `scanner.py` (research/pattern_scan)
- 신규: `engine/patterns/__tests__/test_refinement_loop_e2e.py`

## AI Researcher 관점

### Data Impact
- input: `pattern_outcomes` 테이블 (verdict 10+) + W-0340 feature blocks
- output: 새 LightGBM weights (`engine/patterns/pattern_active_variants/{slug}/v{N}.pkl`)
- training set: 최근 90d outcomes (closed only), OOS split = 마지막 20%

### Statistical Validation
- promotion gate: OOS recall@10 ≥ baseline AND BH-FDR(p, m=총 변경 패턴 수) < 0.05
- min sample size: verdict ≥ 10 (1차), ≥ 30이면 hyperparam tune 활성화
- decay test: 30d/60d/90d hit_rate 비교, monotonic decline 시 reject

### Failure Modes
- F1: verdict 라벨 노이즈 (Jin이 무작위로 valid 클릭) — class-balance check (≥30% invalid 강제)
- F2: 클래스 imbalance 극단 (≥95% valid) → SMOTE 거부, 기존 variant 유지
- F3: 신규 variant overfitting → train/OOS gap > 0.15 면 reject

## Decisions
- [D-0344-01] LightGBM 유지 (Charter §Frozen 준수)
- [D-0344-02] Promotion gate는 baseline-tied (절대 임계값 아닌 상대 비교)
- [D-0344-03] Cooldown 7d 유지 — verdict 누적 빠르더라도 재학습 빈도 제한

## Open Questions
- [ ] [Q-0344-01] active_variant cache TTL 60s vs mtime-watch 중 무엇? (성능 측정 필요)
- [ ] [Q-0344-02] Promotion 실패 N회 누적 시 패턴을 blocked_patterns에 자동 추가할지?

## Implementation Plan
1. `pattern_refinement_job()` wiring — `refinement_trigger`가 게이트 통과한 패턴을 큐에 enqueue
2. `training_service.train_variant()`이 OOS split + BH-FDR 계산 반환
3. `active_variant_registry.promote()`에 promotion gate 검증 + rollback 메타 기록
4. `research/pattern_scan/scanner.py`에 `_load_active_variant(pattern_id)` 추가, mtime cache
5. e2e 테스트: 10 verdicts seed → trigger → train → promote → scan 신규 variant 사용 검증
6. flywheel KPI 어서션 (`verdicts_to_refinement_count_7d ≥ 1`)

## Exit Criteria
- [ ] AC1: 10 verdicts seed 후 60초 내 `pattern_refinement_job` 실행 (e2e test)
- [ ] AC2: promotion gate 통과 시 `active_variant_registry.get_active()`가 새 variant_id 반환 (mtime 갱신 검증)
- [ ] AC3: live scanner가 promote 후 첫 호출에서 신규 variant 점수 사용 (cache TTL ≤ 60s)
- [ ] AC4: `compute_flywheel_health().promotion_gate_pass_rate_30d` ≥ 0.5 (synthetic seed 기준)
- [ ] AC5: rollback 1줄 (`promote(rollback_to=prev)`) 동작 검증
- [ ] CI green (engine pytest + typecheck)
- [ ] PR merged + CURRENT.md SHA 업데이트
