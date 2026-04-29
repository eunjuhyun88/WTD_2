/**
 * Client-side API helpers for pattern lifecycle management.
 * All requests go through SvelteKit proxy routes (/api/patterns/...).
 */

export type PatternLifecycleStatus = 'draft' | 'candidate' | 'object' | 'archived';

export interface PatchStatusResult {
  slug: string;
  status: PatternLifecycleStatus;
  promoted_at: string | null;
  updated_at: string;
}

/**
 * Promote or demote a pattern's lifecycle status.
 *
 * Valid transitions:
 *   draft      → candidate | archived
 *   candidate  → object    | archived
 *   object     → archived
 *   archived   → (terminal)
 */
export async function patchPatternStatus(
  slug: string,
  status: PatternLifecycleStatus,
  reason?: string,
): Promise<PatchStatusResult> {
  const res = await fetch(`/api/patterns/${slug}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reason: reason ?? '' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(err.detail ?? `PATCH status failed: ${res.status}`);
  }
  return res.json() as Promise<PatchStatusResult>;
}
