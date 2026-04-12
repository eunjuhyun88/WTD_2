# RELIABILITY

Purpose:
- Canonical reliability and validation boundary for the frontend repo.

## Reliability Rules

1. `npm run gate` is the default local ship gate.
2. Context restore/handoff should be deterministic via `.agent-context/`.
3. Durable state must have a clear server authority.
4. High-risk routes should be decomposable enough to validate in isolation.
5. Large UI changes should preserve or improve observable user journeys.

## Current Reliability Sources

- `docs/references/active/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md`
- `docs/references/active/terminal-refactor-master-plan-2026-03-06.md`
- `docs/references/active/TERMINAL_SCAN_E2E_SPEC.md`
- `docs/references/active/warning-priority-2026-03-06.md`
- `docs/references/active/LAUNCH_LOAD_SECURITY_DESIGN_2026-04-12.md`
- `docs/references/active/API_ROUTE_TIER_INVENTORY_2026-04-12.md`
- `scripts/perf/k6-auth-snapshot.js`

## Current Gaps

- Full app observability for local agent runs is not yet a repo-local first-class workflow.
- Critical user journeys are not yet summarized as route-level SLO/SLA artifacts.
- Some large route files still make failure isolation harder than it should be.

## Next Reliability Promotions

- Add route-level critical journey checklist.
- Add explicit state-authority regression checklist for profile/trade/signal flows.
- Add stronger docs check coverage for canonical paths and stale references.
- Split web request handling from async worker execution for heavy launch-time routes.
- Promote shared cache and shared rate-limit policy ahead of multi-instance deploy.
