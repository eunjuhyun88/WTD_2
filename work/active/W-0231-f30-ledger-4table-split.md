# W-0231 — F-30: Ledger 4-table 분리

> Wave 3 P2 | Owner: engine | Branch: `feat/F30-ledger-4table-split`
> **선행 조건: W-0230 H-08 머지 후 착수** (H-08이 JSONB 쿼리로 동작 검증 먼저)

---

## Goal

단일 `pattern_ledger_records` (JSONB payload) → 4개 typed 테이블 분리.
H-08 accuracy 쿼리 성능 + 향후 훈련 데이터 추출 경로 정규화.

---

## CTO 설계 결정

### 왜 4-table인가

| 현재 | 문제 |
|------|------|
| 단일 테이블 + `record_type` discriminator | user_id 인덱스 없음 → H-08 full scan |
| `payload JSONB` | 타입 없음 → ML 파이프라인이 payload 파싱 필수 |
| 단일 RLS | verdict vs outcome 접근 정책 분리 불가 |

### 분리 대상

```
ledger_verdicts  — record_type='verdict'  (user_id, capture_id, verdict_label, note)
ledger_outcomes  — record_type='outcome'  (capture_id, outcome, gain_pct, duration_h)
ledger_entries   — record_type='entry'    (capture_id, entry_price, btc_trend)
ledger_scores    — record_type='score'    (capture_id, p_win, model_key, threshold)
```

나머지 record_type (`training_run`, `model`, `phase_attempt`, `capture`) → `pattern_ledger_records` 유지.

### 마이그레이션 전략 (AI Researcher: 안전 우선)

```
Phase 1 (migration 024): 4개 신규 테이블 생성 + user_id 인덱스
Phase 2 (코드):          dual-write — 기존 테이블 + 신규 테이블 동시 write
Phase 3 (migration 025): 기존 레코드 backfill → 신규 테이블
Phase 4 (검증):          신규 테이블 read path 전환 + 쿼리 성능 확인
Phase 5 (migration 026): 기존 테이블 verdict/outcome/entry/score rows 삭제
```

롤백 경로: Phase 2까지는 코드 revert만으로 복원 가능.

---

## Scope

### Migration 024 — 신규 테이블

```sql
-- ledger_verdicts
CREATE TABLE ledger_verdicts (
    id           TEXT PRIMARY KEY,
    capture_id   TEXT NOT NULL,
    pattern_slug TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    verdict      TEXT NOT NULL,  -- valid|invalid|missed|too_late|unclear
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX lv_user_id_idx ON ledger_verdicts (user_id, created_at DESC);
CREATE INDEX lv_capture_id_idx ON ledger_verdicts (capture_id);

-- ledger_outcomes
CREATE TABLE ledger_outcomes (
    id           TEXT PRIMARY KEY,
    capture_id   TEXT NOT NULL,
    pattern_slug TEXT NOT NULL,
    outcome      TEXT NOT NULL,  -- success|failure|timeout|pending
    max_gain_pct NUMERIC,
    exit_return_pct NUMERIC,
    duration_hours NUMERIC,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX lo_capture_id_idx ON ledger_outcomes (capture_id);
CREATE INDEX lo_slug_outcome_idx ON ledger_outcomes (pattern_slug, outcome);

-- ledger_entries (entry signals)
CREATE TABLE ledger_entries (
    id            TEXT PRIMARY KEY,
    capture_id    TEXT NOT NULL,
    pattern_slug  TEXT NOT NULL,
    entry_price   NUMERIC,
    btc_trend     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ledger_scores (ML scores at entry)
CREATE TABLE ledger_scores (
    id              TEXT PRIMARY KEY,
    capture_id      TEXT NOT NULL,
    pattern_slug    TEXT NOT NULL,
    p_win           NUMERIC,
    model_key       TEXT,
    threshold       NUMERIC,
    threshold_passed BOOLEAN,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 코드 변경

| 파일 | 변경 |
|------|------|
| `engine/ledger/supabase_record_store.py` | dual-write: append() → 신규 테이블도 insert |
| `engine/stats/user_accuracy.py` | Phase 4: ledger_verdicts + ledger_outcomes join으로 전환 |
| `engine/ledger/types.py` | 기존 타입 유지 (신규 테이블은 별도 dataclass 불필요) |

---

## Facts

1. `pattern_ledger_records` migration 018에서 생성. RLS enabled.
2. user_id 컬럼 존재하나 인덱스 없음 (현재 full scan)
3. `supabase_record_store.py` — append() 메서드가 단일 insert 담당

## Assumptions

1. backfill 시 `payload` JSONB에서 typed 컬럼 추출 가능 (VerdictPayload, OutcomePayload 정의 존재)
2. Phase 1~2 dual-write 기간: 1 스프린트 (W-0232 F-17과 병렬 가능)

## Open Questions

1. Migration 023 (`capture_records_is_watching`) 실행 여부 — 운영 환경 확인 필요
2. `ledger_verdicts.user_id` TEXT vs UUID — auth.users.id 타입 맞춰야 함

---

## Exit Criteria

- [ ] migration 024 적용 + 4개 테이블 생성 확인
- [ ] dual-write 검증 (신규 verdict → 두 테이블 모두 존재)
- [ ] migration 025 backfill 완료 (row count 일치)
- [ ] H-08 accuracy 쿼리 `ledger_verdicts` read path 전환 후 결과 동일
- [ ] Engine CI ✅

---

## Non-Goals

- `training_run`, `model`, `phase_attempt` 분리 (현재 불필요)
- ORM 도입
- `pattern_ledger_records` 테이블 완전 삭제 (잔여 record_type 유지)
