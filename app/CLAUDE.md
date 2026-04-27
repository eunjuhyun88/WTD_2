# App Claude Router

Do not start active work from this file alone.

## Use This Order

1. Root `../AGENTS.md`
2. Root `../work/active/CURRENT.md`
3. Relevant `../work/active/*.md` listed in `CURRENT.md`
4. Relevant root `../docs/domains/*.md`
5. Relevant root `../docs/product/*.md`
6. Required `app/src/**` files only

## Canonical Authority

- App boundary and execution rules: root `../AGENTS.md`
- Product truth: root `../docs/product/*.md`
- Domain maps: root `../docs/domains/*.md`
- Decisions: root `../docs/decisions/*.md`
- Legacy product reference only: `docs/COGOCHI.md`

## App Deploy Guardrail

- For the app Vercel project, agent/default branches are non-deploy lanes.
- Use `release` as the production branch if Git auto-deploy is enabled again.
- If that branch model is not explicitly confirmed, treat manual deploy as the default.

## Default Excludes

- `node_modules/`
- `build/`
- `.svelte-kit/`
- `docs/generated/`
- `docs/archive/`
- `_archive/`
- `memory/` (legacy local memory root; use root `../memory/`)

If a task changes contracts or behavior, update the root canonical docs, not only legacy app docs.
