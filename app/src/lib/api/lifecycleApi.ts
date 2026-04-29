/**
 * Pattern lifecycle status API client (W-0308 F-14)
 *
 * Wraps engine PATCH /patterns/{slug}/status and GET /patterns/{slug}/lifecycle-status.
 * Consumed by PatternLifecycleCard and PromoteConfirmModal.
 */

export type LifecycleStatus = 'draft' | 'candidate' | 'object' | 'archived';

export interface LifecycleStatusResponse {
  ok: boolean;
  slug: string;
  status: LifecycleStatus;
}

export interface LifecycleTransitionResponse {
  ok: boolean;
  slug: string;
  from_status: LifecycleStatus;
  to_status: LifecycleStatus;
  updated_at: number;
}

/** Allowed forward transitions per status (mirrors engine ALLOWED_TRANSITIONS). */
export const ALLOWED_NEXT: Record<LifecycleStatus, LifecycleStatus[]> = {
  draft:     ['candidate', 'archived'],
  candidate: ['object', 'archived'],
  object:    ['archived'],
  archived:  [],
};

/** Human-readable labels. */
export const STATUS_LABEL: Record<LifecycleStatus, string> = {
  draft:     'Draft',
  candidate: 'Candidate',
  object:    'Object',
  archived:  'Archived',
};

/** Fetch current lifecycle status for a pattern. */
export async function fetchLifecycleStatus(slug: string): Promise<LifecycleStatusResponse> {
  const res = await fetch(`/api/patterns/${encodeURIComponent(slug)}/lifecycle-status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<LifecycleStatusResponse>;
}

/** Transition pattern to a new lifecycle status. */
export async function patchPatternStatus(
  slug: string,
  status: LifecycleStatus,
  reason: string = '',
): Promise<LifecycleTransitionResponse> {
  const res = await fetch(`/api/patterns/${encodeURIComponent(slug)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
  return res.json() as Promise<LifecycleTransitionResponse>;
}
