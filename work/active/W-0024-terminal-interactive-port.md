# W-0024 Terminal Interactive Port

## Goal

Port the useful interaction density from `cogochi_terminal_interactive.html` into `/terminal` while keeping the actual behavior routed through the app/backend terminal analysis flow.

## Owner

app

## Scope

- Improve `/terminal` right analysis rail density and action semantics.
- Add bottom dock quick actions that submit real terminal commands through the existing backend message stream.
- Keep the global product header intact and avoid adding a second in-page global header.
- Keep home route untouched.
- Design the missing backend/app-domain contracts required so every prototype interaction has a real server-side owner.

## Non-Goals

- No fake trade execution.
- No frontend-only scanner state that pretends backend persistence exists.
- No changes to `engine/` contracts unless the backend route shape must change.
- No home redesign.
- No package or deployment config changes.

## Canonical Files

- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/workspace/TerminalContextPanel.svelte`
- `app/src/components/terminal/workspace/TerminalBottomDock.svelte`
- `docs/domains/terminal-html-backend-parity.md`
- `/Users/ej/Downloads/cogochi_terminal_interactive.html`

## Decisions

- Context panel actions use backend terminal prompts via `sendCommand`.
- Challenge saving uses the existing capture modal path instead of a fake local save.
- `metrics` tab remains the internal id, but the visible label is `Flow`.
- `Execute` language is removed because the product does not execute trades from this UI.
- SSE terminal messaging remains the conversational path, but deterministic product actions should migrate to dedicated routes as contracts become available.
- Prototype parity is measured by backend ownership, not by preserving the prototype's local modal implementations.
- Chart rendering should reuse already-loaded terminal market context where possible; UI toggles must not trigger duplicate network fetches.
- Restore only high-value terminal density UI as isolated presentational components; keep engine-backed routes, caches, and analysis orchestration unchanged.
- Reintroduced summary chrome should mount as `TerminalContextPanelSummary` and `ChartMetricStrip`, not as large page-local `if (false)` blocks inside `/terminal/+page.svelte`.
- `/terminal/+page.svelte` should assemble from view-model adapters rather than owning dense summary derivation logic inline; summary chrome belongs in a dedicated surface-model layer.
- Quant-facing board structure should separate `rail summary UI` from `board data normalization`; chart summary, orderbook, and liquidation cards belong to a board-model adapter distinct from rail chrome.
- Board header layout should follow trader priority: focus/bias/regime first, then actionable levels, then supporting sources; those placement rules belong in the board-summary model/component pair, not scattered through page markup.

## Next Steps

1. Land contracts for status, presets, anomalies, macro, depth ladder, liquidation clusters, alerts, pins, watchlist, and export jobs.
2. Rewire quick actions and badges away from mock/local state to dedicated backend routes.
3. Continue porting the interactive prototype into the left rail and center board without duplicating global navigation.
4. Keep density improvements aligned with the existing dashboard/header shell.
5. Keep terminal chart interactions local-first by caching chart payloads per `symbol+tf` and reusing parent-fetched read-path data.
6. Deduplicate active terminal analysis loads so pair/timeframe switches do not fan out duplicate bundle, rerank, and read-path requests.
7. Skip non-critical terminal polling while the page is hidden, and reuse short-lived chart API results for repeated symbol/timeframe requests.
8. Keep terminal hot-path math and bootstrap linear: chart indicator generation should avoid repeated slice/reduce scans, and non-critical rail data should hydrate after the main board is visible.
9. Active terminal charts should consume parent-loaded market payloads first; avoid a second chart-specific fetch when analysis already loaded the same symbol/timeframe context.
10. Hot read endpoints must coalesce concurrent identical requests and serve short-lived cached payloads so multi-user bursts do not multiply upstream/API load.
11. Terminal parity routes should compose from one shared cached snapshot; remove route-local duplicate fetch/derive code when the same underlying data powers multiple read endpoints.
12. Memory feedback is telemetry-grade, not critical-path UX; batch and flush it asynchronously so high-frequency terminal interactions do not create write amplification.
13. Analyze raw-input collection should be shared and short-lived cached, and engine proxy timeouts should be path-aware instead of one global ceiling for every request shape.
14. Remove dead terminal-derived state and disabled UI branches once they stop serving the active surface; idle reactivity and dead CSS still cost maintenance and can hide real hot paths.
15. Re-add only the summary UI with component boundaries so future density experiments do not reintroduce page-local dead code.
16. Move summary UI derivation into a dedicated terminal surface-model adapter so the page remains a composition layer, not the owner of summary formatting rules.
17. Merge duplicate board summary layers into one `BoardSummary` component and move board read-path/fallback shaping into a dedicated `terminalBoardModel` adapter.
18. Promote board actions and cited sources into the board-summary layer so the top-of-board header reads like a trading cockpit instead of separate disconnected strips.

## Exit Criteria

- `/terminal` keeps one global header and one compact workspace bar.
- Action buttons either call the backend stream or open an existing real flow.
- `/terminal` visibly contains the interactive prototype's right-rail decision structure.
- The backend parity plan in `docs/domains/terminal-html-backend-parity.md` is the contract reference for remaining prototype actions.
- `npm --prefix app run check` passes.
