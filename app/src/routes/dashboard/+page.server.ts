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

export interface UserStats {
  accuracy: number | null;
  pass: boolean;
  verdicts_remaining: number;
  min_verdicts: number;
}

export interface OpportunityScore {
  symbol: string;
  name: string;
  price: number;
  change1h: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  momentumScore: number;
  volumeScore: number;
  socialScore: number;
  macroScore: number;
  onchainScore: number;
  totalScore: number;
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  reasons: string[];
  alerts: string[];
  compositeScore: number | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  const userId = locals.user?.id;

  const [verdictResp, flywheelResp, opportunityResp, userStatsResp] = await Promise.allSettled([
    userId
      ? engineFetch(`/captures?user_id=${encodeURIComponent(userId)}&status=outcome_ready&limit=50`, {
          signal: AbortSignal.timeout(5000),
        })
      : Promise.resolve(
          new Response(JSON.stringify({ captures: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    engineFetch('/observability/flywheel/health', {
      signal: AbortSignal.timeout(4000),
    }),
    engineFetch('/opportunity/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 10, user_id: userId ?? null }),
      signal: AbortSignal.timeout(5000),
    }),
    userId
      ? engineFetch(`/users/${encodeURIComponent(userId)}/f60-status`, {
          signal: AbortSignal.timeout(3000),
        })
      : Promise.resolve(new Response('null', { status: 200 })),
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

  let topOpportunities: OpportunityScore[] = [];
  let macroRegime = 'neutral';
  let opportunityPersonalized = false;
  if (opportunityResp.status === 'fulfilled' && opportunityResp.value.ok) {
    const data = (await opportunityResp.value.json()) as {
      coins?: OpportunityScore[];
      macroBackdrop?: { regime?: string };
    };
    topOpportunities = data.coins ?? [];
    macroRegime = data.macroBackdrop?.regime ?? 'neutral';
    opportunityPersonalized = !!userId && topOpportunities.length > 0;
  }

  let userStats: UserStats | null = null;
  if (userStatsResp.status === 'fulfilled' && userStatsResp.value.ok) {
    const raw = (await userStatsResp.value.json()) as {
      accuracy?: number;
      pass?: boolean;
      verdicts_remaining?: number;
      min_verdicts?: number;
    } | null;
    if (raw && typeof raw === 'object') {
      userStats = {
        accuracy: raw.accuracy ?? null,
        pass: raw.pass ?? false,
        verdicts_remaining: raw.verdicts_remaining ?? 0,
        min_verdicts: raw.min_verdicts ?? 0,
      };
    }
  }

  return { pendingVerdicts, flywheelHealth, topOpportunities, macroRegime, opportunityPersonalized, userStats };
};
