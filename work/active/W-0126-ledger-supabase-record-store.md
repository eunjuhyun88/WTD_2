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
- `scripts/w0126-cutover-preflight.sh`
- `cloudbuild.yaml`
- `cloudbuild.worker.yaml`

## Facts

1. W-0126 code path 는 PR #186 으로 mainline 에 통합되었고, `patterns_thread` / `observability` / `outcome_resolver` 는 record-store boundary 를 사용한다.
2. Supabase migration `018_pattern_ledger_records.sql` 은 운영 DB에 적용되었고 `pattern_ledger_records` table 및 `pattern_ledger_records_pkey`, `plr_slug_created_idx`, `plr_slug_type_created_idx` 가 검증되었다.
3. Cloud Run 실제 상태는 `us-east4/cogotchi` 만 Ready 이고 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENGINE_INTERNAL_SECRET` env 이름을 가진다. `asia-southeast1/cogotchi` 와 `us-east4/wtd-2` 는 container start 실패 상태다.
4. `app.cogotchi.dev` 는 production deployment 가 아니라 `release` preview deployment alias 이다. preview env 에는 `ENGINE_URL` 은 있으나 `ENGINE_INTERNAL_SECRET` 이 없어 `/api/patterns/stats` 가 `{ ok: false }` 를 반환한다.
5. 기존 `cloudbuild.worker.yaml` 은 HTTP listener 가 없는 `engine/worker/Dockerfile` 이미지를 Cloud Run Service 로 배포하려 해서 worker-control Service 구조와 맞지 않는다.

## Assumptions

1. 현 시점 운영 app alias 는 `release` preview deployment 를 canonical app surface 로 사용한다.
2. 기존 파일 기반 레코드와 Supabase 레코드가 일시적으로 분기될 수 있음 (백필 전).
   통계 차이는 허용된다. 새 레코드부터 Supabase 에 누적된다.
3. `us-east4/cogotchi` 는 `asia-southeast1/cogotchi` 가 재배포로 복구될 때까지 현재 검증 가능한 engine runtime 이다.

## Open Questions

- `app.cogotchi.dev` preview env 의 `ENGINE_INTERNAL_SECRET` 값은 production Vercel env 또는 Cloud Run env 와 동일한 값으로 복사할지 확인이 필요하다.
- `asia-southeast1/cogotchi` 를 즉시 재배포해 canonical engine 으로 되돌릴지, 당장은 Ready 상태인 `us-east4/cogotchi` 를 유지할지 운영 결정이 필요하다.

## Decisions

- record store 구현 교체보다 consumer 가 store contract 를 직접 사용하도록 바꾸는 것을 우선한다.
- hot path consumer 는 가능하면 `list()` 직접 집계 대신 `summarize_family()` / `count_records()` 같은 store-level API 를 사용한다.
- record append 가 필요한 write path 는 전역 singleton 직접 참조보다 주입 가능한 인자를 우선한다.
- 기존 파일 기반 코드는 local dev fallback 으로 유지한다.
- 백필 스크립트와 Supabase 운영 migration 실행은 별도 execution step 으로 둔다.
- `codex/w-0126-core-ledger-boundaries` 는 dirty execution lane으로 유지하지 않고, 최신 `origin/main` 위 clean branch `codex/w-0126-mainline` 에 cherry-pick 해서 이어간다.
- W-0126 ops follow-up 은 최신 `origin/main` 위 `codex/w-0126-cutover-ops` 에서 분리한다. W-0139 app changes 와 섞지 않는다.
- `CRON_SECRET` 는 `ENGINE_INTERNAL_SECRET` 로 자동 대체하지 않는다. `CRON_SECRET` 로 direct engine stats 호출 시 403 이 확인되었다.
- Cloud Run engine-api deploy 는 `ENGINE_RUNTIME_ROLE=api` 를 명시하고, worker-control Service 는 HTTP FastAPI entrypoint + `ENGINE_RUNTIME_ROLE=worker` 로 배포한다.

## Next Steps

1. Vercel preview 에 exact `ENGINE_INTERNAL_SECRET` 를 설정하고 release alias deployment 를 재배포한다.
2. `app.cogotchi.dev/api/patterns/stats` 가 `{ ok: true }` 를 반환하는지 확인한다.
3. Cloud Run `asia-southeast1/cogotchi` 재배포 또는 `us-east4/cogotchi` 유지 결정을 문서화한다.

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

- [x] Supabase 대시보드/DB에서 `018_pattern_ledger_records.sql` 실행
- [x] DB table/index 검증 (`pattern_ledger_records`, required indexes 3개)
- [x] GCP `us-east4/cogotchi` 에 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `ENGINE_INTERNAL_SECRET` env 이름 확인
- [ ] Vercel preview 에 exact `ENGINE_INTERNAL_SECRET` 설정
- [ ] `bash scripts/w0126-cutover-preflight.sh` 로 cutover preflight 통과
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
- [x] Supabase migration 실행 (배포 시점)
- [ ] app release alias 에서 `/api/patterns/stats` 가 `{ ok: true }` 반환
- [ ] GCP canonical engine runtime 결정 및 재배포 후 stats 응답 개선 확인

## Handoff Checklist

- branch: `codex/w-0126-cutover-ops`
- 신규 파일: 없음
- 수정 파일: `cloudbuild.yaml`, `cloudbuild.worker.yaml`, `scripts/w0126-cutover-preflight.sh`, W-0126 docs
- verification:
  - `uv run --directory engine python -m pytest tests/test_ledger_store.py -q` ✅
  - `uv run --directory engine python -m pytest tests/test_outcome_resolver.py -q` ✅
  - `uv run --directory engine python -m pytest tests/test_observability_flywheel.py -q` ✅
  - `uv run --directory engine python -m pytest tests/test_pattern_candidate_routes.py -q` ✅
  - `RUN_DB_VERIFY=1` preflight with Node `pg` fallback: pending
- 다음 운영 필수 작업: Vercel preview `ENGINE_INTERNAL_SECRET` 설정 → release alias 재배포 → `/api/patterns/stats` 확인
