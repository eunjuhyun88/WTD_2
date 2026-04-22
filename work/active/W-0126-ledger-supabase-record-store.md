# W-0126 — Ledger Record Store Boundary Refactor

## Goal

`LedgerRecordStore` / `SupabaseLedgerRecordStore` 추상화를 실제 hot path consumer까지 관통시키고,
전역 `LEDGER_RECORD_STORE` 의 import-time 결합을 줄여 로컬 file-mode, Supabase mode,
테스트 주입 경계를 같은 계약 위에서 동작하게 만든다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- `engine/ledger/store.py` — record store contract / fallback 구현
- `engine/ledger/supabase_record_store.py` — Supabase-backed record store 구현
- `engine/api/routes/patterns_thread.py` — stats hot path consumer
- `engine/api/routes/observability.py` — KPI aggregation consumer
- `engine/scanner/jobs/outcome_resolver.py` — capture → outcome close path
- `app/supabase/migrations/018_pattern_ledger_records.sql` — record table + indexes

## Non-Goals

- 기존 `ledger_records/*.json` 파일 삭제 (local dev fallback 유지)
- `PatternOutcome` / `FileLedgerStore` 전환 (이미 `SupabaseLedgerStore` 존재)
- 히스토리 백필 자동화 (수동 rebuild 스크립트로 대체 가능)
- Supabase 운영 migration 실행 자체를 이 change set에 포함

## Canonical Files

- `engine/ledger/supabase_record_store.py`
- `engine/ledger/store.py`
- `app/supabase/migrations/018_pattern_ledger_records.sql`
- `engine/api/routes/patterns_thread.py`
- `engine/api/routes/observability.py`
- `engine/scanner/jobs/outcome_resolver.py`
- `engine/tests/test_pattern_candidate_routes.py`
- `engine/tests/test_observability_flywheel.py`
- `engine/tests/test_outcome_resolver.py`
- `docs/runbooks/pattern-ledger-record-cutover.md`

## Facts

1. `patterns_thread._summarize_record_family(slug)` 는 아직 `LEDGER_RECORD_STORE.list(slug)` 전량 로드 + 직접 집계를 사용하고 있어 store abstraction의 핵심 이점을 hot path 에서 활용하지 않는다.
2. `LEDGER_RECORD_STORE` 는 모듈 임포트 시 초기화되는 전역 싱글톤이고, 일부 consumer 는 주입형인데 일부 consumer 는 여전히 전역 인스턴스에 직접 결합되어 있다.
3. `SupabaseLedgerRecordStore` 와 migration `018_pattern_ledger_records.sql` 은 이미 존재하므로 W-0126의 현재 핵심 결함은 "미구현"이 아니라 "consumer migration / 경계 정리 미완료"이다.
4. `SupabaseLedgerRecordStore.compute_family_stats()` 는 DB 한 번 호출로 집계하지만, 현재 구현은 `record_type` row 들을 읽어 Python 에서 합산하므로 주석상의 strict O(1) 보다는 "single-roundtrip O(N rows)"에 가깝다.
5. focused local verification 기준으로 `tests/test_ledger_store.py`, `tests/test_outcome_resolver.py`, `tests/test_observability_flywheel.py`, `tests/test_pattern_candidate_routes.py` 는 file-mode / injected mode 에서 통과한다. 즉 현재 남은 위험은 코드 correctness 보다 Supabase 운영 전환과 실제 row growth 에 있다.

## Assumptions

1. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 가 엔진 GCP 런타임에 설정된다.
2. 기존 파일 기반 레코드와 Supabase 레코드가 일시적으로 분기될 수 있음 (백필 전).
   통계 차이는 허용된다. 새 레코드부터 Supabase 에 누적된다.

## Open Questions

- `compute_family_stats()` 를 SQL aggregate / RPC 로 더 내릴 가치가 있는지 여부는 실제 row growth 를 본 뒤 별도 성능 lane 에서 판단한다.

