# W-0127 — Dirty Tree Split Plan

## Goal

현재 `claude/w-0126-ledgerstore-supabase` 브랜치의 대형 dirty worktree를
merge-safe한 독립 슬라이스들로 분해하는 실행 순서를 고정한다.

## Owner

research

## Primary Change Type

Research or eval change

## Verification Target

- `git status --porcelain=v1` 분류 결과가 계획과 일치하는지 확인
- `git diff --name-only origin/main...HEAD` 로 브랜치 본체와 로컬 dirty를 분리 확인
- 실행 계획이 각 슬라이스별 source branch/worktree/restore 대상까지 포함하는지 수동 검토

## Scope

- 현재 dirty tree를 `discard`, `docs move`, `W-0126 boundary closure`, `ledger-supabase`, `scan helper refactor` 로 분리
- 각 슬라이스를 어떤 source에서 새 branch/worktree로 옮길지 결정
- `git restore`, `git mv`, `git cherry-pick` 대신 `fresh branch + explicit file copy` 기준 순서 고정

## Non-Goals

- 이 work item에서 실제 파일 삭제/복구/브랜치 생성까지 전부 수행
- 여러 owner 변경을 한 PR로 다시 섞기
- `work/` 문서 체계 개편의 최종 정책 결정

## Canonical Files

- `work/active/W-0127-dirty-tree-split-plan.md`
- `work/active/W-0126-ledger-supabase-record-store.md`
- `work/wip/W-0126-app-engine-boundary-closure.md`
- `AGENTS.md`
- `app/vercel.json`

## Facts

1. 현재 worktree dirty는 `405`개이며, `186 D`, `24 M`, `195 ??` 상태다.
2. `work/` 아래 변경이 `352`개로 가장 크고, 실질적으로 `active -> completed` 대량 이동이다.
3. 현재 브랜치 HEAD(`206199a5`)는 `ledger-supabase` 슬라이스를 이미 커밋으로 포함한다.
4. app/engine dirty 코드는 별도로 `W-0126 boundary closure`, `market snapshot GET hardening`, `scan helper extraction`이 섞여 있다.
5. `research/experiments/experiment_log.jsonl` 와 메모성 파일들은 PR 가치가 낮은 로컬 산출물이다.

## Assumptions

1. 새 merge unit은 항상 `origin/main` 기반 clean branch/worktree에서 다시 조립하는 것이 가장 안전하다.
2. 현재 dirty worktree는 source-of-truth가 아니라 임시 staging area 로 취급해야 한다.

## Open Questions

- none

## Decisions

- 현재 dirty worktree에서 직접 커밋하지 않는다.
- `ledger-supabase` 는 현재 브랜치 HEAD를 source로 쓰고, 나머지 dirty 변경은 file-scoped copy로 별도 조립한다.
- `work/` 대량 이동은 코드 PR과 분리한다.
- 로컬 산출물/메모성 파일은 어떤 PR에도 포함하지 않는다.

## Next Steps

1. `ledger-supabase` clean branch/worktree를 먼저 만든다.
2. `W-0126 boundary closure` 를 `origin/main` 기반 별도 clean branch/worktree로 다시 조립한다.
3. 문서 이동과 scan helper refactor 는 독립 후속 슬라이스로 남긴다.

## Exit Criteria

- 각 dirty cluster가 어느 branch/worktree로 가야 하는지 결정돼 있다.
- 버릴 파일과 보존할 파일이 명시돼 있다.
- 다음 실행자가 chat 없이도 순서대로 분리 작업을 시작할 수 있다.

## Handoff Checklist

- active work item: `work/active/W-0127-dirty-tree-split-plan.md`
- branch/worktree state: `claude/w-0126-ledgerstore-supabase` on dirty source worktree
- verification status: git status / diff classification completed; no file mutations executed yet
- remaining blockers: none for planning; execution still needs explicit branch/worktree creation
