# W-0126 — LedgerStore Supabase Record Migration

## Goal

`LedgerRecordStore`를 Supabase-backed `SupabaseLedgerRecordStore`로 전환하여
`compute_family_stats()`의 O(N files) 파일 스캔 병목을 O(1) DB 쿼리로 교체한다.
GCP 다중 인스턴스 환경에서 per-process 파일 캐시 대신 공유 Postgres 상태를 사용한다.

## Owner

engine

## Scope

- `engine/ledger/supabase_record_store.py` — 신규 `SupabaseLedgerRecordStore` 클래스
- `engine/ledger/store.py` — `get_ledger_record_store()` 추가, `LEDGER_RECORD_STORE` 자동 라우팅
- `app/supabase/migrations/018_pattern_ledger_records.sql` — 신규 테이블 + 인덱스

## Non-Goals

- 기존 `ledger_records/*.json` 파일 삭제 (local dev fallback 유지)
- `PatternOutcome` / `FileLedgerStore` 전환 (이미 `SupabaseLedgerStore` 존재)
- 히스토리 백필 자동화 (수동 rebuild 스크립트로 대체 가능)

## Canonical Files

- `engine/ledger/supabase_record_store.py`
- `engine/ledger/store.py`
- `app/supabase/migrations/018_pattern_ledger_records.sql`
- `engine/api/routes/patterns_thread.py` (소비자, 변경 불필요)

## Facts

1. `patterns_thread._summarize_record_family(slug)` → `LEDGER_RECORD_STORE.list(slug)` → 모든 `.json` 스캔 O(N)
2. `LEDGER_RECORD_STORE`는 모듈 임포트 시 초기화되는 전역 싱글톤.
3. `SupabaseLedgerStore`(outcomes)는 이미 존재하며 `get_ledger_store()`로 자동 선택됨.
4. `pattern_ledger_records` 테이블 + `(pattern_slug, record_type, created_at DESC)` 인덱스로
   `compute_family_stats()` = `SELECT record_type FROM ... WHERE pattern_slug=X` → Python dict aggregate.
5. `list(..., limit=1)` (latest training_run/model) = 인덱스 활용 단일 행 쿼리.

## Assumptions

1. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 가 엔진 GCP 런타임에 설정된다.
2. 기존 파일 기반 레코드와 Supabase 레코드가 일시적으로 분기될 수 있음 (백필 전).
   통계 차이는 허용됨 — 새 레코드부터 Supabase에 누적.

## Open Questions

- none

## Decisions

- `LEDGER_RECORD_STORE = get_ledger_record_store()` — 환경 감지 자동 라우팅.
- 기존 파일 기반 코드는 local dev fallback으로 유지.
- `SupabaseLedgerRecordStore.compute_family_stats()` — `SELECT record_type` 만 가져와 Python dict으로 집계.
  PostgREST GROUP BY RPC 대신 클라이언트 집계: 구현 단순성 우선, 레코드 수 증가 시 RPC로 교체 가능.
- 백필 스크립트는 별도 `engine/scripts/backfill_ledger_records.py`로 구현 (이 슬라이스 범위 아님).

## Next Steps

- Supabase migration 018 을 실제 환경에 적용한다.
- GCP 엔진 런타임 env 를 확인하고 재배포 후 `GET /patterns/stats/all` 개선 여부를 비교한다.
- 필요 시 백필 스크립트를 별도 lane 으로 열어 기존 파일 레코드를 Supabase 로 이관한다.

## Performance Impact

| 경로 | 이전 | 이후 |
|---|---|---|
| `compute_family_stats(slug)` | O(N json files) 디스크 스캔 | O(N rows) DB 쿼리 (인덱스 활용) |
| `list(slug, record_type="model", limit=1)` | O(N files) 필터 | O(1) 인덱스 fetch |
| GCP 다중 인스턴스 캐시 | per-process (30s TTL 무효) | Postgres 공유 상태 |

## Deployment Checklist

- [ ] Supabase 대시보드에서 `018_pattern_ledger_records.sql` 실행
- [ ] GCP 엔진 Cloud Run에 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env 확인
- [ ] GCP 재배포 후 `GET /patterns/stats/all` 응답 시간 비교
- [ ] (선택) `engine/scripts/backfill_ledger_records.py` 실행으로 기존 JSON → Supabase 백필

## Exit Criteria

- [x] `SupabaseLedgerRecordStore` 클래스 구현 (동일 public interface)
- [x] `get_ledger_record_store()` 추가 + `LEDGER_RECORD_STORE` 자동 라우팅
- [x] Supabase migration SQL 작성
- [x] 엔진 테스트 통과 (local dev = file 모드 → 기존 테스트 영향 없음)
- [ ] Supabase migration 실행 (배포 시점)
- [ ] GCP 재배포 후 stats 응답 개선 확인

## Handoff Checklist

- branch: `claude/w-0126-ledgerstore-supabase`
- 신규 파일: `engine/ledger/supabase_record_store.py`, `app/supabase/migrations/018_pattern_ledger_records.sql`
- 수정 파일: `engine/ledger/store.py`, `engine/ledger/__init__.py`, 관련 consumer/test files
- verification:
  - `UV_CACHE_DIR=/tmp/wtd-v2-uv-cache uv run --directory engine python -m pytest tests/test_ledger_store.py tests/test_patterns_scanner.py tests/test_worker_research_jobs.py -q`
- 다음 배포 필수 작업: Supabase migration 실행 → GCP 재배포
