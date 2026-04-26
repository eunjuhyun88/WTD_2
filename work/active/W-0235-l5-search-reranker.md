# W-0235 — L5 Search: LambdaRank Reranker stub

> Wave 4 P2 | Owner: engine | Branch: `feat/L5-reranker-stub`
> **선행 조건: verdict ≥ 50 (데이터 임계치). Charter §In-Scope L5 갭.**

---

## Goal

L5 Search의 Layer B reranker를 LambdaRank 기반으로 구현.
현재 Layer A (weighted L1)만 있고 Layer B (learning-to-rank)가 누락 — Charter §L5 갭.
verdict 데이터 50개 이상 수집 후 첫 훈련 가능한 stub 구조 완성.

## Owner

engine

## Primary Change Type

feature (ML pipeline stub)

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `engine/search/reranker.py` | 신규 — LambdaRank stub (`score()`, `train()`, `load()`) |
| `engine/search/layer_b.py` | 신규 — Layer B orchestration (reranker 호출) |
| `engine/search/pipeline.py` | 변경 — Layer A 결과를 Layer B로 전달 |
| `engine/tests/test_search_reranker.py` | 신규 — stub 동작 테스트 (데이터 없어도 pass) |

## Non-Goals

- 실제 LambdaRank 훈련 실행 (데이터 임계치 미달 시)
- Layer C/D 구현 (별도 work item)
- GPU 훈련 인프라 (scikit-learn 기반 우선)

## Exit Criteria

- [ ] `reranker.py` `score(candidates) → ranked_candidates` 인터페이스 완성
- [ ] 데이터 없을 때 Layer A 결과 그대로 반환 (graceful degradation)
- [ ] `train()` — verdict 데이터 ≥ 50 조건 체크 후 훈련 (미달 시 skip + log)
- [ ] Engine Tests ✅

## Facts

1. Layer A (`engine/search/_signals.py`) — 40+차원 weighted L1 구현 완료 (W-0145, PR #346).
2. `engine/search/pipeline.py` — Layer A 결과 반환. Layer B 호출 없음.
3. verdict 데이터: `ledger_verdicts` 테이블 (W-0231 Phase 1+2 완료) — 현재 row 수 불명.
4. LambdaRank: `lightgbm` 또는 `scikit-learn` 기반 가능. 의존성 추가 필요.
5. `engine/requirements.txt` — 현재 lightgbm 없음.

## Assumptions

1. verdict ≥ 50 전까지 stub은 Layer A pass-through.
2. lightgbm 추가 허용 (engine requirements.txt).
3. 훈련 주기: manual trigger 또는 cron (별도 결정 필요).

## Canonical Files

- `engine/search/reranker.py` (신규)
- `engine/search/layer_b.py` (신규)
- `engine/search/pipeline.py`
- `engine/tests/test_search_reranker.py` (신규)
- `engine/requirements.txt`

## Decisions

- **stub 전략**: data < 50 → Layer A 결과 그대로 반환 (no-op reranker)
- **feature 벡터**: 기존 40+ dim feature 재사용 (Layer A _signals.py)
- **훈련 트리거**: `POST /search/reranker/train` admin endpoint (future)
- **모델 저장**: `engine/models/reranker_{pattern_slug}.pkl` (local, Supabase storage 이전 가능)

## Next Steps

1. `engine/search/reranker.py` interface 정의 (stub)
2. `engine/search/pipeline.py` Layer B 호출 삽입
3. verdict count 체크 로직 (ledger_verdicts COUNT)
4. Engine Tests 작성 + CI ✅

## Handoff Checklist

- [ ] `engine/search/_signals.py` 40+dim feature 파악
- [ ] `engine/search/pipeline.py` Layer A 반환 구조 파악
- [ ] `ledger_verdicts` 현재 row 수 확인 (Supabase Dashboard)
- [ ] `engine/requirements.txt` lightgbm 추가 여부 결정
