# W-0133 — Repo Stabilization Refactor

## Goal

현재 저장소의 고장 원인을 "버그 수정"이 아니라 "경계/계약/런타임 구조" 기준으로 재정렬하고, 대규모 리팩토링을 한 번에 하지 않고 3개 파동으로 나눠 안정화한다.

## Owner

contract

## Scope

- app/engine 경계 위반 지점 식별 및 우선순위화
- 깨진 기준선(test/check)와 구조적 원인 연결
- 리팩토링 파동별 목표, 순서, 검증 기준 정의

## Non-Goals

- 이번 work item에서 기능 구현 완료
- UI polish warning 일괄 정리
- feature PR 여러 개를 한 번에 병합

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `docs/domains/contracts.md`
- `docs/domains/engine-pipeline.md`
- `docs/domains/terminal-backend-mapping.md`
- `app/docs/APP_ENGINE_BOUNDARY.md`
- `engine/ledger/store.py`
- `engine/ledger/supabase_record_store.py`

## Facts

- `app/src/routes/api`에 `+server.ts`가 154개, `engine/api/routes`에는 28개 route module이 있어 app API surface가 과도하게 넓다.
- `app/src/lib/engine`에 61개 파일, `app/src/lib/server`에 155개 파일이 남아 있고 duplication audit도 server runtime 경로 6개를 위반으로 보고한다.
- `app/cogochi/*.py`가 `app/` 내부에 남아 있어 "engine only backend truth" 원칙과 충돌한다.
- `npm run check`는 에러 없이 통과하지만 Svelte warning 78개가 누적되어 있고 구식 slot/self-closing/a11y 패턴이 혼재한다.
- `uv run pytest -q` 결과는 `15 failed, 1201 passed, 5 skipped`이며 실패는 `pattern_ledger_records` 테이블 부재와 전역 `LEDGER_RECORD_STORE`가 test path에 새어드는 문제에 집중된다.
- 현재 repo는 `work/active/CURRENT.md`를 live work item 단일 인덱스로 사용하지만, `AGENTS.md`와 `scripts/check-operating-baseline.sh`는 아직 이전 `W-0000-template`/전체 `W-*.md` 가정을 일부 남겨 두고 있다.
- `main` 기준 tree 는 `work/active` 문서 173개 / `work/completed` 1개로 남아 있지만, 현재 작업트리는 `work/active` 10개 / `work/completed` 176개이며 `CURRENT.md` 는 그중 8개만 live 로 가리킨다.
- archive sweep 대상 178개 문서는 삭제/추가 이름이 1:1 대응하며, live index 밖 checkpoint 메모(`W-0129`, `W-0130`)는 reference-only 로 유지할 수 있다.
- mixed runtime diff는 dedicated lane `codex/w-0134-runtime-stabilization` 로 분리되어 PR #182 로 올라갔다.

## Assumptions

- 현재 `pattern_ledger_records` migration 미실행은 운영 이슈이면서 동시에 테스트 격리 설계 결함을 드러낸다.
- 전체 리팩토링은 단일 PR이 아니라 `engine logic` → `contract` → `app surface` 순의 분리된 변경으로 나눠야 안전하다.

## Open Questions

- `app/src/lib/engine/cogochi/*` 중 실제 canonical truth로 남겨야 하는 계산이 있는지, 아니면 전부 legacy/preview인지 확인 필요.
- `app/cogochi/*.py`는 engine으로 이동할 대상인지, 폐기할 legacy인지 결정 필요.

## Decisions

- 전체 리팩토링의 1차 목표는 "새 기능 추가"가 아니라 "single source of truth 복구"로 둔다.
- 파동 1은 persistence/test isolation, 파동 2는 contract/runtime consolidation, 파동 3은 app surface slimming으로 나눈다.
- app route는 `proxy`, `orchestrated`, `app-domain` 셋으로 재분류하고, 계산 권한이 섞인 route부터 engine으로 이동시킨다.
- repo baseline은 `CURRENT.md`에 올라온 live work item만 검증 대상으로 삼고, checkpoint/parking note는 reference-only 로 취급한다.
- 운영 문서 정렬은 `main` 의 낡은 "모든 W 문서가 active" 가정이 아니라 현재 파일시스템 구조와 live index를 우선한다.
- non-code cleanup 에서는 live baseline commit 과 archive sweep commit 을 분리하고, app/runtime 코드 변경은 이 lane 에 섞지 않는다.
- `.codex/` worktree와 `.playwright-cli/*` 산출물은 로컬 artifact로 취급하고 non-code lane에서 추적하지 않는다.

## Next Steps

1. `CURRENT.md` + `.gitignore` 를 최신 lane 구조에 맞게 유지하고, runtime/code diff는 W-0134 lane 밖에 두지 않는다.
2. W-0126 선행: `pattern_ledger_records` migration 적용 여부를 정리하고 `LEDGER_RECORD_STORE`를 주입형으로 바꿔 테스트와 로컬 file store가 외부 Supabase 상태에 의존하지 않게 만든다.
3. contract pack 기준으로 `/api/cogochi/*`, `/api/market/*`, `/api/patterns/*`, `/api/terminal/*`를 소유권별로 인벤토리화하고 engine 이관 대상 route를 확정한다.

## Exit Criteria

- engine tests가 외부 migration 상태와 무관하게 통과한다.
- 계산 권한이 있는 app-side engine code에 대해 유지/이관/폐기 분류가 끝난다.
- route ownership inventory와 계약 기준 검증 항목이 문서화된다.

## Handoff Checklist

- active work item: `work/active/W-0133-repo-stabilization-refactor.md`
- branch/worktree state: current non-code cleanup branch `codex/w-0133-noncode-cleanup`; runtime code changes are split to PR #182 and must stay out of this merge unit
- verification status: `bash scripts/check-operating-baseline.sh`, `npm run check`, `uv run pytest -q` results should be recorded separately as each wave is refreshed
- remaining blockers: W-0126 migration/test isolation and route ownership inventory remain the technical gates after the doc baseline is repaired
