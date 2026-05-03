# W-0398 — Layer C Auto-Train Scheduler Wiring + E2E Verification

> Wave: 6 | Priority: P0 | Effort: M
> Charter: In-Scope (L5 Search + L7 Refinement)
> Issue: #963
> Status: 🟡 Design Draft
> Created: 2026-05-03

## Goal
W-0394에서 완성된 auto_trainer.py를 scheduler에 연결하고, synthetic verdict injection harness로 1 사이클(50 verdicts → train → promote → blend 변경 → search recall 개선)을 검증한다.

## Owner
engine

## Facts
- `engine/scoring/auto_trainer.py` — evaluate_trigger / train_and_register / shadow_eval / promote_if_eligible 구현됨 (W-0394)
- `engine/scanner/scheduler.py` — `layer_c_trainer_check` job 미등록
- `engine/api/routes/captures.py` — verdict submit hook 미연결
- `engine/scoring/similar.py` — is_trained=False → Layer C None 반환 중
- `app/src/lib/components/SearchLayerBadge.svelte` — W-0394에서 추가됨

## Canonical Files
- `engine/scoring/auto_trainer.py`
- `engine/scanner/scheduler.py`
- `engine/api/routes/captures.py`
- `engine/tests/test_w0398_layer_c_e2e.py` (신규)
- `app/supabase/migrations/0NN_add_is_synthetic.sql` (신규)

## Assumptions
- auto_trainer.py 알고리즘 코드는 변경 없이 wiring만 필요
- APScheduler 이미 scheduler.py에서 사용 중
- `_TRAIN_LOCK` 이미 auto_trainer.py에 존재 (중복 실행 방지)

## Next Steps
1. `engine/api/routes/captures.py` verdict submit hook 추가 (background thread)
2. `engine/scanner/scheduler.py` `layer_c_trainer_check` job 등록 (1h)
3. `app/supabase/migrations/0NN_add_is_synthetic.sql` 신규 migration
4. `engine/tests/test_w0398_layer_c_e2e.py` E2E synthetic harness 작성

