# WTD v2 Operating System

WTD v2 is managed as a research-product-execution operating system, not just a code repository.

## North Star

1. Minimize read cost for models and humans.
2. Make current truth obvious.
3. Keep small, repeatable work loops moving in Cursor-like sessions.

## Canonical Structure

```text
engine/                    # Canonical backend truth
app/                       # UI surfaces + orchestration layer
docs/product/              # Current product truth only
docs/domains/              # Domain maps (short, task-focused)
docs/decisions/            # ADR history (why decisions were made)
docs/runbooks/             # How to run, test, release
docs/archive/              # Historical/non-canonical docs
work/active/               # Current work items (session memory)
work/completed/            # Closed work items
research/                  # Thesis, experiments, evals, datasets, notes
```

## Ownership Boundary

- `engine/` owns feature calculation, blocks, scanner, scoring, evaluation.
- `app/` owns surfaces, auth/session, API routes, SSE, persistence, orchestration.
- `app` must not reimplement engine business logic.
- `engine` must not know UI state.
- app-engine integration must flow through documented contracts.

## Read Order (Default)

1. `AGENTS.md`
2. Relevant `work/active/*.md`
3. Relevant `docs/domains/*.md`
4. Relevant `docs/product/*.md`
5. Only then open required code files

## Quick Start

- Engine tests: `cd engine && uv run pytest`
- App dev: `npm --prefix app run dev`
- App checks: `npm --prefix app run check`
- Repo baseline checks: `bash scripts/check-operating-baseline.sh`

## Document Policy

- Keep docs short and layered.
- Do not store historical context in canonical docs.
- Move superseded design/history docs into `docs/archive/` or keep them in existing legacy locations marked as non-canonical.
