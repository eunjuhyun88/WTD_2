# AGENTS

Execution rules for humans and coding agents.

> **읽기 순서**: CLAUDE.md §Canonical Read Order 6단계 준수. 도메인 게이트·브랜치·Canonical Docs: CLAUDE.md 참조.

---

## 에이전트 락 테이블 — Files 컬럼

새 탭 시작 시: `./tools/file-lock-check.sh [파일명...]` → 충돌 확인 필수.
등록 형식: `| W-XXXX | {agent} | {worktree} | {file1.ts, file2.svelte} | 🔴 진행중 |`
PR 머지 후 행 삭제. 상세: `docs/runbooks/parallel-agent-file-isolation.md`

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
