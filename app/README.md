# App Workspace

This folder contains the SvelteKit surfaces and orchestration layer for WTD v2.

## Start Here

1. Root `../AGENTS.md`
2. Relevant `../work/active/*.md`
3. Relevant root `../docs/domains/*.md`
4. Relevant root `../docs/product/*.md`

## Scope

- `src/routes/`: product surfaces and API routes
- `src/components/`: reusable UI pieces
- `src/lib/contracts/`: app-side contract definitions

## Boundary

Do not treat this folder as backend truth. Backend logic lives in `../engine/`.

## Commands

- Dev: `npm --prefix app run dev`
- Check: `npm --prefix app run check`
- Build: `npm --prefix app run build`
