# Agent Context Memory Protocol

Last updated: 2026-03-06
Scope: current git worktree rooted at this repository

## 1) Why

The repo already has strong doc routing and local safety automation.
The next failure mode is not "missing files"; it is semantic drift:

- sessions restart with the wrong objective
- watch logs become implicit memory
- snapshots preserve state but not intent
- agents reopen too many files to recover context

This protocol separates:

- authority
- machine state
- semantic working memory
- handoff artifacts
- historical evidence

## 2) Context Architecture

### A. Authority

Stable rules and invariants live in canonical repo-local docs:

- `README.md`
- `ARCHITECTURE.md`
- `docs/README.md`
- `docs/{DESIGN,FRONTEND,PLANS,PRODUCT_SENSE,QUALITY_SCORE,RELIABILITY,SECURITY}.md`

These are the source of truth. They are not runtime artifacts.

### B. Machine Snapshot

Location:

- `.agent-context/snapshots/<branch-safe>/*.md`

Purpose:

- git/worktree/head/upstream/ahead-behind
- changed files vs `origin/main`
- recent commits
- runtime flags

Rule:

- snapshots capture state, not semantics
- do not treat them as the best resume artifact

### C. Semantic Checkpoint

Location:

- `.agent-context/checkpoints/<work-id>.md`
- `.agent-context/checkpoints/<branch-safe>-latest.md`

Purpose:

- current objective
- why now
- scope
- owned files
- canonical docs opened
- decisions made
- rejected alternatives
- open questions
- next actions
- exit criteria

Rule:

- checkpoints are required for non-trivial work
- this is the primary working-memory artifact

### D. Brief and Handoff

Location:

- `.agent-context/briefs/<work-id>.md`
- `.agent-context/briefs/<branch-safe>-latest.md`
- `.agent-context/handoffs/<work-id>.md`
- `.agent-context/handoffs/<branch-safe>-latest.md`
- compatibility path: `.agent-context/compact/<branch-safe>-latest.md`

Purpose:

- `brief`: small, fast resume map
- `handoff`: fuller transfer artifact for the next agent/session

### E. Evidence

Location:

- `docs/AGENT_WATCH_LOG.md`
- raw snapshots

Purpose:

- historical evidence
- validation trail
- execution chronology

Rule:

- evidence is not authority
- evidence is not the primary resume surface

## 3) Runtime Layout (Local Only)

All runtime context files are gitignored under `.agent-context/`.

- `.agent-context/snapshots/`
- `.agent-context/checkpoints/`
- `.agent-context/briefs/`
- `.agent-context/handoffs/`
- `.agent-context/compact/`
- `.agent-context/state/`
- `.agent-context/runtime/`
- `.agent-context/pinned-facts.md`
- `.agent-context/index.tsv` (legacy snapshot index)
- `.agent-context/catalog.tsv` (multi-artifact registry)

## 4) Commands

### Save machine snapshot

```bash
npm run ctx:save -- --title "task start" --work-id "W-YYYYMMDD-HHMM-frontend-codex" --agent "codex"
```

Captures:

- branch/head/upstream/ahead-behind
- changed files vs `origin/main`
- uncommitted files
- recent commits
- runtime context flags

### Record semantic checkpoint

```bash
npm run ctx:checkpoint -- \
  --work-id "W-YYYYMMDD-HHMM-frontend-codex" \
  --surface "terminal" \
  --objective "split semantic checkpoint from raw snapshot flow" \
  --doc "README.md" \
  --doc "docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md" \
  --file "scripts/dev/context-compact.sh" \
  --decision "keep .agent-context/compact as compatibility path" \
  --question "should pre-push fail without checkpoint?" \
  --next "wire strict context quality check into pre-push"
```

Use checkpoint when:

- the task is multi-step
- architecture/state/contracts are changing
- the work is likely to span sessions
- a handoff may be needed

### Pin durable facts

```bash
npm run ctx:pin -- --add "Do not merge without required write-access approval"
```

Use only for durable, high-value facts. Never pin secrets.

### Build brief and handoff

```bash
npm run ctx:compact
```

Produces:

- branch brief
- work-id handoff
- compatibility compact brief
- lightweight state json

### Validate context quality

```bash
npm run ctx:check -- --strict
```

Strict validation expects:

- checkpoint-backed brief
- semantic objective
- open questions section
- immediate next step
- read-first docs
- no watch-log tail copied into brief

### Restore context

```bash
npm run ctx:restore -- --mode brief
npm run ctx:restore -- --mode handoff
npm run ctx:restore -- --mode files
```

Compatibility alias:

```bash
npm run ctx:restore -- --mode context
```

`context` resolves to `brief` and exists only for backwards compatibility.

## 5) Automatic Triggers

Automation runs through `ctx:auto`.

- `safe:status` -> save snapshot, refresh brief/handoff if possible
- `safe:sync-start` -> save snapshot
- `safe:sync-end` -> save snapshot, refresh brief/handoff
- `pre-push` -> save snapshot, refresh brief/handoff, then strict quality check
- `post-merge` -> save snapshot, refresh brief/handoff

Environment controls:

- `CTX_AUTO_DISABLED=1`
- `CTX_AUTO_MIN_INTERVAL_SEC=300`
- `CTX_AUTO_STRICT=1`
- `CTX_AUTO_SKIP_COMPACT=1`
- `CTX_WORK_ID`
- `CTX_AGENT_ID`

## 6) Resume Order

Use this order on session restart:

1. `README.md`
2. `docs/README.md`
3. `npm run ctx:restore -- --mode brief`
4. `npm run ctx:restore -- --mode handoff` if the brief is insufficient
5. only then inspect snapshots or watch log

This preserves progressive disclosure and keeps the hot path small.

## 7) Quality Rules

The context system is healthy only if:

- objective is semantic, not stage-shaped like `auto-safe-status`
- brief contains open questions
- brief contains an immediate next step
- brief points to canonical docs, not random logs
- watch log is used as evidence only

Bad signs:

- latest compact output is mostly changed-file dump
- the agent needs watch-log tail to know what to do next
- checkpoint is missing on long-running work
- restore opens many files before showing the objective

## 8) Minimum Cadence

- task start: `safe:status`
- first serious design/implementation decision: `ctx:checkpoint`
- pre-handoff: `ctx:save` + `ctx:compact`
- pre-push: hook path (`ctx:auto(pre-push)` + `ctx:check -- --strict`)
- post-reset: `ctx:restore -- --mode brief`

## 9) Safety Rules

- Do not commit `.agent-context/*`.
- Do not put secrets into snapshots, checkpoints, or pinned facts.
- Do not use watch log as the only memory system.
- Do not rely on external non-repo-local docs for normal resume flow.
- Keep compatibility outputs until all local workflows are moved off `.agent-context/compact/*-latest.md`.
