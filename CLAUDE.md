# WTD v2 Agent Router

Use this repository as a low-context AI research operating system.

## 도메인 분기 (작업 유형별 추가 로드)

| 작업 유형 | 추가 로드 파일 |
|---|---|
| `engine/` 수정 / pytest | `agents/engine.md` |
| `app/src/` 수정 / Svelte | `agents/app.md` |
| worktree · PR · 머지 · 멀티 에이전트 | `agents/coordination.md` |

## Canonical Read Order

1. `AGENTS.md`
2. `work/active/CURRENT.md`
3. 도메인 sub-file (`agents/engine.md` or `agents/app.md` — 작업 유형 기준)
4. `state/inventory.md` — tools, endpoints, commands 전체 목록
5. Relevant `work/active/*.md` listed in `CURRENT.md`
6. Relevant `docs/domains/*.md`
7. Minimal required code files

## Canonical Truth

- Backend truth: `engine/`
- Surface and orchestration: `app/`
- Current product truth: `docs/product/*.md`
- Domain maps: `docs/domains/*.md`
- Decisions: `docs/decisions/*.md`
- Runbooks: `docs/runbooks/*.md`

## Default Exclude Scope

Do not read these unless explicitly required:

- `.claude/`
- `.git/`
- `app/node_modules/`
- `app/build/`
- `app/.svelte-kit/`
- `engine/.venv/`
- `engine/data_cache/cache/`
- `docs/archive/`
- `app/docs/COGOCHI.md`
- `app/docs/generated/`
- `app/_archive/`
- `**/__pycache__/`
- `**/.pytest_cache/`

## Branch Naming

Target: `feat/{Issue-ID}-{slug}` 또는 `feat/{W-NNNN}-{slug}`.

Auto-generated `claude/*`, `codex/*` → `git branch -m feat/{ID}-{slug}` rename만. 새 worktree 생성 금지.

상세 규칙: `agents/coordination.md`
