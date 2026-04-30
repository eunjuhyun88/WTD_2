# W-0247 — F-16: Search Recall@10 ≥ 0.7

> Wave 4 P1 | Owner: engine | Branch: `feat/W-0247-f16-search-recall`
> Issue: TBD
> Status: 🟡 Design Draft

---

## Goal

Jin이 "BTC double_bottom" 검색 시 top-10 결과에 진짜 관련 패턴이 ≥70% 포함되도록 3-layer 가중 튜닝 + eval harness를 구축한다.

## Owner

engine

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `engine/search/eval_set.py` | 신규 — 50 query × ground-truth 목록 |
| `engine/search/recall_benchmark.py` | 신규 — recall@10 계산 + JSON 리포트 |
| `engine/tests/test_search_recall.py` | 신규 — CI 통합 (recall@10 ≥ 0.7 assert) |
| `engine/search/similar.py` | 가중치 기본값 수정 (_W_ABC_DEFAULT) |

## Non-Goals

- Layer C ML 모델 재훈련 (GPU 필요, Phase C/D P3)
- 실시간 사용자 쿼리 로깅 UI (별도 W-item)
- 50개 초과 eval set 확장 (이 PR 범위 외)

## Exit Criteria

- [ ] EC-1: `eval_set.py` 50 queries × ground-truth slugs 목록 (패턴당 최소 1 query)
- [ ] EC-2: `recall_benchmark.py` — recall@10 현재값 측정 출력 (JSON report)
- [ ] EC-3: 조정 후 recall@10 ≥ 0.7 on eval set
- [ ] EC-4: `_W_ABC_DEFAULT` → (0.60, 0.30, 0.10) 적용
- [ ] EC-5: `test_search_recall.py` CI pass (recall@10 ≥ 0.70 assert)
- [ ] EC-6: Engine CI green

## Facts

1. `engine/search/similar.py:41` — `_W_ABC_DEFAULT = (0.45, 0.30, 0.25)` 현재 값
2. `engine/search/similar.py:356-367` — `quality_ledger.compute_weights()` 로 동적 조정 가능
3. `engine/search/quality_ledger.py` — 성능 기반 가중치 자동 조정 이미 있음
4. PRD 목표: recall@10 ≥ 0.7 (M3 55% → M6 70%)
5. Layer C = ML p_win, 아직 훈련 데이터 부족 → 가중치 0.25 → 0.10 낮추는 게 핵심

## Canonical Files

- `engine/search/eval_set.py` (신규)
- `engine/search/recall_benchmark.py` (신규)
- `engine/search/similar.py` (가중치 수정)
- `engine/tests/test_search_recall.py` (신규)

## Assumptions

- 52 PatternObjects JSON 파일 존재 (`engine/patterns/objects/`)
- Layer C ML 모델 미훈련 상태 → 0.10 가중치 적합
- recall@10 기준선 측정 후 필요 시 0.6/0.3/0.1 외 조합 재검토

## Decisions

- [D-0247-1] 가중치 → (0.60, 0.30, 0.10). Layer C 미훈련이므로 A 강화.
- [D-0247-2] eval_set 수동 큐레이션. 자동 생성 시 ground-truth 오염 위험.
- [D-0247-3] recall@10 threshold = 0.7. PRD M3 목표 그대로.

## Open Questions

- [ ] [Q-1] Layer B (phase path)가 Layer A보다 낮은 가중치 받아야 하는 근거 실측 필요
- [ ] [Q-2] eval_set ground-truth: slug 기반 vs feature_window_id 기반?

## Next Steps

1. `ls engine/patterns/objects/ | wc -l` 로 실제 패턴 목록 확인
2. `eval_set.py` 50 query 수동 작성
3. `recall_benchmark.py` 현재 recall 측정 (baseline report)
4. 가중치 조정 → recall 재측정 → 0.7 충족 확인
5. `test_search_recall.py` CI 통합

## Handoff Checklist

- [ ] eval_set.py 50 queries 완성
- [ ] baseline recall 수치 측정 + 기록
- [ ] 가중치 조정 후 recall@10 ≥ 0.7 확인
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트
