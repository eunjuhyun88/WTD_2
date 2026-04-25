# AGENTS

Execution rules for humans and coding agents.

## Core Rules

1. `engine/` is the only backend truth.
2. `app/` is surface + orchestration only.
3. Contracts define app-engine coupling.
4. Work continues via `work/active/*.md`, not chat history.

## Default Read Scope

Read in this order:

1. `AGENTS.md`
2. `work/active/CURRENT.md`
3. Relevant `work/active/*.md` listed in `CURRENT.md`
4. Relevant `docs/domains/*.md`
5. Relevant `docs/product/*.md`
6. Minimal required code files

## Context Routing

- Load only the minimum pack required for the active work item.
- Default pack = `AGENTS.md` + one active work item + one relevant domain doc + minimum code files.
- Expand context only when the default pack cannot support the next action safely.
- Use owner and primary change type to keep the default pack narrow.
- Expand packs by need:
  - `app` pack: active work item + relevant product/domain docs + touched app files
  - `engine` pack: active work item + relevant domain docs + touched engine files/tests
  - `contract` pack: active work item + contract/domain docs + route/type boundaries
  - `research` pack: active work item + product/domain docs + experiment/eval references
- Prefer previews, indexes, or briefs before full docs, catalogs, or memory outputs.
- Keep heavy lanes such as memory tooling, broad runbooks, and unrelated domains late-bound.

## Default Exclude Scope

Do not read these unless explicitly required:

- `app/node_modules/`
- `app/build/`
- `app/.svelte-kit/`
- `engine/.venv/`
- `**/__pycache__/`
- `**/.pytest_cache/`
- `docs/archive/`
- `app/_archive/`
- `docs/generated/`

## Work Item Discipline

Every non-trivial task must have one active work item:

- Path: `work/active/W-xxxx-<slug>.md`
- `work/active/CURRENT.md` is the live index. Baseline validation applies to the work items listed under `## 활성 Work Items`.
- Work items not listed in `CURRENT.md` may remain in `work/active/` as checkpoint or parking notes, but they are reference-only until promoted into `CURRENT.md`.
- Required sections: Goal, Owner, Scope, Non-Goals, Canonical Files, Facts, Assumptions, Open Questions, Decisions, Next Steps, Exit Criteria, Handoff Checklist
- Keep one owner per work item: `engine`, `app`, `contract`, or `research`
- Budget:
  - Facts `3-5`
  - Assumptions `0-3`
  - Open Questions `0-3`
  - Next Steps `1-3`

## Execution Loop

1. Reconstruct context from canonical files before acting.
2. Write or refresh the intended design in the active work item before non-trivial edits.
3. Separate facts, assumptions, decisions, and open questions.
4. Confirm owner, change type, canonical files, and verification plan before acting.
5. Prefer small reversible changes and one primary change type per PR.
6. If scope, blockers, hypotheses, or branch intent change, update the work item first.

## Branch and Merge Rules

- Never commit directly on `main`; use task branches only.
- Default execution unit = one thread, one active work item, one execution branch, one worktree.
- New chat messages do not justify new branches.
- Prefer commit splitting before branch splitting.
- Create a new branch only for a new work item, a user-requested isolated PR scope, or when one clean PR is otherwise impossible.
- Start each execution branch in a dedicated worktree.
- Keep one execution branch per active agent/task unless the user explicitly approves parallel ownership.
- Record branch-split reasons in the active work item before branching.
- Merge via PR only after user approval; no direct push-to-main flow.
- Before merge, pass the minimum gate: clean `git status`, scoped tests/checks, and conflict review.
- If unexpected file changes appear, stop and confirm scope before committing.

## Vercel Deploy Rules

- `main`, `master`, and agent branches such as `claude/*` or `codex/*` must not be used as Vercel auto-deploy branches.
- If Git-based Vercel deploys are enabled for `app/`, use a dedicated `release` branch as the only production branch.
- Reconnect Vercel Git auto-deploy only after repo-level branch guardrails are present in `app/vercel.json`.
- Until that guardrail and branch split are in place, prefer manual app deploys from `app/` via Vercel CLI.

## Multi-Agent Handoff

- Split multiple agents by work item or merge unit, not arbitrary file subsets.
- Every handoff must name active work item, active branch, verification status, and remaining blockers.
- Tasks must be restartable from files, not from private reasoning or chat residue.
- Update `Decisions` and `Next Steps` when plan, blocker, or boundary changes materially.
- Record rejected paths or failed hypotheses when they affect future execution.

## Context Hygiene

