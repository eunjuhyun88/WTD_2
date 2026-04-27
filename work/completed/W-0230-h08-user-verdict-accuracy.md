# W-0230 — H-08: per-user Verdict Accuracy

> Wave 3 P2 | Owner: engine | Branch: `feat/H08-user-verdict-accuracy`

---

## Goal

`GET /users/{user_id}/verdict-accuracy` 엔드포인트 추가.
사용자의 verdict 라벨이 실제 시장 결과와 얼마나 일치하는지 측정.
H-07 F-60 Gate의 `accuracy` 데이터 소스.

---

## CTO 설계 결정

**Accuracy 정의 (AI Researcher):**

```
resolved = verdict 존재 AND outcome ∈ {success, failure}  (pending 제외)
correct   = (verdict ∈ {valid, missed} AND outcome == success)
          OR (verdict == invalid AND outcome == failure)
accuracy  = correct / resolved
```

`too_late`, `unclear` → resolved 카운트에 포함되나 correct에는 미포함 (soft label).
→ 이유: 시장 결과로 정답을 판단할 수 없는 라벨.

**구현 결정:**
- 신규 `UserAccuracyEngine` — `PatternStatsEngine`과 동일 패턴 (캐시 + 배치 쿼리)
- TTL: 5분 (stats engine과 동일)
- DB 쿼리: `pattern_ledger_records` WHERE record_type='verdict' + JOIN outcomes
- F-30 완료 전까지 JSONB payload 쿼리 사용 (추후 ledger_verdicts 테이블로 마이그레이션)

---

## Scope

| 파일 | 변경 |
|------|------|
| `engine/stats/user_accuracy.py` | 신규 — UserAccuracyEngine, UserAccuracy dataclass |
| `engine/api/routes/users.py` | 신규 또는 기존 — GET /users/{user_id}/verdict-accuracy |
| `engine/tests/test_user_accuracy.py` | 신규 — 5-cat 시나리오 전체 |

---

## API 스펙

```
GET /users/{user_id}/verdict-accuracy
Authorization: Bearer <JWT>
```

**Response 200:**
```json
{
  "user_id": "uuid",
  "verdict_count": 47,
  "resolved_count": 31,
  "accuracy": 0.68,
  "gate_eligible": false,
  "remaining_for_gate": 169,
  "breakdown": {
    "valid": 20,
    "invalid": 8,
    "missed": 5,
    "too_late": 3,
    "unclear": 3
  }
}
```

`gate_eligible` = resolved_count ≥ 200 AND accuracy ≥ 0.55 (H-07 기준 그대로).

**Error:**
- 403 — 다른 user_id 조회 시 (본인 또는 admin만)
- 404 — user 없음

---

## Facts

1. Wave 1 F-02 머지 완료 — `captures.py`에 5-cat VerdictLabel 정의됨 (`valid|invalid|missed|too_late|unclear`)
2. `pattern_ledger_records` 테이블 존재 — record_type='verdict' rows에 `user_verdict` in payload
3. PatternStatsEngine 패턴 — 캐시 + 배치 쿼리 구조 그대로 복제

## Assumptions

1. verdict records에 user_id 컬럼 또는 payload.user_id 존재
2. outcome records에 capture_id로 join 가능
3. F-30 전까지 JSONB payload 쿼리 성능 허용 범위 (verdict 수 < 10k)

## Open Questions

1. users 라우트 파일이 존재하는지, 새로 만드는지 — 구현 시 확인 필요
2. verdict ↔ outcome join key 확인 (capture_id vs outcome_id)

---

## Exit Criteria

- [ ] `GET /users/{user_id}/verdict-accuracy` 200 응답
- [ ] 5-cat 각 라벨 시나리오 unit test pass
- [ ] accuracy 공식 검증 (too_late/unclear 제외 확인)
- [ ] Engine CI ✅

---

## Non-Goals

- 전체 리더보드 / 랭킹 (copy trading frozen)
- verdict accuracy 기반 자동 게이팅 (H-07이 담당)
- F-30 Ledger 분리 (별도 W-0231)
