/**
 * panelRouter.ts — Cogochi AI-ask event → panel routing
 *
 * Receives { intent, tab, query } from the `cogochi:ai-ask` CustomEvent
 * (dispatched by AiSearchBar), switches the active right-panel tab via
 * shellStore, and writes the pending query into a reactive store so each
 * panel can consume it.
 */

import { writable } from 'svelte/store';
import type { RightPanelTab } from '$lib/hubs/terminal/shell.store';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AiAskDetail {
  intent: string;
  tab: string;
  query: string;
}

export interface PendingQuery {
  tab: RightPanelTab;
  intent: string;
  query: string;
  /** Unix ms timestamp — lets panels detect "new" events even with same query */
  ts: number;
}

// ── Store ──────────────────────────────────────────────────────────────────

/**
 * pendingQuery — set by routeAiAsk, consumed and cleared by each panel.
 * null = no pending query.
 */
export const pendingQuery = writable<PendingQuery | null>(null);

// ── Tab mapping ────────────────────────────────────────────────────────────

/** Canonical set of routable tab IDs (mirrors RightPanelTab minus 'chat') */
const VALID_TABS = new Set<string>(['decision', 'pattern', 'verdict', 'research', 'judge']);

/**
 * kindToTabId — maps slash-command intent to the tab that should handle it.
 * Falls back to the `tab` field already provided by slashParser.
 */
export const kindToTabId: Record<string, RightPanelTab> = {
  scan:   'research',
  why:    'decision',
  judge:  'judge',
  recall: 'pattern',
  inbox:  'verdict',
  nlu:    'research', // NLU default; actual tab comes from detail.tab
};

// ── Router ─────────────────────────────────────────────────────────────────

/**
 * routeAiAsk — call from `window.addEventListener('cogochi:ai-ask', ...)`.
 *
 * 1. Resolves target tab: prefers `detail.tab` when valid, falls back to
 *    `kindToTabId[detail.intent]`, defaults to 'research'.
 * 2. Calls `shellStore.setRightPanelTab(targetTab)` to switch the visible tab.
 * 3. Writes `pendingQuery` so the panel can consume the query.
 *
 * @param detail  — `{ intent, tab, query }` from the CustomEvent
 * @param setTab  — injection seam for shellStore.setRightPanelTab (testable)
 */
export function routeAiAsk(
  detail: AiAskDetail,
  setTab: (tab: RightPanelTab) => void = _defaultSetTab,
): void {
  const resolvedTab: RightPanelTab = VALID_TABS.has(detail.tab)
    ? (detail.tab as RightPanelTab)
    : (kindToTabId[detail.intent] ?? 'research');

  setTab(resolvedTab);

  pendingQuery.set({
    tab: resolvedTab,
    intent: detail.intent,
    query: detail.query,
    ts: Date.now(),
  });
}

/** Default tab-setter — imports shellStore lazily to avoid circular SSR issues */
function _defaultSetTab(tab: RightPanelTab): void {
  // Dynamic import keeps the module testable without a full Svelte store context
  import('$lib/hubs/terminal/shell.store')
    .then(({ shellStore }) => shellStore.setRightPanelTab(tab))
    .catch(() => { /* non-fatal — panel still receives pendingQuery */ });
}
