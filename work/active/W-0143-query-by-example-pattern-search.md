# W-0143 — Agent Context Pack Integration

## Goal

AI-facing terminal routes consume one bounded `AgentContextPack` assembled from canonical fact, search, and runtime planes, instead of rebuilding ad hoc joins or reading raw provider payloads.

## Owner

app

## Primary Change Type

Contract change

## Scope

- Define the app-side `AgentContextPack` loader and compact runtime summary.
- Keep the loader behind existing plane proxy clients for facts, search, and runtime.
- Prepare terminal AI and intel routes for migration without changing the public SSE/API shapes in the first slice.

## Non-Goals

- Rewrite the DOUNI terminal SSE route in the first slice.
- Add new engine routes.
- Move surface compare/pin UX.
- Add broad retrieval or new provider integrations.

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0143-query-by-example-pattern-search.md`
- `docs/domains/terminal-ai-scan-architecture.md`
- `app/src/lib/contracts/agent/agentContext.ts`
- `app/src/lib/server/agentContextPack.ts`
- `app/src/lib/server/douni/contextBuilder.ts`
- `app/src/routes/api/cogochi/terminal/message/+server.ts`
- `app/src/routes/api/terminal/intel-policy/+server.ts`

## Facts

1. Fact routes now expose canonical `/ctx/fact` and `/facts/*` payloads through app plane proxies.
2. Search routes now expose canonical `/search/catalog`, `/search/scan`, and `/search/seed` payloads through app plane proxies.
3. Runtime routes now expose captures and other workflow projections through app plane proxies.
4. `AgentContextPack` exists as a contract skeleton but has no canonical server loader yet.
5. Terminal AI routes still assemble context route-by-route and can drift back into surface-owned joins.

## Assumptions

1. The first implementation slice should be loader-only plus tests, then route migration in a follow-up commit.
2. Runtime summaries should include compact identifiers and notes, not raw chart context or full OHLCV.
3. Existing terminal route response shapes must remain stable until the surface closeout lane.

## Open Questions

- Which terminal route should migrate first after the loader lands: DOUNI message SSE or `intel-policy`?

## Decisions

- W-0143 is now active because Fact, Search, and Runtime plane foundations have merged to `main`.
- The Agent layer must consume plane clients only: no direct provider fetch and no raw engine transport in agent route code.
- Runtime state inside `AgentContextPack` is a compact summary, not authoritative workflow storage.
- Search inputs are optional by id; the loader may return `scan` or `seed_search` as `null` when no run id is supplied.

## Next Steps

1. Add `agentContextPack.ts` with a bounded facts/search/runtime loader and unit tests.
2. Migrate one AI-facing route to call the loader without changing public output shape.
3. Extend the DOUNI context builder to accept the pack after the route migration is verified.

## Exit Criteria

- `AgentContextPack` can be loaded from `facts + search + runtime` plane proxies with no raw provider payloads.
- Unit tests prove runtime chart context and long raw payloads are excluded from the pack.
- At least one AI-facing route consumes the loader before W-0143 closes.
- App checks pass with the existing public route shapes unchanged.

## Handoff Checklist

- active work item: `work/active/W-0143-query-by-example-pattern-search.md`
- branch: `codex/w-0143-agent-context-pack`
- verification:
  - `npm --prefix app run test -- src/lib/server/agentContextPack.test.ts`
  - `npm --prefix app run check`
- remaining blockers: route migration and DOUNI context builder integration remain after the loader slice.
