# W-0261 — `/end` End-to-End Lifecycle 5축 동기화 (Phase 2)

**Owner**: TBD
**Status**: PRD (구현 전)
**Depends on**: W-0260 (registry SSOT)
**Branch (예상)**: `feat/W-0261-end-5axis-sync`

## Goal

`/end` 호출 한 번으로 5축 모두 자동 갱신:

1. **work item md** — `work/active/W-NNNN-*.md` → `work/completed/`
2. **GitHub Issue** — `gh issue close N --comment "Resolved by PR #X"` (옵션)
3. **branch + PR** — push + `gh pr create --fill` (옵션)
4. **worktree registry** — `status=done` (W-0260에서 이미 구현됨)
5. **memory** — jsonl + memkraft retro (이미 구현됨)

## Scope

### In-Scope

- `tools/end.sh`에 5축 옵션 플래그 추가:
  - `--complete-work-item W-NNNN` — md 파일 active → completed 이동
  - `--close-issue N` — gh issue close + PR 링크 코멘트
  - `--push` — `git push -u origin <branch>`
  - `--pr` — `gh pr create --fill`
  - 기본은 모두 OFF (호환성)
- `tools/end.sh`에 `--all` 메타플래그: `--complete-work-item --close-issue --push --pr` 동시 적용
- registry에서 work_item을 자동 추론 (이미 매핑돼 있으면)
- end.sh 종료 시 5축 sync 결과 요약 출력

### Non-Goals

- worktree 자동 삭제 — 너무 위험. 사용자 confirm 필요.
- 다른 사용자/머신의 PR 코멘트는 수동 (cross-machine은 Phase 4)

## Exit Criteria

- [ ] `./tools/end.sh "shipped" "next" --all` — 5축 모두 갱신, 출력에 5개 결과 표시
- [ ] `./tools/end.sh "shipped" "next"` (플래그 없음) — 기존 동작과 동일 (BC)
- [ ] work item 자동 이동 — `work/active/W-NNNN.md` → `work/completed/<DATE>-W-NNNN.md`
- [ ] `gh pr create --fill` 후 PR 번호 capture → `--close-issue` 시 코멘트에 링크
- [ ] 실패 시 fail-fast (예: push 실패해도 registry status=done은 유지)

## Risks

| 위험 | 완화 |
|---|---|
| work item md 이동 시 다른 PR이 같은 파일 수정 중 | Phase 2도 git status가 dirty 면 stop |
| `gh pr create` 실패 (CI/permissions) | 실패해도 registry/jsonl은 갱신. exit code 1 + 명확 메시지 |
| 기존 사용자 워크플로 깨짐 | 모든 새 동작은 opt-in flag. 기본은 BC. |

## CTO 점검표

| 영역 | 평가 |
|---|---|
| 성능 | gh API 호출 1-3회 추가 (네트워크). 사용자 체감 무시 가능 |
| 안정성 | 각 축이 독립 실패 가능. 부분 실패 시 명확 보고. |
| 보안 | gh CLI 인증 의존. 인증 없으면 graceful skip. |
| 유지보수성 | flag 별로 함수 분리. 테스트 단위 명확. |
| Charter 부합 | §Coordination — Issue close가 mutex release를 명시화 |
