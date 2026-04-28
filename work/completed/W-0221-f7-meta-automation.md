# W-0221 — F-7 Meta Automation (PR-1: pre-commit unknown-agent gate)

> **Source of truth**: PRD v2.2 §8 P0 F-7 (1.5일) + W-0220 PRD master
> **Author**: A026 (CTO + AI Researcher hat, 2026-04-26)
> **Base SHA**: 67fe3164

---

## Goal

PR #354에서 노출된 silent failure를 git pre-commit invariant로 차단:
**`state/current_agent.txt = "unknown"`인 채 commit → per-agent jsonl 손실** (A009~A016 8 에이전트 11 entries 사후 backfill됨)

**해결 원칙**: 새 시스템 빌드 X. **기존 `.githooks/` 인프라에 pre-commit 1개 추가.**

## Source

- `spec/CHARTER.md` — 메타도구 추가 개발 freeze. git hook 수준 자동화는 야크쉐이빙 아님 (PRD v2.2 §8 P0 명시).
- `docs/live/W-0220-product-prd-master.md` §8 P0 F-7 — "메타 자동화 — CURRENT.md SHA post-merge hook + worktree ≤10 cron, 1.5일"
- PR #354 (`fix(agent-os): end.sh fail-fast + A009-A016 jsonl recovery`) — silent loss 사후 발견.
- 사용자 (A026 세션): "에이전트 여러개 돌리는데 계속 충돌함, 서로 뭐하는지도 모르자나"

## 기존 인프라 발견 (계획 축소 사유)

이 PR을 시작하며 발견:

| 컴포넌트 | 상태 | 책임 |
|---|---|---|
| `.githooks/post-merge` | ✅ 이미 있음 | `tools/refresh_state.sh --quiet` 호출 |
| `.githooks/pre-push` | ✅ 이미 있음 | `claude/*`, `codex/*` 차단 + design invariant 검증 |
| `core.hooksPath = .githooks` | ✅ 설정됨 | `.git/hooks/`가 아닌 tracked `.githooks/` 사용 |
| `app/scripts/dev/install-git-hooks.sh` | ✅ 이미 있음 | 1회 활성화 스크립트 |

→ 진짜 갭: **`.githooks/pre-commit`만 누락**. 다른 건 이미 있음.

→ 계획에서 `tools/install_hooks.sh`, `tools/hooks/post-merge.sh` 제거. 기존 install 스크립트만 1줄 (`chmod +x .githooks/pre-commit`) 추가.

## Owner

meta — `.githooks/`, `app/scripts/dev/install-git-hooks.sh`, `work/active/W-0221-*` 도메인 lock

## Scope

### PR-1 (이 PR, S size, ½일)

| 파일 | 종류 | 책임 |
|---|---|---|
| `.githooks/pre-commit` | 신규 | `state/current_agent.txt = unknown`이면 거절. memory/state/.githooks staged-only는 예외 |
| `app/scripts/dev/install-git-hooks.sh` | 1줄 추가 | `chmod +x .githooks/pre-commit` |
| `AGENTS.md` | 1줄 보강 | install 명령 경로 명시 (`bash app/scripts/dev/install-git-hooks.sh`) |
| `work/active/W-0221-f7-meta-automation.md` | 신규 | 본 문서 |
| `docs/live/W-0220-*.md` (3개) | 신규 (병행 commit) | PRD v2.2 master + telegram refs + status checklist canonical 저장 (사용자 요청) |

### PR-2 (다음 세션, M size, 1일)

- `.githooks/post-merge` 보강 — `tools/mk.sh log "merge-sync"` 호출 추가 (PR 머지 history 자동 기록)
- `tools/worktree_cleanup.sh` — worktree ≤10 안내 (자동 삭제 X, 안내만)
- `.github/workflows/issue-status-sync.yml` — PR merged → linked issue close → Project #3 status=Done
- `.githooks/pre-push` 보강 검토 — A### + W-#### 표기 권고

## Non-Goals

- 새 slash command 추가 (Charter freeze)
- MemKraft v2 / 새 메모리 도구 (Charter freeze)
- 멀티 에이전트 dispatcher (Charter freeze)
- pre-commit이 hard fail 만들기 — 메모리/상태 sync는 unknown 상태에서도 통과해야 함 (chicken-and-egg 회피)
- `.git/hooks/` 별도 시스템 만들기 (이미 `.githooks/`로 통일됨)
- 자동 worktree 삭제 (rm 위험)
- CI에서 hook 강제 (각 dev machine 책임)

## Canonical Files

