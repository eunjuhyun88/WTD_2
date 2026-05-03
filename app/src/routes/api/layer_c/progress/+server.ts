/**
 * GET /api/layer_c/progress
 *
 * Returns the 10 most recent Layer C training runs and derived F-60 progress metrics.
 *
 * Response shape:
 * {
 *   runs: LayerCRun[],
 *   f60_progress: {
 *     verdicts_labelled: number,   // total labelled verdicts in DB
 *     accuracy: number | null,     // ndcg_at_5 of the most recent promoted run
 *     gate_pct: number,            // 0–100 towards F-60 gate (200 verdicts × accuracy ≥ 0.55)
 *   }
 * }
 */

import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { query } from '$lib/server/db';

export interface LayerCRun {
  run_id: string;
  triggered_at: string;
  n_verdicts: number;
  status: string;
  ndcg_at_5: number | null;
  map_at_10: number | null;
  ci_lower: number | null;
  promoted: boolean;
  version_id: string | null;
}

export interface F60Progress {
  verdicts_labelled: number;
  accuracy: number | null;
  gate_pct: number;
}

const F60_VERDICTS_TARGET = 200;
const F60_ACCURACY_TARGET = 0.55;

export const GET = async (_event: RequestEvent) => {
  try {
    const [runsResult, verdictsResult] = await Promise.all([
      query<LayerCRun>(
        `SELECT run_id, triggered_at, n_verdicts, status,
                ndcg_at_5, map_at_10, ci_lower, promoted, version_id
         FROM layer_c_train_runs
         ORDER BY triggered_at DESC
         LIMIT 10`,
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM capture_records
         WHERE verdict IS NOT NULL`,
      ),
    ]);

    const runs: LayerCRun[] = runsResult.rows;
    const verdicts_labelled = parseInt(verdictsResult.rows[0]?.count ?? '0', 10);

    const latestPromoted = runs.find((r) => r.promoted);
    const accuracy = latestPromoted?.ndcg_at_5 ?? null;

    const verdicts_pct = Math.min(verdicts_labelled / F60_VERDICTS_TARGET, 1);
    const accuracy_ok = accuracy !== null && accuracy >= F60_ACCURACY_TARGET;
    const gate_pct = Math.round(verdicts_pct * (accuracy_ok ? 100 : 50));

    const f60_progress: F60Progress = {
      verdicts_labelled,
      accuracy,
      gate_pct,
    };

    return json({ runs, f60_progress });
  } catch (err) {
    console.error('[/api/layer_c/progress]', err);
    return json(
      { runs: [], f60_progress: { verdicts_labelled: 0, accuracy: null, gate_pct: 0 } },
      { status: 500 },
    );
  }
};
