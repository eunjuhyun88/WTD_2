// Cogochi hub — GTM dual-emit telemetry
// PII policy: NO user_id, NO raw query text.
// Events are pushed to window.dataLayer (GTM) AND dispatched as
// CustomEvent('cogochi:telemetry', { detail }) for in-app subscribers.

import { z } from 'zod';

// ── Schemas ──────────────────────────────────────────────────────────────────

export const AiAskEventSchema = z.object({
  event: z.literal('wave6.ai_ask'),
  intent: z.enum(['scan', 'why', 'judge', 'recall', 'inbox', 'nlu', 'unknown']),
  query_len: z.number().int().nonnegative(),
  ts: z.number().int().positive(),
});

export const TabSwitchEventSchema = z.object({
  event: z.literal('wave6.tab_switch'),
  from: z.string(),
  to: z.enum(['decision', 'pattern', 'verdict', 'research', 'judge', 'scan']),
  source: z.enum(['click', 'slash', 'nlu']),
  ts: z.number().int().positive(),
});

export type AiAskEvent = z.infer<typeof AiAskEventSchema>;
export type TabSwitchEvent = z.infer<typeof TabSwitchEventSchema>;
export type CogochiTelemetryEvent = AiAskEvent | TabSwitchEvent;

// ── Internal GTM window type ──────────────────────────────────────────────────

interface GTMWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>;
}

// ── Core emitter ─────────────────────────────────────────────────────────────

/**
 * Push a validated telemetry event to:
 *  1. window.dataLayer (GTM standard push)
 *  2. CustomEvent('cogochi:telemetry', { detail }) for in-app subscribers
 */
export function track(event: CogochiTelemetryEvent): void {
  if (typeof window === 'undefined') return;

  const w = window as GTMWindow;
  if (!Array.isArray(w.dataLayer)) {
    w.dataLayer = [];
  }
  w.dataLayer.push({ ...event });

  window.dispatchEvent(new CustomEvent('cogochi:telemetry', { detail: event }));
}

// ── Typed helpers ─────────────────────────────────────────────────────────────

export function trackAiAsk(
  intent: AiAskEvent['intent'],
  queryLen: number,
): void {
  track({
    event: 'wave6.ai_ask',
    intent,
    query_len: queryLen,
    ts: Date.now(),
  });
}

export function trackTabSwitch(
  from: string,
  to: TabSwitchEvent['to'],
  source: TabSwitchEvent['source'],
): void {
  track({
    event: 'wave6.tab_switch',
    from,
    to,
    source,
    ts: Date.now(),
  });
}
