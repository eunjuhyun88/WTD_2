# W-0265 — Slash Lifecycle 4-Stage Standard

> Wave: Meta / Tooling | Priority: **P0** | Effort: **M (2-3d)**
> Charter: ✅ governance / runbook
> Status: 🟡 Design Draft (사용자 검토 대기)
> Created: 2026-04-28
> Parent: W-0264 §A — `work/active/W-0264-agent-management-system-overhaul.md`

---

## Goal (1줄)

`/설계 → /구현 → /검증 → /닫기` 4단계 라이프사이클을 일관된 슬래시 커맨드로 표준화하고, 각 단계 사이의 상태 전환(work item state machine)을 자동화하여 사용자가 매번 수동으로 worktree/mutex/stash를 챙기지 않게 한다.

## Scope

### 포함

- `/구현 W-####` 신규 슬래시 (`.claude/commands/구현.md`)
  - design 머지 확인 → fresh worktree 생성 → branch + mutex → 코드 작업 진입
- `/닫기 W-####` enhance (`.claude/commands/닫기.md`)
  - stash list 정리 prompt + worktree cleanup 옵션 + memkraft handoff 자동 등록
- `tools/lifecycle.sh` 신규 헬퍼 (worktree 자동 생성 + work item state 전환)

### Non-Scope

- ❌ 기존 `/설계` `/검증` 동작 변경 (compatibility 유지, 별도 work item 필요 시)
- ❌ work item state machine 자체 신설 (현 work/active ↔ work/completed 폴더 구조 유지)
- ❌ 슬래시 추가 외 키바인딩 변경

---

## CTO 관점 (Engineering)

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `/구현` 자동 worktree 생성이 사용자 권한 위임 없이 진행 | 중 | 중 | 첫 호출 시 confirm 프롬프트 (`/병렬`과 일관) |
| `/닫기` stash drop이 의도치 않게 작업 손실 | 낮 | 상 | drop 전 stash list 보여주고 명시적 y/n |
| 4단계 lifecycle을 모든 작업에 강제하면 small fix가 무거워짐 | 중 | 중 | 단순 chore (1 file, ≤20 lines)는 lifecycle 우회 허용 — `/구현` 옵션 `--simple` |
| design 머지 안 됐는데 `/구현` 호출 시 silent fail | 중 | 중 | `gh pr view <design-PR>` 검사, 머지 안 됐으면 stop + 안내 |

### Dependencies

- 선행: PR #487 (W-0260 worktree registry SSOT) — `/구현`이 registry를 update
- 선행: PR #491 (multi-agent isolation rule) — `/구현`이 fresh worktree 생성 시 isolation 보장
- 차단 해제: 다음 implementation work item부터 `/구현` 워크플로우 사용 가능

### Files Touched

- `.claude/commands/구현.md` (신규, ~80줄)
- `.claude/commands/닫기.md` (enhance, ~30줄 추가)
- `tools/lifecycle.sh` (신규, ~120줄):
  - `lifecycle_implement W-#### [--simple]` — design 머지 검사 → fresh worktree → mutex → branch
  - `lifecycle_close W-####` — stash prune + worktree cleanup + handoff
- `state/worktrees.json` (PR #487 schema 활용, 변경 없음)

---

## AI Researcher 관점 (Data/Model)

### Failure Modes

1. **Race condition**: 동시에 두 에이전트가 같은 W-#### `/구현` 호출 → mutex 충돌
   - 완화: `gh issue edit --add-assignee @me` (현행) + work_item registry 락
2. **Orphaned worktree**: `/구현` 후 사용자가 `/닫기` 안 부르고 세션 종료
   - 완화: `/start` 시 stale worktree (≥7d) prune 권고 (W-0268 §D 통합)
3. **State drift**: PR 머지됐는데 worktree 회수 안 함
   - 완화: post-merge hook (W-0267)이 work_item registry status update

### KPI 측정

- /구현 호출 시 fresh worktree 자동 생성 성공률 (목표 ≥ 99%)
- /닫기 호출 시 stash 누적 없이 종료 비율 (목표 100%)
- 세션당 manual `git worktree add` 횟수 (목표 0)

---

## Decisions

| ID | 결정 | 거절 |
|---|---|---|
| D1 | `/구현 W-####`은 design PR 머지 확인 후만 진행 | design 머지 무관 (✗ design-first 위반) |
| D2 | fresh worktree 자동 생성 + mutex 자동 | 사용자가 수동 (✗ 매번 같은 boilerplate, 실수 유발) |
| D3 | `/닫기`는 stash drop 전 confirm | 자동 drop (✗ 작업 손실 위험) |
| D4 | `--simple` 옵션으로 lifecycle 우회 가능 (≤20 lines chore) | 강제 4단계 (✗ overhead) |

## Open Questions

- [ ] Q1: `/구현 W-####`이 design PR 번호를 자동 추론할까, 사용자가 명시? (work_item ↔ design-PR 매핑)
- [ ] Q2: `/닫기` 시 `--keep-worktree` 옵션? (다음 세션에서 같은 worktree 재진입)

## Implementation Plan

1. `tools/lifecycle.sh` 작성 (lifecycle_implement / lifecycle_close)
2. `.claude/commands/구현.md` slash 등록
3. `.claude/commands/닫기.md` 기존 enhance (stash prune + lifecycle_close 호출)
4. 회귀 테스트: 기존 슬래시 (`/start /save /end`) 동작 확인
5. PR open

## Exit Criteria

- [ ] AC1: `/구현 W-####` 호출 시 fresh worktree 생성 + mutex + branch 진입 (1 명령으로)
- [ ] AC2: `/닫기` 호출 시 stash prune + worktree cleanup + handoff 자동 (1 명령으로)
- [ ] AC3: design PR 머지 안 된 상태에서 `/구현` 호출 시 stop + 안내
- [ ] AC4: 기존 슬래시 회귀 0
- [ ] AC5: PR diff: `.claude/commands/` 2 files + `tools/lifecycle.sh` 1 file (signature 변경 0)

## References

- 부모: W-0264 (PR #493) §A
- 선행: PR #487 W-0260 worktree registry, PR #491 multi-agent rule
- 후속: W-0266 (병렬), W-0267 (auto sync)
