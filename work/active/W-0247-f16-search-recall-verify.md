# W-0247 — F-16: Search Recall@10 ≥ 0.7 검증

> Wave 4 P1 | Owner: engine | Branch: `feat/F16-search-recall-verify`

---

## Goal

50 query eval set 작성 + Layer A/B/C 가중 튜닝 (0.6/0.3/0.1) + recall@10 ≥ 0.7 측정. Search 품질 정량화.

## Owner

engine

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `engine/search/eval_set.py` | 신규 — 50 query eval set |
| `engine/search/recall_benchmark.py` | 신규 — recall@10 측정 |
| `engine/tests/test_search_recall.py` | 신규 — CI 통합 |

## Exit Criteria

- [ ] 50 query eval set 작성 (패턴별 최소 1개)
- [ ] Layer A:B:C = 0.6:0.3:0.1 기본값 설정
- [ ] `recall@10 ≥ 0.7` on eval set
- [ ] Engine CI ✅

## Facts

1. `engine/search/similar.py` — 3-layer blend 현재 가중치 0.45/0.30/0.25.
2. `quality_ledger.py` — 성능 기반 가중치 자동 조정 이미 있음.
3. PRD 목표: recall@10 ≥ 0.7 (M3 55% → M6 70%).

## Canonical Files

- `engine/search/eval_set.py`
- `engine/search/recall_benchmark.py`
