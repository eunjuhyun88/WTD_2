# STOCKCLAW Multi-Agent Memory Layout

Purpose:
- keep `frontend/` as the canonical implementation repo
- let multiple worktrees share memory without writing over each other
- separate project truth, agent memory, and runtime relay

Status:
- active
- adopted on 2026-03-17

## 1. Boundary Rule

There are three different sources of truth:

1. Repo truth
   - path: `/Users/ej/Downloads/maxidoge-clones/frontend`
   - contains code, canonical docs, specs, decisions, and generated maps
2. Agent memory
   - path: `/Users/ej/Downloads/maxidoge-clones/.memento/memories/*`
   - contains per-agent durable notes, working preferences, and role memory
3. Runtime relay
   - path: `/Users/ej/Downloads/maxidoge-clones/.memento/runtime/stockclaw`
   - contains cross-agent relay, retrieval, distill, and handoff inbox material

Non-negotiable rule:

`frontend/` remains the only canonical implementation target.

## 2. Current Shared Layout

```text
/Users/ej/Downloads/maxidoge-clones/
  frontend/                           # canonical repo
  frontend-pr-home-entry/             # worktree
  .wt-passport-learning-panel/        # worktree
  .wt-passport-learning-merge/        # worktree
  .memento/
    memories/
      planner/
      implementer-ui/
      implementer-systems/
      reviewer/
    runtime/
      stockclaw/
        relay/
        retrieval/
        distill/
        handoff-inbox/
    registry/
      stockclaw-memory-map.md
```

## 3. Agent Roles

### planner
- owner of execution plans, page/file routing, dependency order
- canonical repo writes:
  - `docs/exec-plans/active/`
  - `docs/task-contracts/active/`
  - `docs/handoffs/`
  - `docs/decisions/`

### implementer-ui
- owner of home, navigation, route surfaces, Svelte UI shell, responsive behavior
- canonical repo writes:
  - `src/routes/`
  - `src/components/layout/`
  - `src/components/home/`
  - `src/components/shared/`

### implementer-systems
- owner of state, stores, APIs, arena/terminal/passport domain logic, contracts
- canonical repo writes:
  - `src/lib/`
  - `src/routes/api/`
  - `db/`
  - `supabase/`

### reviewer
- owner of correctness, boundary drift, integration risk, release readiness
- canonical repo writes:
  - `docs/handoffs/`
  - `.agent-context/`
  - review-only notes or findings docs

## 4. Collaboration Flow

For any non-trivial task:

1. Read `README.md`, `AGENTS.md`, `docs/README.md`, and this file.
2. Confirm worktree and branch scope.
3. Check path ownership before editing.
4. If the task changes architecture or product semantics, add or update a decision record under `docs/decisions/`.
5. If the task spans multiple agents, leave a handoff artifact under `docs/handoffs/`.
6. Save runtime checkpoint or claim artifacts under `.agent-context/`.
7. Keep durable personal notes in the correct `.memento/memories/<agent>/` folder, not in repo docs.

## 5. What Goes Where

Use `frontend/docs/decisions/` for:
- architecture choices
- IA decisions
- ownership boundary changes
- route naming changes
- merge strategy decisions

Use `frontend/docs/handoffs/` for:
- branch-level handoffs
- partial implementation notes
- cross-agent next steps
- unresolved blockers

Use `.agent-context/coordination/claims/` for:
- active path claims
- branch ownership records
- overlap checks

Use `.agent-context/checkpoints/` for:
- semantic task checkpoints
- resume state for a branch or work ID

Use `.memento/memories/<agent>/MEMORY.md` for:
- durable role memory
- repeated lessons
- stable working assumptions

Use `.memento/runtime/stockclaw/handoff-inbox/` for:
- cross-worktree relay payloads
- normalized summaries for retrieval

## 6. Operational Commands

Use these commands when the repo-local context system needs to talk to the shared `memento` layer:

### Fast resume

```bash
npm run memento:resume -- --agent implementer-ui
```

What it does:

- loads the current branch checkpoint, brief, and handoff from `.agent-context/`
- includes the selected shared agent memory from `.memento/memories/<agent>/MEMORY.md`
- includes the latest runtime relay payload when one exists

### Cross-worktree relay

```bash
npm run memento:relay -- \
  --work-id "W-YYYYMMDD-HHMM-frontend-codex" \
  --agent implementer-ui \
  --summary "short handoff summary"
```

What it does:

- packages the current branch checkpoint, brief, and handoff
- writes a Markdown and JSON relay payload into:
  - `/Users/ej/Downloads/maxidoge-clones/.memento/runtime/stockclaw/handoff-inbox`
- refreshes a latest relay pointer for the branch under:
  - `/Users/ej/Downloads/maxidoge-clones/.memento/runtime/stockclaw/relay`

Rule:

- repo-local docs remain canonical
- shared `.memento` files are for cross-worktree reuse and resume speed, not product truth

## 7. Immediate Operational Rule

Until a stronger automation layer is added:

- all final decisions must be promoted into repo-local docs
- no agent should rely only on chat history
- no worktree-specific note should be treated as canonical for the whole project

## 8. Next Improvements

- add stale-claim cleanup automation
- add nightly distill from repo handoffs into runtime relay
- add retrieval wrapper that loads:
  - canonical docs
  - latest handoff
  - latest agent memory
  - latest checkpoint
