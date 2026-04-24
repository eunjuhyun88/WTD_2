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
5. PR #209 migrated DOUNI terminal message context assembly to consume the bounded pack.

## Assumptions

1. Runtime summaries should include compact identifiers and notes, not raw chart context or full OHLCV.
2. Existing terminal route response shapes must remain stable until the surface closeout lane.

## Open Questions

- None for the current slice.

## Decisions

- W-0143 is now active because Fact, Search, and Runtime plane foundations have merged to `main`.
- The Agent layer must consume plane clients only: no direct provider fetch and no raw engine transport in agent route code.
- Runtime state inside `AgentContextPack` is a compact summary, not authoritative workflow storage.
- Search inputs are optional by id; the loader may return `scan` or `seed_search` as `null` when no run id is supplied.
- DOUNI message SSE is the first agent route migration because it already owns prompt context assembly and can keep its public stream shape unchanged.
- `intel-policy` consumes the pack as an optional summary input first; policy scoring remains unchanged until a dedicated evidence-calibration slice.

## Next Steps

1. Finish and merge the `intel-policy` summary migration.
2. Mark W-0143 ready for surface unblock after PR verification.
3. Start W-0139/W-0140 surface slimming from updated `main`.

## Exit Criteria

- `AgentContextPack` can be loaded from `facts + search + runtime` plane proxies with no raw provider payloads.
- Unit tests prove runtime chart context and long raw payloads are excluded from the pack.
- At least one AI-facing route consumes the loader before W-0143 closes.
- App checks pass with the existing public route shapes unchanged.

## Handoff Checklist

- active work item: `work/active/W-0143-query-by-example-pattern-search.md`
- branch: `codex/w-0143-intel-policy-context`
- verification:
  - `npm --prefix app run test -- src/routes/api/terminal/intel-policy/intel-policy.test.ts src/lib/server/agentContextPack.test.ts src/lib/server/douni/contextBuilder.test.ts`
  - `npm --prefix app run check`
- remaining blockers: surface slimming remains blocked until the `intel-policy` summary migration is merged.
