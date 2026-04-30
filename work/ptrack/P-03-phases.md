# ML Pattern Intelligence — Implementation Phases v1.0

> Track: ML-INTEL | Status: 🟡 Design Draft
> Created: 2026-04-30
> Index: [P-00-master.md](P-00-master.md)

---

## Phase 개요

| Phase | 목적 | 선행 조건 | 목표 기간 |
|---|---|---|---|
| **Ph-1** | Pipeline 결과 API 노출 + frontend 렌더 | W-0348 ✅, W-0314 ✅ | 1주 |
| **Ph-2** | ML inference scanner 연결 + 하드코딩 제거 | MODEL_REGISTRY 기존 | 1주 |
| **Ph-3** | Personalization + Sector surface | Ph-1, W-0341 | 2주 |
| **Infra** | Hypothesis Registry 배포 + UI 강화 | 독립 | 1주 |

---

# Phase 1 — Pipeline API + Frontend (1주)

## 목표
`pipeline.py` Stage 6+7이 만든 composite_score를 사용자가 IntelPanel에서 볼 수 있다.

## Work Items

### W-0352 — Pipeline top-patterns REST API
> Priority: P1 | Effort: S | 선행: W-0348 ✅

**Scope**:
- `GET /research/top-patterns?limit=20&min_grade=B`
- 가장 최근 `top_patterns.parquet` 로드 (mtime 기준), LRU cache TTL=60s
- pydantic `TopPatternResponse` — 7개 메트릭 컬럼 + generated_at + pipeline_run_id
- parquet 미존재 시 200 + `patterns: []`

**Files**: `engine/api/routes/research.py`, `engine/pipeline.py` (path helper)

**Exit Criteria**:
- [ ] AC1: GET /research/top-patterns 200, patterns 배열 존재
- [ ] AC2: 7개 컬럼 모두 존재 (None 허용)
- [ ] AC3: parquet 없을 때 200 + `patterns: []` (404 금지)
- [ ] AC4: cache hit p50 < 50ms, cold p95 < 300ms
- [ ] AC5: pytest ≥ 6 PASS

---

### W-0353 — composite_score → IntelPanel + VerdictInbox 렌더
> Priority: P1 | Effort: M | 선행: W-0352

**Scope**:
- `TopPatternsPanel.svelte` 신규 — composite_score DESC 정렬 테이블
- quality_grade 배지 (S=emerald, A=blue, B=amber, C=gray)
- IntelPanel에 mount, collapsible (기본 expanded)
- `cogochiTypes.ts` TopPattern 타입 활성화

**Files**: `app/src/lib/components/intel/TopPatternsPanel.svelte`, `cogochiTypes.ts`, `research.ts`

**Exit Criteria**:
- [ ] AC1: composite_score 내림차순 정렬, 상위 20개 렌더
- [ ] AC2: quality_grade S/A/B/C 배지 색상 구분
- [ ] AC3: API 없으면 빈 상태 안전 처리 (에러 없음)
- [ ] AC4: vitest ≥ 3 PASS

---

# Phase 2 — ML Inference Wiring (1주)

## 목표
research scanner가 학습된 모델을 실제로 사용하고, live scanner threshold도 registry 기반으로 동작한다.

## Work Items

### W-0357 — Research Scanner ML Model Inference
> Priority: P1 | Effort: M | 선행: MODEL_REGISTRY 기존 존재

**Scope**:
- `scanner.py:392` `predicted_prob=0.6` → `MODEL_REGISTRY_STORE.get_active(slug).predict_one()`
- `scanner.py:418` `threshold=0.55` → `resolve_threshold(entry.threshold_policy_version)`
- `model_registry.py` `resolve_threshold()` helper 신규
- `training_service.py` `_AUTO_PROMOTE_MIN_AUC` 0.60 → 0.65
- `alerts_pattern.py:43` `P_WIN_GATE` → threshold_policy 동적화
- 결과 row에 `model_source` (registry/fallback) 컬럼 추가
- active model 없으면 0.6/0.55 fallback (graceful degradation)

**Files**: `scanner.py`, `model_registry.py`, `alerts_pattern.py`, `training_service.py`