## Handoff Checklist
- [x] 설계 문서 작성
- [x] 구현 완료 (PR #968)
- [ ] E2E synthetic harness 테스트 작성
- [ ] merged to main

## Context
- auto_trainer.py (W-0394): evaluate_trigger(50,100,200...) + train_and_register() + shadow_eval() + promote_if_eligible() — **코드 완성**
- scheduler.py: auto_trainer NOT wired (grep 확인)
- similar.py Layer C: is_trained=False → None 반환 중
- SearchLayerBadge.svelte: W-0394에서 추가됨

## Root Cause
W-0394는 auto_trainer 코드를 작성했으나 scheduler job 등록 및 verdict submit hook 연결을 하지 않았다.

## Scope

### 구현 항목

1. **Scheduler 연결** (`engine/scanner/scheduler.py`)
   - `layer_c_trainer_check` job 추가 (1h interval)
   - `count_labelled_verdicts()` → `evaluate_trigger(n)` → True면 `train_and_register()` → `shadow_eval()` → `promote_if_eligible()`
   - 실패 시 exception 로깅, 다음 tick에 재시도 (idempotent)

2. **Verdict Hook** (`engine/api/routes/captures.py` 또는 `engine/ledger/store.py`)
   - verdict submit 후 `evaluate_trigger(count_labelled_verdicts())` 호출
   - True이면 background thread로 `train_and_register()` 실행 (non-blocking)
   - 두 번 중복 실행 방지: `_TRAIN_LOCK` 이미 있음

3. **E2E Synthetic Harness** (`engine/tests/test_w0398_layer_c_e2e.py`)
   - Supabase test fixtures에 50 synthetic capture_records (outcome_id not null) 주입
   - `is_synthetic=True` 컬럼 (migration 필요) 또는 `--dry-run` 모드
   - evaluate_trigger → train → shadow_eval → promote 1 사이클 완주 확인
   - Layer C is_trained=True 전후 search recall@10 측정

4. **SearchLayerBadge 갱신 검증**
   - Layer C promote 후 `/api/search/similar` 응답 `layer_c: true` 확인
   - SearchLayerBadge.svelte가 layer_c 상태 반영하는지 확인

### 파일 범위
- `engine/scanner/scheduler.py` (job 추가)
- `engine/api/routes/captures.py` (verdict hook)
- `engine/scoring/auto_trainer.py` (필요 시 bug fix만)
- `engine/tests/test_w0398_layer_c_e2e.py` (신규 테스트)
- `app/supabase/migrations/0XX_add_is_synthetic.sql` (synthetic flag — Q-2 결정 후)

## Non-Goals
- auto_trainer.py 알고리즘 변경 (W-0394 완성품 그대로)
- Layer C 수동 훈련 또는 모델 교체
- GPU 훈련 (P3)
- lightgbm_engine.py의 20 threshold 변경

## CTO 관점

### 리스크 매트릭스
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 훈련 중 API 응답 지연 | 중 | 고 | `_TRAIN_LOCK` + background thread, timeout 120s |
| GCS 미설정 환경에서 train 실패 | 고 | 중 | GCS_BUCKET 없으면 local disk fallback (이미 구현됨) |
| synthetic verdicts → prod 분석 오염 | 중 | 고 | is_synthetic 컬럼 OR staging DB 사용 |
| shadow_eval NDCG@5 수렴 실패 (데이터 50개 부족) | 고 | 중 | promote_if_eligible CI lower 0.05 → 테스트 시 0.0로 완화 |
| scheduler 1h interval → 실시간 검증 어려움 | 중 | 저 | verdict hook 방식이 scheduler보다 즉각적 |

### 구현 선택: Job vs Hook
- **Job (1h)**: 간단, idempotent, 배치 처리에 적합
- **Hook (per-verdict)**: 즉각, 단 concurrent 훈련 리스크
- **결정**: 둘 다 구현. Hook은 trigger check만, 실제 훈련은 background thread. Job은 낙수 방어.

### 거절 옵션
- **"W-0394 재작성"** → 거절. auto_trainer 코드 완성됨, wiring만 필요.
- **"수동으로 model을 models/lgbm/에 배치"** → 거절. auto-train 플라이휠 원칙 위반, 재현 불가.

## AI Researcher 관점

### E2E Verification Strategy
```
synthetic_verdicts (50) → count_labelled_verdicts() = 50
→ evaluate_trigger(50) = True
→ train_and_register() → version_id
→ shadow_eval(version_id) → { ndcg_new, ndcg_baseline, ci_lower }
→ promote_if_eligible() → is_trained = True
→ /api/search/similar 재호출 → layer_c_score 존재
→ recall@10 측정 (baseline vs promoted)
```

### 통계적 견고성
- 50개 verdicts는 LightGBM 훈련에 매우 적음 → overfitting 리스크
- shadow_eval의 paired bootstrap CI가 safeguard
- promote 실패 가능성 높음 → 테스트에서는 `_PROMOTE_CI_LOWER_THRESHOLD = 0.0`으로 임시 완화
- 실 운영에서는 100+ verdicts 이후 NDCG 안정화 예상

### 데이터 플라이휠 임팩트
훈련 전 검색: A(0.60) + B(0.40) + C(None)
훈련 후 검색: A(0.45) + B(0.30) + C(0.25)
→ personalization signal 25% 반영
→ recall@10 Δ ≥ +5% 기대 (W-0394 설계 근거)

## Decisions
- **[D-1]** synthetic verdict 격리: `is_synthetic=True` 컬럼 신설 (migration). 이유: staging DB 분리는 인프라 비용 높음, 컬럼이 단순.
- **[D-2]** scheduler 1h + verdict hook 둘 다 구현. 이유: hook이 즉각 트리거, job이 낙수 방어.
- **[D-3]** 테스트 시 `_PROMOTE_CI_LOWER_THRESHOLD = 0.0` monkeypatch. 이유: 50개 데이터로 CI lower > 0.05 달성 어려움.

## Open Questions
- [ ] [Q-1] `engine/api/routes/captures.py` verdict submit 엔드포인트 위치 확인 (POST /{id}/verdict 정확한 라인)
- [ ] [Q-2] is_synthetic 컬럼 migration 번호 확인 (현재 최신 migration 번호 + 1)
- [ ] [Q-3] GCS bucket 운영 환경 설정 여부 (LGBM_MODEL_GCS_BUCKET env var)

## Implementation Plan
1. `engine/api/routes/captures.py`: verdict submit 성공 후 `evaluate_trigger()` hook (background thread)
2. `engine/scanner/scheduler.py`: `layer_c_trainer_check` job (1h, APScheduler)
3. `app/supabase/migrations/0NN_add_is_synthetic.sql`: `ALTER TABLE capture_records ADD COLUMN is_synthetic BOOLEAN DEFAULT FALSE`
4. `engine/tests/test_w0398_layer_c_e2e.py`: synthetic 50 verdicts → full cycle assertion
5. SearchLayerBadge `/api/search/similar` layer_c 필드 반영 확인
6. CI: pytest engine/tests/test_w0398_layer_c_e2e.py + dry-run 검증

## Exit Criteria
- [ ] AC1: verdict submit → evaluate_trigger(50) True → train_and_register() 호출 확인 (integration test)
- [ ] AC2: scheduler `layer_c_trainer_check` job APScheduler 등록 확인 (unit test)
- [ ] AC3: synthetic 50 verdicts injection → 1 cycle 완주 → is_trained=True → layer_c_score ≠ None
- [ ] AC4: Layer C promote 후 `/api/search/similar` recall@10 ≥ baseline (monkeypatch CI 완화)
- [ ] AC5: SearchLayerBadge `layer_c: true` 반영 확인 (Playwright or unit)
- [ ] AC6: 기존 refinement_trigger Hill Climbing 회귀 없음 (test_hill_climbing.py green)
- [ ] AC7: CI green, PR merged, CURRENT.md main SHA 업데이트
