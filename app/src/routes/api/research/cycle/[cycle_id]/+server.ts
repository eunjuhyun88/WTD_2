import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface CycleDetail {
  cycleId: number;
  status: string;
  strategy: string;
  dsrDelta: number;
  costUsd: number;
  latencySec: number;
  commitSha: string;
  createdAt: string;
  rulesSnapshot?: any;
}

interface EnsembleRound {
  cycleId: number;
  strategyName: string;
  passRate: number;
  dsrDelta: number;
  costUsd: number;
  latencySec: number;
}

export const GET: RequestHandler = async ({ params }) => {
  const cycleId = parseInt(params.cycle_id);

  // Validate cycle_id
  if (!Number.isFinite(cycleId) || cycleId < 1 || cycleId > 999999) {
    return json(
      {
        ok: false,
        error: 'Invalid cycle_id'
      },
      { status: 400 }
    );
  }

  try {
    // TODO: Fetch from Supabase autoresearch_ledger + ensemble_rounds tables
    // For now, generate mock data

    const cycle: CycleDetail = {
      cycleId,
      status: Math.random() > 0.7 ? 'committed' : 'rejected',
      strategy: 'moe-regime',
      dsrDelta: (Math.random() - 0.5) * 2.5,
      costUsd: Math.random() * 150 + 40,
      latencySec: Math.random() * 50 + 15,
      commitSha: Math.random().toString(16).substring(2, 42),
      createdAt: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
      rulesSnapshot: {
        version: 'v2.1',
        filters: ['market_regime', 'signal_strength'],
        risk_limits: { max_position: 5000, max_drawdown: 0.15 }
      }
    };

    const ensembleRounds: EnsembleRound[] = [
      'single',
      'parallel-vote',
      'rank-fusion',
      'moe-regime',
      'judge-arbitrate',
      'role-pipeline',
      'tournament',
      'self-refine',
      'debate',
      'moa'
    ].map((strategy) => ({
      cycleId,
      strategyName: strategy,
      passRate: Math.random() * 0.3 + 0.65,
      dsrDelta: (Math.random() - 0.5) * 2,
      costUsd: Math.random() * 100 + 20,
      latencySec: Math.random() * 40 + 10
    }));

    return json({
      ok: true,
      cycle,
      ensembleRounds
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
};
