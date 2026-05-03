# AGENTS

Execution rules for humans and coding agents.

> **읽기 순서**: CLAUDE.md §Canonical Read Order 6단계 준수. 도메인 게이트·브랜치·Canonical Docs: CLAUDE.md 참조.

---

## 에이전트 격리 룰 (W-1004)

**파일 소유권** — 작업 시작 시 반드시 claim:
```bash
tools/own.sh claim <file1> <file2> ...   # 내 파일 선언
tools/own.sh list                         # 전체 claim 확인
tools/own.sh release <file>              # PR 머지 후 해제
```
- 타인 소유 파일 staged → `pre-commit`이 **자동 차단**
- 긴급 우회: `--override-owner` → `state/ownership-overrides.jsonl` 감사 기록
- TTL 24h 자동 만료

**PR 머지** — `gh pr merge` 직접 호출 **금지**. 반드시 wrapper 사용:
```bash
tools/pr-merge-guard.sh <PR번호> --squash   # 본인 PR만 통과
tools/pr-merge-guard.sh <PR번호> --admin    # 긴급 override (감사 로그)
```

**에이전트 간 소통** — `state/agent-inbox/{agent}.jsonl` 기반 비동기 메시지:
```bash
tools/agent-message.sh send <agent> <subject> <body>
tools/agent-message.sh list --unread
tools/agent-message.sh read <id>
```
시작 시 unread 확인 필수. 상세: `agents/coordination.md`

---

## 에이전트 락 테이블 — Files 컬럼

새 탭 시작 시: `./tools/own.sh list` + `./tools/file-lock-check.sh [파일명...]` → 충돌 확인 필수.
등록 형식: `| W-XXXX | {agent} | {worktree} | {file1.ts, file2.svelte} | 🔴 진행중 |`
PR 머지 후 행 삭제 + `tools/own.sh release <files>`. 상세: `docs/runbooks/parallel-agent-file-isolation.md`

### 조건부 로드 (필요 시만)
- `work/active/PRODUCT-DESIGN-PAGES-V2.md` — cogochi/ UX 변경 시
- `docs/live/PRD.md` — 전체 요구사항 확인 시
- `state/inventory.md` — tools/endpoints 전체 (자동생성, 수동 편집 금지)

---

## Core Rules

1. `engine/` is the only backend truth.
2. `app/` is surface + orchestration only.
3. Contracts define app-engine coupling.
4. Work continues via `work/active/*.md`, not chat history.

## Bootstrap (Multi-Agent OS v2 + MemKraft)

**처음 worktree 들어올 때 1회**: `bash app/scripts/dev/install-git-hooks.sh` — `core.hooksPath=.githooks` 활성화.

세션 흐름: `./tools/start.sh` → `./tools/claim.sh "engine/X, app/Y"` → `./tools/save.sh "할 일"` → `./tools/end.sh "PR #N" "handoff"`

MemKraft 커맨드: `/start` `/save` `/end` `/claim` `/decision` `/incident` `/open-loops` `/search` `/컨텍스트`

⚠️ `memory/` (프로젝트 루트) ≠ `~/.claude/projects/.../memory/` (Claude Code 자동 메모리). MemKraft CLI: `./tools/mk.sh`만. worktree→main 절대경로: `/Users/ej/Projects/wtd-v2/`.

Worktree Registry: `state/worktrees.json`. Branch: `feat/{Issue-ID}-{slug}`. 상세: `agents/coordination.md`.

## 회귀 가드

- `post-edit-pytest.sh`: engine `test_*.py` 수정 시 자동 pytest
- `tools/cycle-smoke.py`: PR 전 수동 (`cd engine && uv run python ../tools/cycle-smoke.py`)

## Verification Minimum

Engine: pytest. App: `npm --prefix app run check`. Contract: route + caller/callee shapes.

---

## Memory Protocol (MemKraft)

MemKraft v2.0.0, wrapper: `./tools/mk.sh`. 패턴: `evidence_first` → `log_event` → `decision_record(tags=[...])`. Tier: core/recall/archival.
