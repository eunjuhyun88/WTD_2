# WTD v2 Monorepo

## Structure

```
engine/   Python — feature calc (28 features), building blocks (29), backtest, data cache
app/      SvelteKit 2 + Svelte 5 — frontend, API routes, Supabase
```

## Read Order

1. This file
2. `app/docs/COGOCHI.md` — product truth (single source)
3. `engine/pyproject.toml` — Python deps
4. `app/ARCHITECTURE.md` — app structure

## Engine (Python 3.11+)

- Entry: `engine/scanner/feature_calc.py` → `compute_features_table()` (28 features, past-only)
- Blocks: `engine/building_blocks/{triggers,confirmations,entries,disqualifiers}/`
- Data: `engine/data_cache/` — Binance klines + CSV cache
- Tests: `cd engine && python -m pytest` (302 tests)
- Critical: all features are **past-only** — no look-ahead bias allowed

## App (SvelteKit)

- Dev: `npm --prefix app run dev` (port 5173)
- Build gate: `npm --prefix app run check && npm --prefix app run build`
- Routes: `app/src/routes/` — terminal, lab, dashboard, scanner, agent
- API: `app/src/routes/api/` — 98+ endpoints
- State: `app/src/lib/stores/` (27 modules), `app/src/lib/data-engine/`
- Server: `app/src/lib/server/` — db.ts (pg pool), auth, data providers
- Contracts: `app/src/lib/contracts/` (Zod schemas)
- DB: PostgreSQL via Supabase, migrations in `app/supabase/migrations/`

## Executor-Advisor Pattern

This repo uses a two-model strategy:

- **Executor (Sonnet)**: default for all tasks. File edits, grep, tests, builds, mechanical work.
- **Advisor (Opus)**: on-demand via `Agent tool` with `model: opus`. Architecture decisions, cross-boundary analysis, risk assessment.

### Call the Advisor when:
- Cross-boundary changes (app/ ↔ engine/ interface)
- Architecture or data contract decisions
- 3+ files with unclear dependency graph
- Trade-offs where getting it wrong means rework

### Don't call the Advisor for:
- Single file edits, renames, moves
- Running tests, builds, git operations
- Grep/glob searches
- Following an already-approved plan

## Rules

- Engine changes: edit `engine/` directly, run pytest before commit
- App changes: edit `app/` directly, run check + build before commit
- Never commit `.env*` files
- Product changes → update `app/docs/COGOCHI.md` in place (no versioned copies)
- `.claudeignore` controls what Claude reads — keep _archive and stale docs excluded
