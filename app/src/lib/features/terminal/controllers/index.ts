// ═══════════════════════════════════════════════════════════════
// Stockclaw — Terminal controllers barrel
// ═══════════════════════════════════════════════════════════════
//
// The controllers layer owns async orchestration for the terminal
// feature: opening SSE streams, parsing events, coordinating scan
// requests, applying analysis results to a local feed.
//
// This file is currently an empty barrel. Controllers will land
// here across the terminal convergence workstream:
//
//   sendMessageController(query, context)  — SSE handshake +
//                                             event fan-out
//   runScanController(config)              — scan request +
//                                             result normalization
//   previewSymbolController(symbol, tf)    — single-symbol preview
//
// Each controller will take `eventFetch: typeof fetch` as its first
// arg so SvelteKit SSR + the `+page.svelte` client path both work
// through the same code.
//
// Rule
// ----
// Once a controller lives here, the route shells MUST import from
// it. Inline `fetch('/api/...')` calls in `/terminal`,
// `/terminal-legacy`, or `/cogochi/scanner` are forbidden after
// their migration slice lands.

export {};
