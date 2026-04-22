# W-0069 Scan Agent Metadata Contract

## Goal
Remove the remaining non-facade app-server import of `$lib/engine/agents`.

## Scope
- Add an app contract for the minimal scan agent metadata used by server scan output.
- Update `scanEngine.ts` to use the contract metadata instead of `AGENT_POOL`.
- Preserve scan scoring and response shapes.

## Non-Goals
- No full agent pool migration.
- No frontend `data/agents.ts` refactor in this slice.
- No scan scoring behavior change.

## Canonical Files
- `app/src/lib/contracts/agents.ts`
- `app/src/lib/contracts/index.ts`
- `app/src/lib/server/scanEngine.ts`

## Facts
- `scanEngine.ts` now uses `SCAN_AGENT_META` from `app/src/lib/contracts/agents.ts`.
- Importing the full engine agent pool pulls app-server scan code back into engine implementation details.
- Agent icons in `scanEngine.ts` are already local display aliases, not sourced from engine metadata.

## Assumptions
- Scan display names and colors are stable app-facing product metadata.

## Open Questions
- Should the larger frontend `data/agents.ts` bridge be split from `engine/agents` in a later app surface slice?

## Decisions
- Keep this slice minimal and server-focused.
- Do not migrate factor/spec metadata until a frontend owner work item handles it.

## Next Steps
- Continue with frontend app-surface imports from `$lib/engine/*` in a separate owner slice.

## Exit Criteria
- `scanEngine.ts` no longer imports `$lib/engine/agents`. Met.
- Direct `$lib/engine/*` imports under app-server/routes/contracts are facade-only. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining app/frontend direct engine imports identified for later slices.
