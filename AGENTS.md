# WTD v2 Monorepo

## Structure

```
engine/   Python — feature calc, building blocks, backtest, data cache
app/      SvelteKit — frontend + Supabase + API routes
```

## Read Order

1. This file
2. `engine/pyproject.toml` — Python engine dependencies
3. `app/docs/COGOCHI.md` — product truth (single source)
4. `app/ARCHITECTURE.md` — app structure overview

## Engine (Python)

- Entry: `engine/scanner/feature_calc.py` — compute_features_table() (28 features)
- Blocks: `engine/building_blocks/` — 29 blocks (triggers, confirmations, entries, disqualifiers)
- Data: `engine/data_cache/` — Binance klines fetch + CSV cache
- Tests: `engine/tests/` — 302 tests, run with `cd engine && python -m pytest`

## App (SvelteKit)

- Dev: `npm --prefix app run dev` (port 5173)
- Product docs: `app/docs/COGOCHI.md`
- Frontend: `app/src/routes/`, `app/src/components/`
- Python bridge: `app/cogochi/` — thin wrapper (to be replaced by engine/ imports)

## Rules

- Engine changes: edit `engine/` directly, run tests before commit
- App changes: edit `app/` directly
- Never commit `.env*` files