- Do not use chat as plan storage; durable intent belongs in `work/active/*.md`.
- Replace or delete stale bullets instead of appending history.
- Keep only the latest valid state in active work items; historical detail belongs in commits, ADRs, or archive docs.
- Saved context artifacts default to compact output unless full verbosity is explicitly requested.
- Any future `file-back` automation must compact current state, not append history.

## Agent Execution Protocol

Every agent execution follows these checkpoints:

### Before Starting Work

```python
mk.evidence_first("keyword")  # Search memory/docs for prior related work
```

Find and review:
- Related work items (active or archived)
- Prior decisions or rejected hypotheses
- Domain context or product requirements
- Blockers or escalations

### After Merging PR

```python
mk.log_event(
    title="W-xxxx feature landed",
    details="commit abc1234, PR #nnn",
    tags=["w-xxxx", "merged"]
)
# Update CURRENT.md: change main SHA, record completion
```

Update `work/active/CURRENT.md`:
- New `main SHA` value
- Move work item from active to completed
- Record any new blockers or deferred work

### When Making Architecture Decisions

```python
mk.decision_record(
    what="use FeatureWindowStore for search corpus",
    why="3→40+ dims, batch enrichment, OI/funding 2x weight",
    how="Layer A upgrade: feature_snapshot first, then batch load"
)
# Create or update ADR in `docs/decisions/`
```

Record in `docs/decisions/NNNN-<slug>.md`:
- What is the decision?
- Why now? (constraints, alternatives, trade-offs)
- How will we verify it worked?

### During CI Failures or Production Incidents

```python
mk.incident_record(
    title="main CI: 8 test failures (PR #256 collision)",
    symptoms="multi-agent track collision, migration 021 state",
    resolution="merge --ours, add worker concurrency guards"
)
# Create incident record in `docs/incidents/` + notify handoff
```

Record in `docs/incidents/YYYY-MM-DD-<slug>.md`:
- When and what happened?
- Root cause analysis
- Remediation steps
- Prevention for next time

---

## Change Type Tags

Each PR/change should be one primary type:

- Product surface change
- Engine logic change
- Contract change
- Research or eval change

Avoid mixing types in one change set when possible.

## Verification Minimum

- Engine changes: run targeted engine tests first, then broader suite if needed.
- App changes: run app check/lint relevant to touched area.
- Contract changes: validate both route and engine caller/callee shapes.

## Canonical Docs

- Product: `docs/product/*.md`
- Domains: `docs/domains/*.md`
- Decisions: `docs/decisions/*.md`
- Runbooks: `docs/runbooks/*.md`

---

<!-- MEMKRAFT-BLOCK-START (v2.0.0) -->
## Memory Protocol (MemKraft)

MemKraft v2.0.0 is installed. Base dir: `memory/` (project root).

```python
from memory.mk import mk
```

### 작업 시작 전 — evidence_first (필수)

비자명한 작업을 시작하기 전에 반드시 과거 결정·장애를 조회한다.

```python
evidence = mk.evidence_first("관련 키워드")
# decisions + incidents + entities 통합 조회
```

### 작업 완료 후 — log_event (필수)

PR 머지, 배포, 주요 완료 시 반드시 기록한다. CURRENT.md main SHA도 함께 업데이트.

```python
mk.log_event(
    "PR #NNN merged: {한줄요약}",
    tags="pr,merge,{work_id}",
    importance="high",
)
```

### 아키텍처 결정 — decision_record

non-trivial 설계 선택(라이브러리 도입, 구조 변경, 정책 결정) 시 기록.

```python
mk.decision_record(
    what="결정 내용",
    why="이유",
    how="구현 방법",
    tags="domain,work_id",
)
```

### 장애/실패 — incident_record

CI 실패, 프로덕션 장애, 데이터 손실 시 기록.

```python
mk.incident_record(
    title="무엇이 깨졌는가",
    symptoms=["증상1", "증상2"],
    severity="medium",  # low | medium | high | critical
)
```

### Tier 규칙

- `core` — 현재 활성 결정, 반복 참조하는 엔티티
- `recall` — 최근 완료된 작업, 일시적 메모
- `archival` — 히스토리 보존용

```python
mk.tier_set("entity-slug", tier="core")
```

### 검색

```python
mk.search("키워드")           # hybrid: exact + IDF + fuzzy
mk.evidence_first("키워드")   # decisions + incidents + memory 통합
```

### Gotchas

- Tier: `core` / `recall` / `archival` only (`critical` ❌)
- `log_event` 후 CURRENT.md main SHA 업데이트 함께
- 과거 기억 조회 시 `grep` 전에 `mk.search()` 먼저
<!-- MEMKRAFT-BLOCK-END -->
