# W-0036 Terminal Persistence-First Rollout

## Goal

Land the internal-rollout terminal persistence slice so `/terminal` can save and restore user context through dedicated app-domain routes while reducing UI guesswork with explicit analyze contracts and stabilizing the existing memory loop.

## Owner

app

## Scope

- add terminal app-domain contracts and routes for `watchlist`, `pins`, `alerts`, and async `exports`
- add the read-only `macro-calendar` route and wire terminal surfaces away from mock macro data
- extend the canonical analyze envelope with `entryPlan`, `riskPlan`, `flowSummary`, and `sources`
- rewire terminal UI/adapters to prefer the explicit analyze fields and hydrate saved terminal state
- persist engine memory feedback/debug indices via a local SQLite WAL store and centralize app-side memory wire-shape conversion
- restore `app` typecheck health where it blocks this rollout

## Non-Goals

- no standalone retrieval corpus or vector-memory system
- no public-beta hardening beyond the existing auth/rate-limit patterns
- no new engine-owned decision routes for risk or flow panels
- no fake execution or frontend-only persistence semantics

## Canonical Files

- `work/active/W-0036-terminal-persistence-first-rollout.md`
- `docs/domains/terminal-html-backend-parity.md`
- `docs/product/terminal-attention-workspace.md`
- `app/src/routes/terminal/+page.svelte`
- `app/src/lib/contracts/terminalBackend.ts`
- `app/src/lib/server/analyze/responseMapper.ts`
- `engine/api/routes/memory.py`

## Facts

- `/terminal` parity docs already target dedicated routes for watchlist, pins, alerts, exports, and macro calendar (`docs/domains/terminal-html-backend-parity.md`).
- analyze now emits explicit `entryPlan`, `riskPlan`, `flowSummary`, and `sources`, and the panel adapter prefers those fields before fallback derivation (`app/src/lib/server/analyze/responseMapper.ts`, `app/src/lib/terminal/panelAdapter.ts`).
- app-domain persistence routes now exist for watchlist, pins, alerts, exports, and macro calendar, backed by a new Postgres migration plus authenticated route handlers (`app/src/lib/server/migrations/004_terminal_persistence.sql`, `app/src/routes/api/terminal/*`, `app/src/routes/api/market/macro-calendar/+server.ts`).
- `/terminal/+page.svelte` now hydrates watchlist/pins/saved alerts/macro calendar, routes Pin/Alert/Export/Compare actions to dedicated endpoints, and feeds persisted state into the left rail and context panel.
- engine memory feedback/debug state now persists through a WAL-backed SQLite store instead of process-local dicts (`engine/memory/state_store.py`, `engine/api/routes/memory.py`).
- targeted app contracts/routes/tests, targeted engine tests, and `app` typecheck all pass for this slice.

## Assumptions

- the internal rollout can reuse the existing cookie-auth model and Postgres database without introducing new external infrastructure
- export jobs only need a queued/running/succeeded/failed lifecycle for the initial terminal report use case

## Open Questions

- none; the current rollout scope is decision-complete from the approved plan

## Integration Design

- `app` owns terminal persistence orchestration; `engine` continues to own analysis, pattern candidates, captures, and memory scoring.
- `/terminal/+page.svelte` remains the composition boundary: it may hydrate app-domain state, call app-domain routes for durable actions, and pass normalized props into rails, but dense derivation stays in adapters/components.
- Initial hydration loads three state groups independently:
  - market read path: status, presets, anomalies, scanner alerts, events, news
  - persistence read path: watchlist, pins, saved alert rules
  - macro read path: read-only macro calendar
- Durable user actions map to first-class routes:
  - `Pin` -> `GET/PUT /api/terminal/pins` plus watchlist touch
  - `Alert+` -> `POST/DELETE /api/terminal/alerts`
  - `Export` -> `POST /api/terminal/exports` then poll `GET /api/terminal/exports/:id`
  - `Compare` -> `POST /api/terminal/compare` plus optional compare pin
  - `Save Setup` -> engine capture when candidate transition context exists, otherwise legacy challenge create
- UI state must reflect backend-backed state: persisted watchlist rows feed the left rail, saved alerts show as saved rows, pin/alert buttons show active state from persisted records, and macro calendar uses `/api/market/macro-calendar`.

## Decisions

- keep `GET /api/cogochi/analyze` as the single source of truth for terminal decision payloads and extend that envelope instead of introducing parallel risk/flow read routes
- implement terminal persistence in `app/` routes backed by Postgres and keep engine memory durability separate in SQLite WAL
- allow memory debug-session writes only from durable terminal actions such as save/pin/alert mutations, not passive viewing interactions
- keep one implementation branch for the full rollout even though the final merge should be split into reviewable PR slices by change type
- wire `/terminal` to the app-domain persistence client from the page composition layer: hydrate watchlist/pins/alerts/macro calendar on mount, pass persisted state into rails, and route Pin/Alert/Export actions to dedicated app endpoints

## Next Steps

1. apply the new terminal persistence SQL migration in the target Postgres environment before rollout
2. split merge units into the planned review slices: `contract/analyze`, `app-domain persistence`, `engine memory durability`
3. run an authenticated browser smoke test on `/terminal` once the migration is present

## Exit Criteria

- `/terminal` can persist and restore watchlist/pins and manage alert rules through dedicated authenticated routes
- macro calendar reads from a real route and analyze-driven panels render explicit `entryPlan`, `riskPlan`, `flowSummary`, and `sources`
- engine memory feedback and rejected-hypothesis records survive process restart through SQLite WAL persistence
- targeted engine tests, app contract tests, and `app` typecheck all pass

## Handoff Checklist

- latest rollout scope, decisions, and verification targets are recorded here
- next agent can identify the app-domain route slice, analyze-contract slice, and engine-memory slice without replaying chat
- no hidden dependency on prompt-only behavior for watchlist, pins, alerts, exports, or memory debug-session writes
- verification completed:
  - `npm run check -- --fail-on-warnings`
  - `npm test -- --run src/lib/contracts/terminalMemory.test.ts src/lib/contracts/terminalPersistence.test.ts src/lib/api/terminalMemoryAdapter.test.ts src/lib/server/analyze/responseMapper.test.ts src/routes/api/terminal/watchlist/watchlist.test.ts src/routes/api/terminal/alerts/alerts.test.ts src/routes/api/terminal/exports/exports.test.ts`
  - `uv run --with pytest pytest tests/test_contract_memory_roundtrip.py tests/test_memory_rerank.py tests/test_memory_state_store.py`
