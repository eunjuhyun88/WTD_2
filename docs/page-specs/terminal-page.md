# Terminal Page

Route scope:
- `/terminal`

Purpose:
- Define the responsive Terminal shell that combines scan, intel, trade actions, and community share flows.

## Primary User Job

- Ask a question, run a scan, or react to a chart signal and get to a legible next action quickly.

## Core Flow

1. Route boots shared Terminal state: live ticker, layout runtime, alert engine, and optional copy-trade bootstrap from query params.
2. User works inside one of three shells:
   - `TerminalMobileLayout`
   - `TerminalTabletLayout`
   - `TerminalDesktopLayout`
3. Action runtime handles chart-scan and trade-plan actions; chat runtime handles intel/chat turns; community runtime handles share modal state.
4. Scan completion updates local decision state, chat messages, and trade setup affordances.
5. User can track, quick-trade, copy-trade, or share to community without leaving the route.

## Guardrails

- Responsive layouts must preserve the same scan -> interpret -> act path.
- Copy-trade bootstrap from URL params must open the modal and then clean the URL.
- Background alert scanning must start and stop with the route lifecycle.
- Users must understand what is live, cached, or simulated even when density mode is `pro`.

## Key UI Blocks

- terminal control bar and live ticker strip
- chart surface plus chart-driven scan/chat/share actions
- war room / verdict / decision panels
- intel feed and chat section
- copy-trade modal
- community share modal backed by `SignalPostForm`
- mobile bottom navigation and tablet intel split-pane affordances

## State Authority

- pair, timeframe, and shared market context: `gameState`
- live prices: `priceStore`; live ticker is route-loaded display data
- scan/intel result projection: server APIs plus route-local `latestScan` and chat state
- layout widths, collapse state, mobile tab, density mode, and share modal: route-local runtimes
- tracked signal, quick trade, and copy-trade durable state: shared stores backed by API flows

## Supporting APIs And Data

- `/api/terminal/scan`
- `/api/terminal/intel-policy`
- `/api/terminal/intel-agent-shadow`
- `/api/market/*`
- `/api/signals/track`
- `/api/quick-trades/*`
- `/api/copy-trades/*`
- `/api/community/posts`

## Failure States

- live ticker never resolves and does not fall back cleanly
- scan returns partial state and the decision banner/chat path desyncs
- copy-trade bootstrap leaves stale URL params or fails to open modal
- share modal or chart-to-community handoff loses the signal prefill
- one viewport layout hides the main action path relative to the others

## Read These First

- `docs/product-specs/terminal.md`
- `docs/references/active/TERMINAL_SCAN_E2E_SPEC.md`
- `docs/generated/api-group-map.md`
- `docs/generated/store-authority-map.md`

## Applied Source Inputs

- `2026-03-01__STOCKCLAW_PRD_A01.md`
- `2026-03-01__STOCKHOO_TradingAgent_PRD.md`
- `docs/references/active/TERMINAL_SCAN_E2E_SPEC.md`
