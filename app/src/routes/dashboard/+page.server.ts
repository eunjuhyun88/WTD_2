import type { PageServerLoad } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

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

export interface FlywheelHealth {
  ok: boolean;
  captures_per_day_7d: number;
  captures_to_outcome_rate: number;
  outcomes_to_verdict_rate: number;
  verdicts_to_refinement_count_7d: number;
  active_models_per_pattern: Record<string, number>;
  promotion_gate_pass_rate_30d: number;
}

export const load: PageServerLoad = async () => {
  const [verdictResp, flywheelResp] = await Promise.allSettled([
    engineFetch('/captures?status=outcome_ready&limit=50', {
      signal: AbortSignal.timeout(5000),
    }),
    engineFetch('/observability/flywheel/health', {
      signal: AbortSignal.timeout(4000),
    }),
  ]);

  let pendingVerdicts: CaptureRow[] = [];
  if (verdictResp.status === 'fulfilled' && verdictResp.value.ok) {
    const data = (await verdictResp.value.json()) as { captures?: CaptureRow[] };
    pendingVerdicts = data.captures ?? [];
  }

  let flywheelHealth: FlywheelHealth | null = null;
  if (flywheelResp.status === 'fulfilled' && flywheelResp.value.ok) {
    flywheelHealth = (await flywheelResp.value.json()) as FlywheelHealth;
  }

  return { pendingVerdicts, flywheelHealth };
};
