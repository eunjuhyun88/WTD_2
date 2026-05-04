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

// ── wave6.* telemetry ──────────────────────────────────────────────────────

export const AiAskSchema = z.object({
  intent: z.enum(['scan', 'why', 'judge', 'recall', 'inbox', 'unknown']),
  source: z.enum(['slash', 'nl']),
  input_len: z.number().int().nonnegative(),
});
export type AiAskPayload = z.infer<typeof AiAskSchema>;

export function trackAiAsk(payload: AiAskPayload): void {
  const parsed = AiAskSchema.safeParse(payload);
  if (!parsed.success) { console.warn('[telemetry] ai_ask invalid', parsed.error.issues); return; }
  // dual-emit: legacy + wave6 namespace
  fireGtag('ai_query', parsed.data as unknown as Record<string, unknown>);
  fireGtag('wave6.ai_ask', parsed.data as unknown as Record<string, unknown>);
}

export const TabSwitchSchema = z.object({
  from: z.string(),
  to: z.string(),
  trigger: z.enum(['manual', 'ai_ask']),
});
export type TabSwitchPayload = z.infer<typeof TabSwitchSchema>;

export function trackTabSwitch(payload: TabSwitchPayload): void {
  const parsed = TabSwitchSchema.safeParse(payload);
  if (!parsed.success) { console.warn('[telemetry] tab_switch invalid', parsed.error.issues); return; }
  fireGtag('rightpanel_tab_switch', parsed.data as unknown as Record<string, unknown>); // legacy
  fireGtag('wave6.tab_switch', parsed.data as unknown as Record<string, unknown>);
}

// ── decide_drawer_open (W-0403 PR7) ───────────────────────────────────────

export const DecideDrawerOpenSchema = z.object({
  verdict_id: z.string().optional(),
  trigger: z.enum(['jdg_tab_button', 'deeplink']),
});
export type DecideDrawerOpenPayload = z.infer<typeof DecideDrawerOpenSchema>;

export function trackDecideDrawerOpen(payload: DecideDrawerOpenPayload): void {
  const parsed = DecideDrawerOpenSchema.safeParse(payload);
  if (!parsed.success) { console.warn('[telemetry] decide_drawer_open invalid', parsed.error.issues); return; }
  fireGtag('decide_drawer_open', parsed.data as unknown as Record<string, unknown>);
  fireGtag('wave6.decide_drawer_open', parsed.data as unknown as Record<string, unknown>);
}

// ── inbox_dot_click (W-0403) ───────────────────────────────────────────────

export const InboxDotClickSchema = z.object({
  unread_count: z.number().int().nonnegative(),
  destination: z.literal('/cogochi?panel=vdt'),
});
export type InboxDotClickPayload = z.infer<typeof InboxDotClickSchema>;

export function trackInboxDotClick(unreadCount: number): void {
  const payload: InboxDotClickPayload = {
    unread_count: unreadCount,
    destination: '/cogochi?panel=vdt',
  };
  const parsed = InboxDotClickSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn('[telemetry] inbox_dot_click validation failed', parsed.error.issues);
    return;
  }
  // dual-emit: legacy + wave6 namespace
  fireGtag('inbox_dot_click', parsed.data as unknown as Record<string, unknown>);
  fireGtag('wave6.inbox_dot_click', parsed.data as unknown as Record<string, unknown>);
}
