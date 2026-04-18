import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export interface CaptureRow {
  capture_id: string;
  symbol: string;
  timeframe: string;
  pattern_slug: string;
  phase: string;
  captured_at_ms: number;
  user_note: string | null;
  outcome_id: string | null;
  status: string;
}

export const load: PageServerLoad = async () => {
  try {
    const resp = await fetch(`${ENGINE_URL}/captures?status=outcome_ready&limit=50`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return { pendingVerdicts: [] as CaptureRow[] };
    const data = (await resp.json()) as { captures?: CaptureRow[] };
    return { pendingVerdicts: data.captures ?? [] };
  } catch {
    return { pendingVerdicts: [] as CaptureRow[] };
  }
};
