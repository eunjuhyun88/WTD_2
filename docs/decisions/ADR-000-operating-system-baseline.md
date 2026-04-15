# ADR-000: AI Research Operating System Baseline

## Status

Accepted

## Context

This repository must be managed as an operating system connecting research, product, and execution.  
The previous state mixed product truth, architecture notes, historical context, and task logs in high-cost docs.

## North Star

1. Minimize repeated reading for models.
2. Make current truth obvious for humans.
3. Keep small Cursor-like work loops running continuously.

## Fixed Operating Principles

1. `engine/` is the only backend truth.
2. `app/` owns surface and orchestration only.
3. Truth is split across short layered documents, not one giant file.
4. Work continues by `work item` files, not chat transcripts.

## Information Layer Model

Canonical layers:

- `README.md`: entry and quick orientation
- `AGENTS.md`: execution and context-routing rules only
- `docs/product/`: current product truth only
- `docs/domains/`: short domain maps and boundaries
- `docs/decisions/`: ADR rationale history
- `docs/runbooks/`: local execution and release operation
- `docs/archive/`: non-canonical historical references

Outcome: models read only required layers for the task.

## Code Responsibility Split

### `engine/`

- feature calculation
- building blocks
- scanner
- scoring
- evaluation/backtest
- challenge runtime
- tests

### `app/`

- UI surfaces
- server routes
- auth/session
- persistence
- SSE/streaming
- orchestration for engine calls

### Contract Layer

App-engine coupling must be contract-defined (types + payload shapes + error model).

## Hard Boundary Rules

- No app-side reimplementation of engine feature/block/business logic.
- Engine must not depend on UI state.
- Integration changes must go through contract updates.

## Work Item System (Externalized Session Memory)

Directories:

- `work/active/`
- `work/completed/`

Each work item must define:

- Goal
- Scope
- Non-Goals
- Canonical Files
- Decisions
- Next Steps
- Exit Criteria

Benefit: new sessions load one work item file instead of long chat history.

## Context Control Rules

Default excluded paths:

- `app/node_modules/`
- `app/build/`
- `app/.svelte-kit/`
- `engine/.venv/`
- `**/__pycache__/`
- `**/.pytest_cache/`
- `docs/archive/`
- `app/_archive/`
- `docs/generated/`

Default read order:

1. `AGENTS.md`
2. relevant `work/active/*.md`
3. relevant `docs/domains/*.md`
4. required code files only
5. minimal test-failure excerpts

Operating discipline on top of the read order:

- plan in the work item before implementing non-trivial changes
- re-anchor context after folder/worktree/branch changes
- keep verified facts, assumptions, and open questions explicit
- treat rejected hypotheses as durable debugging memory when they matter to future work
- preserve source attribution for architectural or policy decisions

## Research Operations Separation

`research/` is independent from product docs:

- `research/thesis/`
- `research/experiments/`
- `research/evals/`
- `research/datasets/`
- `research/notes/`

Principle: hypotheses and experiment outputs are file-tracked artifacts, not chat-only memory.

## App-Engine Contract Operations

Must maintain these interfaces:

- challenge input contract
- evaluation run contract
- result summary contract
- instance detail contract
- error contract

Operational requirement:

- one canonical contract doc
- one canonical type home
- sample payloads
- ADR update on breaking changes

## Team Execution Rules

Every task must start with:

1. owner type (`app`, `engine`, `contract`, `research`)
2. canonical doc
3. relevant domain doc
4. work item file
5. completion criteria (test/screen/contract)

Every change set should have one primary class:

- product surface change
- engine logic change
- contract change
- research/eval change

## Session Loop Standard

1. choose one active work item
2. read one domain doc
3. read only related files
4. implement
5. validate locally
6. update work item

Good session shape:

- 1 work item
- 1 domain doc
- 3-5 code files
- partial logs only

Required behavior before action:

1. define the intended outcome and non-goals in the work item
2. identify owner, primary change type, and verification target
3. prefer design/contract clarification before cross-boundary implementation
4. update the work item when scope or hypotheses change materially

## Ordered Rollout Plan

1. Fix `engine` canonical declaration across docs.
2. Decompose large product truth docs into layered docs + archive.
3. Author domain docs.
4. Introduce `work/active` system.
5. Shrink `AGENTS.md`.
6. Lock excludes and read order.
7. Document app-engine contracts.
8. Separate research workspace.

## Decision

Adopt the operating-system baseline immediately and treat this ADR as the governing architecture-level policy for repository operation.

## Consequences

- Lower context cost per task.
- Faster onboarding for humans and agents.
- Reduced drift between research, product truth, and implementation flow.
