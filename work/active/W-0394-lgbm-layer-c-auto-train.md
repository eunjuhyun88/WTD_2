# W-0394 — LightGBM Layer C 자동 학습·배포 파이프라인

> Wave: 6 | Priority: P1 | Effort: M (5–7 dev-days, 2 PR)
> Charter: In-Scope (검색·랭킹 품질 개선)
> Status: 🟡 Design Draft
> Created: 2026-05-03
> Issue: TBD (저장 후 발행)
> Depends-On: W-0392 (Issue #947) — strict blocker (verdict_json 필요)

## Goal

verdict가 50건 누적되면 LightGBM Layer C가 **자동으로** 학습·평가·배포되어, Jin이 추가 조작 없이 더 정확한 검색 결과를 받게 된다 — Flywheel 첫 회전을 사람이 돌릴 필요가 없다.

## Owner

engine (메인) + app (SearchLayerBadge 컴포넌트)

---

## CPO 선정 이유

### 선택: W-0394 LightGBM Auto-Train

1. **NSM(WVPL) 직접 가속의 유일한 비선형 레버**: 개인 stats 대시보드나 decay monitor는 기존 정확도를 *표시*하지만, Layer C는 검색 정확도 자체를 끌어올림 → captures → verdicts → 재학습 루프 첫 회전. 한 번 켜지면 매주 자동 개선.
2. **W-0392 데이터 자산 직접 활용**: W-0392가 만드는 `verdict_json`(entry/stop/target/RR)이 곧 LightGBM 학습 라벨이자 feature. 두 work item이 동일 데이터 자산 공유.
3. **Dead code 활성화 = 최고 ROI**: `engine/scoring/lightgbm_engine.py`의 predict_one()은 존재하나 weight=0으로 비활성(미훈련). 이미 만든 시스템을 켜는 작업.
4. **W-0393(TV Idea Twin)과 파일 영역 disjoint** — 병렬 구현 가능.

### 거절 후보들

- **개인 정확도 대시보드(F-37)**: W-0394 ship 후 Layer C 효과를 stats panel에서 같이 보여주면 narrative 더 강력. **W-0394 → W-0395** 순서 권장.
- **Pattern Decay Monitor(F-38)**: verdict 200+ 필요, 현재 표본 부족. false positive 다발 위험. Wave 7 적기.

---

## CPO 결정 확정 (Open Questions 전부 처리)

| Q# | 질문 | CPO 결정 | 이유 |
|---|---|---|---|
| Q-1 | verdict_json 학습 feature 최종 필드 | **RR + hold_minutes** 포함 (mfe/mae는 W-0392 merge 후 grep 확정) | RR은 win/loss signal, hold_minutes은 pattern durability indicator |
| Q-2 | weight 200+ 재조정 W-0394 포함 여부 | **W-0396으로 분리** | W-0394는 첫 활성화(0→0.25)에 집중. 가중치 튜닝은 데이터 충분 후 |
| Q-3 | 모델 저장소 | **GCS (`LGBM_MODEL_GCS_BUCKET` env)** | Cloud Run ephemeral disk — restart 시 소실. 베타 이후 스케일 필요 |
| Q-4 | SearchLayerBadge 위치 | **검색 결과 상단 inline** | Jin이 검색 시 AI reranker 상태 즉시 인지 → 동기부여. StatusBar는 묻힘 |
| Q-5 | verdict 14일 미도달 시 처리 | **graceful skip + weekly log** | 활동 정체 관찰 목적. 강제 alert는 별도 W로 분리 |
| — | AC2 임계 | **+0.05 유지** | 너무 엄격(+0.07) → 첫 배포 영원히 안 됨. 너무 느슨(+0.03) → 의미 없음 |
| — | W-0392 의존 | **strict blocker 확정** | W-0392 merge 전 W-0394 PR1 시작 금지 |

---

## Scope

### 포함
- verdict 50+ 도달 시 자동 학습 트리거 + shadow eval + atomic model swap
- GCS 기반 model versioning (model_versions DB 테이블)
- Layer C weight `0.0 → 0.25` (A:0.45 / B:0.30 / C:0.25) 활성화
- nightly eval cron — NDCG 회귀 감지 시 자동 rollback
- SearchLayerBadge UI — "AI Reranker: ON v{N}" / "training (n=47/50)" / "OFF"

### 파일 목록

**Engine (신규)**
- `engine/scoring/auto_trainer.py` — 트리거·학습·shadow eval·promote 오케스트레이터
- `engine/scoring/registry.py` — model_versions 테이블 access layer
- `engine/scoring/eval/ndcg.py` — NDCG@5, MAP@10, paired_bootstrap_ci
- `engine/scoring/eval/__init__.py`
- `engine/tests/scoring/test_auto_trainer.py`
- `engine/tests/scoring/test_ndcg.py`
- `engine/tests/scoring/test_registry.py`

**Engine (수정)**
- `engine/scoring/trainer.py` — `build_dataset_from_verdicts(min_n)` 분리, 기존 CLI 호환 유지
- `engine/scoring/lightgbm_engine.py` — atomic GCS swap (current symlink 패턴 → GCS path)
- `engine/research/ensemble/similarity_ranker.py` — Layer C weight를 `float(os.environ.get("LGBM_CONTEXT_SCORE_WEIGHT", "0"))`
- `engine/api/routes/verdict.py` — insert 직후 `auto_trainer.evaluate_trigger()` 호출 (idempotent)
- `engine/api/routes/scoring.py` — `GET /scoring/active-model` endpoint 추가 (또는 신규)
- `engine/scheduler/jobs.py` — nightly `evaluate_active_model` cron 등록

**App (신규)**
- `app/src/lib/components/search/SearchLayerBadge.svelte` (~30 lines)

**App (수정)**
- `app/src/routes/(app)/search/+page.svelte` — SearchLayerBadge 마운트

**DB**
- `app/supabase/migrations/050_lgbm_model_registry.sql`
  - `model_versions` 테이블: id, model_type, version, trained_at, training_size, ndcg_at_5, map_at_10, status ('shadow'|'active'|'retired'), gcs_path

  주의: W-0392가 049 선점 예정 → **PR1 시작 전 `ls migrations/ | tail -3` 재확인 필수**

### Non-Goals
- ❌ 온라인/스트리밍 학습 — 배치 트리거만 (이유: 표본 부족 시 gradient 불안정)
- ❌ HPO (Optuna) — 고정 hyperparams (이유: n=50 표본에서 HPO = noise fitting)
- ❌ A/B 트래픽 분기 — shadow eval만 (이유: 단일 베타 사용자에서 A/B 통계 무의미)
- ❌ Feature store 도입 — 기존 similarity_ranker feature 재사용 (이유: scope creep)
- ❌ Layer C weight 200+ 이후 재조정 — W-0396으로 분리

---

## Facts (코드 실측)

```
engine/scoring/trainer.py          — LGBMClassifier 학습 코드 존재. dataset_builder 강결합 → 분리 필요
engine/scoring/lightgbm_engine.py  — predict_one() 존재, 미훈련 시 None 반환 (Layer C 현재 dead)
engine/train_lgbm.py               — 수동 CLI 진입점. auto_trainer가 import 재사용
engine/research/ensemble/similarity_ranker.py:348
                                   — "When LightGBM model is trained and LGBM_CONTEXT_SCORE_ENABLED not false"
                                     분기 주석 이미 존재 → env flag 패턴 확립됨
engine/api/routes/verdict.py       — verdict insert 핸들러 존재. trigger logic 미구현
engine/models/lgbm/                — 현재 빈 디렉토리 (gitignore)
현재 Layer C 가중치: A:0.60 / B:0.40 / C:0.00 (dead)
목표 가중치:        A:0.45 / B:0.30 / C:0.25
최신 migration:    048_formula_evidence.sql
```

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| n=50 과적합 → Layer C 오히려 품질 악화 | 高 | 高 | shadow eval: NDCG@5 (bootstrap CI 하한) ≥ +0.05 + per-pattern 회귀 없음 → promote 조건 엄격 |
| Cloud Run restart → GCS 모델 로드 지연 | 中 | 中 | 시작 시 GCS에서 local temp copy, predict path는 in-memory (restart latency ≤ 2s) |
| verdict_json 스키마 W-0392와 충돌 | 中 | 中 | W-0392 merge 후 PR1 시작 (strict blocker). PR1에서 schema validator 추가 |
| migration 번호 충돌 (049/050) | 中 | 低 | PR1 첫 커밋 전 `ls migrations/ | tail -3` 확인 |
| nightly eval false rollback | 低 | 中 | -0.03 임계 + 연속 2회 회귀 시에만 retired (단발 flapping 방지) |

### Dependencies
- **W-0392 (Issue #947)**: `capture_records.verdict_json` — **strict blocker**
- **migration 048**: 이미 main ✅
- **engine 스케줄러**: hybrid role로 active ✅

### Rollback
- **즉시**: `LGBM_CONTEXT_SCORE_WEIGHT=0` env → Layer C 비활성, 코드 변경 없음
- **모델**: GCS에서 이전 버전 path로 registry 업데이트 (1 Cloud Run deploy)
- **DB**: migration 050 reversible (DROP TABLE model_versions)

---

## AI Researcher 관점

### Data Impact

**훈련 데이터**
- 라벨: verdict_json.outcome (WIN/LOSS from W-0365 15bps gate)
- Feature: cosine_sim, time_decay, sector_match, regime_match, RR, hold_minutes (similarity_ranker 기존 feature + verdict_json 2개)
- Class imbalance 처리: `scale_pos_weight = n_loss / n_win`
- **Time-based split** (verdict.created_at 80/20) — random split 절대 금지 (leakage)
- 같은 capture에서 파생된 candidate → 같은 fold 묶음 (group-aware split)

**통계 유효성**
- Paired bootstrap (n=1,000 resamples) 95% CI
- Primary metric: NDCG@5 (CI 하한 > baseline + 0.05)
- Secondary: MAP@10 (단독 실패 시 warning, 단독 reject 아님)
- Per-pattern NDCG 분해: 어느 패턴도 -0.05 이상 회귀 시 promote 거부

### Failure Modes

1. **Class collapse** (verdict 거의 모두 LOSS): AUC ≈ 0.5 → 학습 전 `min(class_count) ≥ 10` precondition. 미달 시 skip + log
2. **Distribution shift** (베타 초기 특정 패턴 편향): per-pattern NDCG 분해로 감지
3. **Recency bias**: SHAP feature importance top feature > 0.5 → warning
4. **Trigger flapping** (verdict count 50 근처 oscillate): cooldown 24h + `last_trained_at` 체크
5. **Silent degradation**: nightly eval cron — 최근 7일 NDCG 재측정, -0.03 연속 2회 → auto retired

---

## Decisions

| ID | 결정 | 거절 |
|---|---|---|
| D-1 | verdict insert 후 sync evaluator + **async trainer** | cron-only: 임계 도달 후 최대 24h 대기 → UX 나쁨 |
| D-2 | n=50 첫 trigger, **이후 doubling** (100→200→400) | 매 verdict 재학습: noise fitting + 비용 |
| D-3 | shadow eval → **atomic GCS swap** (no traffic split) | A/B 50/50: 단일 베타 사용자에서 통계 무의미 |
| D-4 | **고정 hyperparams** (num_leaves=31, lr=0.05, n_estimators=100, min_child_samples=5) | Optuna HPO: n=50 표본에서 search space overfit |
| D-5 | Layer C weight **0.0 → 0.25** (A:0.45 / B:0.30 / C:0.25) | 0.30 즉시: 첫 모델 품질 미검증 상태에서 과도한 가중치 |
| D-6 | **Time-based split + paired bootstrap CI** | Random split + t-test: 시계열 leakage + 소표본 t-test 불안정 |
| D-7 | **GCS** (`LGBM_MODEL_GCS_BUCKET`) | 로컬 disk: Cloud Run restart 시 소실 |

---

## Implementation Plan

### PR1 — Data Layer + Trainer Refactor (2일, ~600 LOC)

1. `app/supabase/migrations/050_lgbm_model_registry.sql` 작성 및 검증
2. `engine/scoring/registry.py`: CRUD + `get_active(model_type)` + `promote(version_id)` (transactional)
3. `engine/scoring/trainer.py` 리팩토링:
   - `build_dataset_from_verdicts(min_n) → (X, y, meta)` 함수 분리
   - 기존 `train_lgbm.py` import 경로 유지 (회귀 방지)
   - time-based 80/20 split + group-aware (capture_id 기준)
4. `engine/scoring/eval/ndcg.py`: `ndcg_at_k`, `map_at_k`, `paired_bootstrap_ci` (numpy only)
5. `engine/scoring/lightgbm_engine.py`: GCS path 기반 model load + in-memory cache + atomic swap
6. Tests (합성 verdict fixture):
   - `test_auto_trainer.py`: 50/100/200 표본 시나리오
   - `test_ndcg.py`: known-answer (NDCG@5 수식 검증)
   - `test_registry.py`: concurrent promote 안전성
7. **PR1은 production 동작 변경 없음** — trainer 내부 리팩토링만

### PR2 — Auto-Trigger + Shadow Eval + Badge UI (3일, ~500 LOC + Svelte)

1. `engine/scoring/auto_trainer.py`:
   ```python
   def evaluate_trigger(verdict_count: int) -> bool:
       # n in {50, 100, 200, 400, ...} + cooldown 24h + min class_count ≥ 10
   
   async def train_and_register() -> str:  # version_id
       # subprocess, non-blocking, GCS upload
   
   async def shadow_eval(version_id: str) -> dict:
       # 24h accumulated verdicts, paired bootstrap, per-pattern NDCG
   
   def promote_if_eligible(version_id: str) -> bool:
       # CI 하한 > baseline+0.05 + per-pattern 회귀 없음
       # → LGBM_CONTEXT_SCORE_WEIGHT=0.25 env update + GCS active pointer
   ```

2. `engine/api/routes/verdict.py`: insert 직후 `evaluate_trigger()` 호출 (idempotent, 실패 시 swallow + log)

3. `engine/scheduler/jobs.py`: nightly cron `evaluate_active_model()`:
   - 최근 7일 verdict로 NDCG 재측정
   - 연속 2회 -0.03 회귀 → status='retired' + env `LGBM_CONTEXT_SCORE_WEIGHT=0` update

4. `engine/research/ensemble/similarity_ranker.py`:
   ```python
   _LGBM_WEIGHT = float(os.environ.get("LGBM_CONTEXT_SCORE_WEIGHT", "0.0"))
   # 기존 하드코딩 0.0 → env 치환
   ```

5. `engine/api/routes/scoring.py`: `GET /scoring/active-model`:
   ```json
   {"status": "active|training|off", "version": "v3", "ndcg_delta": 0.07, "training_size": 87}
   ```

6. `app/src/lib/components/search/SearchLayerBadge.svelte`:
   ```svelte
   <!-- OFF: subtle grey badge -->
   <!-- training (n=47/50): pulsing amber -->
   <!-- ON v3, +0.07 NDCG: green badge -->
   ```
   - 색상: var(--pos) / var(--neg) / var(--amb) (design token 준수)
   - 폰트: var(--ui-text-xs) (stylelint hardcoded px 금지)

7. `app/src/routes/(app)/search/+page.svelte`: SearchLayerBadge 검색 결과 상단 inline 마운트

8. E2E 검증: 50개 mock verdict → trigger → shadow eval → promote → search response `X-Model-Version: v{N}` 헤더

---

## Exit Criteria

- [ ] **AC1**: 합성 verdict 50개 → auto_trainer 트리거 발화 + model_versions 레코드 생성 + GCS 파일 저장 (test)
- [ ] **AC2**: shadow eval NDCG@5 (paired bootstrap 95% CI 하한) **≥ baseline + 0.05** 충족 시에만 promote. 미달 시 status='retired' 자동 처리 (test fixture로 검증)
- [ ] **AC3**: per-pattern NDCG 분해 — 어느 패턴도 -0.05 이상 회귀 시 promote 거부 (test)
- [ ] **AC4**: promote 후 `/api/v1/search` 응답에 `X-Model-Version: v{N}` 헤더 포함 (Layer C 활성 확인)
- [ ] **AC5**: `LGBM_CONTEXT_SCORE_WEIGHT=0` env override → 즉시 Layer C 비활성화 (rollback test)
- [ ] **AC6**: nightly eval에서 최근 7일 NDCG 연속 2회 -0.03 회귀 → auto retired + weight=0 (test)
- [ ] **AC7**: cooldown 24h 동안 동일 임계에서 trigger 재발화 안 됨 (test)
- [ ] **AC8**: SearchLayerBadge 3상태 (OFF / training / ON v{N}) 정확히 표시, design token 준수, stylelint 0 errors (vitest)
- [ ] **AC9**: 기존 engine tests ≥ 1,955개 통과 + 신규 tests ≥ 25개 + svelte-check 0 errors + CI green
- [ ] **AC10**: PR1, PR2 모두 merged + CURRENT.md main SHA 업데이트
- [ ] **AC11 (사후)**: 실 운영에서 verdict 50 도달 시 자동 학습 1회 성공 로그 확인 (베타 데이터 기준, ship 후 1주 관찰)

---

## Handoff Checklist

- [ ] W-0392 (Issue #947) PR1+PR3 merge 확인
- [ ] `ls app/supabase/migrations/ | tail -3` — 050 번호 재확인
- [ ] `grep -rn "LGBM_CONTEXT_SCORE_WEIGHT\|predict_one" engine/scoring/` — 현재 분기 실측
- [ ] `LGBM_MODEL_GCS_BUCKET` env 값 Cloud Run 에 설정 여부 확인
- [ ] PR1 → PR2 순서 엄수 (PR1 merge 후 PR2 시작)
