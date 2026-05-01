---
id: W-0351
title: Personalization weights wiring (score_candidate_with_user_feedback)
status: design
wave: 5
priority: P1
effort: M
owner: engine
issue: "#760"
created: 2026-04-30
---

# W-0351 — Personalization weights wiring

> Wave: 5 | Priority: P1 | Effort: M
> Owner: engine
> Status: 🟡 Design Draft
> Created: 2026-04-30

## Goal
Jin이 verdict (valid/invalid/near_miss/too_early/too_late)을 누를수록 그의 opportunity 스캐너 결과가 본인의 패턴 선호에 맞게 재정렬되어, 같은 시점에도 다른 사용자와 다른 순위를 본다.

## Scope
### Files
- `engine/api/routes/opportunity.py` — `score_candidate(...)` 호출부 (실측: 메모리 reranking 미연결)을 `score_candidate_with_user_feedback(..., user_id=...)`로 교체. user_id는 Supabase JWT (`request.state.user_id`)에서 가져옴
- `engine/memory/rerank.py` — 132~155행 `score_candidate_with_user_feedback` 시그니처 검증, exception path 추가 (DB miss → fallback to base)
- `engine/memory/feedback_weights.py` (existing) — `apply_verdict_feedback(user_id, pattern_family, verdict)` 가 captures.py에서 호출되는 흐름 (이미 동작) — read path만 추가
- `engine/api/routes/captures.py` — verdict POST 후 (`apply_verdict_feedback` 이후) cache invalidation hook 추가하여 사용자별 weights 재로드 트리거
- `engine/tests/test_w0351_personalization_wiring.py` (신규) — verdict 누적 → opportunity 재정렬 e2e 1 case
- `engine/tests/test_w0346_rerank_feedback.py` — 기존 unit test 유지 (이미 score_candidate_with_user_feedback 검증)

### API Changes
- `GET /opportunity/run` — Authorization 헤더의 user_id 활용 (이미 SSE 인증 동일 방식 사용 중), 응답 스키마 변경 없음
- 신규 엔드포인트 없음

### Schema Changes
- DB 변경 없음 (`feedback_weights` 테이블 이미 존재)
- Pydantic 변경 없음

## Non-Goals
- weights schema 자체 변경
- 새로운 verdict label 추가 (W-0354 별도)
- weights를 사용자에게 노출하는 UI (별도 wave)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| user_id 누락 (anonymous request)으로 None 처리 누락 → 500 | M | H | None일 때 base `score_candidate(...)` fallback 보장 + e2e 테스트 |
| weights DB lookup이 매 코인마다 실행 → N+1 query | H | M | 요청 시작 시 1회 batch fetch + dict cache (per-request scoped) |
| 기존 비로그인 유저 결과 변경 (regression) | L | H | user_id None일 때 결과 byte-identical 회귀 테스트 1 case |
| weights drift로 가중치 폭주 | M | M | `apply_verdict_feedback`에 ±max clip (이미 존재) 검증 추가 |

### Dependencies
- 없음 (apply_verdict_feedback은 captures.py에서 이미 호출됨)

### Rollback
- `routes/opportunity.py`만 revert → 즉시 base 스코어로 복귀
- DB 데이터 보존 (weights 테이블 그대로)

## AI Researcher 관점

### Data Impact
- 사용자 verdict가 next-day opportunity 순위에 반영 → 행동-결과 루프 완성
- 훈련 셋이 사용자별 segmentation 가능 (W-0341 hypothesis registry와 호환)

### Statistical Validation
- A/B: 신규 가입 후 7일 동안 verdict ≥ 5건 누적된 사용자 그룹 (treatment)에서 personalized 순위 hit_rate가 base 대비 `Δ ≥ 3pp` (n≥30, McNemar paired test)
- weight drift: 사용자별 weight L2 norm 시계열 안정성 (스파이크 감지 alert)

### Failure Modes
- cold start (verdict 0건) → base와 동일해야 함. unit test 1 case
- 단일 verdict 폭주 (한 패턴에 100번 invalid) → clip + decay (기존 로직 검증)
- DB 일시 unavailable → exception swallow + base fallback, log warning

## Implementation Plan
1. engine: `routes/opportunity.py` user_id 추출 + per-request weights cache fetch + `score_candidate_with_user_feedback` 호출 변경
2. engine: `_resolve_user_id(request)` helper 추가 (None 안전)
3. engine 단위 테스트: `test_w0351_personalization_wiring.py` 3 case (cold start identity, verdict accumulation rerank, anonymous fallback)
4. perf 측정: `/opportunity/run` p95 baseline 대비 +50ms 이내 확인 (n=100 코인 기준)
5. tracing log: weights applied count per request

## Exit Criteria
- [ ] AC1: 동일 시장 데이터 + 다른 user_id (verdict history 다름) → 응답 코인 순서 차이 ≥ 1쌍 swap 발생
- [ ] AC2: anonymous user (user_id=None) 응답이 W-0350 기준선과 byte-identical (regression 0)
- [ ] AC3: `/opportunity/run` p95 latency 증가 ≤ 50ms (baseline 측정 후)
- [ ] AC4: `score_candidate_with_user_feedback` callsite ≥ 1개 (현재 0) — grep 확인
- [ ] CI green (pytest + typecheck)
- [ ] PR merged + CURRENT.md SHA 업데이트
