# W-0241 — H-07-eng: F-60 Gate Status API

> Wave 2.5 | Owner: engine | Branch: `feat/H07-eng-f60-status-api`
> **선행: W-0232 (design merged ✅) + F-02 (engine 5-cat verdict ✅)**

## Goal

`GET /users/{user_id}/f60-status` endpoint 구현 — 사용자별 verdict count + accuracy 계산 + F-60 marketplace gate unlock 판정.

## Owner

engine

## Primary Change Type

Engine logic change (new endpoint + stats helper)

## Scope

| 파일 | 변경 이유 |
|---|---|
| `engine/api/routes/users.py` | NEW endpoint `GET /users/{user_id}/f60-status` 등록 |
| `engine/stats/engine.py` | `compute_f60_status(user_id)` 메서드 추가 (5-min TTL cache 패턴 따름) |
| `engine/ledger/store.py` | `list_verdicts_by_user(user_id)` 헬퍼 (없으면 신규) |
| `engine/api/main.py` | `users` router 등록 (있으면 skip) |
| `engine/tests/test_f60_gate.py` | NEW — count gate / accuracy gate / both unlock unit test |

## Non-Goals

- per-pattern accuracy (전체 user 우선, follow-up)
- unlock 후 revoke 정책 (W-0232 D-W-0232-5: revoke X)
- N-05 Marketplace publish workflow (charter 회색지대, 별도 W-####)
- F60GateBar UI 컴포넌트 (W-0242 별도 PR)

## Canonical Files

- `work/active/W-0241-h07-eng-f60-status-api.md` (this)
- `work/active/W-0232-h07-f60-gate-design.md` (선행 설계)
- `engine/api/routes/users.py` (or stats.py)
- `engine/stats/engine.py`
- `engine/ledger/store.py`
- `engine/api/main.py`
- `engine/tests/test_f60_gate.py` (NEW)

## Facts

1. main = `c43a22ed` (W-0232 design 머지 완료)
2. F-02 5-cat verdict (PR #370) 머지 완료 — `pattern_outcomes.user_verdict` text 컬럼 5값 작동
3. `engine/stats/engine.py` 5-min TTL cache 패턴 작동 중 (8.8KB)
4. 5-cat: valid / invalid / missed / too_late / unclear (Q1 lock-in)
5. accuracy 계산은 valid + invalid만 (missed/too_late/unclear 학습 제외)

## Assumptions

1. `engine/ledger/store.py`에 user_id 별 verdict 쿼리 가능 (없으면 추가)
2. Q2 threshold 0.55 + 200 verdict 유지 (W-0232 D-W-0232-3)
3. cache invalidation은 사용자 verdict 제출 시 (`set_capture_verdict` 호출 후)

## Open Questions

(없음 — W-0232 spec에서 모두 lock-in 됨)

## Decisions

- D-W-0241-1: accuracy = `valid / (valid + invalid)` (missed/too_late/unclear 제외)
- D-W-0241-2: threshold = 200 + 0.55 (Q2 lock-in)
- D-W-0241-3: 5-min TTL cache, verdict 제출 시 invalidate
- D-W-0241-4: response shape = W-0232 §H-07 API Spec 그대로

## Next Steps

1. `engine/ledger/store.py` `list_verdicts_by_user()` 헬퍼 (없으면 추가)
2. `engine/stats/engine.py` `compute_f60_status(user_id)` 메서드
3. `engine/api/routes/users.py` (NEW or 기존 확장) `GET /users/{user_id}/f60-status` 라우트
4. `engine/api/main.py` users router 등록 (있으면 확인)
5. unit test 5케이스 (count gate / accuracy gate / both / verdict 0 / 5-cat 카운트 정확)
6. Engine CI pass

## Exit Criteria

- [ ] GET `/users/{user_id}/f60-status` → 200 + JSON (W-0232 §API Spec 매칭)
- [ ] verdict 0 → progress_pct=0, unlocked=false
- [ ] count 199 + acc 1.0 → unlocked=false, lock_reason="verdict_count_below_target"
- [ ] count 1000 + acc 0.5 → unlocked=false, lock_reason="accuracy_below_target"
- [ ] count 200 + acc 0.55 → unlocked=true, lock_reason=null
- [ ] missed/too_late/unclear는 카운트 제외
- [ ] 5-min TTL cache 작동 + verdict 제출 시 invalidate
- [ ] Engine CI pass

## API Contract (W-0232에서 복사)

```
GET /users/{user_id}/f60-status

Response 200:
{
  "user_id": "u_abc123",
  "verdict_count": 142,
  "verdict_count_target": 200,
  "valid_count": 78,
  "invalid_count": 41,
  "accuracy": 0.6555,
  "accuracy_target": 0.55,
  "f60_unlocked": false,
  "progress_pct": 0.71,
  "lock_reason": "verdict_count_below_target",
  "calculated_at": "2026-04-27T01:23:45Z"
}

Error 404: user not found (or no verdict history)
Error 401: auth required
```

## Logic (W-0232 §Logic 그대로)

```python
def compute_f60_status(user_id: str) -> F60Status:
    verdicts = ledger.list_verdicts_by_user(user_id)
    learnable = [v for v in verdicts if v.user_verdict in ("valid", "invalid")]
    valid = sum(1 for v in learnable if v.user_verdict == "valid")
    invalid = sum(1 for v in learnable if v.user_verdict == "invalid")
    count = valid + invalid
    accuracy = (valid / count) if count > 0 else 0.0
    count_pct = min(count / 200, 1.0)
    acc_pct = min(accuracy / 0.55, 1.0) if count > 0 else 0.0
    progress_pct = min(count_pct, acc_pct)
    unlocked = count >= 200 and accuracy >= 0.55
    lock_reason = (
        None if unlocked
        else "verdict_count_below_target" if count < 200
        else "accuracy_below_target"
    )
    return F60Status(...)
```

## CTO 설계 원칙 적용

### 성능 (100명+ 동시)
- DB 쿼리: `WHERE user_id = $1 AND user_verdict IN ('valid', 'invalid')` 인덱스 추가 (`idx_pattern_outcomes_user_verdict`)
- 5-min TTL cache → cache hit 시 0 DB query
- bulk: per-user 모든 verdict를 한 번에 fetch (N+1 방지)

### 안정성
- Cache miss 시 fallback: 직접 DB query
- Idempotent: GET endpoint, side effect 없음
- 헬스체크: `/health` 기존 endpoint 활용 (별도 추가 X)

### 보안
- Endpoint에 `requireAuth()` 적용 (current user만 조회 가능, admin은 별도)
- user_id path param: `/users/me/f60-status` 또는 path user_id == auth user_id 검증
- Supabase RLS: pattern_outcomes 테이블 user_id 기준 SELECT 정책

### 유지보수성
- 계층: engine/ 단독 (app proxy는 W-0242 별도)
- 계약: response shape = W-0232 §API Spec
- 테스트: 5케이스 unit test
- 롤백: 신규 endpoint, 기존 영향 0

## Handoff Checklist

- 본 PR 머지 후 W-0242 (H-07-app) PR 시작 가능
- response shape 변경 시 W-0242에도 반영 필수

## Risks

| 위험 | 완화 |
|---|---|
| 큰 사용자 verdict (10K+) → 쿼리 느림 | 인덱스 + cache, 일정 후 cursor pagination 가능 |
| cache invalidation 누락 → stale | verdict POST 핸들러에서 명시 invalidate |
| user_id auth mismatch | path param 검증 + admin role 별도 |