- `.githooks/pre-commit` (새, tracked)
- `.githooks/post-merge` (기존, PR-2에서 보강 검토)
- `.githooks/pre-push` (기존, 변경 없음)
- `app/scripts/dev/install-git-hooks.sh` (1줄 추가)
- `state/current_agent.txt` (gate 체크 대상)
- `tools/refresh_state.sh` (기존 post-merge가 호출)
- `tools/mk.sh` (기존, PR-2에서 post-merge 추가 호출)

## Facts

1. `core.hooksPath = .githooks` 가 이미 git config로 설정됨 → `.git/hooks/`는 무시됨.
2. 모든 worktree는 git common dir의 hooks 설정을 공유 → 1회 install로 모든 worktree에 적용.
3. `tools/refresh_state.sh`는 main SHA + open PR + worktrees를 state/*.json으로 자동 생성.
4. `tools/end.sh`는 PR #354에서 fail-fast 패치됨 (unknown agent 거절). pre-commit은 그 앞단 방어.
5. CHARTER `claim.sh`의 NONGOAL_REGEX 매칭에 git hook 수준 자동화는 매칭 안 됨.
6. **branch naming**: 기존 `.githooks/pre-push`가 `claude/*`, `codex/*`를 차단하고 `^(main|release|feat/|chore/|docs/|fix/|automation/|hotfix/)` 만 허용 → 본 PR은 `automation/w-0221-f7-meta-automation` 사용 (rename 필수).

## Assumptions

1. dev machine은 macOS/Linux bash. Windows는 git-bash 가정.
2. `app/scripts/dev/install-git-hooks.sh`를 worktree 들어올 때 1회 실행하는 패턴 유지.
3. memory/state/.githooks staged-only commit은 unknown 허용 — 자동 메모리 sync 차단 X.

## Open Questions

- pre-commit 화이트리스트에 추가할 path 더 있는지 (예: `automation/*` agent prefixed 메시지). PR 리뷰에서 결정.
- post-merge에 mk.log_event 추가는 PR-2로 미뤄둠 (mk.sh 설정 검증 필요).

## Decisions

- **D1**: pre-commit 1개만 추가. post-merge/pre-push 기존 사용. 새 시스템 X.
- **D2**: 화이트리스트에 `.githooks/*` 포함 — install 스크립트 자체가 unknown 상태에서 동작 가능해야 chicken-and-egg 회피.
- **D3**: pre-commit 거절 시 main repo 경로를 안내 문구에 명시 (worktree 안에서 cd 위치 헷갈림 방지).
- **D4**: 브랜치 이름 `automation/w-0221-f7-meta-automation` — 기존 pre-push 정책 준수. `claude/*`는 push 막힘.

## Next Steps (이 세션)

1. ~~`tools/hooks/`, `tools/install_hooks.sh` 삭제~~ ✅
2. ~~`.githooks/pre-commit` 작성 + chmod +x~~ ✅
3. ~~`app/scripts/dev/install-git-hooks.sh` 1줄 추가~~ ✅
4. ~~AGENTS.md install 경로 명시~~ ✅
5. 브랜치 rename: `claude/w-0221-f7-meta-automation` → `automation/w-0221-f7-meta-automation`
6. pre-commit 동작 테스트 (unknown 거절 + 정상 통과 + 화이트리스트 통과)
7. Commit (분리: hooks PR + docs canonicalize PR — 같은 브랜치 2 commit)
8. Push + PR open

## Exit Criteria (PR-1)

- [x] `.githooks/pre-commit` 존재 + 실행권한
- [x] `app/scripts/dev/install-git-hooks.sh`에 pre-commit chmod 추가
- [x] AGENTS.md install 경로 안내 1줄
- [ ] `state/current_agent.txt = "unknown"` 상태에서 commit → 거절
- [ ] `state/current_agent.txt = "A026"` 상태에서 commit → 통과
- [ ] memory/sessions/ staged-only commit은 unknown 상태에서도 통과
- [ ] PR open + base=main + head=`automation/w-0221-f7-meta-automation`

## Branch

`automation/w-0221-f7-meta-automation` (worktree: `.claude/worktrees/w-0221-f7`, base: main 67fe3164)

## Status

IN PROGRESS — A026 — 2026-04-26

## Handoff Checklist

- active work item: `work/active/W-0221-f7-meta-automation.md`
- branch/worktree: `automation/w-0221-f7-meta-automation` @ `.claude/worktrees/w-0221-f7`
- verification: pre-commit 4-state 검증 (unknown reject / known pass / memory pass / hooks pass)
- remaining: PR-2 (post-merge mk.log + worktree cron + GitHub Actions issue-status-sync)
