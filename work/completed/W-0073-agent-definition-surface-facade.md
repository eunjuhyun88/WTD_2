# W-0073 Agent Definition Surface Facade

## Goal
Stop app UI modules from importing agent definitions directly from engine implementation paths.

## Scope
- Add an app-facing agent definition facade.
- Update `data/agents.ts` and `WarRoom.svelte` imports to use the facade.
- Preserve the existing agent metadata and UI bridge behavior.

## Non-Goals
- No full agent metadata copy.
- No factor/spec model migration.
- No WarRoom behavior change.

## Canonical Files
- `app/src/lib/agents/definitions.ts`
- `app/src/lib/data/agents.ts`
- `app/src/components/terminal/WarRoom.svelte`

## Facts
- `data/agents.ts` imports `getAllAgents` and `AgentDefinition` from `$lib/agents/definitions`.
- `WarRoom.svelte` imports `AGENT_POOL` from `$lib/agents/definitions`.
- A thin facade can isolate the remaining frontend agent definition coupling.

## Assumptions
- Full agent/factor/spec ownership should be decided in a later product/app surface slice.

## Open Questions
- Should agent definitions become product contracts instead of engine implementation data?

## Decisions
- Use a thin facade now to remove direct UI imports from engine paths.
- Keep the direct engine agent import isolated to `app/src/lib/agents/definitions.ts`.

## Next Steps
- Continue with store type/facade boundaries.

## Exit Criteria
- `data/agents.ts` and `WarRoom.svelte` no longer import `$lib/engine/agents` or `$lib/engine/types`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct app surface `$lib/engine/*` imports listed for later slices.
