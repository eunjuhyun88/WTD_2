/**
 * telemetry.ts — GTM event wrapper for terminal hub
 *
 * Fires window.gtag events with zod-validated payloads.
 * - dev: console.debug (gtag absent)
 * - prod: window.gtag('event', ...)
 * - SSR / no-gtag: no-op, no error thrown
 * - 0 PII: user_id, email, IP 절대 미포함
 */

import { z } from 'zod';
import type { WorkMode } from './workMode.store';

// ── Schemas ────────────────────────────────────────────────────────────────

export const WorkmodeSwitchSchema = z.object({
  from: z.enum(['TRADE', 'TRAIN', 'FLYWHEEL']),
  to: z.enum(['TRADE', 'TRAIN', 'FLYWHEEL']),
  timestamp: z.number().int().positive(),
});
export type WorkmodeSwitchPayload = z.infer<typeof WorkmodeSwitchSchema>;

export const TrainSessionCompleteSchema = z.object({
  session_id: z.string().min(1),
  correct: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  duration_ms: z.number().int().nonnegative(),
});
export type TrainSessionCompletePayload = z.infer<typeof TrainSessionCompleteSchema>;

export const RightpanelTabSwitchSchema = z.object({
  from_tab: z.string().min(1),
  to_tab: z.string().min(1),
});
export type RightpanelTabSwitchPayload = z.infer<typeof RightpanelTabSwitchSchema>;

// ── Core fire helper ───────────────────────────────────────────────────────

function fireGtag(eventName: string, params: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  // Paranoia: strip any PII keys that should never appear
  const safe = { ...params };
  for (const key of ['user_id', 'email', 'ip', 'user_email', 'userId']) {
    delete safe[key];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  if (typeof win.gtag === 'function') {
    win.gtag('event', eventName, safe);
  } else {
    // dev fallback
    console.debug('[telemetry]', eventName, safe);
  }
}

// ── Public event functions ─────────────────────────────────────────────────

export function trackWorkmodeSwitch(from: WorkMode, to: WorkMode): void {
  const payload: WorkmodeSwitchPayload = {
    from,
    to,
    timestamp: Date.now(),
  };
  const parsed = WorkmodeSwitchSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn('[telemetry] workmode_switch validation failed', parsed.error.issues);
    return;
  }
  fireGtag('workmode_switch', parsed.data as unknown as Record<string, unknown>);
}

export function trackTrainSessionComplete(
  sessionId: string,
  answers: string[],
  totalQuestions: number,
  durationMs: number,
): void {
  const correct = answers.filter(a => a !== 'SKIP').length;
  const payload: TrainSessionCompletePayload = {
    session_id: sessionId,
    correct,
    total: totalQuestions,
    duration_ms: durationMs,
  };
  const parsed = TrainSessionCompleteSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn('[telemetry] train_session_complete validation failed', parsed.error.issues);
    return;
  }
  fireGtag('train_session_complete', parsed.data as unknown as Record<string, unknown>);
}

export function trackRightpanelTabSwitch(fromTab: string, toTab: string): void {
  if (fromTab === toTab) return;
  const payload: RightpanelTabSwitchPayload = { from_tab: fromTab, to_tab: toTab };
  const parsed = RightpanelTabSwitchSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn('[telemetry] rightpanel_tab_switch validation failed', parsed.error.issues);
    return;
  }
  fireGtag('rightpanel_tab_switch', parsed.data as unknown as Record<string, unknown>);
}
