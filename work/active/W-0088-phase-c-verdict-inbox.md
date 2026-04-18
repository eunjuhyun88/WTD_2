# W-0088 Phase C — Verdict Inbox (flywheel axis 3)

## Goal

`outcome_resolver` 가 남긴 `status='outcome_ready'` capture 들을 founder 가 확인 → 사용자 verdict(valid/invalid/missed) 를 부여 → capture 가 `verdict_ready` 로 닫히게 해 플라이휠 3축(verdict) 을 연결한다.

## Owner

engine / API

## Why

W-0088 Phase A/B 로 Capture/Outcome 축은 닫혔지만, outcome 이 만들어진 뒤 **누군가 valid/invalid 레이블을 붙여야** verdict 축이 돈다. 지금까지 verdict 는 `POST /patterns/{slug}/verdict` 로 pattern-centric 하게만 있었고, capture-centric inbox UX 가 없어 founder 가 resolved-but-unverified 항목을 훑을 방법이 없었다.

## Scope (본 커밋)

### 새 엔드포인트

```
GET /captures/outcomes
  ?status=outcome_ready | verdict_ready
  ?user_id, pattern_slug, symbol, limit
  → { ok, status, count, items: [{ capture, outcome }] }

POST /captures/{capture_id}/verdict
  body: { verdict: "valid"|"invalid"|"missed", user_note?: str }
  → { ok, capture_id, outcome_id, user_verdict, status="verdict_ready" }
```

### 동작

1. `GET /captures/outcomes` 는 `CaptureStore.list(status=...)` 를 호출하고,
   각 capture 의 `outcome_id` + `pattern_slug` 로 `LedgerStore.load()` 해 join.
   outcome 이 삭제됐거나 orphan 인 경우 `outcome: null` 로 graceful 리턴.
2. `POST /captures/{id}/verdict` 는:
   - status ∈ {outcome_ready, verdict_ready} 만 허용 (409 otherwise)
   - linked outcome 을 `LedgerStore.load()` 로 로딩 (없으면 404)
   - `outcome.user_verdict` + `outcome.user_note` 업데이트 후 save
   - `LEDGER_RECORD_STORE.append_verdict_record(outcome)` 호출
   - `CaptureStore.update_status(capture_id, "verdict_ready", verdict_id=outcome.id)`
3. 재호출 시 overwrite (`valid → invalid` 변심 허용).

### 변경된 파일

- `engine/api/routes/captures.py` — `_ledger_store`, `_join_outcome`,
  `GET /outcomes`, `POST /{capture_id}/verdict`, `list_captures` 에 `status` 파라미터 추가
- `engine/tests/test_capture_verdict_inbox.py` — 13개 신규 테스트

## Non-Goals

- Verdict dashboard UI (app/ 영역)
- `verdict_count` KPI 를 `/observability/flywheel/health` 에 추가 — 별도 슬라이스
- multi-user verdict 동시성 (현재 last-write-wins)

## Facts

- `CaptureStore.update_status(... verdict_id=)` 은 이미 존재 — 추가 DB 변경 불요.
- `CaptureStatus` 리터럴에 `verdict_ready` 이미 정의됨.
- `LEDGER_RECORD_STORE.append_verdict_record(outcome)` 가 `user_verdict + user_note` payload 로 LEDGER 레코드 생성.
- `_ledger_store` 는 module-level singleton 으로 monkeypatch 가능 (test 에서 임시 경로 주입).

## Test Evidence

- `tests/test_capture_verdict_inbox.py` — 13 passed
  - list: outcome_ready 필터, verdict_ready 토글, user_id 필터, 빈 inbox,
    Literal 거부 (status='closed'), orphan outcome join graceful
  - verdict: happy path (outcome+capture+LEDGER 3개 동시 갱신),
    idempotent overwrite, 404(unknown/missing outcome), 409(pending status/no outcome),
    422 invalid label
- `tests/test_capture_routes.py + test_capture_verdict_inbox.py + test_outcome_resolver.py + test_outcome_policy.py + test_observability_flywheel.py` — 41 passed (회귀)

## Exit Criteria

- [x] `GET /captures/outcomes` 가 outcome_ready/verdict_ready capture+outcome join 반환
- [x] `POST /captures/{id}/verdict` 가 outcome + capture + LEDGER 3개를 원자적으로 갱신
- [x] `verdict_ready` 로 flip 되어 inbox 에서 사라짐
- [x] 기존 capture/outcome 테스트 녹색 유지
- [x] 잘못된 status / 누락 outcome / 잘못된 label 에 대한 명시적 에러

## Next

- `GET /observability/flywheel/health` 에 `verdict_count` 노출 (KPI 축 3 완전 측정)
- app/ 측 Verdict Inbox UI (별도 슬라이스)
