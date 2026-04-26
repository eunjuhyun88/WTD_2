# Generated Artifacts

Purpose:
- Home for repo-local derived summaries that help agents navigate the codebase faster.

Current artifacts:
- `docs/generated/db-schema.md`
- `docs/generated/game-record-schema.md`
- `docs/generated/route-map.md`
- `docs/generated/store-authority-map.md`
- `docs/generated/api-group-map.md`

Refresh:
- `npm run docs:refresh`
- freshness check is enforced by `npm run docs:check`

Rules:
- Generated artifacts summarize source-of-truth files; they do not replace them.
- If a generated artifact goes stale, either refresh it or delete it.
