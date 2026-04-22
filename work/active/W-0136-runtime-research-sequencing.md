# W-0136 — Runtime / Research Sequencing

## Goal

W-0126 이후의 코어 아키텍처 실행 순서를 `runtime stability`, `runtime role split`,
`AI research plane` 기준으로 고정하고, 다음 구현 파동이 shared-state canonical truth
위에서만 진행되게 만든다.

## Owner

contract

## Primary Change Type

Contract change

## Scope

- W-0126 cutover 를 전체 프로그램의 선행 게이트로 고정
- `engine-api` / `worker-control` / `app-web` runtime role 기준으로 다음 파동 순서 정의
- AI research / refinement / pattern ML work 가 어디에서 실행되어야 하는지 배치 규칙 확정
- operator 가 W-0126 cutover readiness 를 빠르게 판단할 수 있는 preflight 절차 확보

## Non-Goals

- 이번 work item 에서 실제 Supabase migration 018 실행
- 이번 work item 에서 worker-control 대규모 코드 이동 완료
- 이번 work item 에서 W-0122 Confluence Phase 2 기능 구현 완료

## Canonical Files

- `work/active/W-0136-runtime-research-sequencing.md`
- `work/active/W-0126-ledger-supabase-record-store.md`
- `work/active/W-0124-engine-ingress-auth-hardening.md`
- `work/active/W-0122-free-indicator-stack.md`
- `docs/decisions/ADR-009-core-runtime-ownership.md`
- `docs/domains/autoresearch-ml.md`
- `docs/domains/refinement-methodology.md`
- `docs/domains/pattern-ml.md`
- `docs/runbooks/pattern-ledger-record-cutover.md`
- `scripts/w0126-cutover-preflight.sh`
- `engine/worker/cli.py`
- `engine/tests/test_worker_cli.py`

## Facts

1. W-0126 코드 변경은 완료됐지만 production shared ledger cutover 는 아직 migration 018 미실행 상태라 canonical shared-state 전환이 끝나지 않았다.
2. W-0126 cutover 후에는 `engine-api` 도 `/patterns/stats/all` 같은 shared ledger read path 때문에 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 를 필요로 한다.
3. W-0124 는 non-meta engine route 에 대한 `ENGINE_INTERNAL_SECRET` 경계를 이미 코드로 가졌고, 실제 배포 env 적용만 남은 상태다.
4. `docs/domains/refinement-methodology.md` 와 `docs/domains/pattern-ml.md` 는 exploratory search / training / promotion 을 `worker-control` plane 에 둬야 한다고 명시한다.
5. W-0122 Confluence Phase 2 의 핵심은 UI 확장이 아니라 engine-side scoring, flywheel weight learning, capture snapshot persistence 다.
6. 기존 methodology primitives 는 `engine/research/*` 와 `worker/research_jobs.py` 에 이미 있지만, worker-control 소유의 canonical CLI entrypoint 는 없었다.

## Assumptions

1. 현재 priority 는 "새 AI feature 추가" 보다 "shared evidence plane 와 privileged runtime boundary 를 production 에서 먼저 굳히는 것" 이다.
2. cutover 이후에도 historical JSON record backfill 은 당장 필수는 아니다. 새 evidence 부터 shared store 에 쌓이면 다음 phase 를 시작할 수 있다.

## Open Questions

- W-0122 Phase 2 의 weight learning state 를 기존 ledger payload 에 둘지, 별도 research memory / experiment store 로 분리할지 세부 모델 결정 필요.
- `engine/api/routes/jobs.py` 와 scheduler entrypoint 중 어떤 slice 를 먼저 worker-control 로 옮길지 우선순위 확정 필요.

## Decisions

- 다음 파동의 0번 게이트는 W-0126 cutover 완료다. migration 018 + trusted runtime env + redeploy + smoke check 가 끝나기 전에는 research lane 을 main priority 로 올리지 않는다.
- privileged Supabase credential 을 `engine-api` 에 넣는 cutover 는 W-0124 ingress boundary 와 함께 다룬다. 즉 "shared state canonicalization" 과 "public runtime hardening" 을 분리하지 않는다.
- research / refinement / training / calibration / promotion logic 는 `worker-control` 로만 올리고, `engine-api` 에는 deterministic read / score / evidence contract 만 남긴다.
- W-0122 Confluence Phase 2 는 W-0126 cutover 후, `worker-control` placement 규칙을 먼저 정한 다음에 시작한다.

## Next Steps

1. W-0126 cutover 를 operator 가 바로 점검할 수 있도록 `scripts/w0126-cutover-preflight.sh` 를 canonical preflight 로 둔다.
2. `engine/worker/cli.py` 를 canonical one-shot entrypoint 로 두고, objective/refinement/search-refinement 실행을 public runtime 밖에서 시작하게 만든다.
3. 그 다음 W-0122 Phase 2 를 `engine scoring plane + worker-control learning plane` 으로 분리해 착수한다.

## Verification Target

- `bash -n scripts/w0126-cutover-preflight.sh`
- `SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=test-key ENGINE_INTERNAL_SECRET=test-secret APP_ORIGIN=https://app.example.com bash scripts/w0126-cutover-preflight.sh`
- `uv run --directory engine python -m pytest tests/test_worker_cli.py tests/test_worker_research_jobs.py tests/test_research_worker_control.py -q`

## Exit Criteria

- W-0126 cutover 가 다음 파동의 explicit gate 로 문서화된다.
- next-wave order 가 `cutover -> runtime role split -> research lane` 으로 고정된다.
- operator preflight 절차가 문서가 아니라 실행 가능한 스크립트로 제공된다.
- worker-control 소유의 one-shot research entrypoint 가 존재한다.

## Handoff Checklist

- active work item: `work/active/W-0136-runtime-research-sequencing.md`
- branch: `codex/w-0126-core-ledger-boundaries`
- verification:
  - `bash -n scripts/w0126-cutover-preflight.sh`
  - dummy env 기반 preflight 실행
  - worker CLI + research jobs focused pytest
- remaining blockers: 실제 migration 018 실행, Cloud Run env 반영, runtime role split implementation
