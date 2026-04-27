# W-0233 — F-30 Phase 3: Ledger backfill

> Wave 4 P1 | Owner: engine | Branch: `feat/F30-phase3-backfill`
> **선행 조건: W-0231 dual-write 1 스프린트 이상 운영 + Supabase migration 024 실행 완료**

---

## Goal

기존 `pattern_ledger_records` 테이블의 verdict/outcome/entry/score 레코드를
신규 4개 typed 테이블(`ledger_verdicts`, `ledger_outcomes`, `ledger_entries`, `ledger_scores`)에
backfill하여 Phase 4 read-path 전환의 전제조건을 충족.

## Owner

engine

## Primary Change Type

migration (backfill script)

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `engine/ledger/backfill_4table.py` | 신규 — `pattern_ledger_records` → 4 typed 테이블 backfill |
| `app/supabase/migrations/025_backfill_ledger_4table.sql` | 신규 — SQL backfill (optional — Python 스크립트 대안) |
| `engine/tests/test_f30_backfill.py` | 신규 — backfill 검증 (row count 일치 + spot-check) |

## Non-Goals

- read path 전환 (Phase 4 — W-0234 이후 별도)
- `pattern_ledger_records` 정리 (Phase 5)
- RLS 정책 변경

## Exit Criteria

- [ ] backfill 실행 후 `ledger_verdicts` row count == `pattern_ledger_records` WHERE record_type='verdict' count
- [ ] 동일 조건: ledger_outcomes, ledger_entries, ledger_scores
- [ ] spot-check: 임의 outcome_id로 양쪽 조회 결과 동일
- [ ] Engine CI ✅

## Facts

1. `pattern_ledger_records` — migration 018에서 생성. `record_type` discriminator 컬럼 존재.
2. `ledger_verdicts` 등 4개 테이블 — migration 024에서 생성 (W-0231).
3. dual-write는 Phase 2 (`W-0231`)에서 구현 완료 — `append_verdict_record` 등 non-fatal try/except.
4. backfill 대상 레코드: `record_type IN ('verdict','outcome','entry','score')`.
5. `payload` JSONB에서 typed 컬럼 추출 경로: `payload->>'user_verdict'`, `payload->>'outcome'` 등.

## Assumptions

1. Supabase migration 024 실행 완료 (운영 환경).
2. dual-write가 최소 1 스프린트 운영되어 신규 레코드는 양쪽에 존재.
3. backfill 중복 방지: upsert (conflict on `id`).
4. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env var 설정됨.

## Canonical Files

- `engine/ledger/backfill_4table.py`
- `engine/ledger/supabase_record_store.py` (참조만)
- `engine/tests/test_f30_backfill.py`
- `app/supabase/migrations/025_backfill_ledger_4table.sql`

## Decisions

- **backfill 방식**: Python 스크립트 (배치 upsert, 1000 rows/batch) — SQL COPY보다 안전
- **중복 방지**: `INSERT ... ON CONFLICT (id) DO NOTHING`
- **idempotent**: 재실행해도 동일 결과 (upsert)
- **backfill 검증**: row count 비교 + 5% spot-check

## Next Steps

1. migration 024 실행 확인 (Supabase Dashboard)
2. `backfill_4table.py` 구현 → dry-run 테스트
3. staging 환경에서 row count 검증
4. PR 오픈 → CI ✅ → merge
5. 운영 환경 backfill 실행

## Handoff Checklist

- [ ] Supabase migration 024 실행 확인 (`app/supabase/migrations/024_ledger_4table_split.sql`)
- [ ] `engine/ledger/supabase_record_store.py` dual-write 코드 파악 (Phase 2)
- [ ] `engine/tests/test_f30_ledger_dual_write.py` 참조하여 테스트 패턴 이해
- [ ] backfill 완료 후 W-0234 (Phase 4 read path 전환) 착수
