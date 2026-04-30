# Ptrack: ML Pattern Intelligence — Master

> Wave: 5 | Priority: P0 | Track: ML-INTEL
> Status: 🟡 P1 설계 완료 / 구현 대기
> Created: 2026-04-30

---

## 트랙 목적

**"모델이 학습되면 scanner가 즉시 반영하고, pipeline 결과가 frontend에 보인다"**

지금 상태: 모델 학습 → promote → 아무것도 안 됨. scanner는 predicted_prob=0.6 고정. composite_score는 parquet에 묻힘.
목표 상태: Train → Promote → Infer → Score → API → IntelPanel 전 구간 연결.

---

## 관련 문서

| 파일 | 내용 |
|---|---|
| [P-01-prd.md](P-01-prd.md) | Product Requirements — 사용자가 보는 것 |
| [P-02-architecture.md](P-02-architecture.md) | 전체 ML loop 아키텍처 + 하드코딩 제거 계획 |
| [P-03-phases.md](P-03-phases.md) | Phase별 Work Items + Exit Criteria |

---

## Phase 상태

| Phase | 목적 | 상태 |
|---|---|---|
| **Ph-1** | Pipeline 결과 → API → Frontend 노출 | 🟡 설계 |
| **Ph-2** | ML inference scanner 연결 | 🟡 설계 |
| **Ph-3** | Personalization + Sector/MTF surface | 🟡 설계 |
| **Infra** | Hypothesis Registry + UI 강화 | 🟡 일부 설계 |

---

## Work Items

| W-# | 제목 | Phase | 이슈 | 상태 |
|---|---|---|---|---|
| W-0341 | Hypothesis Registry Supabase 배포 | Infra | #728 | 🟡 설계 |
| W-0346 | Verdict → reranker weight feedback | Ph-3 | #737 | 🟡 설계 |
| W-0347 | Sector/MTF Surface (opportunity scan) | Ph-3 | #738 | 🟡 설계 |
| W-0348 | Pipeline E2E (Stage 6+7 composite) | Ph-1 | #750 | ✅ 머지 |
| W-0352 | Pipeline top-patterns → REST API | Ph-1 | TBD | 🟡 설계 |
| W-0353 | composite_score → IntelPanel + VerdictInbox | Ph-1 | TBD | 🟡 설계 |
| W-0354 | CaptureReviewDrawer 5-verdict 정렬 | Infra | TBD | 🟡 설계 |
| W-0355 | Extreme events 카드 (funding/OI/price) | Infra | TBD | 🟡 설계 |
| W-0358 | Research scanner ML model inference | Ph-2 | TBD | 🟡 설계 |

---

## 핵심 하드코딩 제거 목록

| 위치 | 현재값 | 목표 | W-# |
|---|---|---|---|
| `scanner.py:392` | `predicted_prob=0.6` | `MODEL_REGISTRY_STORE.get_active(slug).predict_one()` | W-0358 |
| `scanner.py:418` | `threshold=0.55` | `resolve_threshold(registry_entry)` | W-0358 |
| `alerts_pattern.py:43` | `P_WIN_GATE=0.55` | registry threshold_policy | W-0358 |
| `training_service.py` | `_AUTO_PROMOTE_MIN_AUC=0.60` | 0.65로 강화 | W-0358 |

---

## Key Decisions

- **[D-ML-001]** pipeline composite_score는 GET /research/top-patterns로 노출, 프런트는 IntelPanel에서 소비
- **[D-ML-002]** scanner ML inference는 research/live 양쪽 동일 MODEL_REGISTRY_STORE.get_active() 진입점
- **[D-ML-003]** fallback: active model 없으면 predicted_prob=0.6 유지 (model_source="fallback" 마킹)
- **[D-ML-004]** personalization은 verdict 5건 이상 시 점진 활성 (cold start 보호)
