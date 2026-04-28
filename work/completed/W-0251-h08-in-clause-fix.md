# W-0251 — H-08 user_accuracy IN clause overflow fix

> Wave 4 P0 (Bug) | Owner: engine | Branch: `feat/W-0251-h08-in-clause-fix`
> Issue: #449 | Discovered by: A042 (2026-04-27 세션)
> Related: W-0230 (H-08 본 작업, 이미 머지됨), PR #437 (F-60 gate 통합)

---

## Goal

H-08 `user_accuracy._compute_from_supabase()`에서 220+ outcome_id를 가진
고활성 유저(F-60 gate 도달 시점)의 accuracy가 **silent 0으로 리셋되는 버그**를
batch chunk 분할로 해결한다.

---

## Owner

engine

---

## Scope

| 파일 | 변경 | 이유 |
|------|------|------|
| `engine/stats/user_accuracy.py` | Query 2를 100단위 chunk batch로 분할 | PostgREST URL 길이 제한 (~8KB) 회피 — UUID 36char × 100 = 3.6KB safe |
| `engine/tests/test_user_accuracy.py` (신규/확장) | 220+ outcome_id 통합 테스트 1개 + chunk boundary 테스트 1개 | 회귀 방지 + 정확도 검증 |

---

## Non-Goals

- **W-0230 본 작업 변경 금지** — UserAccuracyEngine 캐시/스키마/엔드포인트는 유지
- **F-30 ledger_verdicts 마이그레이션** — 별도 work item (W-0231/W-0233)
- **H-07 F-60 status API** — PR #437 진행 중, 본 fix와 독립
- **Supabase RPC 도입** — 현재 chunk만으로 충분, 복잡도 추가 회피
- **Query 1 (verdict select) 변경** — 단일 user_id 필터라 행 수 < 1000 가정, IN 미사용

---

## Exit Criteria

- [ ] `engine/stats/user_accuracy.py:125-131` Query 2가 100단위 chunk loop로 변경
- [ ] 220 outcome_id로 호출 시 `resolved_count == 220` 반환 (silent fail 없음)
- [ ] 1000 outcome_id 통합 테스트 추가, pass
- [ ] chunk 경계 (정확히 100, 101, 199, 200) edge case 테스트 추가, pass
- [ ] 기존 test_user_accuracy.py 전체 green
- [ ] Engine CI pass
- [ ] PR 머지

---

## Facts

- 현재 코드 `engine/stats/user_accuracy.py:124-131`:
  ```python
  outcome_ids = list(verdict_map.keys())
  resp2 = (
      sb.table("pattern_ledger_records")
      .select("id, payload")
      .eq("record_type", "outcome")
      .in_("id", outcome_ids)   # 220+ UUIDs → URL ~8KB overflow
      .execute()
  )
  ```
- Supabase Python client는 `.in_()`을 GET URL query param으로 변환 (PostgREST 표준).
- 기존 try/except가 catch하여 `UserAccuracy(resolved_count=0)` 반환 → gate_eligible=False 오판.
- F-60 Gate 임계값: 200 verdict (`_F60_GATE_MIN_COUNT`) — 정확히 트리거 시점에 버그 발생.
- `_compute_from_supabase` 호출자: `UserAccuracyEngine.get()` (5분 TTL 캐시).
- 테스트 fixture: `engine/tests/test_user_accuracy.py` 존재 여부 확인 필요 (없으면 신규 작성).

---

## Assumptions

- Supabase v2 client (`supabase-py`) 사용. `.in_()` 시그니처는 list[str] 받음 — chunk slice도 동일.
- PostgREST URL 한도 ~8KB (실측 기반, RFC 7230 권장 8000 octets).
- UUID v4 형식 (36 chars). chunk=100 = 3.6KB 본문 + URL prefix/encoding overhead 안전.
- `pattern_ledger_records.id` 인덱스 존재 (PK이므로 자동) → chunk loop의 N회 쿼리 비용 무시 가능 (N ≤ 10).
- `engine/.env` SUPABASE_URL / SUPABASE_KEY 설정됨 (기존 작업 가정).
- F-30 ledger_verdicts 별도 테이블 분리는 미완 — 현재 JSONB payload 쿼리 유지.

---

## Canonical Files

- `engine/stats/user_accuracy.py` (수정)
- `engine/tests/test_user_accuracy.py` (신규 또는 확장)
- `work/active/W-0251-h08-in-clause-fix.md` (본 work item, 이번 PR로 추가)

---

## CTO 품질 게이트 사전 체크

### 성능 (100명+ 동시 사용자 기준)
- N+1 회피: chunk loop 내부에서 추가 쿼리 없음 (단순 SELECT 분할)
- SELECT 컬럼 명시: `id, payload`만 (이미 적용됨)
- limit: 단일 user의 verdict 수가 < 10000 가정 (Wave 4까지 안전), 추후 cursor pagination 고려
- 캐시: UserAccuracyEngine 5분 TTL 기존 유지 — chunk 추가로 인한 latency 증가는 cache miss 시점만 (10회 × 50ms ≈ 500ms 단발성)
- 비동기: 현재 sync. asyncio.to_thread 래핑은 호출자(`UserAccuracyEngine.get()`) 책임

### 안정성
- 폴백: 기존 try/except 유지 — chunk 1개 실패 시 partial result로 부분 정확도라도 반환할지 결정 필요 (Exit Criteria에 명시)
- 멱등성: 읽기 전용 쿼리, 무관
- 재시도: chunk별 supabase 호출 실패 시 exponential backoff 옵션 — Wave 4까지 미적용, P1로 분리

### 보안
- JWT: 본 함수는 engine 내부, 호출자(API route)에서 `requireAuth()` 강제 — 이번 PR 변경 없음
- RLS: `pattern_ledger_records` 테이블 RLS는 H-08 본 작업(W-0230)에서 설정됨
- secret: SUPABASE_KEY는 env, 변경 없음
- 입력 검증: outcome_ids는 내부 verdict_map에서 추출 — 외부 입력 아님

### 유지보수성
- 계층: engine 내부, app 미접촉 — 교차 없음
- 계약: `UserAccuracy` dataclass schema 불변 — 호출자 영향 없음
- 테스트: 220+ 통합 테스트 + chunk boundary 테스트 추가
- 롤백: 코드 fix만 (migration 없음) → revert 안전

---

## 다음 에이전트 실행 가이드

```bash
git checkout main && git pull origin main
git checkout -b feat/W-0251-h08-in-clause-fix
# 1. test_user_accuracy.py 220 outcome 케이스 작성 (red)
# 2. user_accuracy.py:124-131 chunk loop 변경 (green)
# 3. chunk boundary 테스트 추가 (refactor)
# 4. uv run pytest engine/tests/test_user_accuracy.py -v
# 5. PR 생성 + #449 Closes 연결
```
