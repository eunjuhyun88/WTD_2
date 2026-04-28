# WTD v2 Agent Router

Use this repository as a low-context AI research operating system.

## Canonical Read Order

1. `AGENTS.md`
2. `work/active/CURRENT.md`
3. `state/inventory.md` — tools, endpoints, commands 전체 목록
4. Relevant `work/active/*.md` listed in `CURRENT.md`
5. Relevant `docs/domains/*.md`
6. Relevant `docs/product/*.md`
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

## Work Mode

- Continue non-trivial work through `work/active/CURRENT.md` and the listed active work item, not chat history.
- Prefer domain docs and contracts over long legacy PRDs.
- Keep `app/` free of duplicated engine business logic.

## Design-First Loop

- Before acting on a non-trivial task, define the intended change in the active work item.
- Refresh `Goal`, `Scope`, `Non-Goals`, and `Exit Criteria` before implementation.
- Prefer contract/design clarification before runtime edits when boundaries may shift.
- Split mixed work into smaller change types instead of planning in chat and coding ad hoc.

## Context Discipline

- Re-anchor after switching folders, worktrees, or branches: re-read `AGENTS.md`, the active work item, and the relevant domain doc.
- Keep context intentionally small; load only the files required to act safely.
- Move durable findings, assumptions, and rejected hypotheses into the active work item tracked from `work/active/CURRENT.md`.
- Preserve source attribution for key decisions so another agent can continue without chat replay.

## Branch Naming — TARGET (auto-rename allowed)

PR 머지 전 도달해야 할 형태: `feat/{Issue-ID}-{slug}` 또는 `feat/{W-NNNN}-{slug}`.

Examples:
- `feat/F02-verdict-5cat`
- `feat/W-0260-agent-os-registry-overhaul`
- `feat/issue-442-meta-automation`
- `chore/cleanup-stale-branches`

### Auto-generated 이름 처리 (이중 worktree 방지)

Claude Code SDK / codex CLI는 자동으로 `claude/<random>`, `codex/<random>`, `worktree-agent-<hash>` 형식 worktree를 생성한다. 이 worktree에 진입한 경우:

1. **새 worktree를 또 만들지 말 것**. 이중 생성은 stale 누적의 주원인.
2. **단순 rename으로 충분**:
   ```bash
   git branch -m feat/{Issue-ID}-{slug}    # worktree는 그대로 유지
   ```
3. PR push 시점 전까지 rename하면 hook은 통과 (warning만 표시).
4. PR 본문에 `Closes #{Issue-ID}` 또는 work item ID 명시 → 추적 완료.

진입 시 Issue가 없으면 `/start` 출력의 P0 목록에서 픽업하거나 새 issue 생성 후 rename. `docs/live/feature-implementation-map.md`는 보조 매핑 — 진실 출처는 GitHub Issue + `state/worktrees.json` registry.

## Branch and Worktree Operating Rules

- **1 agent = 1 worktree = 1 branch = 1 issue**. 절대 섞지 말 것.
- Worktree 경로 자유 (`.claude/worktrees/<auto-name>/` 또는 `.claude/worktrees/feat-<ID>/`).
- 새 worktree 생성: `git worktree add .claude/worktrees/<slug> -b feat/<ID>-<desc> main`
  - 이미 worktree 안에 있으면 **rename**으로 처리. 새로 만들지 말 것.
- PR 머지 후 폐기: `git worktree remove <path>` + `tools/worktree-registry.sh remove`
- 자기 worktree 내부에서만 편집. 다른 agent의 worktree 절대 손대지 말 것.
- 명시적 승인 없이 push/merge 금지.
- 예상 외 diff 발견 시 진행 중단 + 사용자 확인.

## Worktree Registry — Single Source of Truth

`state/worktrees.json` 이 worktree 4축의 단일 진실 출처: `(path, branch, agent_id, issue, work_item, status, last_active)`.

자동 갱신:
- `/start` → 현재 worktree 자동 등록 (`agent_id`, `last_active`)
- `/claim --issue N` → issue/work_item 매핑 추가
- `/end` → `status=done` 표식 + branch push hint
- `tools/refresh_state.sh` → derived 필드(branch/ahead/modified/head_sha) 갱신

