# W-0261 — `/end` End-to-End Lifecycle 5축 동기화 (Phase 2)

**Owner**: engine (tools/)
**Status**: PRD (구현 전, CTO + AI Researcher 강화 2026-04-27)
**Depends on**: W-0260 ✅ MERGED (#487, main `5d4b1d13`)
**Branch (예상)**: `feat/W-0261-end-5axis-sync`

## Goal

`/end` 호출 1회 → 5축 (work item md / GitHub Issue / branch+PR / worktree registry / memory) 자동 동기화. 누락 0, 사용자 1개 명령어로 종료.

## Scope

### In-Scope

- `tools/end.sh` 5축 옵션 플래그:
  - `--complete-work-item W-NNNN` — work/active/* → work/completed/* (`tools/complete_work_item.sh` 재사용)
  - `--close-issue N` — `gh issue close N --comment "Resolved by PR #X"`
  - `--push` — `git push -u origin <branch>`
  - `--pr` — `gh pr create --fill`
  - `--all` 메타플래그 — 위 4개 동시 ON
  - 기본 OFF (BC 보장)
- registry에서 work_item / issue 자동 추론 (`worktree-registry.sh get`이 매핑 보유)
- 출력 5축 결과 요약 (✅/⚠/❌)

### Non-Goals

- worktree 자동 삭제 (위험 — 사용자 confirm 필요)
- cross-machine PR 코멘트 (Phase 4 W-0263)
- AI 자동 회고 (memkraft retro로 충분)

## Exit Criteria

| # | Criterion | 측정 방법 | 수치 기준 |
|---|---|---|---|
| 1 | `--all` 사용 시 5축 모두 갱신 | end.sh 출력에 5개 ✅ | 5/5 success or 1+ ⚠/❌ + 정확한 reason |
| 2 | 플래그 없으면 BC 유지 | git diff end.sh + 기존 jsonl/CONTRACTS 동작 | 동일 |
| 3 | work item 이동 path | `work/completed/<YYYY-MM-DD>-W-NNNN-<slug>.md` 존재 | 100% |
| 4 | PR 번호 capture latency | `gh pr create --fill` → 환경변수 PR_NUM 설정 | < 5s p95 |
| 5 | 부분 실패 시 fail-fast | push 실패해도 registry/jsonl은 commit | 독립 실패 5/5 시나리오 통과 |
| 6 | unit test | `tools/tests/test_end_5axis.sh` (bats 또는 shell) | 신규 5+ 케이스 |

## AI Researcher 리스크

이 PR은 **shell 인프라**라 ML 훈련 데이터에 직접 영향 ❌. 그러나 운영 데이터 흐름 영향:

**메모리/jsonl 영향**
- `memory/sessions/agents/A###.jsonl`에 추가 필드(`pr_num`, `closed_issue`)? — 결정 필요
- 기존 jsonl reader (다른 도구)와 호환성: 추가 필드는 OK (additive). 필드 제거는 ❌.

**Issue close timing**
- `gh issue close` 시점이 PR 머지 전이면 Issue가 잘못 close. → `gh pr merge` 후에만 close.
- end.sh는 보통 PR merge 전에 호출 → `--close-issue`는 머지 후 별도 호출 권장 패턴 또는 PR body의 `Closes #N` 자동 close에 의존.

**실데이터 시나리오**
- 73 worktree 머신에서 5축 동기화: registry 71개 entry 처리 — refresh_state.sh ~80ms (실측). end.sh +50ms 추정.
- gh CLI rate limit (5000 req/h authenticated): 평소 사용량 << 한도. 무시 가능.

## CTO 설계 결정

### 성능
- gh API 호출은 **각 flag당 1회** (총 최대 3회). 병렬화 불필요 (사용자 체감 < 2s).
- registry merge는 이미 atomic — race ❌.

### 안정성
- 각 축은 **독립 실행** (try/catch 패턴):
  ```bash
  if ! _do_axis_X; then echo "⚠ axis X failed: $REASON"; FAILED=1; fi
  ```
- 어느 축 실패해도 나머지 4축은 진행 (사용자가 부분 복구 가능)
- 마지막에 FAILED=1면 exit 1, 사용자에게 정확한 실패 위치 표시

### 보안
- gh CLI 인증 없으면 `--close-issue` `--pr` 모두 graceful skip (warning 표시, exit 0)
- `git push`는 pre-push hook 통과 (이미 W-0260에서 약화됨)
- 민감 토큰 ❌ (gh CLI가 OS keychain 사용)

### 유지보수성
- 각 axis 함수 분리 (`_axis_workitem`, `_axis_issue`, `_axis_branch`, `_axis_registry`, `_axis_memory`)
- 테스트: `tools/tests/test_end_5axis.sh` — 5축 × OK/Fail 매트릭스
- 롤백: 새 flag 모두 opt-in. 기존 사용자 영향 0.

## Facts (실측, 2026-04-27)

```bash
# 1. 현재 end.sh 줄 수
$ wc -l tools/end.sh
138 tools/end.sh

# 2. 기존 5축 처리 현황
$ grep -nE "complete_work_item|gh issue close|gh pr create|git push" tools/end.sh
(없음 — 모두 신규)

# 3. complete_work_item.sh 재사용 가능?
$ ls tools/complete_work_item.sh
✅ 존재 — Exit Criteria 0/N 시 --force 옵션 있음

# 4. registry get 출력 형식
$ ./tools/worktree-registry.sh get | jq '{issue, work_item}'
{"issue": null, "work_item": "W-0260"}    # 매핑 정상
```

## Assumptions

- W-0260 main에 머지됨 (`5d4b1d13`) — registry SSOT 사용 가능
- gh CLI 인증 + repo write 권한
- `tools/complete_work_item.sh` 변경 ❌ (재사용만)
- bats / 또는 shell test framework 선택은 구현 시점에 결정

## Canonical Files

| 파일 | 역할 |
|---|---|
| `tools/end.sh` | 5축 옵션 flag 추가 (현재 138줄 → 예상 +80줄) |
| `tools/tests/test_end_5axis.sh` (new) | 5축 × 통과/실패 매트릭스 테스트 |
| `AGENTS.md` | `/end` 슬래시 표 갱신 (5축 자동) |
| `CLAUDE.md` | §Worktree Registry 자동 갱신 표 보강 |
| `docs/decisions/0006-end-5axis-sync-2026-XX-XX.md` (new) | ADR (실측 기반 설계 근거) |

## Charter 정합성

- ✅ §In-Scope: 기존 `tools/end.sh` 안정화·기능 확장 (Charter 명시 허용)
- ✅ §Frozen 250줄 한도: end.sh 예상 ~218줄, 신규 stack 아님
- ✅ §Coordination: Issue close가 mutex release를 명시화
- ✅ §Non-Goal 침범 ❌
