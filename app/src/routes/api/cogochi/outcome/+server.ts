/**
 * POST /api/cogochi/outcome
 *
 * Records a trade outcome (win / loss / timeout) for LightGBM retraining (L5).
 *
 * Body: { snapshot, outcome, symbol?, timeframe? }
 *   outcome: 1 = win, 0 = loss, -1 = timeout / skip
 *
 * Flow:
 *   1. Validate + insert into engine_trade_records
 *   2. Count unlabeled records for this user
 *   3. If count >= MIN_TRAIN_RECORDS (20), fire engine /train in background
 *   4. Return { saved: true, count, training_triggered: bool }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { engine } from '$lib/server/engineClient';

const MIN_TRAIN_RECORDS = 20;

export const POST: RequestHandler = async ({ request, locals }) => {
  // Auth: prefer session user, fall back to anonymous bucket
  const userId: string =
    (locals as any)?.user?.id ?? (locals as any)?.session?.user?.id ?? 'anon';

  let body: any;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const { snapshot, outcome, symbol, timeframe } = body;

  if (!snapshot || typeof snapshot !== 'object') {
    throw error(400, 'snapshot is required');
  }
  if (outcome !== 1 && outcome !== 0 && outcome !== -1) {
    throw error(400, 'outcome must be 1, 0, or -1');
  }

  const sym: string = symbol ?? snapshot?.symbol ?? 'UNKNOWN';
  const tf: string = timeframe ?? '4h';

  // 1. Insert record
  await query(
    `INSERT INTO engine_trade_records (user_id, symbol, timeframe, snapshot, outcome)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, sym, tf, JSON.stringify(snapshot), outcome]
  );

  // 2. Count records for this user (excluding timeouts for training)
  const countRes = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM engine_trade_records
     WHERE user_id = $1 AND outcome IN (0, 1)`,
    [userId]
  );
  const count = parseInt(countRes.rows[0]?.count ?? '0', 10);

  // 3. Auto-trigger training when threshold reached
  let training_triggered = false;
  if (count >= MIN_TRAIN_RECORDS && count % MIN_TRAIN_RECORDS === 0) {
    // Fire-and-forget: fetch all labeled records and send to engine
    triggerTraining(userId, count).catch((err) =>
      console.error('[outcome] training trigger failed:', err)
    );
    training_triggered = true;
  }

  return json({ saved: true, count, training_triggered });
};

async function triggerTraining(userId: string, count: number): Promise<void> {
  console.log(`[outcome] triggering LightGBM train for user=${userId} count=${count}`);

  const rows = await query<{ snapshot: any; outcome: number }>(
    `SELECT snapshot, outcome FROM engine_trade_records
     WHERE user_id = $1 AND outcome IN (0, 1)
     ORDER BY created_at ASC`,
    [userId]
  );

  const records = rows.rows.map((r) => ({
    snapshot: typeof r.snapshot === 'string' ? JSON.parse(r.snapshot) : r.snapshot,
    outcome: r.outcome as 1 | 0,
  }));

  const result = await engine.train(records, userId);
  console.log(
    `[outcome] training complete: auc=${result.auc.toFixed(3)} n=${result.n_samples} v=${result.model_version}`
  );
}
