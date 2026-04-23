# W-0143 — Agent Context Pack Integration

## Goal

AI-facing terminal routes consume one bounded `AgentContextPack` assembled from canonical fact, search, and runtime planes, instead of rebuilding ad hoc joins or reading raw provider payloads.

## Owner

app

## Primary Change Type

Contract change

## Scope

- Maintain the app-side `AgentContextPack` loader and compact runtime summary.
- Keep agent routes behind existing plane proxy clients for facts, search, and runtime.
- Migrate AI-facing routes without changing public SSE/API shapes.

## Non-Goals

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
4. PR #208 added the canonical app-side `AgentContextPack` loader and tests.
5. DOUNI terminal message now has the first route-level integration point for the bounded pack.

## Assumptions

1. Runtime summaries should include compact identifiers and notes, not raw chart context or full OHLCV.
2. Existing terminal route response shapes must remain stable until the surface closeout lane.

## Open Questions

- Whether `intel-policy` should consume the full `AgentContextPack` or only the fact/runtime evidence section.

## Decisions

- W-0143 is now active because Fact, Search, and Runtime plane foundations have merged to `main`.
- The Agent layer must consume plane clients only: no direct provider fetch and no raw engine transport in agent route code.
- Runtime state inside `AgentContextPack` is a compact summary, not authoritative workflow storage.
- Search inputs are optional by id; the loader may return `scan` or `seed_search` as `null` when no run id is supplied.
- DOUNI message SSE is the first agent route migration because it already owns prompt context assembly and can keep its public stream shape unchanged.

## Next Steps

1. Finish and merge the DOUNI message route migration.
2. Decide the `intel-policy` migration shape from the bounded pack evidence.
3. After W-0143 route migration, unblock W-0139/W-0140 surface slimming.

## Exit Criteria

- `AgentContextPack` can be loaded from `facts + search + runtime` plane proxies with no raw provider payloads.
- Unit tests prove runtime chart context and long raw payloads are excluded from the pack.
- At least one AI-facing route consumes the loader before W-0143 closes.
- App checks pass with the existing public route shapes unchanged.

## Handoff Checklist

- active work item: `work/active/W-0143-query-by-example-pattern-search.md`
- branch: `codex/w-0143-agent-route-migration`
- verification:
  - `npm --prefix app run test -- src/lib/server/agentContextPack.test.ts src/lib/server/douni/contextBuilder.test.ts`
  - `npm --prefix app run check`
- remaining blockers: `intel-policy` still uses legacy route-by-route policy inputs; surface slimming remains blocked until agent lane closes.