## Decisions

- record store 구현 교체보다 consumer 가 store contract 를 직접 사용하도록 바꾸는 것을 우선한다.
- hot path consumer 는 가능하면 `list()` 직접 집계 대신 `summarize_family()` / `count_records()` 같은 store-level API 를 사용한다.
- record append 가 필요한 write path 는 전역 singleton 직접 참조보다 주입 가능한 인자를 우선한다.
- 기존 파일 기반 코드는 local dev fallback 으로 유지한다.
- 백필 스크립트와 Supabase 운영 migration 실행은 별도 execution step 으로 둔다.

## Next Steps

1. Supabase migration 018 을 실제 환경에 적용한다.
2. GCP 엔진 런타임 env 확인 후 재배포하고 `/patterns/stats/all` latency 를 비교한다.
3. 실제 row growth 가 커지면 `compute_family_stats()` SQL aggregate / RPC 최적화 lane 을 별도로 연다.

운영 절차는 `docs/runbooks/pattern-ledger-record-cutover.md` 를 canonical checklist 로 사용한다.

## Verification Target

- `uv run --directory engine python -m pytest tests/test_ledger_store.py -q`
- `uv run --directory engine python -m pytest tests/test_outcome_resolver.py -q`
- `uv run --directory engine python -m pytest tests/test_observability_flywheel.py -q`
- `uv run --directory engine python -m pytest tests/test_pattern_candidate_routes.py -q`

## Performance Impact

| 경로 | 이전 | 이후 |
|---|---|---|
| `patterns_thread` family summary | route 내부 `list()` 전량 로드 + 집계 | store contract `summarize_family()` 사용 |
| `compute_family_stats(slug)` | O(N json files) 디스크 스캔 | single-roundtrip DB 집계 (`O(N rows)` current impl) |
| `list(slug, record_type="model", limit=1)` | O(N files) 필터 | O(1) 인덱스 fetch |
| GCP 다중 인스턴스 캐시 | per-process (30s TTL 무효) | Postgres 공유 상태 |

## Deployment Checklist

- [ ] Supabase 대시보드에서 `018_pattern_ledger_records.sql` 실행
- [ ] GCP 엔진 Cloud Run에 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env 확인
- [ ] GCP 재배포 후 `GET /patterns/stats/all` 응답 시간 비교
- [ ] (선택) `engine/scripts/backfill_ledger_records.py` 실행으로 기존 JSON → Supabase 백필

Runbook:

- `docs/runbooks/pattern-ledger-record-cutover.md`

## Exit Criteria

- [x] `SupabaseLedgerRecordStore` 클래스 구현 (동일 public interface)
- [x] `get_ledger_record_store()` 추가 + `LEDGER_RECORD_STORE` 자동 라우팅
- [x] Supabase migration SQL 작성
- [x] `patterns_thread` hot path 가 `summarize_family()` 기반으로 store contract 사용
- [x] `outcome_resolver` / `observability` 가 record store 주입 경계를 가진다
- [x] focused engine tests 통과 (local dev = file mode, injected tests 유지)
- [ ] Supabase migration 실행 (배포 시점)
- [ ] GCP 재배포 후 stats 응답 개선 확인

## Handoff Checklist

- branch: `codex/w-0126-core-ledger-boundaries`
- 신규 파일: 없음
- 수정 파일: `engine/ledger/store.py`, `engine/ledger/supabase_record_store.py`, consumer/test files
- verification:
  - `uv run --directory engine python -m pytest tests/test_ledger_store.py -q` ✅
  - `uv run --directory engine python -m pytest tests/test_outcome_resolver.py -q` ✅
  - `uv run --directory engine python -m pytest tests/test_observability_flywheel.py -q` ✅
  - `uv run --directory engine python -m pytest tests/test_pattern_candidate_routes.py -q` ✅
- 다음 운영 필수 작업: Supabase migration 실행 → 엔진 재배포 → `/patterns/stats/all` 응답 비교