직접 조작:
```bash
tools/worktree-registry.sh get                    # 현재 worktree 매핑
tools/worktree-registry.sh list --mine            # 내 worktree들
tools/worktree-registry.sh list --orphan          # registry에는 있는데 git이 모르는 것
tools/worktree-registry.sh set work_item W-0260   # 임의 declared 필드
tools/worktree-registry.sh remove --path <P>      # registry entry만 제거
```

자동 stale sweep (24h+ idle → stale, 7d+ → 폐기 권장)은 **W-0263 Phase 4**에서 도입 예정. 현재는 수동 cleanup으로 충분 (Charter §Frozen 준수).

진실 우선순위 (충돌 시):
1. **GitHub Issue assignee** (CHARTER §Coordination — primary mutex)
2. **Worktree registry** (로컬 SSOT)
3. **live.sh heartbeat** (실시간 가시성)
4. ~~`spec/CONTRACTS.md` 텍스트 lock~~ (DEPRECATED — Phase 4에서 제거 예정)

## Branch-Thread Rules

- One thread maps to one active work item and one active execution branch.
- Do not create a new branch just because a new chat message arrived.
- Split commits first; split branches only for a new merge unit.
- If the branch changes but the work item does not, continue on the same thread after explicit confirmation.

## Multi-Agent Orchestration — MANDATORY

**Rule of thumb**: 한 에이전트 = 한 worktree = 한 branch. 다른 에이전트와 worktree를 절대 공유하지 않는다.

### Sub-agent 띄울 때 (Agent tool / Task)

병렬 sub-agent를 launch할 때는 **반드시 `isolation: "worktree"`** 옵션을 준다. 빠뜨리면 sub-agent가 main agent와 같은 working directory + HEAD + stash를 공유해서 git 상태가 섞인다.

실제 사고 사례 (2026-04-27 A045): W-0259 background agent를 같은 worktree에서 띄움 → main agent가 별도 W-0257+W-0258 commit 만들었지만 git checkout이 stash 충돌로 silent fail → 같은 W-0259 local branch 위에 commit 쌓임 → push가 꼬여 PR 분리에 reset --hard + reflog 복구 필요. 한 세션 30분 낭비.

```python
# ✅ CORRECT
Agent(
    description="...",
    subagent_type="general-purpose",
    isolation="worktree",      # ← 필수
    run_in_background=true,    # 병렬일 때만
    prompt="..."
)

# ❌ WRONG — 같은 worktree 공유, race condition
Agent(
    subagent_type="general-purpose",
    run_in_background=true,
    prompt="..."
)
```

### 병렬 작업 분배 원칙

병렬로 띄우기 **전에** 파일 충돌 매트릭스 작성:

| Sub-agent | 변경 파일 / 디렉토리 | 다른 sub-agent와 disjoint? |
|---|---|---|
| Agent A | `engine/X/` (신규) | ✅ |
| Agent B | `engine/Y.py` (PromotionGatePolicy 확장) | ✅ disjoint with A |
| Agent C | `engine/Y.py` (다른 클래스) | ⚠️ B와 같은 파일 → 순차 권고 |

같은 파일을 동시 수정하는 sub-agent는 띄우지 않는다. axis가 달라도 git merge conflict가 발생함.

### Main agent의 역할 (오케스트레이터)

Sub-agent 작업 중 main agent는:
- **코드 변경 금지** (sub-agent들이 작업 중인 파일을 main이 동시 수정하면 락 충돌)
- 가능한 작업: PR 검토, 다른 worktree에서 docs 작업, 사용자 보고
- Sub-agent 완료 알림 받으면 → 결과 검증 → main 머지 → 다음 work item 분배

### Worktree 회수

`isolation: "worktree"`로 만든 임시 worktree는 sub-agent 변경 없으면 자동 cleanup. 변경 있으면 worktree path + branch 반환됨 → main이 PR 머지 후 `git worktree remove` + branch 삭제 + `tools/worktree-registry.sh remove`.

이 룰 위반 = git 상태 섞임 + 시간 낭비. 작업 시작 전 반드시 확인.

## Vercel Deploy Guardrail

- Treat Vercel production deploy as a dedicated release lane, not as a side-effect of agent branches.
- Do not route Vercel auto-deploy through `main`, `master`, `claude/*`, or `codex/*`.
- For `app/`, reconnect Git deploys only after `app/vercel.json` contains branch deployment guardrails and Vercel production is reassigned to `release`.
- If that remote setup is not confirmed, assume manual `vercel deploy --prod` is the safe path.
