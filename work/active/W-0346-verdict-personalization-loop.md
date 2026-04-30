# W-0346 — Verdict → Personalization Loop (reranker weight feedback)

> Wave: 5 | Priority: P1 | Effort: M
> Charter: In-Scope (기존 reranker 강화, 신규 AI 시스템 아님)
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: #737

## Goal
Jin이 같은 종류의 패턴에 valid를 반복하면 그 컨텍스트(symbol/timeframe/intent)에서 reranker가 해당 패턴을 위로 올려주고, invalid는 강하게 페널티 받는다.

## Scope
- 포함:
  - `engine/memory/rerank.py`에 `apply_verdict_feedback(user_id, verdict)` 추가
  - per-user verdict history → context-tag별 weight delta
  - cold start: verdict count < 5이면 baseline weights, ≥5에서 점진 활성
  - verdict 제출 시 (`POST /api/captures/[id]/verdict` 핸들러) feedback 호출
- 파일:
  - `engine/memory/rerank.py` (수정)
  - `engine/memory/state_store.py` (per-user weight 저장)
  - `app/src/routes/api/captures/[id]/verdict/+server.ts` (verdict 저장 후 engine 호출)
  - `app/src/routes/api/patterns/[slug]/verdict/+server.ts`
  - 신규: `engine/memory/__tests__/test_rerank_feedback.py`
- API: 기존 verdict POST 엔드포인트에 side-effect 추가 (no schema change)

## Non-Goals
- 글로벌 모델 (모든 사용자 합산 학습)
- DL/transformer reranker — 현재 deterministic context-aware 유지
- Cross-user collaborative filtering

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Verdict 라벨 노이즈로 weight 폭주 | 중 | 중 | per-update delta clip ±0.1, 절대값 cap [-1.0, +1.0] |
| Cold start에서 feedback 너무 빨리 활성 → 오학습 | 중 | 중 | n<5: 무시, 5≤n<20: half-weight, n≥20: full |
| User별 weight DB 크기 증가 | 저 | 저 | 90d 미사용 weight purge cron |
| Feedback 호출 실패가 verdict 저장 막음 | 고 | 고 | feedback은 fire-and-forget (try/except + log) |

### Dependencies
- W-0335 verdict pipeline — merged ✅
- 독립: A/B/D와 병렬 가능

### Rollback
- env flag `RERANK_VERDICT_FEEDBACK_ENABLED=false` → 즉시 baseline weights 사용
- per-user weight 테이블 truncate 1줄

### Files Touched
- 수정: `engine/memory/rerank.py`, `engine/memory/state_store.py`, verdict POST handlers (app)
- 신규: `test_rerank_feedback.py`, migration (per-user weight 테이블 또는 JSONB 컬럼)

## AI Researcher 관점

### Data Impact
- 신규 state: `rerank_user_weights(user_id, context_tag, weight, updated_at)`
- context_tag = `(symbol_class, timeframe, intent)` triple
- delta rule (deterministic): valid=+0.05, near_miss=+0.02, invalid=−0.08

### Statistical Validation
- offline replay: 과거 30d verdict 시퀀스로 weight 재구성 후 다음 7d 시뮬레이션 → MRR / NDCG@10 baseline 대비
- min effect size: NDCG@10 +5% on cohort with verdict_count ≥ 20
- A/B는 cohort 가르기 없이 self-comparison (before-feedback baseline)

### Failure Modes
- F1: 적대적 verdict (사용자 임의 클릭) → delta clip + cap
- F2: 모드 전환 (intent: scalp ↔ swing) 시 가중치 오용 → context_tag에 intent 포함
- F3: per-user 데이터 0 → reranker는 baseline weight (이미 보장)

## Decisions
- [D-0346-01] Deterministic delta rule (학습 모델 아님) — Charter 준수
- [D-0346-02] context_tag 3-tuple: (symbol_class, timeframe, intent). symbol_class = "BTC|ETH|alt-major|alt-mid|alt-low"
- [D-0346-03] Feedback 호출은 fire-and-forget — verdict 저장과 분리

## Open Questions
- [ ] [Q-0346-01] symbol_class 분류 기준 (시총? volume? — 어느 데이터로?)
- [ ] [Q-0346-02] near_miss 가중치 +0.02가 적절한가, 아니면 0?
- [ ] [Q-0346-03] weight 영구 저장 vs 30d sliding window?

## Implementation Plan
1. migration: `rerank_user_weights` 테이블 또는 user_state JSONB 추가
2. `engine/memory/rerank.py`에 `apply_verdict_feedback(user_id, outcome)` + `_resolve_weight(user_id, context_tag)` 추가
3. verdict POST handler 2곳에서 fire-and-forget engine call (try/except, 200ms timeout)
4. cold start gate: `if verdict_count < 5: return baseline`
5. offline replay 스크립트 + NDCG@10 측정
6. 테스트: delta clip, cap, cold start, fire-and-forget 실패 시 verdict 저장 영향 없음

## Exit Criteria
- [ ] AC1: valid×3 후 동일 context_tag weight delta = +0.15 (정확히), invalid×1 후 −0.08
- [ ] AC2: weight 절대값 cap 1.0 (±2.0 시도해도 1.0에서 클램프)
- [ ] AC3: verdict_count < 5 사용자는 baseline weight 그대로 사용 (테스트로 검증)
- [ ] AC4: feedback engine 호출이 500 던져도 verdict POST는 201 반환
- [ ] CI green (engine pytest + app vitest)
- [ ] PR merged + CURRENT.md SHA 업데이트
