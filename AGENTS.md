# AGENTS

Execution rules for humans and coding agents.

## Core Rules

1. `engine/` is the only backend truth.
2. `app/` is surface + orchestration only.
3. Contracts define app-engine coupling.
4. Work continues via `work/active/*.md`, not chat history.

## Bootstrap (Multi-Agent OS v2 + MemKraft)

**처음 worktree 들어올 때 1회**: `bash app/scripts/dev/install-git-hooks.sh` — `core.hooksPath=.githooks` 활성화.

세션 흐름:
```bash
./tools/start.sh                                      # 또는 /start
./tools/claim.sh "engine/X, app/Y"                    # 또는 /claim "..."
./tools/save.sh "다음에 할 일"                          # 또는 /save "..."
./tools/end.sh "PR #N" "handoff" [lesson]             # 또는 /end ...
```

`/start`가 자동: Agent ID 발번, `state/` 갱신, memkraft 통합, 직전 handoff 표시.

### MemKraft 슬래시 커맨드

| 슬래시 | 기능 |
|---|---|
| `/start` | 세션 시작 |
| `/save` | 중간 체크포인트 |
| `/end` | 세션 종료 |
| `/claim` | 영역 lock + Issue mutex |
| `/decision` | 결정 기록 |
| `/incident` | 사고 기록 |
| `/open-loops` | 미해결 항목 |
| `/search` | 메모리 검색 |
| `/컨텍스트` | On-demand Context Pack |

### ⚠️ 경로 혼동 주의

| 경로 | 정체 |
|---|---|
| `memory/` (프로젝트 루트) | 프로젝트 메모리 (MemKraft) |
| `~/.claude/projects/.../memory/` | Claude Code 자동 메모리 (별개) |

- 모든 MemKraft CLI: `./tools/mk.sh`로 실행 (전역 `memkraft` 금지)
- worktree 내에서 메인 파일 필요 시: `/Users/ej/Projects/wtd-v2/` 절대경로

### Worktree Registry

`state/worktrees.json` — 4축 SSOT: `(path, branch, agent_id, issue, work_item, status, last_active)`. 자세한 운영: `agents/coordination.md`.

### Branch 명명

`feat/{Issue-ID}-{slug}` 또는 `chore/{slug}`. Auto-generated 브랜치는 rename으로 처리. 자세한 룰: `agents/coordination.md`.

## Context Routing

- Default pack = `AGENTS.md` + one active work item + one domain doc + minimum code files.
- Expand only when default pack cannot support the next action safely.

### /컨텍스트 — On-demand Context Pack

```
/컨텍스트 "V-PV-01 구현"      # engine 도메인, W-0298 work item
/컨텍스트 W-0299               # work item 직접 지정
/컨텍스트 "차트 그리기 툴"     # app 도메인
```

Pack: Work Item (Goal+Scope+AC) + Domain sub-file + 코드 (serena → git grep) + Domain Doc + Memory.

## Work Item Discipline

Every non-trivial task must have one active work item (`work/active/W-xxxx-<slug>.md`).

Required sections: Goal, Owner, Scope, Non-Goals, Canonical Files, Facts, Assumptions, Open Questions, Decisions, Next Steps, Exit Criteria, Handoff Checklist.

Budget: Facts `3-5`, Assumptions `0-3`, Open Questions `0-3`, Next Steps `1-3`.

## Execution Loop

1. Reconstruct context from canonical files before acting.
2. Write or refresh design in the active work item before non-trivial edits.
3. Confirm owner, change type, canonical files, and verification plan before acting.
4. Prefer small reversible changes and one primary change type per PR.
5. If scope or blockers change, update the work item first.

## Branch and Merge Rules

- Never commit directly on `main`; use task branches only.
- One thread = one active work item = one branch = one worktree.
- Merge via PR only after user approval.
- Before merge: clean `git status`, scoped tests, conflict review.

## Vercel Deploy Rules

- `main`, `master`, `claude/*`, `codex/*` must not be Vercel auto-deploy branches.
- Use dedicated `release` branch for production if Git auto-deploy is enabled.
- Until branch guardrails are in place: manual `vercel deploy --prod` from `app/`.

## 회귀 가드

| 도구 | 트리거 | 효과 |
|---|---|---|
| `.claude/hooks/post-edit-pytest.sh` | engine `test_*.py` Write/Edit | 자동 pytest |
| `tools/cycle-smoke.py` | PR 머지 전 수동 | 1사이클 5 AC 검증 |

```bash
cd engine && uv run python ../tools/cycle-smoke.py
```

## Verification Minimum

- Engine: targeted engine tests first.
- App: `npm --prefix app run check`.
- Contract: validate route + caller/callee shapes.

## Canonical Docs

- Product: `docs/product/*.md`
- Domains: `docs/domains/*.md`
- Decisions: `docs/decisions/*.md`
- Runbooks: `docs/runbooks/*.md`

---

<!-- MEMKRAFT-BLOCK-START (v2.0.0) -->
## Memory Protocol (MemKraft)

MemKraft v2.0.0, base dir: `memory/`, wrapper: `./tools/mk.sh`.

```python
from memory.mk import mk
```

### 필수 호출 패턴

```python
# 작업 시작 전 — 과거 결정·장애 조회 (필수)
mk.evidence_first("관련 키워드")

# 완료 후 — PR 머지, 배포, 주요 완료 시
mk.log_event("PR #N merged: 한줄요약", tags="pr,merge,w-xxxx", importance="high")

# 설계 결정
mk.decision_record(what="결정", why="이유", how="방법", tags=["domain", "w-id"])

# 장애 기록
mk.incident_record(title="무엇이 깨졌나", symptoms=["증상1"], severity="medium")
```

### Tier 및 검색

Tier: `core` / `recall` / `archival`. `mk.tier_set("slug", tier="core")`.

```python
mk.search("키워드")           # hybrid 검색
mk.evidence_first("키워드")   # decisions + incidents 통합
```

### Gotchas

- `decision_record(tags=[...])` 리스트 사용 (문자열 ❌)
- `log_event` 후 CURRENT.md main SHA 업데이트
- `work/active/AGENT-HANDOFF-*.md` 금지
- Tier: `critical` ❌ (core/recall/archival only)
<!-- MEMKRAFT-BLOCK-END -->