**Exit Criteria**:
- [ ] AC1: active model 있는 패턴 → predicted_prob ≠ 0.6 비율 ≥ 80%
- [ ] AC2: active model 없는 패턴 → model_source="fallback" + predicted_prob=0.6 정확히 유지
- [ ] AC3: live/research scanner 동일 input → predicted_prob 차이 < 1e-6
- [ ] AC4: scanner wall-clock 증가 ≤ 20% (모델 LRU cache 적용 후)
- [ ] AC5: pytest ≥ 6 신규 + 기존 scanner 테스트 0 회귀

---

# Phase 3 — Personalization + Surface (2주)

## Work Items

### W-0346 / W-0351 — Verdict → reranker feedback
> Priority: P1 | Effort: M | 선행: W-0341 infra

**Scope**:
- `apply_verdict_feedback(user_id, verdict)` — per-user context-tag weight delta
- valid +0.1, invalid -0.2, clip ±1.0
- cold start: n<5 무시, 5≤n<20 half, n≥20 full
- verdict POST 핸들러에 side-effect 추가 (fire-and-forget)

**Exit Criteria**:
- [ ] AC1: 20번 valid verdict 후 해당 context_tag 패턴 순위 ≥ 3단계 상승
- [ ] AC2: invalid 10번 → 해당 패턴 순위 하위 25% 진입
- [ ] AC3: feedback 실패가 verdict 저장 막지 않음 (try/except 격리)
- [ ] AC4: pytest ≥ 6 PASS

---

### W-0347 / W-0350 — Sector/MTF score API surface
> Priority: P1 | Effort: S | 선행: W-0324~0330 ✅

**Scope**:
- opportunity scan response에 `sector_score_norm`, `mtf_confluence` 추가 (additive only)
- QuickPanel SECTOR 필터 탭 (기존 MTF 탭 옆)
- SingleAssetBoard sector 배지

**Exit Criteria**:
- [ ] AC1: opportunity scan response에 sector_score_norm, mtf_confluence 포함
- [ ] AC2: SECTOR 필터 + MTF 필터 AND 조합 동작
- [ ] AC3: stale sector (6h+) → UI dim 표시

---

# Infra Phase — 독립 실행 가능

### W-0341 — Hypothesis Registry Supabase 배포
> Priority: P1 | Effort: S | 이슈: #728

**Scope**:
- migration 027 Supabase prod 배포
- integration tests 4개 (격리/만료/lookahead 가드)

**Exit Criteria**:
- [ ] AC1: migration 027 prod 배포 성공
- [ ] AC2: as_of=None → ValueError
- [ ] AC3: 366d archive purge 정상 작동
- [ ] AC4: pytest ≥ 4 integration PASS

---

### W-0354 — CaptureReviewDrawer 5-verdict 정렬
> Priority: P2 | Effort: S

**Scope**: CaptureReviewDrawer에서 verdict 5단계(strong_valid → strong_invalid) 정렬 + 키보드 단축키

**Exit Criteria**:
- [ ] AC1: 5단계 정렬 UI 렌더
- [ ] AC2: 키보드 1~5 단축키 동작
- [ ] AC3: vitest ≥ 3 PASS

---

### W-0355 — Extreme events 카드 (funding/OI/price)
> Priority: P2 | Effort: S

**Scope**: IntelPanel에 funding_extreme / OI spike / price divergence 이벤트 카드 추가

**Exit Criteria**:
- [ ] AC1: funding_extreme 이벤트 카드 렌더 (임계값 초과 시)
- [ ] AC2: dismiss 시 24h 재노출 안 됨
- [ ] AC3: vitest ≥ 3 PASS

---

## 전체 Work Item 목록

| Phase | W-# | 제목 | Effort | 선행 |
|---|---|---|---|---|
| Ph-1 | W-0352 | Pipeline top-patterns REST API | S | W-0348 ✅ |
| Ph-1 | W-0353 | composite_score → IntelPanel | M | W-0352 |
| Ph-2 | W-0357 | Research scanner ML inference | M | MODEL_REGISTRY |
| Ph-3 | W-0346 | Verdict → reranker feedback | M | W-0341 |
| Ph-3 | W-0347 | Sector/MTF surface | S | W-0324 ✅ |
| Infra | W-0341 | Hypothesis Registry 배포 | S | — |
| Infra | W-0354 | CaptureReviewDrawer 5-verdict | S | — |
| Infra | W-0355 | Extreme events 카드 | S | — |

**권장 실행 순서**: W-0341 + W-0357 병렬 → W-0352 → W-0353 → W-0346 + W-0347 병렬 → W-0354 + W-0355
