import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

interface LedgerRow {
  cycle_id: number;
  status: string;
  strategy: string;
  dsr_delta: number | null;
  cost_usd: number | null;
  latency_sec: number | null;
  commit_sha: string | null;
  created_at: string;
  rules_snapshot_json: unknown;
}

interface EnsembleRow {
  cycle_id: number;
  strategy_name: string;
  ensemble_group: string;
  outcome: string;
  proposal_score: number | null;
  dsr_delta_predicted: number | null;
  dsr_delta_actual: number | null;
  cost_usd: number | null;
  latency_sec: number | null;
}

export const GET: RequestHandler = async ({ params }) => {
  const cycleId = parseInt(params.cycle_id);

  if (!Number.isFinite(cycleId) || cycleId < 1 || cycleId > 999999) {
    return json({ ok: false, error: 'Invalid cycle_id' }, { status: 400 });
  }

  try {
    const [ledgerRes, roundsRes] = await Promise.all([
      query<LedgerRow>(
        `SELECT cycle_id, status, strategy,
                dsr_delta, cost_usd, latency_sec,
                commit_sha, created_at, rules_snapshot_json
         FROM autoresearch_ledger
         WHERE cycle_id = $1
         LIMIT 1`,
        [cycleId]
      ),
      query<EnsembleRow>(
        `SELECT cycle_id, strategy_name, ensemble_group, outcome,
                proposal_score, dsr_delta_predicted, dsr_delta_actual,
                cost_usd, latency_sec
         FROM ensemble_rounds
         WHERE cycle_id = $1
         ORDER BY strategy_name`,
        [cycleId]
      ),
    ]);

    if (!ledgerRes.rows.length) {
      return json({ ok: false, error: 'Cycle not found' }, { status: 404 });
    }

    const r = ledgerRes.rows[0];
    const cycle = {
      cycleId:       r.cycle_id,
      status:        r.status,
      strategy:      r.strategy,
      dsrDelta:      r.dsr_delta ?? 0,
      costUsd:       r.cost_usd ?? 0,
      latencySec:    r.latency_sec ?? 0,
      commitSha:     r.commit_sha ?? '',
      createdAt:     r.created_at,
      rulesSnapshot: r.rules_snapshot_json ?? null,
    };

    const ensembleRounds = roundsRes.rows.map((er) => ({
      cycleId:          er.cycle_id,
      strategyName:     er.strategy_name,
      ensembleGroup:    er.ensemble_group,
      outcome:          er.outcome,
      proposalScore:    er.proposal_score ?? null,
      dsrDeltaPredicted: er.dsr_delta_predicted ?? null,
      dsrDeltaActual:   er.dsr_delta_actual ?? null,
      costUsd:          er.cost_usd ?? 0,
      latencySec:       er.latency_sec ?? 0,
    }));

    return json({ ok: true, cycle, ensembleRounds });
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
