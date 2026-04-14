# App Claude Router

Do not start active work from this file alone.

## Use This Order

1. Root `../AGENTS.md`
2. Relevant `../work/active/*.md`
3. Relevant root `../docs/domains/*.md`
4. Relevant root `../docs/product/*.md`
5. Required `app/src/**` files only

## Canonical Authority

- App boundary and execution rules: root `../AGENTS.md`
- Product truth: root `../docs/product/*.md`
- Domain maps: root `../docs/domains/*.md`
- Decisions: root `../docs/decisions/*.md`
- Legacy product reference only: `docs/COGOCHI.md`

## Default Excludes

- `node_modules/`
- `build/`
- `.svelte-kit/`
- `docs/generated/`
- `docs/archive/`
- `_archive/`
- `memory/memory/`

If a task changes contracts or behavior, update the root canonical docs, not only legacy app docs.
