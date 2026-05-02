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
3. **`spec/NAMING.md`** — 이름 계약서 (**skip 금지**: 미확인 시 merge conflict 발생. W-0374 사례)
4. 도메인 sub-file (`agents/engine.md` or `agents/app.md` — 작업 유형 기준)
5. `state/inventory.md` — tools, endpoints, commands 전체 목록
6. Relevant `work/active/*.md` listed in `CURRENT.md`
7. Relevant `docs/domains/*.md`
8. Minimal required code files

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

## Task Delegation (Token Budget)

작업은 가능한 한 subagent로 위임하고, 작업이 감당 가능한 가장 저렴한 모델을 선택한다.

| 모델 | 용도 |
|---|---|
| Haiku | 단순 반복 / 기계적 작업, 판단 불필요 (이름 바꾸기, 일괄 패턴 치환, 파일 목록 수집 등) |
| Sonnet | 범위가 정해진 리서치, 코드 탐색, 정리·요약 |
| Opus | 진짜 기획·트레이드오프 판단이 필요한 경우에만 |

**Spawn 제한**

- Haiku는 추가 subagent를 spawn하지 않는다. 더 잘게 쪼개야 한다면 작업 사이즈가 잘못된 것이다.
- 최대 spawn depth = 2 (parent → subagent → one more tier).
- subagent가 더 똑똑한 모델이 필요하다고 판단하면 스스로 escalate하지 말고 parent에게 결과를 돌려준다.

## Preferred Tools (Cost-First)

같은 결과를 낸다면 항상 더 싼/가벼운 도구를 먼저 고른다.

- **공개 페이지** → `WebFetch` (free, text-only)
- **동적 페이지 / 인증벽** → `agent-browser` CLI (스크린샷 기반 도구 대비 토큰 ~82% 절감)
- **PDF** → `pdftotext` (Read 도구 대신)
- 같은 패턴으로 반복 fetch가 보이면 재사용 가능한 도구로 묶어달라고 요청한다.
